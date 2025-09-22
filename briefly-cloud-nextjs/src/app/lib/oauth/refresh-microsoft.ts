/**
 * Microsoft OAuth Token Refresh Utility
 * 
 * Handles automatic token refresh when access tokens expire
 */

import { TokenStore } from './token-store'
import { OAuthLogger } from './logger'

export interface RefreshResult {
  success: boolean
  accessToken?: string
  expiresAt?: string
  error?: string
}

export async function refreshMicrosoftToken(userId: string): Promise<RefreshResult> {
  try {
    // Get existing token
    const existingToken = await TokenStore.getToken(userId, 'microsoft')
    
    if (!existingToken?.refreshToken) {
      OAuthLogger.logTokenOperation('microsoft', 'refresh', userId, false, {
        error: 'No refresh token available'
      })
      return { 
        success: false, 
        error: 'No refresh token available. Please reconnect your OneDrive.' 
      }
    }

    // Exchange refresh token for new access token
    const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MS_DRIVE_CLIENT_ID!,
        client_secret: process.env.MS_DRIVE_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: existingToken.refreshToken,
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      
      OAuthLogger.logTokenOperation('microsoft', 'refresh', userId, false, {
        httpStatus: response.status,
        httpStatusText: response.statusText,
        responseBody: errorText
      })

      // Handle specific refresh token errors
      if (response.status === 400) {
        return { 
          success: false, 
          error: 'Refresh token expired. Please reconnect your OneDrive.' 
        }
      }

      return { 
        success: false, 
        error: 'Failed to refresh OneDrive access token.' 
      }
    }

    const tokens = await response.json()

    // Calculate new expiration time
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    // Update stored token (keep existing refresh token unless Microsoft sends a new one)
    await TokenStore.saveToken(userId, 'microsoft', {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? existingToken.refreshToken,
      expiresAt,
      scope: tokens.scope ?? existingToken.scope
    })

    OAuthLogger.logTokenOperation('microsoft', 'refresh', userId, true, {
      scope: tokens.scope ?? existingToken.scope,
      newRefreshToken: !!tokens.refresh_token
    })

    return {
      success: true,
      accessToken: tokens.access_token,
      expiresAt
    }

  } catch (error) {
    OAuthLogger.logTokenOperation('microsoft', 'refresh', userId, false, {
      error: error instanceof Error ? error.message : String(error)
    })

    return {
      success: false,
      error: 'Unexpected error refreshing OneDrive token.'
    }
  }
}

/**
 * Check if a token needs refresh (expired or expires within 5 minutes)
 */
export function needsRefresh(token: { expiresAt?: string }): boolean {
  if (!token.expiresAt) return true
  
  const expiresAt = new Date(token.expiresAt)
  const now = new Date()
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000)
  
  return expiresAt <= fiveMinutesFromNow
}

/**
 * Get a valid access token, refreshing if necessary
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  try {
    const token = await TokenStore.getToken(userId, 'microsoft')
    
    if (!token) {
      return null
    }

    if (!needsRefresh(token)) {
      return token.accessToken
    }

    // Token needs refresh
    const refreshResult = await refreshMicrosoftToken(userId)
    
    if (refreshResult.success && refreshResult.accessToken) {
      return refreshResult.accessToken
    }

    return null
  } catch (error) {
    OAuthLogger.logError('microsoft', 'get_valid_token', error instanceof Error ? error : new Error(String(error)), {
      userId,
      operation: 'get_valid_access_token'
    })
    return null
  }
}
