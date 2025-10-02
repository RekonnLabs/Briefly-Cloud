/**
 * Signout Alerting System
 * 
 * Provides alerting capabilities specifically for signout flow monitoring
 * including email notifications, webhook integrations, and alert escalation
 */

import { getErrorMonitoring } from '../error-monitoring'
import { alertingService } from '../monitoring/alerting'

export interface SignoutAlert {
  id: string
  type: 'high_failure_rate' | 'cleanup_failures' | 'performance_degradation' | 'consecutive_failures' | 'system_health'
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  message: string
  timestamp: string
  metadata: Record<string, any>
  resolved: boolean
  escalated: boolean
}

export interface SignoutAlertThresholds {
  successRate: {
    warning: number    // e.g., 95%
    critical: number   // e.g., 90%
  }
  cleanupFailureRate: {
    warning: number    // e.g., 10%
    critical: number   // e.g., 20%
  }
  averageDuration: {
    warning: number    // e.g., 5000ms
    critical: number   // e.g., 10000ms
  }
  consecutiveFailures: {
    warning: number    // e.g., 5
    critical: number   // e.g., 10
  }
  errorRate: {
    warning: number    // e.g., 5%
    critical: number   // e.g., 15%
  }
}

class SignoutAlertingService {
  private monitoring = getErrorMonitoring()
  private alerts: Map<string, SignoutAlert> = new Map()
  private alertCooldowns: Map<string, number> = new Map()
  
  private defaultThresholds: SignoutAlertThresholds = {
    successRate: {
      warning: 95,
      critical: 90
    },
    cleanupFailureRate: {
      warning: 10,
      critical: 20
    },
    averageDuration: {
      warning: 5000,
      critical: 10000
    },
    consecutiveFailures: {
      warning: 5,
      critical: 10
    },
    errorRate: {
      warning: 5,
      critical: 15
    }
  }

  private cooldownPeriods = {
    low: 30 * 60 * 1000,      // 30 minutes
    medium: 15 * 60 * 1000,   // 15 minutes
    high: 5 * 60 * 1000,      // 5 minutes
    critical: 2 * 60 * 1000   // 2 minutes
  }

  /**
   * Check signout success rate and trigger alerts if needed
   */
  checkSuccessRate(
    successRate: number,
    totalAttempts: number,
    successfulAttempts: number,
    timeWindow: string = '15m'
  ): void {
    if (totalAttempts < 10) return // Need minimum sample size

    let severity: 'warning' | 'critical' | null = null
    let threshold: number = 0

    if (successRate < this.defaultThresholds.successRate.critical) {
      severity = 'critical'
      threshold = this.defaultThresholds.successRate.critical
    } else if (successRate < this.defaultThresholds.successRate.warning) {
      severity = 'warning'
      threshold = this.defaultThresholds.successRate.warning
    }

    if (severity) {
      const alertKey = `success_rate_${severity}`
      
      if (this.isInCooldown(alertKey)) return

      this.triggerAlert({
        type: 'high_failure_rate',
        severity: severity === 'critical' ? 'critical' : 'high',
        title: `Signout Success Rate ${severity === 'critical' ? 'Critical' : 'Warning'}`,
        message: `Signout success rate dropped to ${successRate.toFixed(1)}% (${successfulAttempts}/${totalAttempts} successful in last ${timeWindow})`,
        metadata: {
          successRate,
          totalAttempts,
          successfulAttempts,
          failedAttempts: totalAttempts - successfulAttempts,
          timeWindow,
          threshold,
          alertType: 'success_rate'
        }
      })

      this.setCooldown(alertKey, severity === 'critical' ? 'critical' : 'high')
    }
  }

