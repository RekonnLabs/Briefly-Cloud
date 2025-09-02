/**
 * OAuth Token Store with RPC-based Security
 * 
 * This module provides secure storage and retrieval of OAuth tokens
 * using RPC functions with SECURITY DEFINER for enhanced security.
 */

import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'

export interface OAuthTokenData {
  accessToken: string
  refreshToken?: string
  expiresAt?: string
  scope?: string
}

export interface OAuthToken {
  userId: string
  provider: 'google_drive' | 'microsoft' | 'google' // Support legacy 'google' format
  accessToken: string
  refreshToken?: string
  scope?: string
  tokenType?: string
  expiresAt: Date
}

export interface StoredOAuthToken {
  access_token: string
  refresh_token?: string
  expires_at: string
  scope?: string
}

/**
 * TokenStore class for secure OAuth token management
 */
export class TokenStore {
  /**
   * Save OAuth token using secure RPC function
   */
  static async saveToken(
    userId: string,
    provider: 'google_drive' | 'microsoft',
    tokenData: OAuthTokenData
  ): Promise<void> {
    try {
      const { error } = await supabaseAdmin.rpc('save_oauth_token', {
        p_user_id: userId,
        p_provider: provider,
        p_access_token: tokenData.accessToken,
        p_refresh_token: tokenData.refreshToken || null,
        p_expires_at: tokenData.expiresAt || null,
        p_scope: tokenData.scope || null
      })

      if (error) {
        logger.error('Failed to save OAuth token via RPC', {
          userId,
          provider,
          error: error.message
        })
        throw createError.internal(`Failed to save OAuth token: ${error.message}`)
      }

      logger.info('OAuth token saved successfully via RPC', {
        userId,
        provider
      })
    } catch (error) {
      logger.error('Error saving OAuth token', {
        userId,
        provider,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Get OAuth token using secure RPC function
   */
  static async getToken(
    userId: string,
    provider: 'google_drive' | 'microsoft'
  ): Promise<OAuthTokenData | null> {
    try {
      const { data, error } = await supabaseAdmin.rpc('get_oauth_token', {
        p_user_id: userId,
        p_provider: provider
      })

      if (error) {
        logger.error('Failed to get OAuth token via RPC', {
          userId,
          provider,
          error: error.message
        })
        return null
      }

      if (!data || data.length === 0) {
        return null
      }

      const tokenData = Array.isArray(data) ? data[0] : data
      return {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: tokenData.expires_at,
        scope: tokenData.scope
      }
    } catch (error) {
      logger.error('Error getting OAuth token', {
        userId,
        provider,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return null
    }
  }

  /**
   * Delete OAuth token using secure RPC function
   */
  static async deleteToken(
    userId: string,
    provider: 'google_drive' | 'microsoft'
  ): Promise<void> {
    try {
      const { error } = await supabaseAdmin.rpc('delete_oauth_token', {
        p_user_id: userId,
        p_provider: provider
      })

      if (error) {
        logger.error('Failed to delete OAuth token via RPC', {
          userId,
          provider,
          error: error.message
        })
        throw createError.internal(`Failed to delete OAuth token: ${error.message}`)
      }

      logger.info('OAuth token deleted successfully via RPC', {
        userId,
        provider
      })
    } catch (error) {
      logger.error('Error deleting OAuth token', {
        userId,
        provider,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Refresh token if needed (with 5-minute expiry buffer)
   */
  static async refreshTokenIfNeeded(
    userId: string,
    provider: 'google_drive' | 'microsoft'
  ): Promise<OAuthTokenData | null> {
    try {
      const token = await this.getToken(userId, provider)
      if (!token || !token.expiresAt) {
        return token
      }

      const expiresAt = new Date(token.expiresAt)
      const now = new Date()
      const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000)

      // Refresh if expires within 5 minutes
      if (expiresAt <= fiveMinutesFromNow) {
        logger.info('Token expires soon, refreshing', {
          userId,
          provider,
          expiresAt: expiresAt.toISOString()
        })
        return await this.refreshToken(userId, provider, token)
      }

      return token
    } catch (error) {
      logger.error('Error checking token expiry', {
        userId,
        provider,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return null
    }
  }

  /**
   * Internal method to refresh token
   */
  private static async refreshToken(
    userId: string,
    provider: 'google_drive' | 'microsoft',
    currentToken: OAuthTokenData
  ): Promise<OAuthTokenData | null> {
    if (provider === 'google_drive') {
      return await this.refreshGoogleToken(userId, currentToken)
    } else {
      return await this.refreshMicrosoftToken(userId, currentToken)
    }
  }

  /**
   * Refresh Google Drive token
   */
  private static async refreshGoogleToken(
    userId: string,
    currentToken: OAuthTokenData
  ): Promise<OAuthTokenData | null> {
    try {
      if (!currentToken.refreshToken) {
        throw new Error('No refresh token available for Google Drive')
      }

      if (!process.env.GOOGLE_DRIVE_CLIENT_ID || !process.env.GOOGLE_DRIVE_CLIENT_SECRET) {
        throw new Error('Google Drive OAuth credentials not configured')
      }

      logger.info('Refreshing Google Drive token', { userId })

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: currentToken.refreshToken,
          client_id: process.env.GOOGLE_DRIVE_CLIENT_ID,
          client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Google token refresh API error', {
          userId,
          status: response.status,
          statusText: response.statusText,
          error: errorText
        })
        
        // If refresh token is invalid, we need to re-authenticate
        if (response.status === 400 || response.status === 401) {
          await this.deleteToken(userId, 'google_drive')
          throw new Error('Refresh token invalid, re-authentication required')
        }
        
        throw new Error(`Google token refresh failed: ${response.statusText}`)
      }

      const data = await response.json()
      
      if (!data.access_token) {
        throw new Error('No access token in refresh response')
      }

      const newToken: OAuthTokenData = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || currentToken.refreshToken, // Google may not return new refresh token
        expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
        scope: currentToken.scope
      }

      await this.saveToken(userId, 'google_drive', newToken)
      
      logger.info('Google token refreshed successfully', { 
        userId,
        expiresAt: newToken.expiresAt
      })
      return newToken
    } catch (error) {
      logger.error('Failed to refresh Google token', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return null
    }
  }

  /**
   * Refresh Microsoft token
   */
  private static async refreshMicrosoftToken(
    userId: string,
    currentToken: OAuthTokenData
  ): Promise<OAuthTokenData | null> {
    try {
      if (!currentToken.refreshToken) {
        throw new Error('No refresh token available for Microsoft')
      }

      if (!process.env.MS_DRIVE_CLIENT_ID || !process.env.MS_DRIVE_CLIENT_SECRET) {
        throw new Error('Microsoft OAuth credentials not configured')
      }

      logger.info('Refreshing Microsoft token', { userId })

      const tenantId = process.env.MS_DRIVE_TENANT_ID || 'common'
      const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: currentToken.refreshToken,
          client_id: process.env.MS_DRIVE_CLIENT_ID,
          client_secret: process.env.MS_DRIVE_CLIENT_SECRET,
          scope: currentToken.scope || 'https://graph.microsoft.com/Files.Read.All offline_access'
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Microsoft token refresh API error', {
          userId,
          status: response.status,
          statusText: response.statusText,
          error: errorText
        })
        
        // If refresh token is invalid, we need to re-authenticate
        if (response.status === 400 || response.status === 401) {
          await this.deleteToken(userId, 'microsoft')
          throw new Error('Refresh token invalid, re-authentication required')
        }
        
        throw new Error(`Microsoft token refresh failed: ${response.statusText}`)
      }

      const data = await response.json()
      
      if (!data.access_token) {
        throw new Error('No access token in refresh response')
      }

      const newToken: OAuthTokenData = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || currentToken.refreshToken, // Microsoft may not return new refresh token
        expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
        scope: data.scope || currentToken.scope
      }

      await this.saveToken(userId, 'microsoft', newToken)
      
      logger.info('Microsoft token refreshed successfully', { 
        userId,
        expiresAt: newToken.expiresAt
      })
      return newToken
    } catch (error) {
      logger.error('Failed to refresh Microsoft token', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return null
    }
  }
}

// Legacy function exports for backward compatibility
export async function storeEncryptedToken(token: OAuthToken): Promise<void> {
  // Map legacy provider names to new ones
  let mappedProvider: 'google_drive' | 'microsoft'
  if (token.provider === 'google_drive' || token.provider === 'google') {
    mappedProvider = 'google_drive'
  } else {
    mappedProvider = 'microsoft'
  }
  
  await TokenStore.saveToken(token.userId, mappedProvider, {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: token.expiresAt.toISOString(),
    scope: token.scope
  })
}

export async function getDecryptedToken(
  userId: string, 
  provider: 'google' | 'microsoft'
): Promise<OAuthToken | null> {
  const mappedProvider = provider === 'google' ? 'google_drive' : 'microsoft'
  const tokenData = await TokenStore.getToken(userId, mappedProvider)
  
  if (!tokenData) {
    return null
  }

  return {
    userId,
    provider,
    accessToken: tokenData.accessToken,
    refreshToken: tokenData.refreshToken,
    scope: tokenData.scope,
    tokenType: 'Bearer',
    expiresAt: new Date(tokenData.expiresAt || Date.now() + 3600000)
  }
}

export async function getValidToken(
  userId: string, 
  provider: 'google' | 'microsoft'
): Promise<OAuthToken | null> {
  const mappedProvider = provider === 'google' ? 'google_drive' : 'microsoft'
  const tokenData = await TokenStore.refreshTokenIfNeeded(userId, mappedProvider)
  
  if (!tokenData) {
    return null
  }

  return {
    userId,
    provider,
    accessToken: tokenData.accessToken,
    refreshToken: tokenData.refreshToken,
    scope: tokenData.scope,
    tokenType: 'Bearer',
    expiresAt: new Date(tokenData.expiresAt || Date.now() + 3600000)
  }
}