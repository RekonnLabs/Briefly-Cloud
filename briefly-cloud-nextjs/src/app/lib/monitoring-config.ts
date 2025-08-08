// Monitoring and Analytics Configuration
// This file contains all configuration settings for the monitoring system

export interface MonitoringConfig {
  // Core monitoring settings
  enabled: boolean
  environment: 'development' | 'staging' | 'production'
  
  // Analytics providers
  analytics: {
    vercel: {
      enabled: boolean
      projectId?: string
    }
    sentry: {
      enabled: boolean
      dsn?: string
      environment?: string
      tracesSampleRate?: number
      profilesSampleRate?: number
    }
    custom: {
      enabled: boolean
      endpoint?: string
    }
  }
  
  // Performance monitoring
  performance: {
    enabled: boolean
    sampleRate: number // 0.0 to 1.0
    coreWebVitals: {
      enabled: boolean
      reportTo: 'analytics' | 'console' | 'both'
    }
    thresholds: {
      pageLoadTime: number // milliseconds
      apiResponseTime: number // milliseconds
      databaseQueryTime: number // milliseconds
      memoryUsage: number // percentage
      cpuUsage: number // percentage
      errorRate: number // percentage
    }
  }
  
  // Error tracking
  errorTracking: {
    enabled: boolean
    captureUnhandled: boolean
    captureConsoleErrors: boolean
    captureNetworkErrors: boolean
    severityLevels: {
      critical: string[]
      high: string[]
      medium: string[]
      low: string[]
    }
  }
  
  // Alerting
  alerting: {
    enabled: boolean
    channels: {
      email: {
        enabled: boolean
        recipients: string[]
        smtp?: {
          host: string
          port: number
          secure: boolean
          auth: {
            user: string
            pass: string
          }
        }
      }
      slack: {
        enabled: boolean
        webhookUrl?: string
        channel?: string
      }
      sms: {
        enabled: boolean
        provider?: 'twilio' | 'aws-sns'
        credentials?: Record<string, any>
        recipients: string[]
      }
    }
    thresholds: {
      errorRate: number // percentage
      responseTime: number // milliseconds
      memoryUsage: number // percentage
      cpuUsage: number // percentage
      activeAlerts: number // count
    }
    cooldown: {
      errorRate: number // minutes
      responseTime: number // minutes
      memoryUsage: number // minutes
      cpuUsage: number // minutes
    }
  }
  
  // User analytics
  userAnalytics: {
    enabled: boolean
    trackPageViews: boolean
    trackUserBehavior: boolean
    trackConversions: boolean
    privacy: {
      anonymizeIp: boolean
      respectDnt: boolean
      cookieConsent: boolean
    }
  }
  
  // Data retention
  retention: {
    analyticsEvents: number // days
    performanceMetrics: number // days
    errorLogs: number // days
    userAnalytics: number // days
    webhookLogs: number // days
    apiUsageLogs: number // days
  }
  
  // Stripe monitoring
  stripe: {
    enabled: boolean
    webhookMonitoring: boolean
    alertOnFailures: boolean
    trackMetrics: boolean
  }
}

// Default configuration
export const defaultMonitoringConfig: MonitoringConfig = {
  enabled: true,
  environment: process.env.NODE_ENV as 'development' | 'staging' | 'production',
  
  analytics: {
    vercel: {
      enabled: process.env.NODE_ENV === 'production',
      projectId: process.env.VERCEL_PROJECT_ID,
    },
    sentry: {
      enabled: process.env.NODE_ENV === 'production',
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0.1,
      profilesSampleRate: 0.1,
    },
    custom: {
      enabled: true,
      endpoint: '/api/analytics/track',
    },
  },
  
  performance: {
    enabled: true,
    sampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    coreWebVitals: {
      enabled: true,
      reportTo: 'analytics',
    },
    thresholds: {
      pageLoadTime: 3000, // 3 seconds
      apiResponseTime: 2000, // 2 seconds
      databaseQueryTime: 1000, // 1 second
      memoryUsage: 80, // 80%
      cpuUsage: 70, // 70%
      errorRate: 5, // 5%
    },
  },
  
  errorTracking: {
    enabled: true,
    captureUnhandled: true,
    captureConsoleErrors: true,
    captureNetworkErrors: true,
    severityLevels: {
      critical: ['unhandledrejection', 'network_error', 'database_error'],
      high: ['api_error', 'authentication_error', 'authorization_error'],
      medium: ['validation_error', 'rate_limit_error'],
      low: ['warning', 'info'],
    },
  },
  
  alerting: {
    enabled: process.env.NODE_ENV === 'production',
    channels: {
      email: {
        enabled: !!process.env.ADMIN_EMAIL,
        recipients: process.env.ADMIN_EMAIL ? [process.env.ADMIN_EMAIL] : [],
        smtp: process.env.SMTP_HOST ? {
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER || '',
            pass: process.env.SMTP_PASS || '',
          },
        } : undefined,
      },
      slack: {
        enabled: !!process.env.SLACK_WEBHOOK_URL,
        webhookUrl: process.env.SLACK_WEBHOOK_URL,
        channel: process.env.SLACK_CHANNEL || '#alerts',
      },
      sms: {
        enabled: !!process.env.TWILIO_ACCOUNT_SID,
        provider: 'twilio',
        credentials: process.env.TWILIO_ACCOUNT_SID ? {
          accountSid: process.env.TWILIO_ACCOUNT_SID,
          authToken: process.env.TWILIO_AUTH_TOKEN,
          from: process.env.TWILIO_FROM_NUMBER,
        } : undefined,
        recipients: process.env.ADMIN_PHONE ? [process.env.ADMIN_PHONE] : [],
      },
    },
    thresholds: {
      errorRate: 5, // 5%
      responseTime: 2000, // 2 seconds
      memoryUsage: 80, // 80%
      cpuUsage: 70, // 70%
      activeAlerts: 10, // 10 alerts
    },
    cooldown: {
      errorRate: 15, // 15 minutes
      responseTime: 10, // 10 minutes
      memoryUsage: 5, // 5 minutes
      cpuUsage: 5, // 5 minutes
    },
  },
  
  userAnalytics: {
    enabled: true,
    trackPageViews: true,
    trackUserBehavior: true,
    trackConversions: true,
    privacy: {
      anonymizeIp: true,
      respectDnt: true,
      cookieConsent: true,
    },
  },
  
  retention: {
    analyticsEvents: 90, // 90 days
    performanceMetrics: 30, // 30 days
    errorLogs: 30, // 30 days (critical: 90 days)
    userAnalytics: 90, // 90 days
    webhookLogs: 30, // 30 days
    apiUsageLogs: 30, // 30 days
  },
  
  stripe: {
    enabled: !!process.env.STRIPE_SECRET_KEY,
    webhookMonitoring: true,
    alertOnFailures: true,
    trackMetrics: true,
  },
}

