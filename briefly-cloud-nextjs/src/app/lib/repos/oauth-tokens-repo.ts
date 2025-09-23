/**
 * OAuth Tokens Repository
 * 
 * This repository manages OAuth tokens for cloud storage providers using
 * secure RPC functions that store tokens in the private schema.
 */

import { BaseRepository } from './base-repo'
import { createError } from '@/app/lib/api-errors'

// TypeScript interfaces for OAuth token operations
export interface OAuthTokenData {
  accessToken: string
  refreshToken?: string
  expiresAt?: string
  scope?: string
}

export interface OAuthTokenStatus {
  exists: boolean
  expiresAt?: string
  isExpired: boolean
  expiresSoon: boolean
}

export interface ConnectionStatus {
  connected: boolean
  lastSync?: string
  errorMessage?: string
}

export type OAuthProvider = 'google' | 'microsoft'

/**
 * Repository for managing OAuth tokens using secure RPC functions
 */
export class OAuthTokensRepository extends BaseRepository {
  /**
   * Save OAuth token for a user and provider
   * @param userId - The user ID
   * @param provider - The OAuth provider ('google' or 'microsoft')
   * @param tokenData - The token data to save
   */
  async saveToken(
    userId: string,
    provider: OAuthProvider,
    tokenData: OAuthTokenData
  ): Promise<void> {
    // Validate required fields
    this.validateRequiredFields(
      { userId, provider, accessToken: tokenData.accessToken },
      ['userId', 'provider', 'accessToken'],
      'saveToken'
    )

    try {
      const { error } = await this.appClient.rpc('save_oauth_token', {
        p_user_id: userId,
        p_provider: provider,
        p_access_token: tokenData.accessToken,
        p_refresh_token: tokenData.refreshToken || null,
        p_expires_at: tokenData.expiresAt || null,
        p_scope: tokenData.scope || null
      })

      if (error) {
        this.handleDatabaseError(error, `saveToken for ${provider}`)
      }

      // Update connection status to connected
      await this.updateConnectionStatus(userId, provider, true)
    } catch (error: any) {
      // Log the error with context
      console.error('OAuth token save error:', {
        userId,
        provider,
        error: error.message,
        hasRefreshToken: !!tokenData.refreshToken,
        hasExpiresAt: !!tokenData.expiresAt
      })

      throw createError.databaseError(
        `Failed to save OAuth token for ${provider}`,
        error
      )
    }
  }

  /**
   * Get OAuth token for a user and provider
   * @param userId - The user ID
   * @param provider - The OAuth provider ('google' or 'microsoft')
   * @returns The token data or null if not found
   */
  async getToken(
    userId: string,
    provider: OAuthProvider
  ): Promise<OAuthTokenData | null> {
    // Validate required fields
    this.validateRequiredFields(
      { userId, provider },
      ['userId', 'provider'],
      'getToken'
    )

    try {
      const { data, error } = await this.appClient.rpc('get_oauth_token', {
        p_user_id: userId,
        p_provider: provider
      })

      if (error) {
        this.handleDatabaseError(error, `getToken for ${provider}`)
      }

      // Handle empty result
      if (!data || data.length === 0) {
        return null
      }

      // Extract token data from RPC result
      const token = Array.isArray(data) ? data[0] : data
      
      if (!token || !token.access_token) {
        return null
      }

      return {
        accessToken: token.access_token,
        refreshToken: token.refresh_token || undefined,
        expiresAt: token.expires_at || undefined,
        scope: token.scope || undefined
      }
    } catch (error: any) {
      // Log the error with context
      console.error('OAuth token get error:', {
        userId,
        provider,
        error: error.message
      })

      throw createError.databaseError(
        `Failed to get OAuth token for ${provider}`,
        error
      )
    }
  }

  /**
   * Delete OAuth token for a user and provider
   * @param userId - The user ID
   * @param provider - The OAuth provider ('google' or 'microsoft')
   */
  async deleteToken(
    userId: string,
    provider: OAuthProvider
  ): Promise<void> {
    // Validate required fields
    this.validateRequiredFields(
      { userId, provider },
      ['userId', 'provider'],
      'deleteToken'
    )

    try {
      const { error } = await this.appClient.rpc('delete_oauth_token', {
        p_user_id: userId,
        p_provider: provider
      })

      if (error) {
        this.handleDatabaseError(error, `deleteToken for ${provider}`)
      }

      // Update connection status to disconnected
      await this.updateConnectionStatus(userId, provider, false)
    } catch (error: any) {
      // Log the error with context
      console.error('OAuth token delete error:', {
        userId,
        provider,
        error: error.message
      })

      throw createError.databaseError(
        `Failed to delete OAuth token for ${provider}`,
        error
      )
    }
  }

  /**
   * Check if OAuth token exists for a user and provider
   * @param userId - The user ID
   * @param provider - The OAuth provider ('google' or 'microsoft')
   * @returns True if token exists, false otherwise
   */
  async tokenExists(
    userId: string,
    provider: OAuthProvider
  ): Promise<boolean> {
    // Validate required fields
    this.validateRequiredFields(
      { userId, provider },
      ['userId', 'provider'],
      'tokenExists'
    )

    try {
      const { data, error } = await this.appClient.rpc('oauth_token_exists', {
        p_user_id: userId,
        p_provider: provider
      })

      if (error) {
        this.handleDatabaseError(error, `tokenExists for ${provider}`)
      }

      return Boolean(data)
    } catch (error: any) {
      // Log the error with context
      console.error('OAuth token exists check error:', {
        userId,
        provider,
        error: error.message
      })

      throw createError.databaseError(
        `Failed to check if OAuth token exists for ${provider}`,
        error
      )
    }
  }

