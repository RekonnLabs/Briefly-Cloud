/**
 * OAuth Token Store with Encryption
 * 
 * This module provides secure storage and retrieval of OAuth tokens
 * using database-backed encryption via SECURITY DEFINER functions.
 */

import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'

export interface OAuthToken {
  userId: string
  provider: 'google_drive' | 'microsoft_drive'
  accessToken: string
  refreshToken?: string
  scope?: string
  tokenType?: string
  expiresAt: Date
}

export interface StoredOAuthToken {
  user_id: string
  provider: string
  access_token: string
  refresh_token?: string
  scope?: string
  token_type?: string
  expires_at: string
  created_at: string
  updated_at: string
}

/**
 * Store encrypted OAuth token using SECURITY DEFINER function
 */
export async function storeEncryptedToken(token: OAuthToken): Promise<void> {
  try {
    const { error } = await supabaseAdmin.rpc('encrypt_oauth_token', {
      p_user_id: token.userId,
      p_provider: token.provider,
      p_access_token: token.accessToken,
      p_refresh_token: token.refreshToken || null,
      p_scope: token.scope || null,
      p_token_type: token.tokenType || 'Bearer',
      p_expires_at: token.expiresAt.toISOString()
    })

    if (error) {
      logger.error('Failed to store encrypted OAuth token', {
        userId: token.userId,
        provider: token.provider,
        error: error.message
      })
      throw createError.internalServerError('Failed to store OAuth token')
    }

    logger.info('OAuth token stored successfully', {
      userId: token.userId,
      provider: token.provider
    })
  } catch (error) {
    logger.error('Error storing encrypted OAuth token', {
      userId: token.userId,
      provider: token.provider,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    throw error
  }
}

/**
 * Retrieve and decrypt OAuth token using SECURITY DEFINER function
 */
export async function getDecryptedToken(
  userId: string, 
  provider: 'google' | 'microsoft'
): Promise<OAuthToken | null> {
  try {
    const { data, error } = await supabaseAdmin.rpc('decrypt_oauth_token', {
      p_user_id: userId,
      p_provider: provider
    })

    if (error) {
      logger.error('Failed to retrieve encrypted OAuth token', {
        userId,
        provider,
        error: error.message
      })
      throw createError.internalServerError('Failed to retrieve OAuth token')
    }

    if (!data || data.length === 0) {
      return null
    }

    const tokenData = data[0]
    return {
      userId: tokenData.user_id,
      provider: tokenData.provider as 'google' | 'microsoft',
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      scope: tokenData.scope,
      tokenType: tokenData.token_type,
      expiresAt: new Date(tokenData.expires_at)
    }
  } catch (error) {
    logger.error('Error retrieving encrypted OAuth token', {
      userId,
      provider,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    throw error
  }
}

/**
 * Check if OAuth token exists and is valid
 */
export async function isTokenValid(
  userId: string, 
  provider: 'google' | 'microsoft'
): Promise<boolean> {
  try {
    const token = await getDecryptedToken(userId, provider)
    if (!token) {
      return false
    }

    // Check if token is expired (with 5 minute buffer)
    const now = new Date()
    const expiryBuffer = new Date(token.expiresAt.getTime() - 5 * 60 * 1000)
    
    return now < expiryBuffer
  } catch (error) {
    logger.error('Error checking token validity', {
      userId,
      provider,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    return false
  }
}

/**
 * Delete OAuth token
 */
export async function deleteToken(
  userId: string, 
  provider: 'google' | 'microsoft'
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('private.oauth_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('provider', provider)

    if (error) {
      logger.error('Failed to delete OAuth token', {
        userId,
        provider,
        error: error.message
      })
      throw createError.internalServerError('Failed to delete OAuth token')
    }

    logger.info('OAuth token deleted successfully', {
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
 * Refresh OAuth token (Google specific)
 */
export async function refreshGoogleToken(userId: string): Promise<OAuthToken | null> {
  try {
    const existingToken = await getDecryptedToken(userId, 'google')
    if (!existingToken || !existingToken.refreshToken) {
      return null
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: existingToken.refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    const tokenData = await response.json()
    
    if (!response.ok || !tokenData.access_token) {
      logger.error('Failed to refresh Google token', {
        userId,
        error: tokenData.error_description || 'Unknown error'
      })
      return null
    }

    const refreshedToken: OAuthToken = {
      userId,
      provider: 'google',
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || existingToken.refreshToken,
      scope: existingToken.scope,
      tokenType: tokenData.token_type || 'Bearer',
      expiresAt: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000)
    }

    await storeEncryptedToken(refreshedToken)
    return refreshedToken
  } catch (error) {
    logger.error('Error refreshing Google token', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    return null
  }
}

/**
 * Refresh OAuth token (Microsoft specific)
 */
export async function refreshMicrosoftToken(userId: string): Promise<OAuthToken | null> {
  try {
    const existingToken = await getDecryptedToken(userId, 'microsoft')
    if (!existingToken || !existingToken.refreshToken) {
      return null
    }

    const tenant = process.env.AZURE_AD_TENANT_ID || 'common'
    const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.AZURE_AD_CLIENT_ID!,
        client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
        refresh_token: existingToken.refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    const tokenData = await response.json()
    
    if (!response.ok || !tokenData.access_token) {
      logger.error('Failed to refresh Microsoft token', {
        userId,
        error: tokenData.error_description || 'Unknown error'
      })
      return null
    }

    const refreshedToken: OAuthToken = {
      userId,
      provider: 'microsoft',
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || existingToken.refreshToken,
      scope: existingToken.scope,
      tokenType: tokenData.token_type || 'Bearer',
      expiresAt: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000)
    }

    await storeEncryptedToken(refreshedToken)
    return refreshedToken
  } catch (error) {
    logger.error('Error refreshing Microsoft token', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    return null
  }
}

/**
 * Get valid OAuth token (with automatic refresh if needed)
 */
export async function getValidToken(
  userId: string, 
  provider: 'google' | 'microsoft'
): Promise<OAuthToken | null> {
  try {
    // First try to get existing token
    const token = await getDecryptedToken(userId, provider)
    if (!token) {
      return null
    }

    // Check if token is still valid (with 5 minute buffer)
    const now = new Date()
    const expiryBuffer = new Date(token.expiresAt.getTime() - 5 * 60 * 1000)
    
    if (now < expiryBuffer) {
      return token
    }

    // Token is expired, try to refresh
    logger.info('OAuth token expired, attempting refresh', {
      userId,
      provider
    })

    if (provider === 'google') {
      return await refreshGoogleToken(userId)
    } else if (provider === 'microsoft') {
      return await refreshMicrosoftToken(userId)
    }

    return null
  } catch (error) {
    logger.error('Error getting valid OAuth token', {
      userId,
      provider,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    return null
  }
}