  /**
   * Check cleanup task failure rates and trigger alerts
   */
  checkCleanupFailures(
    pickerFailureRate: number,
    storageFailureRate: number,
    totalCleanupAttempts: number,
    timeWindow: string = '15m'
  ): void {
    if (totalCleanupAttempts < 5) return

    const maxFailureRate = Math.max(pickerFailureRate, storageFailureRate)
    let severity: 'warning' | 'critical' | null = null
    let threshold: number = 0

    if (maxFailureRate > this.defaultThresholds.cleanupFailureRate.critical) {
      severity = 'critical'
      threshold = this.defaultThresholds.cleanupFailureRate.critical
    } else if (maxFailureRate > this.defaultThresholds.cleanupFailureRate.warning) {
      severity = 'warning'
      threshold = this.defaultThresholds.cleanupFailureRate.warning
    }

    if (severity) {
      const alertKey = `cleanup_failures_${severity}`
      
      if (this.isInCooldown(alertKey)) return

      this.triggerAlert({
        type: 'cleanup_failures',
        severity: severity === 'critical' ? 'critical' : 'medium',
        title: `Signout Cleanup ${severity === 'critical' ? 'Critical' : 'Warning'}`,
        message: `High cleanup failure rate detected: Picker tokens ${pickerFailureRate.toFixed(1)}%, Storage credentials ${storageFailureRate.toFixed(1)}% (${totalCleanupAttempts} attempts in ${timeWindow})`,
        metadata: {
          pickerFailureRate,
          storageFailureRate,
          totalCleanupAttempts,
          timeWindow,
          threshold,
          alertType: 'cleanup_failures'
        }
      })

      this.setCooldown(alertKey, severity === 'critical' ? 'critical' : 'medium')
    }
  }

  /**
   * Check performance degradation and trigger alerts
   */
  checkPerformanceDegradation(
    averageDuration: number,
    sampleSize: number,
    timeWindow: string = '15m'
  ): void {
    if (sampleSize < 5) return

    let severity: 'warning' | 'critical' | null = null
    let threshold: number = 0

    if (averageDuration > this.defaultThresholds.averageDuration.critical) {
      severity = 'critical'
      threshold = this.defaultThresholds.averageDuration.critical
    } else if (averageDuration > this.defaultThresholds.averageDuration.warning) {
      severity = 'warning'
      threshold = this.defaultThresholds.averageDuration.warning
    }

    if (severity) {
      const alertKey = `performance_${severity}`
      
      if (this.isInCooldown(alertKey)) return

      this.triggerAlert({
        type: 'performance_degradation',
        severity: severity === 'critical' ? 'critical' : 'medium',
        title: `Signout Performance ${severity === 'critical' ? 'Critical' : 'Warning'}`,
        message: `Average signout duration increased to ${averageDuration.toFixed(0)}ms (threshold: ${threshold}ms, ${sampleSize} samples in ${timeWindow})`,
        metadata: {
          averageDuration,
          threshold,
          sampleSize,
          timeWindow,
          alertType: 'performance_degradation'
        }
      })

      this.setCooldown(alertKey, severity === 'critical' ? 'critical' : 'medium')
    }
  }

  /**
   * Check consecutive failures and trigger alerts
   */
  checkConsecutiveFailures(
    consecutiveFailures: number,
    recentEvents: Array<{ timestamp: string; success: boolean; error?: string }>
  ): void {
    let severity: 'warning' | 'critical' | null = null
    let threshold: number = 0

    if (consecutiveFailures >= this.defaultThresholds.consecutiveFailures.critical) {
      severity = 'critical'
      threshold = this.defaultThresholds.consecutiveFailures.critical
    } else if (consecutiveFailures >= this.defaultThresholds.consecutiveFailures.warning) {
      severity = 'warning'
      threshold = this.defaultThresholds.consecutiveFailures.warning
    }

    if (severity) {
      const alertKey = `consecutive_failures_${severity}`
      
      if (this.isInCooldown(alertKey)) return

      this.triggerAlert({
        type: 'consecutive_failures',
        severity: severity === 'critical' ? 'critical' : 'high',
        title: `Consecutive Signout Failures ${severity === 'critical' ? 'Critical' : 'Warning'}`,
        message: `${consecutiveFailures} consecutive signout failures detected (threshold: ${threshold})`,
        metadata: {
          consecutiveFailures,
          threshold,
          recentEvents: recentEvents.slice(-5),
          alertType: 'consecutive_failures'
        }
      })

      this.setCooldown(alertKey, severity === 'critical' ? 'critical' : 'high')
    }
  }

