/**
 * OAuth Flow Monitoring and Logging
 * 
 * This module provides monitoring and logging specifically for OAuth flow separation
 * to ensure proper usage of authentication vs storage OAuth routes.
 */

import { getErrorMonitoring, captureApiError } from './error-monitoring'
import { alertRouteViolation, alertAuthenticationViolation } from './oauth-flow-alerts'

export interface OAuthFlowEvent {
  flowType: 'main_auth' | 'storage_oauth'
  provider: 'google' | 'microsoft' | 'azure'
  route: string
  userId?: string
  sessionId?: string
  component?: string
  timestamp: string
  success: boolean
  errorMessage?: string
  errorType?: 'oauth_flow_violation' | 'authentication_failure' | 'business_logic_restriction' | 'technical_error'
  metadata?: Record<string, any>
}

export interface OAuthRouteUsage {
  route: string
  expectedFlowType: 'main_auth' | 'storage_oauth'
  actualFlowType: 'main_auth' | 'storage_oauth'
  isCorrect: boolean
  component: string
  timestamp: string
}

// OAuth flow monitoring service
class OAuthFlowMonitoring {
  private monitoring = getErrorMonitoring()
  
  /**
   * Log OAuth route usage for monitoring compliance
   */
  logOAuthRouteUsage(
    route: string,
    flowType: 'main_auth' | 'storage_oauth',
    component: string,
    userId?: string,
    metadata?: Record<string, any>
  ): void {
    const isCorrectUsage = this.validateRouteUsage(route, flowType)
    
    // Set monitoring tags
    this.monitoring.setTag('oauth_flow_type', flowType)
    this.monitoring.setTag('oauth_provider', this.extractProvider(route))
    this.monitoring.setTag('component', component)
    this.monitoring.setTag('route_usage_correct', isCorrectUsage.toString())
    
    // Set extra context
    this.monitoring.setExtra('oauth_route', route)
    this.monitoring.setExtra('expected_flow_type', this.getExpectedFlowType(route))
    this.monitoring.setExtra('metadata', metadata)
    
    if (userId) {
      this.monitoring.setUser(userId)
    }
    
    // Log the event
    const level = isCorrectUsage ? 'info' : 'warning'
    const message = isCorrectUsage 
      ? `OAuth route used correctly: ${route} for ${flowType}`
      : `OAuth route used incorrectly: ${route} for ${flowType} (expected ${this.getExpectedFlowType(route)})`
    
    this.monitoring.captureMessage(message, level, {
      userId,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    })
    
    // If incorrect usage, also capture as error for alerting
    if (!isCorrectUsage) {
      this.captureRouteViolation(route, flowType, component, userId)
      
      // Trigger alert for route violation
      const expectedFlowType = this.getExpectedFlowType(route)
      alertRouteViolation(route, expectedFlowType, flowType, component, userId)
    }
  }
  
  /**
   * Log OAuth flow start events
   */
  logOAuthFlowStart(
    flowType: 'main_auth' | 'storage_oauth',
    provider: 'google' | 'microsoft' | 'azure',
    route: string,
    component: string,
    userId?: string,
    sessionId?: string
  ): void {
    const event: OAuthFlowEvent = {
      flowType,
      provider,
      route,
      component,
      userId,
      sessionId,
      timestamp: new Date().toISOString(),
      success: true
    }
    
    this.monitoring.setTag('oauth_event_type', 'flow_start')
    this.monitoring.setTag('oauth_flow_type', flowType)
    this.monitoring.setTag('oauth_provider', provider)
    this.monitoring.setTag('component', component)
    
    if (userId) {
      this.monitoring.setUser(userId)
    }
    
    this.monitoring.captureMessage(
      `OAuth flow started: ${flowType} for ${provider} via ${route}`,
      'info',
      {
        userId,
        sessionId,
        timestamp: event.timestamp,
        environment: process.env.NODE_ENV || 'development'
      }
    )
  }
  
