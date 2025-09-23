/**
 * Schema Monitoring Alerting System
 * 
 * Provides alerting capabilities for schema health issues including
 * email notifications, webhook integrations, and alert escalation
 */

import { Alert } from './schema-monitor'

export interface AlertingConfig {
  enabled: boolean
  channels: {
    email?: {
      enabled: boolean
      recipients: string[]
      smtpConfig?: {
        host: string
        port: number
        secure: boolean
        auth: {
          user: string
          pass: string
        }
      }
    }
    webhook?: {
      enabled: boolean
      url: string
      headers?: Record<string, string>
      retryAttempts: number
    }
    slack?: {
      enabled: boolean
      webhookUrl: string
      channel: string
    }
  }
  thresholds: {
    responseTime: {
      warning: number
      critical: number
    }
    errorRate: {
      warning: number
      critical: number
    }
    consecutiveFailures: {
      warning: number
      critical: number
    }
  }
  escalation: {
    enabled: boolean
    timeToEscalate: number // minutes
    escalationRecipients: string[]
  }
}

class AlertingService {
  private config: AlertingConfig
  private sentAlerts: Map<string, Date> = new Map()
  private escalatedAlerts: Set<string> = new Set()

  constructor() {
    this.config = this.loadConfig()
  }

  /**
   * Load alerting configuration from environment variables
   */
  private loadConfig(): AlertingConfig {
    return {
      enabled: process.env.SCHEMA_ALERTING_ENABLED === 'true',
      channels: {
        email: {
          enabled: process.env.EMAIL_ALERTS_ENABLED === 'true',
          recipients: process.env.ALERT_EMAIL_RECIPIENTS?.split(',') || [],
          smtpConfig: process.env.SMTP_HOST ? {
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
              user: process.env.SMTP_USER || '',
              pass: process.env.SMTP_PASS || ''
            }
          } : undefined
        },
        webhook: {
          enabled: process.env.WEBHOOK_ALERTS_ENABLED === 'true',
          url: process.env.ALERT_WEBHOOK_URL || '',
          headers: process.env.ALERT_WEBHOOK_HEADERS ? 
            JSON.parse(process.env.ALERT_WEBHOOK_HEADERS) : {},
          retryAttempts: parseInt(process.env.WEBHOOK_RETRY_ATTEMPTS || '3')
        },
        slack: {
          enabled: process.env.SLACK_ALERTS_ENABLED === 'true',
          webhookUrl: process.env.SLACK_WEBHOOK_URL || '',
          channel: process.env.SLACK_ALERT_CHANNEL || '#alerts'
        }
      },
      thresholds: {
        responseTime: {
          warning: parseInt(process.env.RESPONSE_TIME_WARNING_MS || '1000'),
          critical: parseInt(process.env.RESPONSE_TIME_CRITICAL_MS || '3000')
        },
        errorRate: {
          warning: parseFloat(process.env.ERROR_RATE_WARNING || '0.05'),
          critical: parseFloat(process.env.ERROR_RATE_CRITICAL || '0.15')
        },
        consecutiveFailures: {
          warning: parseInt(process.env.CONSECUTIVE_FAILURES_WARNING || '3'),
          critical: parseInt(process.env.CONSECUTIVE_FAILURES_CRITICAL || '5')
        }
      },
      escalation: {
        enabled: process.env.ALERT_ESCALATION_ENABLED === 'true',
        timeToEscalate: parseInt(process.env.ALERT_ESCALATION_MINUTES || '15'),
        escalationRecipients: process.env.ESCALATION_RECIPIENTS?.split(',') || []
      }
    }
  }

  /**
   * Process an alert and send notifications
   */
  async processAlert(alert: Alert): Promise<void> {
    if (!this.config.enabled) {
      return
    }

    // Check if we've already sent this alert recently (prevent spam)
    const alertKey = `${alert.type}-${alert.schema}-${alert.severity}`
    const lastSent = this.sentAlerts.get(alertKey)
    const cooldownPeriod = this.getCooldownPeriod(alert.severity)
    
    if (lastSent && Date.now() - lastSent.getTime() < cooldownPeriod) {
      return // Still in cooldown period
    }

    try {
      // Send notifications through enabled channels
      const notifications = []

      if (this.config.channels.email?.enabled) {
        notifications.push(this.sendEmailAlert(alert))
      }

      if (this.config.channels.webhook?.enabled) {
        notifications.push(this.sendWebhookAlert(alert))
      }

      if (this.config.channels.slack?.enabled) {
        notifications.push(this.sendSlackAlert(alert))
      }

      // Wait for all notifications to complete
      await Promise.allSettled(notifications)

      // Record that we sent this alert
      this.sentAlerts.set(alertKey, new Date())

      // Check for escalation
      if (this.config.escalation.enabled && alert.severity === 'critical') {
        this.scheduleEscalation(alert)
      }

      console.log(`Alert notifications sent for: ${alert.message}`)

    } catch (error) {
      console.error('Failed to process alert:', error)
    }
  }

  /**
   * Send email alert
   */
  private async sendEmailAlert(alert: Alert): Promise<void> {
    if (!this.config.channels.email?.smtpConfig) {
      throw new Error('SMTP configuration not available')
    }

    const subject = `[${alert.severity.toUpperCase()}] Schema Alert: ${alert.schema} - ${alert.type}`
    const body = this.formatEmailBody(alert)

    // In a real implementation, you would use nodemailer or similar
    console.log('Email alert would be sent:', { subject, body, recipients: this.config.channels.email.recipients })
    
    // Placeholder for actual email sending
    // const transporter = nodemailer.createTransporter(this.config.channels.email.smtpConfig)
    // await transporter.sendMail({
    //   from: this.config.channels.email.smtpConfig.auth.user,
    //   to: this.config.channels.email.recipients.join(','),
    //   subject,
    //   html: body
    // })
  }

  /**
   * Send webhook alert
   */
  private async sendWebhookAlert(alert: Alert): Promise<void> {
    const payload = {
      alert: {
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        schema: alert.schema,
        message: alert.message,
        timestamp: alert.timestamp,
        metadata: alert.metadata
      },
      source: 'briefly-cloud-schema-monitor',
      environment: process.env.NODE_ENV || 'development'
    }

    let attempt = 0
    const maxAttempts = this.config.channels.webhook!.retryAttempts

    while (attempt < maxAttempts) {
      try {
        const response = await fetch(this.config.channels.webhook!.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.config.channels.webhook!.headers
          },
          body: JSON.stringify(payload)
        })

        if (response.ok) {
          console.log('Webhook alert sent successfully')
          return
        } else {
          throw new Error(`Webhook returned ${response.status}: ${response.statusText}`)
        }
      } catch (error) {
        attempt++
        console.error(`Webhook alert attempt ${attempt} failed:`, error)
        
        if (attempt < maxAttempts) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
        }
      }
    }

    throw new Error(`Failed to send webhook alert after ${maxAttempts} attempts`)
  }

  /**
   * Send Slack alert
   */
  private async sendSlackAlert(alert: Alert): Promise<void> {
    const color = this.getSlackColor(alert.severity)
    const payload = {
      channel: this.config.channels.slack!.channel,
      username: 'Schema Monitor',
      icon_emoji: ':warning:',
      attachments: [{
        color,
        title: `Schema Alert: ${alert.schema.toUpperCase()} - ${alert.type.replace('_', ' ')}`,
        text: alert.message,
        fields: [
          {
            title: 'Severity',
            value: alert.severity.toUpperCase(),
            short: true
          },
          {
            title: 'Schema',
            value: alert.schema,
            short: true
          },
          {
            title: 'Timestamp',
            value: new Date(alert.timestamp).toLocaleString(),
            short: false
          }
        ],
        footer: 'Briefly Cloud Schema Monitor',
        ts: Math.floor(new Date(alert.timestamp).getTime() / 1000)
      }]
    }

    const response = await fetch(this.config.channels.slack!.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      throw new Error(`Slack webhook returned ${response.status}: ${response.statusText}`)
    }

    console.log('Slack alert sent successfully')
  }

  /**
   * Schedule alert escalation
   */
  private scheduleEscalation(alert: Alert): void {
    if (this.escalatedAlerts.has(alert.id)) {
      return // Already escalated
    }

    setTimeout(async () => {
      // Check if alert is still unresolved
      if (!alert.resolved) {
        this.escalatedAlerts.add(alert.id)
        
        const escalationAlert: Alert = {
          ...alert,
          id: `escalated-${alert.id}`,
          severity: 'critical',
          message: `ESCALATED: ${alert.message} (unresolved for ${this.config.escalation.timeToEscalate} minutes)`,
          timestamp: new Date().toISOString()
        }

        // Send escalation notifications
        await this.processAlert(escalationAlert)
        
        console.log(`Alert escalated: ${alert.id}`)
      }
    }, this.config.escalation.timeToEscalate * 60 * 1000)
  }

  /**
   * Get cooldown period based on severity
   */
  private getCooldownPeriod(severity: string): number {
    const periods = {
      low: 30 * 60 * 1000,      // 30 minutes
      medium: 15 * 60 * 1000,   // 15 minutes
      high: 5 * 60 * 1000,      // 5 minutes
      critical: 2 * 60 * 1000   // 2 minutes
    }
    
    return periods[severity as keyof typeof periods] || periods.medium
  }

  /**
   * Format email body
   */
  private formatEmailBody(alert: Alert): string {
    return `
      <html>
        <body>
          <h2>Schema Alert Notification</h2>
          <table border="1" cellpadding="5" cellspacing="0">
            <tr><td><strong>Alert ID:</strong></td><td>${alert.id}</td></tr>
            <tr><td><strong>Severity:</strong></td><td>${alert.severity.toUpperCase()}</td></tr>
            <tr><td><strong>Schema:</strong></td><td>${alert.schema}</td></tr>
            <tr><td><strong>Type:</strong></td><td>${alert.type.replace('_', ' ')}</td></tr>
            <tr><td><strong>Message:</strong></td><td>${alert.message}</td></tr>
            <tr><td><strong>Timestamp:</strong></td><td>${new Date(alert.timestamp).toLocaleString()}</td></tr>
          </table>
          
          ${alert.metadata ? `
            <h3>Additional Details</h3>
            <pre>${JSON.stringify(alert.metadata, null, 2)}</pre>
          ` : ''}
          
          <p>
            <strong>Action Required:</strong> Please investigate this issue and resolve it as soon as possible.
          </p>
          
          <p>
            <em>This alert was generated by Briefly Cloud Schema Monitor</em>
          </p>
        </body>
      </html>
    `
  }

  /**
   * Get Slack color for severity
   */
  private getSlackColor(severity: string): string {
    const colors = {
      low: '#36a64f',      // Green
      medium: '#ff9500',   // Orange
      high: '#ff0000',     // Red
      critical: '#8b0000'  // Dark red
    }
    
    return colors[severity as keyof typeof colors] || colors.medium
  }

  /**
   * Get current configuration
   */
  getConfig(): AlertingConfig {
    return { ...this.config }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<AlertingConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }

  /**
   * Test alerting system
   */
  async testAlerts(): Promise<void> {
    const testAlert: Alert = {
      id: `test-${Date.now()}`,
      type: 'connectivity',
      severity: 'medium',
      schema: 'app',
      message: 'This is a test alert from the schema monitoring system',
      timestamp: new Date().toISOString(),
      resolved: false,
      metadata: {
        test: true,
        environment: process.env.NODE_ENV || 'development'
      }
    }

    await this.processAlert(testAlert)
    console.log('Test alert sent successfully')
  }
}

// Singleton instance
export const alertingService = new AlertingService()

// Export types
export type { AlertingConfig }