  /**
   * Check overall system health and trigger alerts
   */
  checkSystemHealth(
    totalAttempts: number,
    errorCategories: Record<string, number>,
    timeWindow: string = '1h'
  ): void {
    if (totalAttempts === 0) return

    const totalErrors = Object.values(errorCategories).reduce((sum, count) => sum + count, 0)
    const errorRate = (totalErrors / totalAttempts) * 100

    let severity: 'warning' | 'critical' | null = null
    let threshold: number = 0

    if (errorRate > this.defaultThresholds.errorRate.critical) {
      severity = 'critical'
      threshold = this.defaultThresholds.errorRate.critical
    } else if (errorRate > this.defaultThresholds.errorRate.warning) {
      severity = 'warning'
      threshold = this.defaultThresholds.errorRate.warning
    }

    if (severity) {
      const alertKey = `system_health_${severity}`
      
      if (this.isInCooldown(alertKey)) return

      // Find the most common error category
      const topErrorCategory = Object.entries(errorCategories)
        .sort(([,a], [,b]) => b - a)[0]

      this.triggerAlert({
        type: 'system_health',
        severity: severity === 'critical' ? 'critical' : 'medium',
        title: `Signout System Health ${severity === 'critical' ? 'Critical' : 'Warning'}`,
        message: `High error rate detected: ${errorRate.toFixed(1)}% (${totalErrors}/${totalAttempts} in ${timeWindow}). Top error: ${topErrorCategory[0]} (${topErrorCategory[1]} occurrences)`,
        metadata: {
          errorRate,
          totalAttempts,
          totalErrors,
          errorCategories,
          topErrorCategory: topErrorCategory[0],
          topErrorCount: topErrorCategory[1],
          timeWindow,
          threshold,
          alertType: 'system_health'
        }
      })

      this.setCooldown(alertKey, severity === 'critical' ? 'critical' : 'medium')
    }
  }

  /**
   * Trigger an alert
   */
  private triggerAlert(alertData: Omit<SignoutAlert, 'id' | 'timestamp' | 'resolved' | 'escalated'>): void {
    const alert: SignoutAlert = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      resolved: false,
      escalated: false,
      ...alertData
    }

    // Store alert
    this.alerts.set(alert.id, alert)

    // Log the alert
    console.warn(`🚨 Signout Alert [${alert.severity.toUpperCase()}]: ${alert.title}`)
    console.warn(`   Message: ${alert.message}`)
    console.warn(`   Metadata:`, alert.metadata)

    // Send to monitoring system
    this.monitoring.setTag('alert_type', alert.type)
    this.monitoring.setTag('alert_severity', alert.severity)
    this.monitoring.setTag('signout_alert', 'true')
    this.monitoring.setExtra('alert_metadata', alert.metadata)

    const level = this.getLogLevel(alert.severity)
    this.monitoring.captureMessage(
      `Signout Alert: ${alert.title} - ${alert.message}`,
      level,
      {
        timestamp: alert.timestamp,
        environment: process.env.NODE_ENV || 'development'
      }
    )

    // Send to external alerting systems
    this.sendExternalAlert(alert)

