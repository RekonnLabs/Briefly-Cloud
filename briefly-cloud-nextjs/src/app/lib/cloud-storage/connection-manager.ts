/**
 * Connection Manager for Cloud Storage Providers
 * 
 * Handles connection and disconnection operations including
 * optional provider-side token revocation and job cleanup.
 */

import { TokenStore } from '@/app/lib/oauth/token-store'
import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'

export interface DisconnectOptions {
  revokeAtProvider?: boolean
  cancelRunningJobs?: boolean
}

export class ConnectionManager {
  /**
   * Disconnect from Google Drive
   */
  static async disconnectGoogle(
    userId: string, 
    options: DisconnectOptions = {}
  ): Promise<void> {
    try {
      logger.info('Starting Google Drive disconnect', { userId, options })

      // Get current token for revocation if requested
      if (options.revokeAtProvider) {
        const token = await TokenStore.getToken(userId, 'google')
        if (token?.accessToken) {
          await this.revokeGoogleToken(token.accessToken)
        }
      }

      // Cancel running jobs if requested
      if (options.cancelRunningJobs) {
        await this.cancelProviderJobs(userId, 'google')
      }

      // Delete stored token
      await TokenStore.deleteToken(userId, 'google')

      // Update connection status
      await supabaseAdmin.rpc('update_connection_status', {
        p_user_id: userId,
        p_provider: 'google',
        p_connected: false,
        p_error_message: 'Disconnected by user'
      })

      logger.info('Google Drive disconnected successfully', { userId })

    } catch (error) {
      logger.error('Error disconnecting Google Drive', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Disconnect from Microsoft OneDrive
   */
  static async disconnectMicrosoft(
    userId: string, 
    options: DisconnectOptions = {}
  ): Promise<void> {
    try {
      logger.info('Starting Microsoft OneDrive disconnect', { userId, options })

      // Get current token for revocation if requested
      if (options.revokeAtProvider) {
        const token = await TokenStore.getToken(userId, 'microsoft')
        if (token?.accessToken) {
          await this.revokeMicrosoftToken(token.accessToken)
        }
      }

      // Cancel running jobs if requested
      if (options.cancelRunningJobs) {
        await this.cancelProviderJobs(userId, 'microsoft')
      }

      // Delete stored token
      await TokenStore.deleteToken(userId, 'microsoft')

      // Update connection status
      await supabaseAdmin.rpc('update_connection_status', {
        p_user_id: userId,
        p_provider: 'microsoft',
        p_connected: false,
        p_error_message: 'Disconnected by user'
      })

      logger.info('Microsoft OneDrive disconnected successfully', { userId })

    } catch (error) {
      logger.error('Error disconnecting Microsoft OneDrive', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Revoke Google Drive token at provider
   */
  private static async revokeGoogleToken(accessToken: string): Promise<void> {
    try {
      const response = await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })

      if (!response.ok) {
        logger.warn('Failed to revoke Google token at provider', {
          status: response.status,
          statusText: response.statusText
        })
        // Don't throw error - continue with local cleanup
      } else {
        logger.info('Google token revoked at provider successfully')
      }
    } catch (error) {
      logger.warn('Error revoking Google token at provider', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      // Don't throw error - continue with local cleanup
    }
  }

  /**
   * Revoke Microsoft token at provider
   */
  private static async revokeMicrosoftToken(accessToken: string): Promise<void> {
    try {
      // Microsoft doesn't have a simple revoke endpoint like Google
      // We would need to call the Microsoft Graph API to revoke permissions
      // For now, we'll just log that we would revoke it
      logger.info('Microsoft token revocation requested (local cleanup only)')
      
      // TODO: Implement Microsoft token revocation if needed
      // This would require calling Microsoft Graph API to remove app permissions
      
    } catch (error) {
      logger.warn('Error revoking Microsoft token at provider', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      // Don't throw error - continue with local cleanup
    }
  }

  /**
   * Cancel running import jobs for a provider
   */
  private static async cancelProviderJobs(
    userId: string, 
    provider: 'google' | 'microsoft'
  ): Promise<void> {
    try {
      // Update running jobs to cancelled status
      const { error } = await supabaseAdmin
        .from('job_logs')
        .update({ 
          status: 'failed',
          error_message: `Cancelled due to ${provider} disconnection`,
          completed_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('job_type', 'import')
        .in('status', ['pending', 'processing'])
        .like('input_data->provider', provider)

      if (error) {
        logger.error('Failed to cancel running jobs', {
          userId,
          provider,
          error: error.message
        })
        // Don't throw - this is cleanup, continue with disconnect
      } else {
        logger.info('Cancelled running import jobs', { userId, provider })
      }
    } catch (error) {
      logger.error('Error cancelling running jobs', {
        userId,
        provider,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      // Don't throw - this is cleanup, continue with disconnect
    }
  }

  /**
   * Get connection status for a specific provider
   */
  static async getProviderStatus(
    userId: string,
    provider: 'google' | 'microsoft'
  ): Promise<{
    connected: boolean
    lastSync?: string
    errorMessage?: string
  }> {
    try {
      // Check if we have a valid token
      const token = await TokenStore.getToken(userId, provider)
      
      let connected = false
      if (token) {
        // Check if token is expired
        if (token.expiresAt) {
          const expiresAt = new Date(token.expiresAt)
          const now = new Date()
          connected = expiresAt > now
        } else {
          connected = true
        }
      }

      // Get additional status from database
      const { data: statusData } = await supabaseAdmin.rpc('get_connection_status', {
        p_user_id: userId
      })

      const dbStatus = statusData?.find((s: any) => s.provider === provider)

      return {
        connected,
        lastSync: dbStatus?.last_sync,
        errorMessage: connected ? undefined : (dbStatus?.error_message || 'No token found')
      }
    } catch (error) {
      logger.error(`Error getting ${provider} status`, {
        userId,
        provider,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      return {
        connected: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
}
