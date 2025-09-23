/**
 * OAuth Token Store with RPC-based Security
 * 
 * This module provides secure storage and retrieval of OAuth tokens
 * using RPC functions with SECURITY DEFINER for enhanced security.
 */

import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'

type Provider = 'google' | 'microsoft'

const normalizeProvider = (provider: Provider | 'google'): Provider =>
  provider === 'google' ? 'google' : provider

export async function getToken(userId: string, provider: Provider): Promise<{
  accessToken: string
  refreshToken: string | null
  scope: string | null
  expiresAt: string | null
  updatedAt: string
} | null> {
  try {
    const { data, error } = await supabaseAdmin
      .rpc('get_oauth_token', {
        p_user_id: userId,
        p_provider: provider,
      })
      .single()

    if (error) {
      logger.error('Failed to get OAuth token via RPC', {
        userId,
        provider,
        error: error.message,
      })
      return null
    }

    if (!data) {
      return null
    }

    return {
      accessToken: data.access_token as string,
      refreshToken: (data.refresh_token as string | null) ?? null,
      scope: (data.scope as string | null) ?? null,
      expiresAt: (data.expires_at as string | null) ?? null,
      updatedAt: data.updated_at as string,
    }
  } catch (error) {
    logger.error('Error getting OAuth token', {
      userId,
      provider,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return null
  }
}

export async function saveToken(
  userId: string,
  provider: Provider,
  t: { accessToken: string; refreshToken?: string; scope?: string; expiresAt?: string | null }
): Promise<void> {
  console.log('[TokenStore] Calling RPC app.save_oauth_token with:', {
    p_user_id: userId,
    p_provider: provider,
    p_access_token: t.accessToken ? `${t.accessToken.substring(0, 10)}...` : null,
    p_refresh_token: t.refreshToken ? `${t.refreshToken.substring(0, 10)}...` : null,
    p_scope: t.scope,
    p_expires_at: t.expiresAt,
  })

  const { data, error } = await supabaseAdmin.rpc('save_oauth_token', {
    p_user_id: userId,
    p_provider: provider,
    p_access_token: t.accessToken,
    p_refresh_token: t.refreshToken ?? null,
    p_scope: t.scope ?? null,
    p_expires_at: t.expiresAt ?? null,
  })

  console.log('[TokenStore] RPC response:', { data, error })

  if (error) {
    logger.error('Failed to save OAuth token via RPC', {
      userId,
      provider,
      error: error.message,
    })
    throw error
  }
  
  console.log('[TokenStore] Token saved successfully')
}

const baseGetToken = getToken
const baseSaveToken = saveToken

export interface OAuthTokenData {
  accessToken: string
  refreshToken?: string
  expiresAt?: string
  scope?: string
  updatedAt?: string
}

export interface OAuthToken {
  userId: string
  provider: 'google' | 'microsoft' | 'google' // Support legacy 'google' format
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
    provider: Provider | 'google',
    tokenData: OAuthTokenData
  ): Promise<void> {
    const normalizedProvider = normalizeProvider(provider)

    try {
      await baseSaveToken(userId, normalizedProvider, {
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        scope: tokenData.scope,
        expiresAt: tokenData.expiresAt ?? null,
      })

      logger.info('OAuth token saved successfully via RPC', {
        userId,
        provider: normalizedProvider,
      })
    } catch (error) {
      logger.error('Error saving OAuth token', {
        userId,
        provider: normalizedProvider,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      if (error instanceof Error) {
        throw createError.internal(`Failed to save OAuth token: ${error.message}`)
      }
      throw error
    }
  }

  /**
   * Get OAuth token using secure RPC function
   */
  static async getToken(
    userId: string,
    provider: Provider | 'google'
  ): Promise<OAuthTokenData | null> {
    const normalizedProvider = normalizeProvider(provider)

    try {
      const token = await baseGetToken(userId, normalizedProvider)
      if (!token) {
        return null
      }

      return {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken ?? undefined,
        expiresAt: token.expiresAt ?? undefined,
        scope: token.scope ?? undefined,
        updatedAt: token.updatedAt ?? undefined,
      }
    } catch (error) {
      logger.error('Error getting OAuth token', {
        userId,
        provider: normalizedProvider,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return null
    }
  }

  /**
   * Delete OAuth token using secure RPC function
   */
  static async deleteToken(
    userId: string,
    provider: Provider | 'google'
  ): Promise<void> {
    const normalizedProvider = normalizeProvider(provider)

    try {
      const { error } = await supabaseAdmin.rpc('app.delete_oauth_token', {
        p_user_id: userId,
        p_provider: normalizedProvider,
      })

      if (error) {
        logger.error('Failed to delete OAuth token via RPC', {
          userId,
          provider: normalizedProvider,
          error: error.message,
        })
        throw createError.internal(`Failed to delete OAuth token: ${error.message}`)
      }

      logger.info('OAuth token deleted successfully via RPC', {
        userId,
        provider: normalizedProvider,
      })
    } catch (error) {
      logger.error('Error deleting OAuth token', {
        userId,
        provider: normalizedProvider,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      throw error
    }
  }

  /**
   * Refresh token if needed (with 5-minute expiry buffer)
   */
  static async refreshTokenIfNeeded(
    userId: string,
    provider: Provider | 'google'
  ): Promise<OAuthTokenData | null> {
    const normalizedProvider = normalizeProvider(provider)

    try {
      const token = await this.getToken(userId, normalizedProvider)
      if (!token || !token.expiresAt) {
        return token
      }

      const expiresAt = new Date(token.expiresAt)
      const now = new Date()
      const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000)

      if (expiresAt <= fiveMinutesFromNow) {
        logger.info('Token expires soon, refreshing', {
          userId,
          provider: normalizedProvider,
          expiresAt: expiresAt.toISOString(),
        })
        return await this.refreshToken(userId, normalizedProvider, token)
      }

      return token
    } catch (error) {
      logger.error('Error checking token expiry', {
        userId,
        provider: normalizedProvider,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return null
    }
  }

  /**
   * Internal method to refresh token
   */
  private static async refreshToken(
    userId: string,
    provider: Provider | 'google',
    currentToken: OAuthTokenData
  ): Promise<OAuthTokenData | null> {
    const normalizedProvider = normalizeProvider(provider)

    if (normalizedProvider === 'google') {
      return await this.refreshGoogleToken(userId, currentToken)
    }

    return await this.refreshMicrosoftToken(userId, currentToken)
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
          await this.deleteToken(userId, 'google')
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

      await this.saveToken(userId, 'google', newToken)
      
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
  const mappedProvider: Provider = token.provider === 'microsoft' ? 'microsoft' : 'google'

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
  const tokenData = await TokenStore.getToken(userId, provider)
  
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
  const tokenData = await TokenStore.refreshTokenIfNeeded(userId, provider)
  
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
