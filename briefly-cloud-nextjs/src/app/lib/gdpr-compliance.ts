/**
 * GDPR Compliance and Data Management System
 * 
 * This module handles GDPR compliance, consent management, and data retention policies
 */

import { createClient } from '@supabase/supabase-js';
import { logger } from './logger';

export interface ConsentRecord {
  id: string;
  user_id: string;
  consent_type: 'essential' | 'analytics' | 'marketing' | 'functional';
  granted: boolean;
  version: string;
  ip_address?: string;
  user_agent?: string;
  timestamp: Date;
  expires_at?: Date;
}

export interface DataRetentionPolicy {
  data_type: string;
  retention_period_days: number;
  deletion_method: 'soft' | 'hard';
  requires_user_consent: boolean;
}

export interface DataExportRequest {
  id: string;
  user_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requested_at: Date;
  completed_at?: Date;
  download_url?: string;
  expires_at?: Date;
}

export interface DataDeletionRequest {
  id: string;
  user_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requested_at: Date;
  completed_at?: Date;
  deletion_type: 'account' | 'data_only';
  reason?: string;
}

class GDPRComplianceService {
  private supabase;

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /**
   * Record user consent for various data processing activities
   */
  async recordConsent(
    userId: string,
    consentType: ConsentRecord['consent_type'],
    granted: boolean,
    metadata: {
      version: string;
      ip_address?: string;
      user_agent?: string;
    }
  ): Promise<ConsentRecord> {
    try {
      const consentRecord: Omit<ConsentRecord, 'id'> = {
        user_id: userId,
        consent_type: consentType,
        granted,
        version: metadata.version,
        ip_address: metadata.ip_address,
        user_agent: metadata.user_agent,
        timestamp: new Date(),
        expires_at: this.calculateConsentExpiry(consentType)
      };

      const { data, error } = await this.supabase
        .from('consent_records')
        .insert(consentRecord)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to record consent: ${error.message}`);
      }

      logger.info('Consent recorded', {
        user_id: userId,
        consent_type: consentType,
        granted,
        version: metadata.version
      });

      return data;

    } catch (error) {
      logger.error('Error recording consent', {
        user_id: userId,
        consent_type: consentType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get current consent status for a user
   */
  async getUserConsent(userId: string): Promise<Record<string, ConsentRecord | null>> {
    try {
      const { data, error } = await this.supabase
        .from('consent_records')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (error) {
        throw new Error(`Failed to get user consent: ${error.message}`);
      }

      // Get the latest consent for each type
      const latestConsent: Record<string, ConsentRecord | null> = {
        essential: null,
        analytics: null,
        marketing: null,
        functional: null
      };

      data?.forEach(record => {
        if (!latestConsent[record.consent_type] || 
            new Date(record.timestamp) > new Date(latestConsent[record.consent_type]!.timestamp)) {
          latestConsent[record.consent_type] = record;
        }
      });

      return latestConsent;

    } catch (error) {
      logger.error('Error getting user consent', {
        user_id: userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Check if user has valid consent for a specific type
   */
  async hasValidConsent(userId: string, consentType: ConsentRecord['consent_type']): Promise<boolean> {
    try {
      const consent = await this.getUserConsent(userId);
      const record = consent[consentType];

      if (!record || !record.granted) {
        return false;
      }

      // Check if consent has expired
      if (record.expires_at && new Date() > new Date(record.expires_at)) {
        return false;
      }

      return true;

    } catch (error) {
      logger.error('Error checking consent validity', {
        user_id: userId,
        consent_type: consentType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false; // Fail safe - no consent if error
    }
  }

  /**
   * Request data export for a user (GDPR Article 20)
   */
  async requestDataExport(userId: string): Promise<DataExportRequest> {
    try {
      const exportRequest: Omit<DataExportRequest, 'id'> = {
        user_id: userId,
        status: 'pending',
        requested_at: new Date()
      };

      const { data, error } = await this.supabase
        .from('data_export_requests')
        .insert(exportRequest)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create export request: ${error.message}`);
      }

