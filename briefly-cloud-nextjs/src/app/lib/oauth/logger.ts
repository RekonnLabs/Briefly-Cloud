/**
 * OAuth Logger Utility
 * 
 * Provides structured logging for OAuth flows with consistent formatting
 * and correlation ID tracking for debugging and monitoring.
 */

export interface OAuthLogContext {
  provider: string
  userId?: string
  correlationId?: string
  timestamp?: string
  [key: string]: unknown
}

export interface OAuthSecurityEventContext {
  provider: string
  event: 'state_mismatch' | 'missing_state' | 'invalid_user' | 'start_failed' | 'callback_failed'
  expected?: string
  received?: string
  userId?: string
  correlationId?: string
  [key: string]: unknown
}

export class OAuthLogger {
  /**
   * Log OAuth initiation events
   * 
   * @param provider - OAuth provider (google, microsoft)
   * @param userId - Authenticated user ID
   * @param correlationId - Request correlation ID for tracing
   * @param additionalContext - Additional context data
   */
  static logStart(
    provider: string, 
    userId: string, 
    correlationId?: string,
    additionalContext?: Record<string, unknown>
  ): void {
    const context: OAuthLogContext = {
      provider,
      userId,
      correlationId,
      timestamp: new Date().toISOString(),
      ...additionalContext
    }

    console.info('[oauth:start]', context)
  }

  /**
   * Log OAuth callback events (success and failure)
   * 
   * @param provider - OAuth provider (google, microsoft)
   * @param userId - Authenticated user ID (if available)
   * @param success - Whether the callback was successful
   * @param error - Error code if callback failed
   * @param details - Additional error or success details
   */
  static logCallback(
    provider: string,
    userId: string | undefined,
    success: boolean,
    error?: string,
    details?: Record<string, unknown>
  ): void {
    const context: OAuthLogContext = {
      provider,
      userId,
      success,
      error,
      timestamp: new Date().toISOString(),
      ...details
    }

    const level = success ? 'info' : 'error'
    console[level]('[oauth:callback]', context)
  }

  /**
   * Log security-related OAuth events with HIGH severity
   * 
   * @param provider - OAuth provider (google, microsoft)
   * @param event - Type of security event
   * @param details - Security event details including expected vs received values
   */
  static logSecurityEvent(
    provider: string,
    event: OAuthSecurityEventContext['event'],
    details: Omit<OAuthSecurityEventContext, 'provider' | 'event'>
  ): void {
    const context: OAuthSecurityEventContext = {
      provider,
      event,
      timestamp: new Date().toISOString(),
      severity: 'HIGH',
      ...details
    }

    console.error('[oauth:security]', context)
  }

  /**
   * Log general OAuth errors with structured context
   * 
   * @param provider - OAuth provider (google, microsoft)
   * @param operation - OAuth operation (start, callback, token_exchange, etc.)
   * @param error - Error message or code
   * @param context - Additional error context
   */
  static logError(
    provider: string,
    operation: string,
    error: string | Error,
    context?: Record<string, unknown>
  ): void {
    const errorMessage = error instanceof Error ? error.message : error
    const errorStack = error instanceof Error ? error.stack : undefined

    const logContext: OAuthLogContext = {
      provider,
      operation,
      error: errorMessage,
      stack: errorStack,
      timestamp: new Date().toISOString(),
      ...context
    }

    console.error('[oauth:error]', logContext)
  }

  /**
   * Log OAuth token operations (storage, refresh, etc.)
   * 
   * @param provider - OAuth provider (google, microsoft)
   * @param operation - Token operation (store, refresh, revoke)
   * @param userId - User ID associated with tokens
   * @param success - Whether operation was successful
   * @param details - Additional operation details
   */
  static logTokenOperation(
    provider: string,
    operation: 'store' | 'refresh' | 'revoke' | 'retrieve',
    userId: string,
    success: boolean,
    details?: Record<string, unknown>
  ): void {
    const context: OAuthLogContext = {
      provider,
      operation,
      userId,
      success,
      timestamp: new Date().toISOString(),
      ...details
    }

    const level = success ? 'info' : 'error'
    console[level]('[oauth:token]', context)
  }
}
