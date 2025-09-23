/**
 * OAuth Tokens Repository Usage Examples
 * 
 * This file demonstrates how to use the OAuth tokens repository
 * for managing OAuth tokens in the private schema using RPC functions.
 */

import { oauthTokensRepo, type OAuthTokenData, type OAuthProvider } from './oauth-tokens-repo'

/**
 * Example: Save OAuth token for Google Drive
 */
export async function saveGoogleToken(userId: string, tokenData: OAuthTokenData): Promise<void> {
  try {
    await oauthTokensRepo.saveToken(userId, 'google', tokenData)
    console.log('Google OAuth token saved successfully')
  } catch (error) {
    console.error('Failed to save Google OAuth token:', error)
    throw error
  }
}

/**
 * Example: Get OAuth token for Microsoft OneDrive
 */
export async function getMicrosoftToken(userId: string): Promise<OAuthTokenData | null> {
  try {
    const token = await oauthTokensRepo.getToken(userId, 'microsoft')
    if (token) {
      console.log('Microsoft OAuth token retrieved successfully')
      return token
    } else {
      console.log('No Microsoft OAuth token found for user')
      return null
    }
  } catch (error) {
    console.error('Failed to get Microsoft OAuth token:', error)
    throw error
  }
}

/**
 * Example: Check if user has connected Google Drive
 */
export async function isGoogleConnected(userId: string): Promise<boolean> {
  try {
    const exists = await oauthTokensRepo.tokenExists(userId, 'google')
    console.log(`Google Drive connection status: ${exists ? 'connected' : 'not connected'}`)
    return exists
  } catch (error) {
    console.error('Failed to check Google connection status:', error)
    throw error
  }
}

/**
 * Example: Get token status with expiry information
 */
export async function getTokenStatus(userId: string, provider: OAuthProvider) {
  try {
    const status = await oauthTokensRepo.getTokenStatus(userId, provider)
    
    if (!status.exists) {
      console.log(`No ${provider} token found`)
      return status
    }

    if (status.isExpired) {
      console.log(`${provider} token has expired`)
    } else if (status.expiresSoon) {
      console.log(`${provider} token expires soon`)
    } else {
      console.log(`${provider} token is valid`)
    }

    return status
  } catch (error) {
    console.error(`Failed to get ${provider} token status:`, error)
    throw error
  }
}

/**
 * Example: Disconnect a provider (delete token)
 */
export async function disconnectProvider(userId: string, provider: OAuthProvider): Promise<void> {
  try {
    await oauthTokensRepo.deleteToken(userId, provider)
    console.log(`${provider} disconnected successfully`)
  } catch (error) {
    console.error(`Failed to disconnect ${provider}:`, error)
    throw error
  }
}

/**
 * Example: Get all connection statuses for a user
 */
export async function getAllConnectionStatuses(userId: string) {
  try {
    const statuses = await oauthTokensRepo.getAllConnectionStatuses(userId)
    
    console.log('Connection statuses:')
    statuses.forEach(status => {
      console.log(`- ${status.provider}: ${status.connected ? 'connected' : 'disconnected'}`)
      if (status.lastSync) {
        console.log(`  Last sync: ${status.lastSync}`)
      }
      if (status.errorMessage) {
        console.log(`  Error: ${status.errorMessage}`)
      }
    })

    return statuses
  } catch (error) {
    console.error('Failed to get connection statuses:', error)
    throw error
  }
}

/**
 * Example: Update connection status manually
 */
export async function updateConnectionStatus(
  userId: string, 
  provider: OAuthProvider, 
  connected: boolean, 
  errorMessage?: string
): Promise<void> {
  try {
    await oauthTokensRepo.updateConnectionStatus(userId, provider, connected, errorMessage)
    console.log(`${provider} connection status updated: ${connected ? 'connected' : 'disconnected'}`)
  } catch (error) {
    console.error(`Failed to update ${provider} connection status:`, error)
    throw error
  }
}

