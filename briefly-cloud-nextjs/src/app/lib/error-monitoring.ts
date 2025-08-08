/**
 * Error monitoring and logging system
 * Provides structured error reporting and integration with monitoring services
 */

export interface ErrorContext {
  userId?: string
  sessionId?: string
  requestId?: string
  url?: string
  userAgent?: string
  timestamp: string
  environment: string
  version?: string
}

export interface ErrorReport {
  error: Error
  context: ErrorContext
  tags?: Record<string, string>
  extra?: Record<string, any>
  level: 'info' | 'warning' | 'error' | 'fatal'
}

export interface ErrorMonitoringService {
  captureError(error: Error, context?: Partial<ErrorContext>): void
  captureMessage(message: string, level?: ErrorReport['level'], context?: Partial<ErrorContext>): void
  setUser(userId: string, userData?: Record<string, any>): void
  setTag(key: string, value: string): void
  setExtra(key: string, value: any): void
}

// Simple console-based error monitoring (for development)
class ConsoleErrorMonitoring implements ErrorMonitoringService {
  private userData: Record<string, any> = {}
  private tags: Record<string, string> = {}
  private extra: Record<string, any> = {}

  captureError(error: Error, context?: Partial<ErrorContext>): void {
    const errorContext = this.buildContext(context)
    
    console.error('Error captured:', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      context: errorContext,
      tags: this.tags,
      extra: this.extra,
      timestamp: new Date().toISOString()
    })
  }

  captureMessage(message: string, level: ErrorReport['level'] = 'info', context?: Partial<ErrorContext>): void {
    const errorContext = this.buildContext(context)
    
    const logMethod = level === 'error' ? 'error' : 
                     level === 'warning' ? 'warn' : 'log'
    
    console[logMethod]('Message captured:', {
      message,
      level,
      context: errorContext,
      tags: this.tags,
      extra: this.extra,
      timestamp: new Date().toISOString()
    })
  }

  setUser(userId: string, userData?: Record<string, any>): void {
    this.userData = { id: userId, ...userData }
  }

  setTag(key: string, value: string): void {
    this.tags[key] = value
  }

  setExtra(key: string, value: any): void {
    this.extra[key] = value
  }

  private buildContext(context?: Partial<ErrorContext>): ErrorContext {
    return {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      ...context
    }
  }
}

// Sentry integration (when available)
class SentryErrorMonitoring implements ErrorMonitoringService {
  private sentry: any

  constructor() {
    // Dynamically import Sentry to avoid bundling issues
    try {
      // This would be initialized in a separate file with proper Sentry setup
      this.sentry = (global as any).Sentry
    } catch (error) {
      console.warn('Sentry not available, falling back to console monitoring')
      this.sentry = null
    }
  }

  captureError(error: Error, context?: Partial<ErrorContext>): void {
    if (this.sentry) {
      this.sentry.captureException(error, {
        extra: context,
        tags: this.getTags(context)
      })
    } else {
      // Fallback to console
      console.error('Error captured (Sentry not available):', error, context)
    }
  }

  captureMessage(message: string, level: ErrorReport['level'] = 'info', context?: Partial<ErrorContext>): void {
    if (this.sentry) {
      this.sentry.captureMessage(message, {
        level: this.mapLevel(level),
        extra: context,
        tags: this.getTags(context)
      })
    } else {
      // Fallback to console
      console.log('Message captured (Sentry not available):', { message, level, context })
    }
  }

  setUser(userId: string, userData?: Record<string, any>): void {
    if (this.sentry) {
      this.sentry.setUser({ id: userId, ...userData })
    }
  }

  setTag(key: string, value: string): void {
    if (this.sentry) {
      this.sentry.setTag(key, value)
    }
  }

  setExtra(key: string, value: any): void {
    if (this.sentry) {
      this.sentry.setExtra(key, value)
    }
  }

  private mapLevel(level: ErrorReport['level']): string {
    const levelMap = {
      info: 'info',
      warning: 'warning',
      error: 'error',
      fatal: 'fatal'
    }
    return levelMap[level] || 'info'
  }

  private getTags(context?: Partial<ErrorContext>): Record<string, string> {
    const tags: Record<string, string> = {}
    
    if (context?.environment) tags.environment = context.environment
    if (context?.version) tags.version = context.version
    
    return tags
  }
}

// Global error monitoring instance
let errorMonitoring: ErrorMonitoringService

// Initialize error monitoring based on environment
export function initializeErrorMonitoring(): ErrorMonitoringService {
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_SENTRY_DSN) {
    errorMonitoring = new SentryErrorMonitoring()
  } else {
    errorMonitoring = new ConsoleErrorMonitoring()
  }
  
  return errorMonitoring
}

