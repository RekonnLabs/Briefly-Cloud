/**
 * OAuth Flow Debugging Utilities
 * Provides comprehensive logging and debugging tools for OAuth authentication flows
 */

import { logger } from '../logger'

/**
 * OAuth flow step types for consistent logging
 */
export type OAuthFlowStep = 
  | 'SESSION_CREATE'
  | 'REDIRECT_TO_PROVIDER'
  | 'CALLBACK_RECEIVED'
  | 'TOKEN_EXCHANGE'
  | 'CONNECTION_STORE'
  | 'FLOW_COMPLETE'
  | 'FLOW_ERROR'

/**
 * OAuth provider types
 */
export type OAuthProvider = 'google' | 'microsoft' | 'apideck'

/**
 * OAuth flow context for debugging
 */
export interface OAuthFlowContext {
  correlationId: string
  provider: OAuthProvider
  userId?: string
  step: OAuthFlowStep
  sessionId?: string
  connectionId?: string
  error?: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
  metadata?: Record<string, unknown>
}

/**
 * Log OAuth flow step with detailed context
 */
export function logOAuthStep(context: OAuthFlowContext): void {
  const logLevel = context.error ? 'error' : 'info'
  const message = context.error 
    ? `OAuth ${context.step} failed for ${context.provider}`
    : `OAuth ${context.step} for ${context.provider}`
  
  logger[logLevel](message, {
    correlationId: context.correlationId,
    provider: context.provider,
    userId: context.userId,
    step: context.step,
    sessionId: context.sessionId,
    connectionId: context.connectionId,
    timestamp: new Date().toISOString(),
    error: context.error,
    metadata: context.metadata
  })
}

/**
 * Create OAuth session debug context
 */
export function createOAuthSessionContext(
  correlationId: string,
  provider: OAuthProvider,
  userId: string,
  sessionData?: Record<string, unknown>
): OAuthFlowContext {
  return {
    correlationId,
    provider,
    userId,
    step: 'SESSION_CREATE',
    metadata: {
      sessionData,
      timestamp: new Date().toISOString()
    }
  }
}

/**
 * Create OAuth callback debug context
 */
export function createOAuthCallbackContext(
  correlationId: string,
  provider: OAuthProvider,
  userId?: string,
  callbackParams?: Record<string, unknown>
): OAuthFlowContext {
  return {
    correlationId,
    provider,
    userId,
    step: 'CALLBACK_RECEIVED',
    metadata: {
      callbackParams,
      timestamp: new Date().toISOString()
    }
  }
}

/**
 * Create OAuth error debug context
 */
export function createOAuthErrorContext(
  correlationId: string,
  provider: OAuthProvider,
  step: OAuthFlowStep,
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  },
  userId?: string
): OAuthFlowContext {
  return {
    correlationId,
    provider,
    userId,
    step,
    error,
    metadata: {
      timestamp: new Date().toISOString()
    }
  }
}

/**
 * Track OAuth flow performance metrics
 */
export interface OAuthPerformanceMetrics {
  correlationId: string
  provider: OAuthProvider
  userId?: string
  startTime: number
  endTime: number
  duration: number
  success: boolean
  step: OAuthFlowStep
  error?: string
}

/**
 * Log OAuth flow performance metrics
 */
export function logOAuthPerformance(metrics: OAuthPerformanceMetrics): void {
  const logLevel = metrics.success ? 'info' : 'warn'
  const message = `OAuth ${metrics.step} ${metrics.success ? 'completed' : 'failed'} in ${metrics.duration}ms`
  
  logger[logLevel](message, {
    correlationId: metrics.correlationId,
    provider: metrics.provider,
    userId: metrics.userId,
    step: metrics.step,
    duration: metrics.duration,
    success: metrics.success,
    error: metrics.error,
    timestamp: new Date(metrics.endTime).toISOString()
  })
  
  // Log slow OAuth operations
  if (metrics.duration > 5000) {
    logger.warn(`Slow OAuth operation detected: ${metrics.step} took ${metrics.duration}ms`, {
      correlationId: metrics.correlationId,
      provider: metrics.provider,
      step: metrics.step,
      duration: metrics.duration
    })
  }
}

