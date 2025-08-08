/**
 * Global error handlers for server-side error handling
 * Sets up process-level error handlers and monitoring
 */

import { setupGlobalErrorHandlers, getErrorMonitoring } from './error-monitoring'

// Initialize global error handlers
export function initializeGlobalErrorHandlers() {
  // Set up process-level error handlers
  setupGlobalErrorHandlers()
  
  // Initialize error monitoring
  const monitoring = getErrorMonitoring()
  
  // Set up additional process handlers
  process.on('warning', (warning) => {
    console.warn('Process warning:', warning)
    monitoring.captureMessage(`Process warning: ${warning.message}`, 'warning', {
      name: warning.name,
      stack: warning.stack
    })
  })
  
  // Handle uncaught exceptions in async operations
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error)
    monitoring.captureError(error, {
      environment: process.env.NODE_ENV || 'development'
    })
    
    // In production, we might want to gracefully shut down
    if (process.env.NODE_ENV === 'production') {
      console.error('Uncaught exception in production, shutting down gracefully...')
      process.exit(1)
    }
  })
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled promise rejection:', reason)
    monitoring.captureError(
      reason instanceof Error ? reason : new Error(String(reason)),
      {
        environment: process.env.NODE_ENV || 'development',
        promise: promise.toString()
      }
    )
  })
  
  console.log('Global error handlers initialized')
}

// Enhanced error handler for API routes
export function createApiErrorHandler() {
  return (error: Error, req?: any, res?: any) => {
    const monitoring = getErrorMonitoring()
    
    // Capture API-specific error information
    const errorContext = {
      url: req?.url,
      method: req?.method,
      userAgent: req?.headers?.['user-agent'],
      ip: req?.ip || req?.connection?.remoteAddress,
      environment: process.env.NODE_ENV || 'development'
    }
    
    monitoring.captureError(error, errorContext)
    
    // Log to console for development
    if (process.env.NODE_ENV !== 'production') {
      console.error('API Error:', {
        error: error.message,
        stack: error.stack,
        context: errorContext
      })
    }
  }
}

// Performance monitoring middleware
export function createPerformanceMonitor() {
  return (req: any, res: any, next: any) => {
    const startTime = Date.now()
    const monitoring = getErrorMonitoring()
    
    // Capture request start
    res.on('finish', () => {
      const duration = Date.now() - startTime
      const success = res.statusCode < 400
      
      monitoring.capturePerformanceMetric(
        `${req.method} ${req.url}`,
        duration,
        success,
        req.user?.id
      )
    })
    
    next()
  }
}

// Memory usage monitoring
export function createMemoryMonitor() {
  const monitoring = getErrorMonitoring()
  
  setInterval(() => {
    const memUsage = process.memoryUsage()
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024)
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024)
    
    // Alert if memory usage is high
    if (heapUsedMB > 512) { // 512MB threshold
      monitoring.captureMessage(
        `High memory usage: ${heapUsedMB}MB used of ${heapTotalMB}MB total`,
        'warning',
        {
          heapUsed: heapUsedMB,
          heapTotal: heapTotalMB,
          environment: process.env.NODE_ENV || 'development'
        }
      )
    }
  }, 60000) // Check every minute
}

// Database connection monitoring
export function createDatabaseMonitor() {
  const monitoring = getErrorMonitoring()
  
  return {
    captureQueryError: (error: Error, query: string, params?: any) => {
      monitoring.captureError(error, {
        query: query.substring(0, 200), // Truncate long queries
        params: params ? JSON.stringify(params).substring(0, 200) : undefined,
        environment: process.env.NODE_ENV || 'development'
      })
    },
    
    captureConnectionError: (error: Error) => {
      monitoring.captureError(error, {
        errorType: 'database_connection',
        environment: process.env.NODE_ENV || 'development'
      })
    }
  }
}

// External service monitoring
export function createServiceMonitor() {
  const monitoring = getErrorMonitoring()
  
  return {
    captureOpenAIError: (error: Error, model?: string, tokens?: number) => {
      monitoring.captureError(error, {
        service: 'openai',
        model,
        tokens,
        environment: process.env.NODE_ENV || 'development'
      })
    },
    
    captureChromaError: (error: Error, operation?: string) => {
      monitoring.captureError(error, {
        service: 'chroma',
        operation,
        environment: process.env.NODE_ENV || 'development'
      })
    },
    
    captureSupabaseError: (error: Error, operation?: string) => {
      monitoring.captureError(error, {
        service: 'supabase',
        operation,
        environment: process.env.NODE_ENV || 'development'
      })
    },
    
    captureStripeError: (error: Error, operation?: string) => {
      monitoring.captureError(error, {
        service: 'stripe',
        operation,
        environment: process.env.NODE_ENV || 'development'
      })
    }
  }
}

// Usage limit monitoring
export function createUsageMonitor() {
  const monitoring = getErrorMonitoring()
  
  return {
    captureUsageLimit: (userId: string, limitType: string, current: number, limit: number) => {
      monitoring.captureMessage(
        `Usage limit exceeded: ${limitType}`,
        'warning',
        {
          userId,
          limitType,
          current,
          limit,
          environment: process.env.NODE_ENV || 'development'
        }
      )
    },
    
    captureRateLimit: (userId: string, endpoint: string, limit: number) => {
      monitoring.captureMessage(
        `Rate limit exceeded: ${endpoint}`,
        'warning',
        {
          userId,
          endpoint,
          limit,
          environment: process.env.NODE_ENV || 'development'
        }
      )
    }
  }
}

// Health check monitoring
export function createHealthMonitor() {
  const monitoring = getErrorMonitoring()
  
  return {
    captureHealthCheck: (service: string, status: 'healthy' | 'unhealthy', details?: any) => {
      const level = status === 'healthy' ? 'info' : 'error'
      monitoring.captureMessage(
        `Health check: ${service} is ${status}`,
        level,
        {
          service,
          status,
          details,
          environment: process.env.NODE_ENV || 'development'
        }
      )
    }
  }
}