// Get the global error monitoring instance
export function getErrorMonitoring(): ErrorMonitoringService {
  if (!errorMonitoring) {
    errorMonitoring = initializeErrorMonitoring()
  }
  return errorMonitoring
}

// Utility functions for common error scenarios
export function captureApiError(
  error: Error,
  endpoint: string,
  userId?: string,
  requestId?: string
): void {
  const monitoring = getErrorMonitoring()
  
  monitoring.setTag('endpoint', endpoint)
  monitoring.setTag('error_type', 'api_error')
  
  if (userId) {
    monitoring.setUser(userId)
  }
  
  monitoring.captureError(error, {
    userId,
    requestId,
    url: endpoint,
    environment: process.env.NODE_ENV || 'development'
  })
}

export function captureAuthError(
  error: Error,
  authMethod: string,
  userId?: string
): void {
  const monitoring = getErrorMonitoring()
  
  monitoring.setTag('auth_method', authMethod)
  monitoring.setTag('error_type', 'auth_error')
  
  if (userId) {
    monitoring.setUser(userId)
  }
  
  monitoring.captureError(error, {
    userId,
    environment: process.env.NODE_ENV || 'development'
  })
}

export function captureFileProcessingError(
  error: Error,
  fileType: string,
  fileSize: number,
  userId?: string
): void {
  const monitoring = getErrorMonitoring()
  
  monitoring.setTag('file_type', fileType)
  monitoring.setTag('error_type', 'file_processing_error')
  monitoring.setExtra('file_size', fileSize)
  
  if (userId) {
    monitoring.setUser(userId)
  }
  
  monitoring.captureError(error, {
    userId,
    environment: process.env.NODE_ENV || 'development'
  })
}

export function captureUsageLimitError(
  limitType: string,
  current: number,
  limit: number,
  userId: string
): void {
  const monitoring = getErrorMonitoring()
  
  monitoring.setTag('limit_type', limitType)
  monitoring.setTag('error_type', 'usage_limit_exceeded')
  monitoring.setExtra('current_usage', current)
  monitoring.setExtra('limit', limit)
  
  monitoring.setUser(userId)
  
  monitoring.captureMessage(
    `Usage limit exceeded: ${limitType}`,
    'warning',
    {
      userId,
      environment: process.env.NODE_ENV || 'development'
    }
  )
}

// Error boundary integration
export function captureReactError(
  error: Error,
  errorInfo: React.ErrorInfo,
  componentName?: string
): void {
  const monitoring = getErrorMonitoring()
  
  monitoring.setTag('error_type', 'react_error')
  monitoring.setTag('component', componentName || 'unknown')
  monitoring.setExtra('componentStack', errorInfo.componentStack)
  
  monitoring.captureError(error, {
    environment: process.env.NODE_ENV || 'development'
  })
}

// Performance monitoring
export function capturePerformanceMetric(
  operation: string,
  duration: number,
  success: boolean,
  userId?: string
): void {
  const monitoring = getErrorMonitoring()
  
  monitoring.setTag('operation', operation)
  monitoring.setTag('success', success.toString())
  monitoring.setExtra('duration_ms', duration)
  
  if (userId) {
    monitoring.setUser(userId)
  }
  
  const level = success ? 'info' : 'warning'
  monitoring.captureMessage(
    `Performance metric: ${operation} took ${duration}ms`,
    level,
    {
      userId,
      environment: process.env.NODE_ENV || 'development'
    }
  )
}

// Global error handlers
export function setupGlobalErrorHandlers(): void {
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    const monitoring = getErrorMonitoring()
    monitoring.setTag('error_type', 'unhandled_rejection')
    monitoring.captureError(
      reason instanceof Error ? reason : new Error(String(reason)),
      { environment: process.env.NODE_ENV || 'development' }
    )
  })

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    const monitoring = getErrorMonitoring()
    monitoring.setTag('error_type', 'uncaught_exception')
    monitoring.captureError(error, {
      environment: process.env.NODE_ENV || 'development'
    })
  })
}

// Browser-specific error handlers
export function setupBrowserErrorHandlers(): void {
  if (typeof window !== 'undefined') {
    // Handle global JavaScript errors
    window.addEventListener('error', (event) => {
      const monitoring = getErrorMonitoring()
      monitoring.setTag('error_type', 'global_js_error')
      monitoring.captureError(event.error || new Error(event.message), {
        url: window.location.href,
        userAgent: navigator.userAgent,
        environment: process.env.NODE_ENV || 'development'
      })
    })

    // Handle unhandled promise rejections in browser
    window.addEventListener('unhandledrejection', (event) => {
      const monitoring = getErrorMonitoring()
      monitoring.setTag('error_type', 'unhandled_promise_rejection')
      monitoring.captureError(
        event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
        {
          url: window.location.href,
          userAgent: navigator.userAgent,
          environment: process.env.NODE_ENV || 'development'
        }
      )
    })
  }
}
