/**
 * Google Picker Token Service
 * 
 * Provides secure token management for Google Picker integration.
 * Generates short-lived access tokens for picker authentication.
 */

import { TokenStore } from '@/app/lib/oauth/token-store'
import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'
import { 
  generateSecurePickerToken, 
  validateTokenScope, 
  cleanupPickerTokens,
  type SecureTokenOptions 
} from './security-service'
import { 
  validateOAuthScope, 
  hasMinimalPermissions,
  getRecommendedScope 
} from './permission-validator'

export interface PickerTokenResponse {
  accessToken: string
  expiresIn: number
  scope: string
  tokenId?: string
  securityMetadata?: {
    generatedAt: string
    maxLifetime: number
    scopeValidated: boolean
  }
}

export interface PickerTokenError {
  type: 'TOKEN_NOT_FOUND' | 'TOKEN_REFRESH_FAILED' | 'INVALID_CREDENTIALS' | 'NETWORK_ERROR' | 'REFRESH_TOKEN_EXPIRED'
  message: string
  requiresReauth: boolean
}

export interface TokenRefreshEvent {
  userId: string
  success: boolean
  errorType?: string
  expiresAt?: string
  timeUntilExpiry?: number
  refreshDuration?: number
}

/**
 * Generate a picker token for Google Picker API
 * Uses enhanced security service with token lifecycle management
 */
export async function generatePickerToken(userId: string, options?: SecureTokenOptions): Promise<PickerTokenResponse> {
  try {
    logger.info('Generating secure picker token', { userId })

    // Use secure token generation with enhanced security measures
    const secureToken = await generateSecurePickerToken(userId, {
      maxLifetime: 3600, // 1 hour max
      scopeValidation: true,
      auditLogging: true,
      ...options
    })

    // Validate token scope for security compliance
    const scopeValidation = validateTokenScope(secureToken.scope)
    
    if (!scopeValidation.isValid) {
      logger.error('Token scope validation failed', {
        userId,
        tokenId: secureToken.tokenId,
        missingScopes: scopeValidation.missingScopes,
        hasMinimalPermissions: scopeValidation.hasMinimalPermissions
      })
      
      throw createPickerError(
        'INVALID_CREDENTIALS',
        'Token does not have required permissions for file picker.',
        true
      )
    }

    // Additional permission validation for minimal access
    const permissionValidation = validateOAuthScope(secureToken.scope, userId, secureToken.tokenId)
    
    if (!permissionValidation.isValid) {
      logger.error('Permission validation failed', {
        userId,
        tokenId: secureToken.tokenId,
        violations: permissionValidation.violations,
        riskLevel: permissionValidation.riskLevel
      })
      
      throw createPickerError(
        'INVALID_CREDENTIALS',
        'Token permissions do not meet security requirements.',
        true
      )
    }

    // Log permission compliance
    if (permissionValidation.riskLevel === 'medium') {
      logger.warn('Token has elevated permissions', {
        userId,
        tokenId: secureToken.tokenId,
        currentScope: secureToken.scope,
        recommendedScope: getRecommendedScope(),
        violations: permissionValidation.violations
      })
    }

    // Log successful token generation with security metadata
    logTokenRefreshEvent({
      userId,
      success: true,
      expiresAt: secureToken.securityMetadata.expiresAt,
      timeUntilExpiry: secureToken.expiresIn
    })

    return {
      accessToken: secureToken.accessToken,
      expiresIn: secureToken.expiresIn,
      scope: secureToken.scope,
      tokenId: secureToken.tokenId,
      securityMetadata: {
        generatedAt: secureToken.securityMetadata.generatedAt,
        maxLifetime: secureToken.securityMetadata.maxLifetime,
        scopeValidated: scopeValidation.isValid
      }
    }

  } catch (error) {
    // If it's already a PickerTokenError, re-throw it
    if (error instanceof Error && 'type' in error) {
      throw error
    }

    // Handle specific error cases with detailed logging
    if (error instanceof Error) {
      // Log token generation failure event
      logTokenRefreshEvent({
        userId,
        success: false,
        errorType: error.message
      })

      if (error.message.includes('No valid Google Drive token found')) {
        logger.warn('No valid Google Drive token found for picker', { userId })
        throw createPickerError(
          'TOKEN_NOT_FOUND',
          'No valid Google Drive token found. Please reconnect your Google Drive.',
          true
        )
      }

      if (error.message.includes('Token does not have required drive.file scope')) {
        logger.error('Invalid token scope for picker', { userId, error: error.message })
        throw createPickerError(
          'INVALID_CREDENTIALS',
          'Your Google Drive connection does not have the required permissions.',
          true
        )
      }

      if (error.message.includes('Failed to refresh token')) {
        logger.error('Token refresh failed during secure generation', { userId, error: error.message })
        throw createPickerError(
          'TOKEN_REFRESH_FAILED',
          'Failed to refresh Google Drive access token. Please reconnect your Google Drive.',
          true
        )
      }

      if (error.message.includes('re-authentication required') || error.message.includes('Refresh token invalid')) {
        logger.warn('Re-authentication required for picker token', { 
          userId, 
          error: error.message,
          action: 'delete_stored_token'
        })
        throw createPickerError(
          'REFRESH_TOKEN_EXPIRED',
          'Your Google Drive access has expired. Please reconnect your Google Drive.',
          true
        )
      }

      if (error.message.includes('credentials not configured')) {
        logger.error('Google OAuth credentials not configured', { 
          userId,
          error: error.message,
          requiredEnvVars: ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET']
        })
        throw createPickerError(
          'INVALID_CREDENTIALS',
          'Google Drive integration is not properly configured.',
          false
        )
      }

      if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('timeout')) {
        logger.error('Network error during token generation', { 
          userId, 
          error: error.message,
          retryable: true
        })
        throw createPickerError(
          'NETWORK_ERROR',
          'Network error occurred while generating token. Please try again.',
          false
        )
      }
    }

    // Generic error fallback
    logger.error('Unexpected error generating secure picker token', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    
    throw createPickerError(
      'TOKEN_REFRESH_FAILED',
      'Failed to generate picker token. Please try again.',
      false
    )
  }
}

