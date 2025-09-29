/**
 * OAuth Flow Alerts System
 * 
 * Provides alerting functionality for OAuth flow violations and compliance issues.
 */

import { getErrorMonitoring } from './error-monitoring'

export interface OAuthAlert {
  id: string
  type: 'route_violation' | 'auth_enforcement_failure' | 'high_error_rate' | 'compliance_drop'
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  message: string
  timestamp: string
  metadata: Record<string, any>
  resolved: boolean
}

export interface AlertThresholds {
  complianceRate: {
    warning: number  // e.g., 95%
    critical: number // e.g., 90%
  }
  errorRate: {
    warning: number  // e.g., 5%
    critical: number // e.g., 10%
  }
  violationCount: {
    warning: number  // e.g., 10 per hour
    critical: number // e.g., 25 per hour
  }
}

class OAuthFlowAlertSystem {
  private monitoring = getErrorMonitoring()
  private alerts: Map<string, OAuthAlert> = new Map()
  
  private defaultThresholds: AlertThresholds = {
    complianceRate: {
      warning: 95,
      critical: 90
    },
    errorRate: {
      warning: 5,
      critical: 10
    },
    violationCount: {
      warning: 10,
      critical: 25
    }
  }

  /**
   * Check OAuth route violation and trigger alert if needed
   */
  checkRouteViolation(
    route: string,
    expectedFlowType: 'main_auth' | 'storage_oauth',
    actualFlowType: 'main_auth' | 'storage_oauth',
    component: string,
    userId?: string
  ): void {
    if (expectedFlowType === actualFlowType) {
      return // No violation
    }

    const alertId = `route_violation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const alert: OAuthAlert = {
      id: alertId,
      type: 'route_violation',
      severity: this.getViolationSeverity(route, expectedFlowType, actualFlowType),
      title: 'OAuth Route Violation Detected',
      message: `Component "${component}" used ${route} for ${actualFlowType} flow, but expected ${expectedFlowType} flow`,
      timestamp: new Date().toISOString(),
      metadata: {
        route,
        expectedFlowType,
        actualFlowType,
        component,
        userId
      },
      resolved: false
    }

    this.triggerAlert(alert)
  }

  /**
   * Check authentication enforcement and trigger alert if needed
   */
  checkAuthenticationEnforcement(
    route: string,
    component: string,
    userId?: string
  ): void {
    const alertId = `auth_enforcement_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const alert: OAuthAlert = {
      id: alertId,
      type: 'auth_enforcement_failure',
      severity: 'high',
      title: 'Authentication Enforcement Failure',
      message: `Unauthenticated access attempt to storage OAuth route: ${route} from component "${component}"`,
      timestamp: new Date().toISOString(),
      metadata: {
        route,
        component,
        userId: userId || 'unauthenticated'
      },
      resolved: false
    }

    this.triggerAlert(alert)
  }

  /**
   * Check compliance rate and trigger alert if below threshold
   */
  checkComplianceRate(
    currentRate: number,
    totalUsages: number,
    violations: number,
    timeWindow: string = '1h'
  ): void {
    let severity: OAuthAlert['severity'] | null = null
    
    if (currentRate < this.defaultThresholds.complianceRate.critical) {
      severity = 'critical'
    } else if (currentRate < this.defaultThresholds.complianceRate.warning) {
      severity = 'medium'
    }

    if (severity) {
      const alertId = `compliance_drop_${Date.now()}`
      
      const alert: OAuthAlert = {
        id: alertId,
        type: 'compliance_drop',
        severity,
        title: 'OAuth Compliance Rate Drop',
        message: `OAuth flow compliance rate dropped to ${currentRate.toFixed(1)}% (${violations} violations out of ${totalUsages} total usages in ${timeWindow})`,
        timestamp: new Date().toISOString(),
        metadata: {
          complianceRate: currentRate,
          totalUsages,
          violations,
          timeWindow,
          threshold: severity === 'critical' 
            ? this.defaultThresholds.complianceRate.critical 
            : this.defaultThresholds.complianceRate.warning
        },
        resolved: false
      }

      this.triggerAlert(alert)
    }
  }

