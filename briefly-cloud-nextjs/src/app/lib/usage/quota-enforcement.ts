/**
 * Quota Enforcement Utilities
 * 
 * Provides functions for checking and enforcing user quotas based on subscription tier.
 * Integrates with the app.v_user_limits view and database functions.
 */

import 'server-only';
import { supabaseAdmin } from '@/app/lib/supabase-admin';
import { logger } from '@/app/lib/logger';

export interface UserLimits {
  user_id: string;
  email: string;
  subscription_tier: string;
  subscription_status: string;
  trial_end_date: string | null;
  
  // Current usage
  files_used: number;
  storage_used_mb: number;
  chat_messages_used: number;
  
  // Tier limits
  files_limit: number;
  storage_limit_mb: number;
  chat_messages_limit: number;
  retention_days: number;
  
  // Trial status
  is_trial_active: boolean;
  trial_days_remaining: number;
  
  // Quota flags
  files_limit_reached: boolean;
  storage_limit_reached: boolean;
  chat_limit_reached: boolean;
  
  // Usage percentages
  files_used_percentage: number;
  storage_used_percentage: number;
  chat_used_percentage: number;
}

export interface QuotaCheckResult {
  allowed: boolean;
  reason: string;
  files_used: number;
  files_limit: number;
  storage_used_mb: number;
  storage_limit_mb: number;
}

/**
 * Get user's current limits and usage from v_user_limits view
 */
export async function getUserLimits(userId: string): Promise<UserLimits | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('v_user_limits')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      logger.error('Error fetching user limits', { userId, error: error.message });
      return null;
    }

    return data as UserLimits;
  } catch (error) {
    logger.error('Error in getUserLimits', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return null;
  }
}

/**
 * Check if user can upload a file of given size
 * Uses the database function app.check_upload_quota()
 */
export async function checkUploadQuota(
  userId: string,
  fileSizeBytes: number
): Promise<QuotaCheckResult> {
  try {
    const { data, error } = await supabaseAdmin
      .rpc('check_upload_quota', {
        p_user_id: userId,
        p_file_size_bytes: fileSizeBytes
      });

    if (error) {
      logger.error('Error checking upload quota', {
        userId,
        fileSizeBytes,
        error: error.message
      });
      
      // Fail open - allow upload if quota check fails
      return {
        allowed: true,
        reason: 'Quota check unavailable',
        files_used: 0,
        files_limit: 0,
        storage_used_mb: 0,
        storage_limit_mb: 0
      };
    }

    // RPC returns array with single result
    const result = Array.isArray(data) ? data[0] : data;

    return {
      allowed: result.allowed,
      reason: result.reason,
      files_used: result.files_used,
      files_limit: result.files_limit,
      storage_used_mb: result.storage_used_mb,
      storage_limit_mb: result.storage_limit_mb
    };
  } catch (error) {
    logger.error('Error in checkUploadQuota', {
      userId,
      fileSizeBytes,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    // Fail open - allow upload if quota check fails
    return {
      allowed: true,
      reason: 'Quota check unavailable',
      files_used: 0,
      files_limit: 0,
      storage_used_mb: 0,
      storage_limit_mb: 0
    };
  }
}

/**
 * Check if user can send a chat message
 */
export async function checkChatQuota(userId: string): Promise<boolean> {
  const limits = await getUserLimits(userId);
  
  if (!limits) {
    // Fail open - allow chat if limits unavailable
    return true;
  }

  return !limits.chat_limit_reached;
}

/**
 * Update file's last_accessed_at to extend retention period
 * Uses the database function app.touch_file()
 */
export async function touchFile(fileId: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .rpc('touch_file', { p_file_id: fileId });

    if (error) {
      logger.warn('Error touching file', { fileId, error: error.message });
    }
  } catch (error) {
    logger.warn('Error in touchFile', {
      fileId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Check if user's trial has expired
 */
export async function isTrialExpired(userId: string): Promise<boolean> {
  const limits = await getUserLimits(userId);
  
  if (!limits) {
    return false;
  }

  // If trial_end_date is null, user never had a trial (or it's not tracked)
  if (!limits.trial_end_date) {
    return false;
  }

  // Check if trial is still active
  return !limits.is_trial_active;
}

/**
 * Get upgrade message based on quota type and limits
 */
export function getUpgradeMessage(
  limits: UserLimits,
  quotaType: 'files' | 'storage' | 'chat'
): string {
  const tier = limits.subscription_tier;
  
  if (tier === 'pro' || tier === 'pro_byok') {
    return 'You have reached your Pro tier limit. Contact support for enterprise options.';
  }

  const messages = {
    files: `You've reached your limit of ${limits.files_limit} files. Upgrade to Pro for 50 files and 150 MB storage.`,
    storage: `You've used ${limits.storage_used_mb.toFixed(1)} MB of ${limits.storage_limit_mb} MB. Upgrade to Pro for 150 MB storage.`,
    chat: `You've reached your limit of ${limits.chat_messages_limit} chat messages. Upgrade to Pro for 1000 messages.`
  };

  return messages[quotaType];
}

/**
 * Format quota status for API responses
 */
export function formatQuotaStatus(limits: UserLimits) {
  return {
    files: {
      used: limits.files_used,
      limit: limits.files_limit,
      percentage: limits.files_used_percentage,
      remaining: Math.max(0, limits.files_limit - limits.files_used),
      limitReached: limits.files_limit_reached
    },
    storage: {
      used: limits.storage_used_mb,
      limit: limits.storage_limit_mb,
      percentage: limits.storage_used_percentage,
      remaining: Math.max(0, limits.storage_limit_mb - limits.storage_used_mb),
      limitReached: limits.storage_limit_reached
    },
    chat: {
      used: limits.chat_messages_used,
      limit: limits.chat_messages_limit,
      percentage: limits.chat_used_percentage,
      remaining: Math.max(0, limits.chat_messages_limit - limits.chat_messages_used),
      limitReached: limits.chat_limit_reached
    },
    trial: {
      active: limits.is_trial_active,
      daysRemaining: limits.trial_days_remaining,
      endDate: limits.trial_end_date
    },
    tier: limits.subscription_tier,
    status: limits.subscription_status
  };
}