  /**
   * Log OAuth flow completion events
   */
  logOAuthFlowComplete(
    flowType: 'main_auth' | 'storage_oauth',
    provider: 'google' | 'microsoft' | 'azure',
    success: boolean,
    userId?: string,
    sessionId?: string,
    errorMessage?: string,
    errorType?: 'oauth_flow_violation' | 'authentication_failure' | 'business_logic_restriction' | 'technical_error'
  ): void {
    const event: OAuthFlowEvent = {
      flowType,
      provider,
      route: '', // Not available at completion
      userId,
      sessionId,
      timestamp: new Date().toISOString(),
      success,
      errorMessage,
      errorType
    }
    
    this.monitoring.setTag('oauth_event_type', 'flow_complete')
    this.monitoring.setTag('oauth_flow_type', flowType)
    this.monitoring.setTag('oauth_provider', provider)
    this.monitoring.setTag('oauth_success', success.toString())
    
    if (userId) {
      this.monitoring.setUser(userId)
    }
    
    const level = success ? 'info' : 'error'
    const message = success 
      ? `OAuth flow completed successfully: ${flowType} for ${provider}`
      : `OAuth flow failed: ${flowType} for ${provider} - ${errorMessage}`
    
    this.monitoring.captureMessage(message, level, {
      userId,
      sessionId,
      timestamp: event.timestamp,
      environment: process.env.NODE_ENV || 'development'
    })
  }
  
  /**
   * Capture OAuth route violation for alerting
   */
  private captureRouteViolation(
    route: string,
    actualFlowType: 'main_auth' | 'storage_oauth',
    component: string,
    userId?: string
  ): void {
    const expectedFlowType = this.getExpectedFlowType(route)
    
    const error = new Error(`OAuth route violation: ${route} used for ${actualFlowType} but expected ${expectedFlowType}`)
    
    this.monitoring.setTag('error_type', 'oauth_route_violation')
    this.monitoring.setTag('component', component)
    this.monitoring.setTag('expected_flow_type', expectedFlowType)
    this.monitoring.setTag('actual_flow_type', actualFlowType)
    
    this.monitoring.setExtra('route', route)
    this.monitoring.setExtra('component', component)
    
    if (userId) {
      this.monitoring.setUser(userId)
    }
    
    this.monitoring.captureError(error, {
      userId,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    })
  }
  
  /**
   * Validate if route usage is correct for the flow type
   */
  private validateRouteUsage(route: string, flowType: 'main_auth' | 'storage_oauth'): boolean {
    const expectedFlowType = this.getExpectedFlowType(route)
    return expectedFlowType === flowType
  }
  
  /**
   * Get expected flow type based on route pattern
   */
  private getExpectedFlowType(route: string): 'main_auth' | 'storage_oauth' {
    if (route.startsWith('/auth/start')) {
      return 'main_auth'
    } else if (route.startsWith('/api/storage/')) {
      return 'storage_oauth'
    }
    
    // Default to main_auth for unknown routes
    return 'main_auth'
  }
  
  /**
   * Extract provider from route
   */
  private extractProvider(route: string): string {
    if (route.includes('provider=google') || route.includes('/google/')) {
      return 'google'
    } else if (route.includes('provider=azure') || route.includes('provider=microsoft') || route.includes('/microsoft/')) {
      return 'microsoft'
    }
    
    return 'unknown'
  }
}

// Global instance
let oauthMonitoring: OAuthFlowMonitoring

/**
 * Get the OAuth flow monitoring instance
 */
export function getOAuthMonitoring(): OAuthFlowMonitoring {
  if (!oauthMonitoring) {
    oauthMonitoring = new OAuthFlowMonitoring()
  }
  return oauthMonitoring
}

/**
 * Utility function to log main authentication route usage
 */
export function logMainAuthRoute(
  provider: 'google' | 'microsoft',
  component: string,
  userId?: string,
  sessionId?: string
): void {
  const monitoring = getOAuthMonitoring()
  const authProvider = provider === 'microsoft' ? 'azure' : provider
  const route = `/auth/start?provider=${authProvider}`
  
  monitoring.logOAuthRouteUsage(route, 'main_auth', component, userId)
  monitoring.logOAuthFlowStart('main_auth', authProvider as any, route, component, userId, sessionId)
}

/**
 * Utility function to log storage OAuth route usage
 */
export function logStorageOAuthRoute(
  provider: 'google' | 'microsoft',
  component: string,
  userId?: string,
  sessionId?: string
): void {
  const monitoring = getOAuthMonitoring()
  const route = `/api/storage/${provider}/start`
  
  monitoring.logOAuthRouteUsage(route, 'storage_oauth', component, userId)
  monitoring.logOAuthFlowStart('storage_oauth', provider, route, component, userId, sessionId)
}

/**
 * Utility function to log OAuth flow completion
 */