  /**
   * Check error rate and trigger alert if above threshold
   */
  checkErrorRate(
    errorRate: number,
    totalRequests: number,
    errors: number,
    flowType: 'main_auth' | 'storage_oauth',
    timeWindow: string = '1h'
  ): void {
    let severity: OAuthAlert['severity'] | null = null
    
    if (errorRate > this.defaultThresholds.errorRate.critical) {
      severity = 'critical'
    } else if (errorRate > this.defaultThresholds.errorRate.warning) {
      severity = 'medium'
    }

    if (severity) {
      const alertId = `high_error_rate_${flowType}_${Date.now()}`
      
      const alert: OAuthAlert = {
        id: alertId,
        type: 'high_error_rate',
        severity,
        title: `High ${flowType} OAuth Error Rate`,
        message: `${flowType} OAuth flow error rate is ${errorRate.toFixed(1)}% (${errors} errors out of ${totalRequests} requests in ${timeWindow})`,
        timestamp: new Date().toISOString(),
        metadata: {
          errorRate,
          totalRequests,
          errors,
          flowType,
          timeWindow,
          threshold: severity === 'critical' 
            ? this.defaultThresholds.errorRate.critical 
            : this.defaultThresholds.errorRate.warning
        },
        resolved: false
      }

      this.triggerAlert(alert)
    }
  }

  /**
   * Trigger an alert through various channels
   */
  private triggerAlert(alert: OAuthAlert): void {
    // Store alert
    this.alerts.set(alert.id, alert)

    // Log to monitoring system
    this.monitoring.setTag('alert_type', alert.type)
    this.monitoring.setTag('alert_severity', alert.severity)
    this.monitoring.setExtra('alert_metadata', alert.metadata)

    const level = this.getLogLevel(alert.severity)
    this.monitoring.captureMessage(
      `OAuth Alert: ${alert.title} - ${alert.message}`,
      level,
      {
        timestamp: alert.timestamp,
        environment: process.env.NODE_ENV || 'development'
      }
    )

    // Send to external alerting systems (in production)
    if (process.env.NODE_ENV === 'production') {
      this.sendToExternalAlerts(alert)
    } else {
      // Console alert for development
      console.warn(`🚨 OAuth Alert [${alert.severity.toUpperCase()}]: ${alert.title}`)
      console.warn(`   Message: ${alert.message}`)
      console.warn(`   Metadata:`, alert.metadata)
    }
  }

  /**
   * Send alert to external systems (Slack, email, etc.)
   */
  private async sendToExternalAlerts(alert: OAuthAlert): Promise<void> {
    try {
      // Example: Send to Slack webhook
      if (process.env.SLACK_WEBHOOK_URL && alert.severity === 'critical') {
        await fetch(process.env.SLACK_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `🚨 Critical OAuth Alert: ${alert.title}`,
            attachments: [{
              color: 'danger',
              fields: [
                { title: 'Message', value: alert.message, short: false },
                { title: 'Timestamp', value: alert.timestamp, short: true },
                { title: 'Component', value: alert.metadata.component || 'Unknown', short: true }
              ]
            }]
          })
        })
      }

      // Example: Send email for high severity alerts
      if (process.env.ALERT_EMAIL_ENDPOINT && ['high', 'critical'].includes(alert.severity)) {
        await fetch(process.env.ALERT_EMAIL_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: process.env.ALERT_EMAIL_RECIPIENTS?.split(',') || [],
            subject: `OAuth Alert: ${alert.title}`,
            body: `
              Alert: ${alert.title}
              Severity: ${alert.severity.toUpperCase()}
              Message: ${alert.message}
              Timestamp: ${alert.timestamp}
              
              Metadata:
              ${JSON.stringify(alert.metadata, null, 2)}
            `
          })
        })
      }
    } catch (error) {
      console.error('Failed to send external alert:', error)
      this.monitoring.captureError(error as Error)
    }
  }

  /**
   * Get violation severity based on route and flow types
   */
  private getViolationSeverity(
    route: string,
    expectedFlowType: 'main_auth' | 'storage_oauth',
    actualFlowType: 'main_auth' | 'storage_oauth'
  ): OAuthAlert['severity'] {
    // Storage OAuth routes used for main auth is critical (security risk)
    if (expectedFlowType === 'storage_oauth' && actualFlowType === 'main_auth') {
      return 'critical'
    }
    
    // Main auth routes used for storage is high (functionality risk)
    if (expectedFlowType === 'main_auth' && actualFlowType === 'storage_oauth') {
      return 'high'
    }
    
    return 'medium'
  }

  /**
   * Get log level for alert severity
   */
  private getLogLevel(severity: OAuthAlert['severity']): 'info' | 'warning' | 'error' | 'fatal' {
    switch (severity) {
      case 'low': return 'info'
      case 'medium': return 'warning'
      case 'high': return 'error'
      case 'critical': return 'fatal'
      default: return 'warning'
    }
  }

  /**
   * Get all active alerts
   */
  getActiveAlerts(): OAuthAlert[] {
    return Array.from(this.alerts.values()).filter(alert => !alert.resolved)
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId)
    if (alert) {
      alert.resolved = true
      this.alerts.set(alertId, alert)
      
      this.monitoring.captureMessage(
        `OAuth Alert Resolved: ${alert.title}`,
        'info',
        {
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV || 'development'
        }
      )
      
      return true
    }
    return false
  }

  /**
   * Clear old resolved alerts
   */
  clearOldAlerts(maxAge: number = 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAge
    
    for (const [id, alert] of this.alerts.entries()) {
      if (alert.resolved && new Date(alert.timestamp).getTime() < cutoff) {
        this.alerts.delete(id)
      }
    }
  }
}