/**
 * Example: Complete OAuth flow - save token and update status
 */
export async function completeOAuthFlow(
  userId: string,
  provider: OAuthProvider,
  tokenData: OAuthTokenData
): Promise<void> {
  try {
    // Save the token (this automatically updates connection status to connected)
    await oauthTokensRepo.saveToken(userId, provider, tokenData)
    
    console.log(`OAuth flow completed for ${provider}`)
    console.log(`- Access token saved: ${tokenData.accessToken.substring(0, 10)}...`)
    console.log(`- Has refresh token: ${!!tokenData.refreshToken}`)
    console.log(`- Expires at: ${tokenData.expiresAt || 'never'}`)
    console.log(`- Scope: ${tokenData.scope || 'default'}`)
  } catch (error) {
    // Update connection status to show error
    try {
      await oauthTokensRepo.updateConnectionStatus(
        userId, 
        provider, 
        false, 
        `OAuth flow failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    } catch (statusError) {
      console.error('Failed to update connection status after OAuth error:', statusError)
    }
    
    console.error(`OAuth flow failed for ${provider}:`, error)
    throw error
  }
}

/**
 * Example: Refresh token workflow
 */
export async function refreshTokenIfNeeded(
  userId: string,
  provider: OAuthProvider
): Promise<OAuthTokenData | null> {
  try {
    // Check token status
    const status = await oauthTokensRepo.getTokenStatus(userId, provider)
    
    if (!status.exists) {
      console.log(`No ${provider} token found`)
      return null
    }

    if (!status.isExpired && !status.expiresSoon) {
      // Token is still valid, return it
      return await oauthTokensRepo.getToken(userId, provider)
    }

    console.log(`${provider} token needs refresh`)
    
    // Get current token for refresh
    const currentToken = await oauthTokensRepo.getToken(userId, provider)
    if (!currentToken?.refreshToken) {
      console.log(`No refresh token available for ${provider}`)
      return null
    }

    // Here you would implement the actual token refresh logic
    // This is just an example of how the repository would be used
    console.log(`Refreshing ${provider} token...`)
    
    // After successful refresh, save the new token
    // const newTokenData = await refreshTokenWithProvider(currentToken.refreshToken)
    // await oauthTokensRepo.saveToken(userId, provider, newTokenData)
    
    return currentToken
  } catch (error) {
    console.error(`Failed to refresh ${provider} token:`, error)
    throw error
  }
}

/**
 * Example: Batch operations for multiple providers
 */
export async function disconnectAllProviders(userId: string): Promise<void> {
  const providers: OAuthProvider[] = ['google', 'microsoft']
  
  const results = await Promise.allSettled(
    providers.map(provider => oauthTokensRepo.deleteToken(userId, provider))
  )

  results.forEach((result, index) => {
    const provider = providers[index]
    if (result.status === 'fulfilled') {
      console.log(`${provider} disconnected successfully`)
    } else {
      console.error(`Failed to disconnect ${provider}:`, result.reason)
    }
  })
}

/**
 * Example: Health check for OAuth tokens
 */
export async function checkOAuthHealth(userId: string) {
  try {
    const statuses = await oauthTokensRepo.getAllConnectionStatuses(userId)
    const providers: OAuthProvider[] = ['google', 'microsoft']
    
    const health = {
      connected: 0,
      expired: 0,
      expiringSoon: 0,
      errors: 0
    }

    for (const provider of providers) {
      try {
        const tokenStatus = await oauthTokensRepo.getTokenStatus(userId, provider)
        
        if (tokenStatus.exists) {
          health.connected++
          
          if (tokenStatus.isExpired) {
            health.expired++
          } else if (tokenStatus.expiresSoon) {
            health.expiringSoon++
          }
        }
      } catch (error) {
        health.errors++
        console.error(`Health check failed for ${provider}:`, error)
      }
    }

    console.log('OAuth Health Summary:', health)
    return health
  } catch (error) {
    console.error('OAuth health check failed:', error)
    throw error
  }
}