      // Trigger background job to process export
      await this.scheduleDataExport(data.id);

      logger.info('Data export requested', {
        user_id: userId,
        request_id: data.id
      });

      return data;

    } catch (error) {
      logger.error('Error requesting data export', {
        user_id: userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Request data deletion for a user (GDPR Article 17 - Right to be forgotten)
   */
  async requestDataDeletion(
    userId: string, 
    deletionType: DataDeletionRequest['deletion_type'] = 'account',
    reason?: string
  ): Promise<DataDeletionRequest> {
    try {
      const deletionRequest: Omit<DataDeletionRequest, 'id'> = {
        user_id: userId,
        status: 'pending',
        requested_at: new Date(),
        deletion_type: deletionType,
        reason
      };

      const { data, error } = await this.supabase
        .from('data_deletion_requests')
        .insert(deletionRequest)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create deletion request: ${error.message}`);
      }

      // Trigger background job to process deletion
      await this.scheduleDataDeletion(data.id);

      logger.info('Data deletion requested', {
        user_id: userId,
        request_id: data.id,
        deletion_type: deletionType
      });

      return data;

    } catch (error) {
      logger.error('Error requesting data deletion', {
        user_id: userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Process data export (background job)
   */
  async processDataExport(requestId: string): Promise<void> {
    try {
      // Update status to processing
      await this.supabase
        .from('data_export_requests')
        .update({ status: 'processing' })
        .eq('id', requestId);

      const { data: request, error } = await this.supabase
        .from('data_export_requests')
        .select('*')
        .eq('id', requestId)
        .single();

      if (error || !request) {
        throw new Error('Export request not found');
      }

      // Collect all user data
      const userData = await this.collectUserData(request.user_id);

      // Create export file
      const exportData = {
        export_date: new Date().toISOString(),
        user_id: request.user_id,
        data: userData
      };

      // Store in Supabase Storage (or your preferred storage)
      const fileName = `user-data-export-${request.user_id}-${Date.now()}.json`;
      const { data: uploadData, error: uploadError } = await this.supabase.storage
        .from('data-exports')
        .upload(fileName, JSON.stringify(exportData, null, 2), {
          contentType: 'application/json'
        });

      if (uploadError) {
        throw new Error(`Failed to upload export: ${uploadError.message}`);
      }

      // Generate signed URL for download
      const { data: urlData } = await this.supabase.storage
        .from('data-exports')
        .createSignedUrl(fileName, 604800); // 7 days

      // Update request with completion details
      await this.supabase
        .from('data_export_requests')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          download_url: urlData?.signedUrl,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
        })
        .eq('id', requestId);

      logger.info('Data export completed', {
        request_id: requestId,
        user_id: request.user_id
      });

    } catch (error) {
      // Update status to failed
      await this.supabase
        .from('data_export_requests')
        .update({ status: 'failed' })
        .eq('id', requestId);

      logger.error('Data export failed', {
        request_id: requestId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Process data deletion (background job)
   */
  async processDataDeletion(requestId: string): Promise<void> {
    try {
      // Update status to processing
      await this.supabase
        .from('data_deletion_requests')
        .update({ status: 'processing' })
        .eq('id', requestId);

      const { data: request, error } = await this.supabase
        .from('data_deletion_requests')
        .select('*')
        .eq('id', requestId)
        .single();

      if (error || !request) {
        throw new Error('Deletion request not found');
      }

      if (request.deletion_type === 'account') {
        // Delete entire account and all associated data
        await this.deleteUserAccount(request.user_id);
      } else {
        // Delete only user data, keep account
        await this.deleteUserData(request.user_id);
      }

      // Update request status
      await this.supabase
        .from('data_deletion_requests')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', requestId);

      logger.info('Data deletion completed', {
        request_id: requestId,
        user_id: request.user_id,
        deletion_type: request.deletion_type
      });

    } catch (error) {
      // Update status to failed
      await this.supabase
        .from('data_deletion_requests')
        .update({ status: 'failed' })
        .eq('id', requestId);

      logger.error('Data deletion failed', {
        request_id: requestId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Clean up expired data based on retention policies
   */
  async cleanupExpiredData(): Promise<void> {
    try {
      const retentionPolicies = await this.getRetentionPolicies();

      for (const policy of retentionPolicies) {
        await this.applyRetentionPolicy(policy);
      }

      logger.info('Data cleanup completed');

    } catch (error) {
      logger.error('Data cleanup failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Calculate consent expiry based on type
   */
  private calculateConsentExpiry(consentType: ConsentRecord['consent_type']): Date | undefined {
    const now = new Date();
    
    switch (consentType) {
      case 'essential':
        return undefined; // Essential consent doesn't expire
      case 'analytics':
      case 'marketing':
        return new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year
      case 'functional':
        return new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000); // 6 months
      default:
        return new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // Default 1 year
    }
  }

  /**
   * Schedule data export processing
   */
  private async scheduleDataExport(requestId: string): Promise<void> {
    // In a real implementation, you would use a job queue like Bull, Agenda, or Vercel Cron
    // For now, we'll process immediately in the background
    setTimeout(() => {
      this.processDataExport(requestId).catch(error => {
        logger.error('Background data export failed', { request_id: requestId, error });
      });
    }, 1000);
  }

  /**
   * Schedule data deletion processing
   */
  private async scheduleDataDeletion(requestId: string): Promise<void> {
    // In a real implementation, you would use a job queue
    setTimeout(() => {
      this.processDataDeletion(requestId).catch(error => {
        logger.error('Background data deletion failed', { request_id: requestId, error });
      });
    }, 1000);
  }

  /**
   * Collect all user data for export
   */
  private async collectUserData(userId: string): Promise<any> {
    const userData: any = {};

    try {
      // User profile
      const { data: user } = await this.supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      userData.profile = user;

      // File metadata
      const { data: files } = await this.supabase
        .from('file_metadata')
        .select('*')
        .eq('user_id', userId);
      userData.files = files;

      // Conversations
      const { data: conversations } = await this.supabase
        .from('conversations')
        .select('*')
        .eq('user_id', userId);
      userData.conversations = conversations;

      // Chat messages
      if (conversations?.length) {
        const conversationIds = conversations.map(c => c.id);
        const { data: messages } = await this.supabase
          .from('chat_messages')
          .select('*')
          .in('conversation_id', conversationIds);
        userData.chat_messages = messages;
      }

      // Consent records
      const { data: consents } = await this.supabase
        .from('consent_records')
        .select('*')
        .eq('user_id', userId);
      userData.consent_records = consents;

      // OAuth tokens (anonymized)
      const { data: tokens } = await this.supabase
        .from('oauth_tokens')
        .select('provider, created_at, updated_at')
        .eq('user_id', userId);
      userData.oauth_connections = tokens;

      return userData;

    } catch (error) {
      logger.error('Error collecting user data', {
        user_id: userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Delete user account and all data
   */
  private async deleteUserAccount(userId: string): Promise<void> {
    // Delete in reverse dependency order
    const tables = [
      'chat_messages', // Delete messages first (references conversations)
      'conversations',
      'document_chunks',
      'file_metadata',
      'oauth_tokens',
      'consent_records',
      'data_export_requests',
      'data_deletion_requests',
      'users' // Delete user last
    ];

    for (const table of tables) {
      if (table === 'chat_messages') {
        // Delete chat messages via conversation IDs
        const { data: conversations } = await this.supabase
          .from('conversations')
          .select('id')
          .eq('user_id', userId);

        if (conversations?.length) {
          const conversationIds = conversations.map(c => c.id);
          await this.supabase
            .from('chat_messages')
            .delete()
            .in('conversation_id', conversationIds);
        }
      } else {
        await this.supabase
          .from(table)
          .delete()
          .eq('user_id', userId);
      }
    }
  }

  /**
   * Delete user data but keep account
   */
  private async deleteUserData(userId: string): Promise<void> {
    const dataTables = [
      'chat_messages',
      'conversations',
      'document_chunks',
      'file_metadata',
      'oauth_tokens'
    ];

    for (const table of dataTables) {
      if (table === 'chat_messages') {
        const { data: conversations } = await this.supabase
          .from('conversations')
          .select('id')
          .eq('user_id', userId);

        if (conversations?.length) {
          const conversationIds = conversations.map(c => c.id);
          await this.supabase
            .from('chat_messages')
            .delete()
            .in('conversation_id', conversationIds);
        }
      } else {
        await this.supabase
          .from(table)
          .delete()
          .eq('user_id', userId);
      }
    }
  }

  /**
   * Get retention policies
   */
  private async getRetentionPolicies(): Promise<DataRetentionPolicy[]> {
    // In a real implementation, these would be stored in the database
    return [
      {
        data_type: 'expired_trials',
        retention_period_days: 30,
        deletion_method: 'soft',
        requires_user_consent: false
      },
      {
        data_type: 'inactive_accounts',
        retention_period_days: 1095, // 3 years
        deletion_method: 'soft',
        requires_user_consent: true
      },
      {
        data_type: 'chat_messages',
        retention_period_days: 2555, // 7 years
        deletion_method: 'hard',
        requires_user_consent: false
      },
      {
        data_type: 'file_uploads',
        retention_period_days: 1095, // 3 years
        deletion_method: 'hard',
        requires_user_consent: false
      }
    ];
  }

  /**
   * Apply retention policy
   */
  private async applyRetentionPolicy(policy: DataRetentionPolicy): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.retention_period_days);

    switch (policy.data_type) {
      case 'expired_trials':
        await this.cleanupExpiredTrials(cutoffDate);
        break;
      case 'inactive_accounts':
        await this.cleanupInactiveAccounts(cutoffDate);
        break;
      case 'chat_messages':
        await this.cleanupOldChatMessages(cutoffDate);
        break;
      case 'file_uploads':
        await this.cleanupOldFileUploads(cutoffDate);
        break;
    }
  }

  private async cleanupExpiredTrials(cutoffDate: Date): Promise<void> {
    // Soft delete expired trial accounts
    await this.supabase
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('subscription_tier', 'free')
      .lt('created_at', cutoffDate.toISOString())
      .is('deleted_at', null);
  }

  private async cleanupInactiveAccounts(cutoffDate: Date): Promise<void> {
    // Mark inactive accounts for review
    await this.supabase
      .from('users')
      .update({ inactive_since: cutoffDate.toISOString() })
      .lt('last_login_at', cutoffDate.toISOString())
      .is('inactive_since', null);
  }

  private async cleanupOldChatMessages(cutoffDate: Date): Promise<void> {
    // Hard delete old chat messages
    await this.supabase
      .from('chat_messages')
      .delete()
      .lt('created_at', cutoffDate.toISOString());
  }

  private async cleanupOldFileUploads(cutoffDate: Date): Promise<void> {
    // Hard delete old file uploads and their chunks
    const { data: oldFiles } = await this.supabase
      .from('file_metadata')
      .select('id')
      .lt('created_at', cutoffDate.toISOString());

    if (oldFiles?.length) {
      const fileIds = oldFiles.map(f => f.id);
      
      // Delete chunks first
      await this.supabase
        .from('document_chunks')
        .delete()
        .in('file_id', fileIds);

      // Delete file metadata
      await this.supabase
        .from('file_metadata')
        .delete()
        .in('id', fileIds);
    }
  }
}

// Singleton instance
export const gdprService = new GDPRComplianceService();