  /**
   * Get OAuth token status including expiry information
   * @param userId - The user ID
   * @param provider - The OAuth provider ('google' or 'microsoft')
   * @returns Token status information
   */
  async getTokenStatus(
    userId: string,
    provider: OAuthProvider
  ): Promise<OAuthTokenStatus> {
    // Validate required fields
    this.validateRequiredFields(
      { userId, provider },
      ['userId', 'provider'],
      'getTokenStatus'
    )

    try {
      const { data, error } = await this.appClient.rpc('get_oauth_token_status', {
        p_user_id: userId,
        p_provider: provider
      })

      if (error) {
        this.handleDatabaseError(error, `getTokenStatus for ${provider}`)
      }

      // Handle empty result
      if (!data || data.length === 0) {
        return {
          exists: false,
          isExpired: false,
          expiresSoon: false
        }
      }

      const status = Array.isArray(data) ? data[0] : data

      return {
        exists: Boolean(status.exists),
        expiresAt: status.expires_at || undefined,
        isExpired: Boolean(status.is_expired),
        expiresSoon: Boolean(status.expires_soon)
      }
    } catch (error: any) {
      // Log the error with context
      console.error('OAuth token status error:', {
        userId,
        provider,
        error: error.message
      })

      throw createError.databaseError(
        `Failed to get OAuth token status for ${provider}`,
        error
      )
    }
  }

  /**
   * Update connection status for a provider
   * @param userId - The user ID
   * @param provider - The OAuth provider ('google' or 'microsoft')
   * @param connected - Whether the provider is connected
   * @param errorMessage - Optional error message if connection failed
   */
  async updateConnectionStatus(
    userId: string,
    provider: OAuthProvider,
    connected: boolean,
    errorMessage?: string
  ): Promise<void> {
    // Validate required fields
    this.validateRequiredFields(
      { userId, provider, connected },
      ['userId', 'provider', 'connected'],
      'updateConnectionStatus'
    )

    try {
      const { error } = await this.appClient.rpc('update_connection_status', {
        p_user_id: userId,
        p_provider: provider,
        p_connected: connected,
        p_error_message: errorMessage || null
      })

      if (error) {
        this.handleDatabaseError(error, `updateConnectionStatus for ${provider}`)
      }
    } catch (error: any) {
      // Log the error with context
      console.error('Connection status update error:', {
        userId,
        provider,
        connected,
        errorMessage,
        error: error.message
      })

      throw createError.databaseError(
        `Failed to update connection status for ${provider}`,
        error
      )
    }
  }

  /**
   * Get connection status for a provider
   * @param userId - The user ID
   * @param provider - The OAuth provider ('google' or 'microsoft')
   * @returns Connection status information
   */
  async getConnectionStatus(
    userId: string,
    provider: OAuthProvider
  ): Promise<ConnectionStatus | null> {
    // Validate required fields
    this.validateRequiredFields(
      { userId, provider },
      ['userId', 'provider'],
      'getConnectionStatus'
    )

    try {
      const { data, error } = await this.appClient
        .from('connection_status')
        .select('connected, last_sync, error_message')
        .eq('user_id', userId)
        .eq('provider', provider)
        .single()

      if (error) {
        // If no record found, return null
        if (error.code === 'PGRST116') {
          return null
        }
        this.handleDatabaseError(error, `getConnectionStatus for ${provider}`)
      }

      if (!data) {
        return null
      }

      return {
        connected: Boolean(data.connected),
        lastSync: data.last_sync || undefined,
        errorMessage: data.error_message || undefined
      }
    } catch (error: any) {
      // Log the error with context
      console.error('Connection status get error:', {
        userId,
        provider,
        error: error.message
      })

      throw createError.databaseError(
        `Failed to get connection status for ${provider}`,
        error
      )
    }
  }

  /**
   * Get all connection statuses for a user
   * @param userId - The user ID
   * @returns Array of connection statuses with provider information
   */
  async getAllConnectionStatuses(
    userId: string
  ): Promise<Array<ConnectionStatus & { provider: OAuthProvider }>> {
    // Validate required fields
    this.validateRequiredFields(
      { userId },
      ['userId'],
      'getAllConnectionStatuses'
    )

    try {
      const { data, error } = await this.appClient
        .from('connection_status')
        .select('provider, connected, last_sync, error_message')
        .eq('user_id', userId)

      if (error) {
        this.handleDatabaseError(error, 'getAllConnectionStatuses')
      }

      if (!data) {
        return []
      }

      return data.map(status => ({
        provider: status.provider as OAuthProvider,
        connected: Boolean(status.connected),
        lastSync: status.last_sync || undefined,
        errorMessage: status.error_message || undefined
      }))
    } catch (error: any) {
      // Log the error with context
      console.error('All connection statuses get error:', {
        userId,
        error: error.message
      })

      throw createError.databaseError(
        'Failed to get all connection statuses',
        error
      )
    }
  }
}

// Export singleton instance
export const oauthTokensRepo = new OAuthTokensRepository()

// Export types for external use
export type { OAuthTokenData, OAuthTokenStatus, ConnectionStatus, OAuthProvider }