export function logOAuthFlowCompletion(
  flowType: 'main_auth' | 'storage_oauth',
  provider: 'google' | 'microsoft' | 'azure',
  success: boolean,
  userId?: string,
  sessionId?: string,
  errorMessage?: string,
  errorType?: 'oauth_flow_violation' | 'authentication_failure' | 'business_logic_restriction' | 'technical_error'
): void {
  const monitoring = getOAuthMonitoring()
  monitoring.logOAuthFlowComplete(flowType, provider, success, userId, sessionId, errorMessage, errorType)
}

/**
 * Utility function to capture authentication enforcement violations
 */
export function logAuthenticationViolation(
  route: string,
  component: string,
  userId?: string
): void {
  const monitoring = getErrorMonitoring()
  
  monitoring.setTag('error_type', 'authentication_violation')
  monitoring.setTag('component', component)
  monitoring.setTag('route', route)
  
  if (userId) {
    monitoring.setUser(userId)
  }
  
  const error = new Error(`Unauthenticated access attempt to storage OAuth route: ${route}`)
  
  monitoring.captureError(error, {
    userId,
    url: route,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  })
  
  // Trigger alert for authentication violation
  alertAuthenticationViolation(route, component, userId)
}

/**
 * Middleware to automatically log OAuth route usage
 */
export function createOAuthLoggingMiddleware(component: string) {
  return {
    logMainAuth: (provider: 'google' | 'microsoft', userId?: string) => {
      logMainAuthRoute(provider, component, userId)
    },
    
    logStorageOAuth: (provider: 'google' | 'microsoft', userId?: string) => {
      logStorageOAuthRoute(provider, component, userId)
    },
    
    logCompletion: (
      flowType: 'main_auth' | 'storage_oauth',
      provider: 'google' | 'microsoft' | 'azure',
      success: boolean,
      userId?: string,
      errorMessage?: string
    ) => {
      logOAuthFlowCompletion(flowType, provider, success, userId, undefined, errorMessage)
    }
  }
}

/**
 * Performance monitoring for OAuth flows
 */
export function measureOAuthFlowPerformance<T>(
  operation: string,
  flowType: 'main_auth' | 'storage_oauth',
  provider: string,
  fn: () => Promise<T>,
  userId?: string
): Promise<T> {
  const startTime = Date.now()
  
  return fn()
    .then((result) => {
      const duration = Date.now() - startTime
      
      const monitoring = getErrorMonitoring()
      monitoring.setTag('operation', operation)
      monitoring.setTag('oauth_flow_type', flowType)
      monitoring.setTag('oauth_provider', provider)
      monitoring.setTag('success', 'true')
      monitoring.setExtra('duration_ms', duration)
      
      if (userId) {
        monitoring.setUser(userId)
      }
      
      monitoring.captureMessage(
        `OAuth operation completed: ${operation} (${flowType}/${provider}) took ${duration}ms`,
        'info',
        {
          userId,
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV || 'development'
        }
      )
      
      return result
    })
    .catch((error) => {
      const duration = Date.now() - startTime
      
      const monitoring = getErrorMonitoring()
      monitoring.setTag('operation', operation)
      monitoring.setTag('oauth_flow_type', flowType)
      monitoring.setTag('oauth_provider', provider)
      monitoring.setTag('success', 'false')
      monitoring.setExtra('duration_ms', duration)
      
      if (userId) {
        monitoring.setUser(userId)
      }
      
      monitoring.captureError(error, {
        userId,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
      })
      
      throw error
    })
}

/**
 * Setup OAuth flow monitoring alerts
 */
export function setupOAuthFlowAlerts(): void {
  // This would integrate with your alerting system (e.g., Sentry, DataDog, etc.)
  // For now, we'll use console warnings for development
  
  if (process.env.NODE_ENV === 'development') {
    console.log('OAuth flow monitoring alerts enabled for development')
  }
  
  // In production, you would configure:
  // - Alerts for OAuth route violations
  // - Alerts for authentication enforcement failures
  // - Performance alerts for slow OAuth flows
  // - Error rate alerts for OAuth failures
}

/**
 * Generate OAuth flow compliance report
 */
export function generateOAuthComplianceReport(): {
  totalRouteUsages: number
  correctUsages: number
  violations: number
  complianceRate: number
} {
  // This would query your monitoring data
  // For now, return a placeholder structure
  
  return {
    totalRouteUsages: 0,
    correctUsages: 0,
    violations: 0,
    complianceRate: 0
  }
}