/**
 * Create OAuth performance tracker
 */
export function createOAuthPerformanceTracker(
  correlationId: string,
  provider: OAuthProvider,
  step: OAuthFlowStep,
  userId?: string
) {
  const startTime = Date.now()
  
  return {
    complete: (success: boolean, error?: string) => {
      const endTime = Date.now()
      logOAuthPerformance({
        correlationId,
        provider,
        userId,
        startTime,
        endTime,
        duration: endTime - startTime,
        success,
        step,
        error
      })
    }
  }
}

/**
 * Debug OAuth state validation
 */
export function debugOAuthState(
  correlationId: string,
  provider: OAuthProvider,
  expectedState?: string,
  receivedState?: string,
  userId?: string
): void {
  const isValid = expectedState === receivedState
  const logLevel = isValid ? 'info' : 'error'
  const message = isValid 
    ? 'OAuth state validation successful'
    : 'OAuth state validation failed'
  
  logger[logLevel](message, {
    correlationId,
    provider,
    userId,
    expectedState: expectedState ? `${expectedState.substring(0, 10)}...` : undefined,
    receivedState: receivedState ? `${receivedState.substring(0, 10)}...` : undefined,
    stateMatch: isValid,
    timestamp: new Date().toISOString()
  })
}

/**
 * Debug OAuth token exchange
 */
export function debugOAuthTokenExchange(
  correlationId: string,
  provider: OAuthProvider,
  tokenData: {
    hasAccessToken: boolean
    hasRefreshToken: boolean
    expiresIn?: number
    scope?: string
  },
  userId?: string
): void {
  logger.info('OAuth token exchange completed', {
    correlationId,
    provider,
    userId,
    hasAccessToken: tokenData.hasAccessToken,
    hasRefreshToken: tokenData.hasRefreshToken,
    expiresIn: tokenData.expiresIn,
    scope: tokenData.scope,
    timestamp: new Date().toISOString()
  })
}

/**
 * Debug OAuth connection storage
 */
export function debugOAuthConnectionStorage(
  correlationId: string,
  provider: OAuthProvider,
  connectionData: {
    connectionId?: string
    status?: string
    userId: string
  },
  success: boolean,
  error?: string
): void {
  const logLevel = success ? 'info' : 'error'
  const message = success 
    ? 'OAuth connection stored successfully'
    : 'OAuth connection storage failed'
  
  logger[logLevel](message, {
    correlationId,
    provider,
    userId: connectionData.userId,
    connectionId: connectionData.connectionId,
    status: connectionData.status,
    success,
    error,
    timestamp: new Date().toISOString()
  })
}

/**
 * Generate OAuth correlation ID with provider prefix
 */
export function generateOAuthCorrelationId(provider: OAuthProvider): string {
  return `oauth_${provider}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Extract correlation ID from OAuth state parameter
 */
export function extractCorrelationIdFromState(state: string): string | null {
  try {
    // Assuming state contains correlation ID in some format
    // This might need to be adjusted based on actual state format
    const decoded = decodeURIComponent(state)
    const match = decoded.match(/correlationId[=:]([^&]+)/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

/**
 * Create comprehensive OAuth flow summary for debugging
 */
export function createOAuthFlowSummary(
  correlationId: string,
  provider: OAuthProvider,
  userId: string,
  steps: Array<{
    step: OAuthFlowStep
    timestamp: string
    success: boolean
    duration?: number
    error?: string
  }>
): void {
  const totalDuration = steps.reduce((sum, step) => sum + (step.duration || 0), 0)
  const successfulSteps = steps.filter(step => step.success).length
  const failedSteps = steps.filter(step => !step.success).length
  
  logger.info('OAuth flow summary', {
    correlationId,
    provider,
    userId,
    totalSteps: steps.length,
    successfulSteps,
    failedSteps,
    totalDuration,
    overallSuccess: failedSteps === 0,
    steps: steps.map(step => ({
      step: step.step,
      success: step.success,
      duration: step.duration,
      error: step.error
    })),
    timestamp: new Date().toISOString()
  })
}