// Global instance
let alertSystem: OAuthFlowAlertSystem

/**
 * Get the OAuth flow alert system instance
 */
export function getOAuthAlertSystem(): OAuthFlowAlertSystem {
  if (!alertSystem) {
    alertSystem = new OAuthFlowAlertSystem()
  }
  return alertSystem
}

/**
 * Utility functions for common alert scenarios
 */
export function alertRouteViolation(
  route: string,
  expectedFlowType: 'main_auth' | 'storage_oauth',
  actualFlowType: 'main_auth' | 'storage_oauth',
  component: string,
  userId?: string
): void {
  const alerts = getOAuthAlertSystem()
  alerts.checkRouteViolation(route, expectedFlowType, actualFlowType, component, userId)
}

export function alertAuthenticationViolation(
  route: string,
  component: string,
  userId?: string
): void {
  const alerts = getOAuthAlertSystem()
  alerts.checkAuthenticationEnforcement(route, component, userId)
}

export function alertComplianceIssue(
  complianceRate: number,
  totalUsages: number,
  violations: number,
  timeWindow?: string
): void {
  const alerts = getOAuthAlertSystem()
  alerts.checkComplianceRate(complianceRate, totalUsages, violations, timeWindow)
}

export function alertHighErrorRate(
  errorRate: number,
  totalRequests: number,
  errors: number,
  flowType: 'main_auth' | 'storage_oauth',
  timeWindow?: string
): void {
  const alerts = getOAuthAlertSystem()
  alerts.checkErrorRate(errorRate, totalRequests, errors, flowType, timeWindow)
}

/**
 * Setup periodic compliance checks
 */
export function setupPeriodicComplianceChecks(): void {
  // Check compliance every 15 minutes
  setInterval(async () => {
    try {
      // In a real implementation, you would query your monitoring data
      // For now, we'll skip the actual check
      console.log('Running periodic OAuth compliance check...')
      
      // Example of what you might do:
      // const metrics = await fetchOAuthMetrics('15m')
      // alertComplianceIssue(metrics.complianceRate, metrics.totalUsages, metrics.violations, '15m')
      // alertHighErrorRate(metrics.mainAuth.errorRate, metrics.mainAuth.total, metrics.mainAuth.failures, 'main_auth', '15m')
      // alertHighErrorRate(metrics.storageOAuth.errorRate, metrics.storageOAuth.total, metrics.storageOAuth.failures, 'storage_oauth', '15m')
      
    } catch (error) {
      console.error('Periodic compliance check failed:', error)
    }
  }, 15 * 60 * 1000) // 15 minutes

  // Clean up old alerts daily
  setInterval(() => {
    const alerts = getOAuthAlertSystem()
    alerts.clearOldAlerts()
  }, 24 * 60 * 60 * 1000) // 24 hours
}