/**
 * Log token refresh events for monitoring and debugging
 */
function logTokenRefreshEvent(event: TokenRefreshEvent): void {
  const logData = {
    event: 'picker_token_refresh',
    userId: event.userId,
    success: event.success,
    timestamp: new Date().toISOString(),
    ...(event.errorType && { errorType: event.errorType }),
    ...(event.expiresAt && { expiresAt: event.expiresAt }),
    ...(event.timeUntilExpiry && { timeUntilExpiry: event.timeUntilExpiry }),
    ...(event.refreshDuration && { refreshDuration: event.refreshDuration })
  }

  if (event.success) {
    logger.info('Token refresh successful', logData)
  } else {
    logger.warn('Token refresh failed', logData)
  }
}

/**
 * Create a structured picker error with enhanced context
 */
function createPickerError(
  type: PickerTokenError['type'],
  message: string,
  requiresReauth: boolean
): Error & PickerTokenError {
  const error = new Error(message) as Error & PickerTokenError
  error.type = type
  error.message = message
  error.requiresReauth = requiresReauth
  return error
}

/**
 * Validate picker token requirements
 */
export function validatePickerTokenResponse(token: PickerTokenResponse): boolean {
  return !!(
    token.accessToken &&
    typeof token.expiresIn === 'number' &&
    token.expiresIn > 0 &&
    token.scope
  )
}

/**
 * Clean up picker tokens for a user (called on sign-out or disconnect)
 */
export async function cleanupUserPickerTokens(userId: string): Promise<void> {
  try {
    logger.info('Cleaning up picker tokens for user', { userId })
    
    const result = await cleanupPickerTokens(userId)
    
    logger.info('Picker token cleanup completed', {
      userId,
      tokensProcessed: result.tokensProcessed,
      tokensRevoked: result.tokensRevoked,
      errors: result.errors
    })
    
  } catch (error) {
    logger.error('Failed to cleanup picker tokens', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

/**
 * Get user-friendly error message for picker token errors
 */
export function getPickerErrorGuidance(error: PickerTokenError): {
  userMessage: string
  actionRequired: string
  canRetry: boolean
} {
  switch (error.type) {
    case 'TOKEN_NOT_FOUND':
      return {
        userMessage: 'Google Drive is not connected to your account.',
        actionRequired: 'Please connect your Google Drive account in the storage settings.',
        canRetry: false
      }

    case 'REFRESH_TOKEN_EXPIRED':
      return {
        userMessage: 'Your Google Drive access has expired.',
        actionRequired: 'Please reconnect your Google Drive account to continue.',
        canRetry: false
      }

    case 'TOKEN_REFRESH_FAILED':
      return {
        userMessage: 'Failed to refresh your Google Drive access.',
        actionRequired: error.requiresReauth 
          ? 'Please reconnect your Google Drive account.'
          : 'Please try again in a few moments.',
        canRetry: !error.requiresReauth
      }

    case 'NETWORK_ERROR':
      return {
        userMessage: 'Network connection issue occurred.',
        actionRequired: 'Please check your internet connection and try again.',
        canRetry: true
      }

    case 'INVALID_CREDENTIALS':
      return {
        userMessage: 'Google Drive integration is temporarily unavailable.',
        actionRequired: 'Please try again later or contact support if the issue persists.',
        canRetry: true
      }

    default:
      return {
        userMessage: 'An unexpected error occurred.',
        actionRequired: 'Please try again or contact support if the issue persists.',
        canRetry: true
      }
  }
}