    // Schedule escalation for critical alerts
    if (alert.severity === 'critical') {
      this.scheduleEscalation(alert)
    }
  }

  /**
   * Send alert to external systems
   */
  private async sendExternalAlert(alert: SignoutAlert): Promise<void> {
    try {
      // Convert to the format expected by the alerting service
      const alertingAlert = {
        id: alert.id,
        type: 'signout_monitoring' as any,
        severity: alert.severity,
        schema: 'app' as const, // Use 'app' instead of 'signout' to match the expected schema type
        message: alert.message,
        timestamp: alert.timestamp,
        resolved: alert.resolved,
        metadata: {
          alertType: alert.type,
          title: alert.title,
          signoutSpecific: true,
          ...alert.metadata
        }
      }

      await alertingService.processAlert(alertingAlert)

      // Send to Slack if configured and severity is high enough
      if (process.env.SLACK_SIGNOUT_WEBHOOK_URL && 
          ['high', 'critical'].includes(alert.severity)) {
        await this.sendSlackAlert(alert)
      }

      // Send email for critical alerts
      if (process.env.SIGNOUT_ALERT_EMAIL_RECIPIENTS && 
          alert.severity === 'critical') {
        await this.sendEmailAlert(alert)
      }

    } catch (error) {
      console.error('Failed to send external signout alert:', error)
      this.monitoring.captureError(error as Error)
    }
  }

  /**
   * Send Slack alert for signout issues
   */
  private async sendSlackAlert(alert: SignoutAlert): Promise<void> {
    const color = this.getSlackColor(alert.severity)
    const emoji = alert.severity === 'critical' ? '🚨' : '⚠️'
    
    const payload = {
      username: 'Signout Monitor',
      icon_emoji: emoji,
      attachments: [{
        color,
        title: `${emoji} ${alert.title}`,
        text: alert.message,
        fields: [
          {
            title: 'Severity',
            value: alert.severity.toUpperCase(),
            short: true
          },
          {
            title: 'Alert Type',
            value: alert.type.replace('_', ' '),
            short: true
          },
          {
            title: 'Time Window',
            value: alert.metadata.timeWindow || 'N/A',
            short: true
          },
          {
            title: 'Threshold',
            value: alert.metadata.threshold ? `${alert.metadata.threshold}${alert.type.includes('rate') ? '%' : 'ms'}` : 'N/A',
            short: true
          }
        ],
        footer: 'Briefly Cloud Signout Monitor',
        ts: Math.floor(new Date(alert.timestamp).getTime() / 1000)
      }]
    }

    const response = await fetch(process.env.SLACK_SIGNOUT_WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      throw new Error(`Slack webhook returned ${response.status}: ${response.statusText}`)
    }
  }

  /**
   * Send email alert for critical signout issues
   */
  private async sendEmailAlert(alert: SignoutAlert): Promise<void> {
    const recipients = process.env.SIGNOUT_ALERT_EMAIL_RECIPIENTS!.split(',')
    
    const emailPayload = {
      to: recipients,
      subject: `🚨 Critical Signout Alert: ${alert.title}`,
      html: this.formatEmailBody(alert)
    }

    // This would integrate with your email service
    console.log('Email alert would be sent:', emailPayload)
    
    // In a real implementation, you would send the email here
    // await emailService.send(emailPayload)
  }

  /**
   * Format email body for signout alerts
   */
  private formatEmailBody(alert: SignoutAlert): string {
    return `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #d32f2f; border-bottom: 2px solid #d32f2f; padding-bottom: 10px;">
              🚨 Critical Signout Alert
            </h1>
            
            <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h2 style="margin-top: 0; color: #d32f2f;">${alert.title}</h2>
              <p style="font-size: 16px; margin: 10px 0;">${alert.message}</p>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr style="background: #f9f9f9;">
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Alert ID</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${alert.id}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Severity</td>
                <td style="padding: 10px; border: 1px solid #ddd; color: #d32f2f; font-weight: bold;">${alert.severity.toUpperCase()}</td>
              </tr>
              <tr style="background: #f9f9f9;">
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Alert Type</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${alert.type.replace('_', ' ')}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Timestamp</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${new Date(alert.timestamp).toLocaleString()}</td>
              </tr>
            </table>

            <h3>Alert Details</h3>
            <pre style="background: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto; font-size: 12px;">
${JSON.stringify(alert.metadata, null, 2)}
            </pre>

            <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h4 style="margin-top: 0; color: #856404;">Action Required</h4>
              <p>Please investigate this signout issue immediately. Check the monitoring dashboard for more details and recent events.</p>
              <p><strong>Monitoring Dashboard:</strong> <a href="${process.env.NEXT_PUBLIC_APP_URL}/monitoring/signout">View Dashboard</a></p>
            </div>

            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <p style="font-size: 12px; color: #666; text-align: center;">
              This alert was generated by Briefly Cloud Signout Monitor<br>
              Environment: ${process.env.NODE_ENV || 'development'}
            </p>
          </div>
        </body>
      </html>
    `
  }

  /**
   * Schedule alert escalation
   */
  private scheduleEscalation(alert: SignoutAlert): void {
    const escalationDelay = 15 * 60 * 1000 // 15 minutes

    setTimeout(async () => {
      const currentAlert = this.alerts.get(alert.id)
      if (currentAlert && !currentAlert.resolved && !currentAlert.escalated) {
        currentAlert.escalated = true
        this.alerts.set(alert.id, currentAlert)

        const escalationAlert: SignoutAlert = {
          ...alert,
          id: `escalated-${alert.id}`,
          title: `ESCALATED: ${alert.title}`,
          message: `${alert.message} (unresolved for 15 minutes)`,
          timestamp: new Date().toISOString(),
          escalated: true
        }

        await this.sendExternalAlert(escalationAlert)
        console.error(`🚨 ESCALATED Signout Alert: ${escalationAlert.title}`)
      }
    }, escalationDelay)
  }

  /**
   * Check if alert is in cooldown period
   */
  private isInCooldown(alertKey: string): boolean {
    const lastSent = this.alertCooldowns.get(alertKey)
    if (!lastSent) return false

    const now = Date.now()
    return now - lastSent < this.cooldownPeriods.medium // Default cooldown
  }

  /**
   * Set cooldown for alert type
   */
  private setCooldown(alertKey: string, severity: SignoutAlert['severity']): void {
    this.alertCooldowns.set(alertKey, Date.now())
  }

  /**
   * Get log level for alert severity
   */
  private getLogLevel(severity: SignoutAlert['severity']): 'info' | 'warning' | 'error' | 'fatal' {
    switch (severity) {
      case 'low': return 'info'
      case 'medium': return 'warning'
      case 'high': return 'error'
      case 'critical': return 'fatal'
      default: return 'warning'
    }
  }

  /**
   * Get Slack color for severity
   */
  private getSlackColor(severity: SignoutAlert['severity']): string {
    const colors = {
      low: '#36a64f',      // Green
      medium: '#ff9500',   // Orange
      high: '#ff0000',     // Red
      critical: '#8b0000'  // Dark red
    }
    
    return colors[severity] || colors.medium
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): SignoutAlert[] {
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
        `Signout Alert Resolved: ${alert.title}`,
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
   * Update alert thresholds
   */
  updateThresholds(thresholds: Partial<SignoutAlertThresholds>): void {
    this.defaultThresholds = { ...this.defaultThresholds, ...thresholds }
  }

  /**
   * Get current thresholds
   */
  getThresholds(): SignoutAlertThresholds {
    return { ...this.defaultThresholds }
  }

  /**
   * Clear old alerts and cooldowns
   */
  cleanup(): void {
    const maxAge = 24 * 60 * 60 * 1000 // 24 hours
    const cutoff = Date.now() - maxAge

    // Clear old alerts
    for (const [id, alert] of this.alerts.entries()) {
      if (alert.resolved && new Date(alert.timestamp).getTime() < cutoff) {
        this.alerts.delete(id)
      }
    }

    // Clear old cooldowns
    for (const [key, timestamp] of this.alertCooldowns.entries()) {
      if (timestamp < cutoff) {
        this.alertCooldowns.delete(key)
      }
    }
  }
}

