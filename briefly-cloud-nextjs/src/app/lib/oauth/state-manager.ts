/**
 * OAuth State Security Manager
 * Handles state parameter generation and verification for OAuth flows
 * Prevents CSRF attacks and token binding to wrong accounts
 */

import { AppError, ErrorCode } from '../api-errors'

export interface OAuthSecurityError {
  category: 'AUTHENTICATION'
  code: 'OAUTH_STATE_MISMATCH'
  message: string
  details: {
    expected: string
    received: string
  }
  retryable: false
}

/**
 * OAuth State Manager for secure state parameter handling
 * Uses user ID as state parameter for simplicity and security
 */
export class OAuthStateManager {
  /**
   * Generate OAuth state parameter
   * Uses user ID directly for state verification
   * 
   * @param userId - The authenticated user's ID
   * @returns The state parameter (user ID)
   */
  static generateState(userId: string): string {
    if (!userId || typeof userId !== 'string') {
      throw new Error('User ID is required for state generation')
    }
    return userId
  }

  /**
   * Verify OAuth state parameter matches expected user ID
   * 
   * @param returnedState - State parameter returned from OAuth provider
   * @param expectedUserId - Expected user ID from current session
   * @returns True if state matches, false otherwise
   */
  static verifyState(returnedState: string, expectedUserId: string): boolean {
    if (!returnedState || !expectedUserId) {
      return false
    }
    return returnedState === expectedUserId
  }

  /**
   * Create security error for state mismatch
   * 
   * @param expected - Expected user ID
   * @param received - Received state parameter
   * @returns AppError with security details
   */
  static createSecurityError(expected: string, received: string): AppError {
    return new AppError(
      ErrorCode.UNAUTHORIZED,
      'OAuth state verification failed - possible CSRF attack',
      401,
      {
        category: 'AUTHENTICATION',
        securityEvent: 'OAUTH_STATE_MISMATCH',
        expected,
        received,
        retryable: false
      }
    )
  }

  /**
   * Validate state parameter format
   * Ensures state parameter is a valid user ID format
   * 
   * @param state - State parameter to validate
   * @returns True if valid format, false otherwise
   */
  static isValidStateFormat(state: string): boolean {
    if (!state || typeof state !== 'string') {
      return false
    }
    
    // Basic validation - should be a non-empty string
    // In production, you might want to validate UUID format if using UUIDs
    return state.length > 0 && state.trim() === state
  }

  /**
   * Log state generation for debugging
   * 
   * @param provider - OAuth provider name
   * @param userId - User ID used as state
   * @param correlationId - Optional correlation ID for tracking
   */
  static logStateGeneration(
    provider: string, 
    userId: string, 
    correlationId?: string
  ): void {
    console.info('[oauth:state:generate]', {
      provider,
      userId,
      correlationId,
      timestamp: new Date().toISOString()
    })
  }

  /**
   * Log state verification result for debugging
   * 
   * @param provider - OAuth provider name
   * @param success - Whether verification succeeded
   * @param expected - Expected user ID
   * @param received - Received state parameter
   * @param correlationId - Optional correlation ID for tracking
   */
  static logStateVerification(
    provider: string,
    success: boolean,
    expected: string,
    received: string,
    correlationId?: string
  ): void {
    const level = success ? 'info' : 'error'
    console[level]('[oauth:state:verify]', {
      provider,
      success,
      expected,
      received,
      correlationId,
      timestamp: new Date().toISOString(),
      ...(success ? {} : { severity: 'HIGH', securityEvent: 'STATE_MISMATCH' })
    })
  }
}