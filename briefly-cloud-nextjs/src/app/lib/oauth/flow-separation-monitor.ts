/**
 * OAuth Flow Separation Monitor
 * 
 * Monitors and logs violations of OAuth flow separation between
 * main authentication and storage connection flows.
 */

import { OAuthLogger } from './logger'

export interface FlowSeparationViolation {
  violationType: 'incorrect_route_usage' | 'authentication_failure' | 'unauthorized_access'
  expectedFlow: 'main_auth' | 'storage_oauth'
  actualRoute: string
  userId?: string
  userAgent?: string
  referer?: string
  timestamp: string
  severity: 'low' | 'medium' | 'high'
  description: string
}

export class FlowSeparationMonitor {
  /**
   * Log OAuth flow separation violation
   */
  static logViolation(violation: Omit<FlowSeparationViolation, 'timestamp'>) {
    const fullViolation: FlowSeparationViolation = {
      ...violation,
      timestamp: new Date().toISOString()
    }

    // Log to OAuth logger with high severity
    OAuthLogger.logSecurityEvent('flow_separation', 'violation', {
      violationType: fullViolation.violationType,
      expectedFlow: fullViolation.expectedFlow,
      actualRoute: fullViolation.actualRoute,
      userId: fullViolation.userId,
      userAgent: fullViolation.userAgent,
      referer: fullViolation.referer,
      severity: fullViolation.severity,
      description: fullViolation.description
    })

    // Also log to console for monitoring
    console.warn('[oauth-flow-separation-violation]', JSON.stringify(fullViolation, null, 2))
  }

  /**
   * Log authentication failure in storage OAuth flow
   */
  static logStorageAuthFailure(
    provider: 'google' | 'microsoft',
    route: string,
    userId?: string,
    userAgent?: string,
    referer?: string,
    authError?: string
  ) {
    this.logViolation({
      violationType: 'authentication_failure',
      expectedFlow: 'storage_oauth',
      actualRoute: route,
      userId,
      userAgent,
      referer,
      severity: 'medium',
      description: `Authentication required for storage OAuth flow on ${provider} ${route}. ${authError ? `Auth error: ${authError}` : 'User not authenticated'}`
    })
  }

  /**
   * Log unauthorized access attempt to storage routes
   */
  static logUnauthorizedStorageAccess(
    provider: 'google' | 'microsoft',
    route: string,
    userAgent?: string,
    referer?: string
  ) {
    this.logViolation({
      violationType: 'unauthorized_access',
      expectedFlow: 'storage_oauth',
      actualRoute: route,
      userAgent,
      referer,
      severity: 'high',
      description: `Unauthorized access attempt to ${provider} storage route ${route}`
    })
  }

  /**
   * Log incorrect route usage (e.g., using main auth routes for storage)
   */
  static logIncorrectRouteUsage(
    expectedFlow: 'main_auth' | 'storage_oauth',
    actualRoute: string,
    userId?: string,
    userAgent?: string,
    referer?: string,
    description?: string
  ) {
    this.logViolation({
      violationType: 'incorrect_route_usage',
      expectedFlow,
      actualRoute,
      userId,
      userAgent,
      referer,
      severity: 'low',
      description: description || `Incorrect route usage: expected ${expectedFlow} flow but accessed ${actualRoute}`
    })
  }

  /**
   * Generate user-friendly error message for authentication failures
   */
  static getAuthFailureMessage(provider: 'google' | 'microsoft'): string {
    return `Authentication required to connect ${provider === 'google' ? 'Google Drive' : 'Microsoft OneDrive'}. Please sign in to your account first.`
  }

  /**
   * Generate user-friendly error message for OAuth flow violations
   */
  static getFlowViolationMessage(expectedFlow: 'main_auth' | 'storage_oauth'): string {
    if (expectedFlow === 'storage_oauth') {
      return 'This action requires connecting your cloud storage account. Please use the storage connection flow.'
    } else {
      return 'This action requires user authentication. Please use the main sign-in flow.'
    }
  }
}