// Singleton instance
let signoutAlerting: SignoutAlertingService

/**
 * Get the signout alerting service instance
 */
export function getSignoutAlerting(): SignoutAlertingService {
  if (!signoutAlerting) {
    signoutAlerting = new SignoutAlertingService()
  }
  return signoutAlerting
}

/**
 * Setup periodic cleanup of old alerts
 */
export function setupSignoutAlertingCleanup(): void {
  // Clean up old alerts every hour
  setInterval(() => {
    const alerting = getSignoutAlerting()
    alerting.cleanup()
  }, 60 * 60 * 1000) // 1 hour
}

/**
 * Utility functions for triggering specific alerts
 */
export function alertSignoutSuccessRate(
  successRate: number,
  totalAttempts: number,
  successfulAttempts: number,
  timeWindow?: string
): void {
  const alerting = getSignoutAlerting()
  alerting.checkSuccessRate(successRate, totalAttempts, successfulAttempts, timeWindow)
}

export function alertSignoutCleanupFailures(
  pickerFailureRate: number,
  storageFailureRate: number,
  totalCleanupAttempts: number,
  timeWindow?: string
): void {
  const alerting = getSignoutAlerting()
  alerting.checkCleanupFailures(pickerFailureRate, storageFailureRate, totalCleanupAttempts, timeWindow)
}

export function alertSignoutPerformance(
  averageDuration: number,
  sampleSize: number,
  timeWindow?: string
): void {
  const alerting = getSignoutAlerting()
  alerting.checkPerformanceDegradation(averageDuration, sampleSize, timeWindow)
}

export function alertSignoutConsecutiveFailures(
  consecutiveFailures: number,
  recentEvents: Array<{ timestamp: string; success: boolean; error?: string }>
): void {
  const alerting = getSignoutAlerting()
  alerting.checkConsecutiveFailures(consecutiveFailures, recentEvents)
}

export function alertSignoutSystemHealth(
  totalAttempts: number,
  errorCategories: Record<string, number>,
  timeWindow?: string
): void {
  const alerting = getSignoutAlerting()
  alerting.checkSystemHealth(totalAttempts, errorCategories, timeWindow)
}