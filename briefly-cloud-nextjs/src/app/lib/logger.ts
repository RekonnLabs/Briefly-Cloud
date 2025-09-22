/**
 * Structured logging utility for API routes
 * Provides consistent logging with different levels and contexts
 */

import { NextResponse } from 'next/server'

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogContext {
  userId?: string
  requestId?: string
  endpoint?: string
  method?: string
  userAgent?: string
  ip?: string
  duration?: number
  statusCode?: number
  [key: string]: any
}

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: LogContext
  error?: {
    name: string
    message: string
    stack?: string
  }
}

class Logger {
  private level: LogLevel
  private isDevelopment: boolean

  constructor() {
    this.level = this.getLogLevel()
    this.isDevelopment = process.env.NODE_ENV === 'development'
  }

  private getLogLevel(): LogLevel {
    const envLevel = process.env.LOG_LEVEL?.toUpperCase()
    switch (envLevel) {
      case 'DEBUG': return LogLevel.DEBUG
      case 'INFO': return LogLevel.INFO
      case 'WARN': return LogLevel.WARN
      case 'ERROR': return LogLevel.ERROR
      default: return this.isDevelopment ? LogLevel.DEBUG : LogLevel.INFO
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level
  }

  private formatLogEntry(level: LogLevel, message: string, context?: LogContext, error?: Error): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    }

    if (context) {
      entry.context = context
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      }
    }

    return entry
  }

  private output(entry: LogEntry): void {
    if (this.isDevelopment) {
      // Pretty print for development
      const levelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR']
      const levelColors = ['\x1b[36m', '\x1b[32m', '\x1b[33m', '\x1b[31m']
      const resetColor = '\x1b[0m'
      
      const levelName = levelNames[entry.level]
      const levelColor = levelColors[entry.level]
      
      console.log(
        `${levelColor}[${levelName}]${resetColor} ${entry.timestamp} - ${entry.message}`
      )
      
      if (entry.context) {
        console.log('Context:', JSON.stringify(entry.context, null, 2))
      }
      
      if (entry.error) {
        console.error('Error:', entry.error)
      }
    } else {
      // JSON format for production
      console.log(JSON.stringify(entry))
    }
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const entry = this.formatLogEntry(LogLevel.DEBUG, message, context)
      this.output(entry)
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const entry = this.formatLogEntry(LogLevel.INFO, message, context)
      this.output(entry)
    }
  }

  warn(message: string, context?: LogContext, error?: Error): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const entry = this.formatLogEntry(LogLevel.WARN, message, context, error)
      this.output(entry)
    }
  }

  error(message: string, context?: LogContext, error?: Error): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const entry = this.formatLogEntry(LogLevel.ERROR, message, context, error)
      this.output(entry)
    }
  }

  // Request logging helpers
  logRequest(request: Request, context?: LogContext): void {
    const requestContext: LogContext = {
      method: request.method,
      endpoint: new URL(request.url).pathname,
      userAgent: request.headers.get('user-agent') || undefined,
      ip: request.headers.get('x-forwarded-for')?.split(',')[0] || undefined,
      ...context,
    }

    this.info('API Request', requestContext)
  }

  logResponse(request: Request, response: Response, startTime: number, context?: LogContext): void {
    const duration = Date.now() - startTime
    const responseContext: LogContext = {
      method: request.method,
      endpoint: new URL(request.url).pathname,
      statusCode: response.status,
      duration,
      ...context,
    }

    if (response.status >= 400) {
      this.warn('API Response Error', responseContext)
    } else {
      this.info('API Response', responseContext)
    }
  }

  // Usage logging for analytics
  logUsage(action: string, userId: string, details?: any): void {
    this.info('Usage Event', {
      userId,
      action,
      details,
      timestamp: new Date().toISOString(),
    })
  }

  // Security logging
  logSecurityEvent(event: string, context?: LogContext): void {
    this.warn(`Security Event: ${event}`, {
      ...context,
      securityEvent: true,
    })
  }

  // Performance logging
  logPerformance(operation: string, duration: number, context?: LogContext): void {
    const level = duration > 5000 ? LogLevel.WARN : LogLevel.INFO
    const message = `Performance: ${operation} took ${duration}ms`
    
    if (level === LogLevel.WARN) {
      this.warn(message, { ...context, duration, operation })
    } else {
      this.info(message, { ...context, duration, operation })
    }
  }
}

// Create singleton logger instance
export const logger = new Logger()

// Request logging middleware
export function withRequestLogging<T extends (request: Request, context?: any) => Promise<NextResponse>>(
  handler: T
): T {
  return (async (request: Request, context?: any): Promise<NextResponse> => {
    const startTime = Date.now()
    const requestId = crypto.randomUUID()
    
    // Log incoming request
    logger.logRequest(request, { requestId })
    
    try {
      const response = await handler(request, context)
      
      // Log successful response
      logger.logResponse(request, response, startTime, { requestId })
      
      return response
    } catch (error) {
      // Log error response
      logger.error('API Handler Error', {
        requestId,
        method: request.method,
        endpoint: new URL(request.url).pathname,
        duration: Date.now() - startTime,
      }, error as Error)
      
      throw error
    }
  }) as T
}

// Usage tracking helper
export function logApiUsage(
  userId: string,
  endpoint: string,
  action: string,
  details?: any
): void {
  logger.logUsage(action, userId, {
    endpoint,
    ...details,
  })
}

// Performance monitoring helper
export async function withPerformanceLogging<T>(
  operation: string,
  fn: () => Promise<T>,
  context?: LogContext
): Promise<T> {
  const startTime = Date.now()
  
  try {
    const result = await fn()
    const duration = Date.now() - startTime
    
    logger.logPerformance(operation, duration, context)
    
    return result
  } catch (error) {
    const duration = Date.now() - startTime
    
    logger.error(`Performance: ${operation} failed after ${duration}ms`, context, error as Error)
    
    throw error
  }
}

// Export logger instance as default
export default logger