// Environment-specific configurations
export const getMonitoringConfig = (): MonitoringConfig => {
  const env = process.env.NODE_ENV
  
  switch (env) {
    case 'production':
      return {
        ...defaultMonitoringConfig,
        environment: 'production',
        analytics: {
          ...defaultMonitoringConfig.analytics,
          vercel: { ...defaultMonitoringConfig.analytics.vercel, enabled: true },
          sentry: { ...defaultMonitoringConfig.analytics.sentry, enabled: true },
        },
        alerting: {
          ...defaultMonitoringConfig.alerting,
          enabled: true,
        },
        performance: {
          ...defaultMonitoringConfig.performance,
          sampleRate: 0.1, // 10% sampling in production
        },
      }
    
    case 'staging':
      return {
        ...defaultMonitoringConfig,
        environment: 'staging',
        analytics: {
          ...defaultMonitoringConfig.analytics,
          vercel: { ...defaultMonitoringConfig.analytics.vercel, enabled: false },
          sentry: { ...defaultMonitoringConfig.analytics.sentry, enabled: true },
        },
        alerting: {
          ...defaultMonitoringConfig.alerting,
          enabled: true,
        },
        performance: {
          ...defaultMonitoringConfig.performance,
          sampleRate: 0.5, // 50% sampling in staging
        },
      }
    
    case 'development':
    default:
      return {
        ...defaultMonitoringConfig,
        environment: 'development',
        analytics: {
          ...defaultMonitoringConfig.analytics,
          vercel: { ...defaultMonitoringConfig.analytics.vercel, enabled: false },
          sentry: { ...defaultMonitoringConfig.analytics.sentry, enabled: false },
        },
        alerting: {
          ...defaultMonitoringConfig.alerting,
          enabled: false,
        },
        performance: {
          ...defaultMonitoringConfig.performance,
          sampleRate: 1.0, // 100% sampling in development
        },
      }
  }
}

// Validation functions
export const validateMonitoringConfig = (config: MonitoringConfig): string[] => {
  const errors: string[] = []
  
  if (config.enabled) {
    // Validate analytics configuration
    if (config.analytics.sentry.enabled && !config.analytics.sentry.dsn) {
      errors.push('Sentry DSN is required when Sentry is enabled')
    }
    
    // Validate alerting configuration
    if (config.alerting.enabled) {
      if (config.alerting.channels.email.enabled && config.alerting.channels.email.recipients.length === 0) {
        errors.push('Email recipients are required when email alerts are enabled')
      }
      
      if (config.alerting.channels.slack.enabled && !config.alerting.channels.slack.webhookUrl) {
        errors.push('Slack webhook URL is required when Slack alerts are enabled')
      }
      
      if (config.alerting.channels.sms.enabled && config.alerting.channels.sms.recipients.length === 0) {
        errors.push('SMS recipients are required when SMS alerts are enabled')
      }
    }
    
    // Validate thresholds
    if (config.performance.thresholds.errorRate < 0 || config.performance.thresholds.errorRate > 100) {
      errors.push('Error rate threshold must be between 0 and 100')
    }
    
    if (config.performance.thresholds.memoryUsage < 0 || config.performance.thresholds.memoryUsage > 100) {
      errors.push('Memory usage threshold must be between 0 and 100')
    }
    
    if (config.performance.thresholds.cpuUsage < 0 || config.performance.thresholds.cpuUsage > 100) {
      errors.push('CPU usage threshold must be between 0 and 100')
    }
  }
  
  return errors
}

// Utility functions
export const isMonitoringEnabled = (): boolean => {
  const config = getMonitoringConfig()
  return config.enabled
}

export const shouldTrackEvent = (eventType: string): boolean => {
  const config = getMonitoringConfig()
  if (!config.enabled) return false
  
  // Check if event type is in severity levels
  const severityLevels = Object.values(config.errorTracking.severityLevels).flat()
  if (severityLevels.includes(eventType)) return true
  
  // Check sample rate for performance events
  if (eventType.startsWith('performance_')) {
    return Math.random() < config.performance.sampleRate
  }
  
  return true
}

export const getAlertThreshold = (metric: keyof MonitoringConfig['alerting']['thresholds']): number => {
  const config = getMonitoringConfig()
  return config.alerting.thresholds[metric]
}

export const getCooldownPeriod = (metric: keyof MonitoringConfig['alerting']['cooldown']): number => {
  const config = getMonitoringConfig()
  return config.alerting.cooldown[metric]
}
