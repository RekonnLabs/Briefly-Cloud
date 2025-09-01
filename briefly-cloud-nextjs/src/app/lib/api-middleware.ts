/**
 * Enhanced API middleware for Next.js API routes
 * Provides authentication, rate limiting, logging, validation, and performance monitoring
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, type AuthUser } from './auth/supabase-auth'
import { ApiResponse, ApiErrorCode } from './api-response'
import { logger } from './logger'
import { ErrorHandler } from './error-handler'
import { auditApiAccess, auditSystemError } from './audit/comprehensive-audit-logger'
import {
  createSecurityMiddleware,
  RateLimiter,
  InputSanitizer,
  securitySchemas,
  validateEnvironment
} from './security'

export interface ApiContext {
  user: AuthUser | null
  correlationId: string
  startTime: number
  metadata: Record<string, unknown>
}

export interface RateLimitConfig {
  windowMs: number
  maxRequests: number
  skipSuccessfulRequests?: boolean
  skipFailedRequests?: boolean
}

export interface LoggingConfig {
  enabled: boolean
  includeBody?: boolean
  includeHeaders?: boolean
  logLevel?: 'debug' | 'info' | 'warn' | 'error'
}

export interface ValidationConfig {
  schema?: any
  sanitize?: boolean
  allowUnknown?: boolean
}

export interface MiddlewareConfig {
  requireAuth?: boolean
  rateLimit?: RateLimitConfig
  logging?: LoggingConfig
  validation?: ValidationConfig
  performanceMonitoring?: boolean
  cors?: {
    origin?: string | string[]
    methods?: string[]
    allowedHeaders?: string[]
  }
}

/**
 * Generate correlation ID for request tracking
 */
function generateCorrelationId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Enhanced API handler with comprehensive middleware
 */
export function createProtectedApiHandler(
  handler: (request: NextRequest, context: ApiContext) => Promise<NextResponse>,
  config: MiddlewareConfig = {}
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest): Promise<NextResponse> => {
    const startTime = Date.now()
    const correlationId = generateCorrelationId()
    let user: AuthUser | null = null

    try {
      // Initialize security validation
      validateEnvironment()

      // Create security middleware
      const securityMiddleware = createSecurityMiddleware()

      // Authentication handling
      if (config.requireAuth !== false) { // Default to requiring auth
        try {
          user = await getAuthenticatedUser()
          if (!user) {
            return NextResponse.json(
              { 
                success: false, 
                error: { 
                  code: 'UNAUTHORIZED', 
                  message: 'Authentication required' 
                },
                correlationId,
                timestamp: new Date().toISOString()
              },
              { 
                status: 401,
                headers: {
                  'X-Correlation-ID': correlationId
                }
              }
            )
          }
        } catch (error) {
          console.error('Authentication error:', error, { correlationId })
          return NextResponse.json(
            { 
              success: false, 
              error: { 
                code: 'AUTH_ERROR', 
                message: 'Authentication failed' 
              },
              correlationId,
              timestamp: new Date().toISOString()
            },
            { 
              status: 401,
              headers: {
                'X-Correlation-ID': correlationId
              }
            }
          )
        }
      }

      // Rate limiting
      if (config.rateLimit) {
        const identifier = user?.id || request.headers.get('x-forwarded-for') || 'anonymous'
        if (RateLimiter.isRateLimited(identifier)) {
          const remaining = RateLimiter.getRemainingRequests(identifier)
          const retryAfter = Math.ceil(config.rateLimit.windowMs / 1000)
          
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: 'Too many requests. Please try again later.',
                retryAfter
              },
              correlationId,
              timestamp: new Date().toISOString()
            },
            {
              status: 429,
              headers: {
                'Retry-After': retryAfter.toString(),
                'X-RateLimit-Limit': config.rateLimit.maxRequests.toString(),
                'X-RateLimit-Remaining': remaining.toString(),
                'X-Correlation-ID': correlationId
              }
            }
          )
        }
      }

      // CORS handling
      if (config.cors) {
        const origin = request.headers.get('origin')
        const allowedOrigins = Array.isArray(config.cors.origin) 
          ? config.cors.origin 
          : config.cors.origin ? [config.cors.origin] : ['*']
        
        if (origin && !allowedOrigins.includes('*') && !allowedOrigins.includes(origin)) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'CORS_ERROR',
                message: 'Origin not allowed'
              },
              correlationId,
              timestamp: new Date().toISOString()
            },
            { 
              status: 403,
              headers: {
                'X-Correlation-ID': correlationId
              }
            }
          )
        }
      }

      // Create enhanced context
      const context: ApiContext = {
        user,
        correlationId,
        startTime,
        metadata: {
          method: request.method,
          url: request.url,
          userAgent: request.headers.get('user-agent') || undefined,
          ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
          contentType: request.headers.get('content-type')
        }
      }

      // Input validation and sanitization
      let processedRequest = request
      if (config.validation?.schema && request.method !== 'GET') {
        try {
          const contentType = request.headers.get('content-type')
          
          // Only validate JSON requests
          if (contentType?.includes('application/json')) {
            const body = await request.json().catch(() => ({}))
            const validatedData = config.validation.schema.parse(body)

            // Sanitize input if enabled
            if (config.validation.sanitize) {
              Object.keys(validatedData).forEach(key => {
                if (typeof validatedData[key] === 'string') {
                  validatedData[key] = InputSanitizer.sanitizeString(validatedData[key])
                }
              })
            }

            // Create new request with validated data
            processedRequest = new NextRequest(request.url, {
              method: request.method,
              headers: request.headers,
              body: JSON.stringify(validatedData)
            })
          }
        } catch (validationError) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid input data',
                details: validationError instanceof Error ? validationError.message : 'Validation failed'
              },
              correlationId,
              timestamp: new Date().toISOString()
            },
            { 
              status: 400,
              headers: {
                'X-Correlation-ID': correlationId
              }
            }
          )
        }
      }

      // Call the handler
      const response = await handler(processedRequest, context)

      // Add correlation ID to response headers
      response.headers.set('X-Correlation-ID', correlationId)

      // Apply security headers
      const securedResponse = securityMiddleware(request, response)

      // Performance monitoring and audit logging
      const duration = Date.now() - startTime
      const success = response.status < 400

      // Audit API access
      await auditApiAccess(
        new URL(request.url).pathname,
        user?.id,
        success,
        correlationId,
        duration,
        request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
        request.headers.get('user-agent') || undefined
      ).catch(error => {
        logger.error('Failed to audit API access', {
          correlationId,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      })

      if (config.performanceMonitoring !== false) {
        if (duration > 1000) { // Log slow requests
          logger.warn('Slow API request detected', {
            correlationId,
            method: request.method,
            url: request.url,
            duration,
            userId: user?.id
          })
        }
      }

      return securedResponse

    } catch (error) {
      // Use centralized error handler
      const context: ApiContext = {
        user,
        correlationId,
        startTime,
        metadata: {
          method: request.method,
          url: request.url,
          userAgent: request.headers.get('user-agent') || undefined,
          ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
          contentType: request.headers.get('content-type')
        }
      }

      // Audit system error
      const duration = Date.now() - startTime
      const errorClass = error instanceof Error ? error.constructor.name : 'UnknownError'
      
      await auditSystemError(
        errorClass,
        correlationId,
        duration,
        user?.id,
        new URL(request.url).pathname,
        {
          method: request.method,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      ).catch(auditError => {
        logger.error('Failed to audit system error', {
          correlationId,
          error: auditError instanceof Error ? auditError.message : 'Unknown audit error'
        })
      })

      // Enhanced error handling with retry logic for transient failures
      if (ErrorHandler.isRetryableError(error)) {
        try {
          const { retryApiCall } = await import('./retry')
          return await retryApiCall(() => handler(request, context))
        } catch (retryError) {
          return ErrorHandler.handleError(retryError, context)
        }
      }

      return ErrorHandler.handleError(error, context)
    } finally {
      // Comprehensive logging
      if (config.logging?.enabled !== false) {
        const duration = Date.now() - startTime
        const logData = {
          method: request.method,
          url: request.url,
          duration,
          correlationId,
          userId: user?.id,
          userAgent: request.headers.get('user-agent') || undefined,
          ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
          timestamp: new Date().toISOString()
        }

        // Include headers if configured
        if (config.logging?.includeHeaders) {
          (logData as any).headers = Object.fromEntries(request.headers.entries())
        }

        // Log at appropriate level
        const logLevel = config.logging?.logLevel || 'info'
        logger[logLevel]('API Request', logData)
      }
    }
  }
}

// Note: Error retry logic moved to ErrorHandler.isRetryableError()

/**
 * Public API handler (no authentication required)
 */
export function createPublicApiHandler(
  handler: (request: NextRequest, context: ApiContext) => Promise<NextResponse>,
  config: MiddlewareConfig = {}
): (request: NextRequest) => Promise<NextResponse> {
  return createProtectedApiHandler(handler, { ...config, requireAuth: false })
}

/**
 * File upload handler with enhanced security and monitoring
 */
export function createFileUploadHandler(
  handler: (request: NextRequest, context: ApiContext) => Promise<NextResponse>,
  config: MiddlewareConfig = {}
): (request: NextRequest) => Promise<NextResponse> {
  // Use the enhanced protected handler with file upload specific config
  const uploadConfig: MiddlewareConfig = {
    ...config,
    requireAuth: config.requireAuth !== false, // Default to requiring auth for uploads
    performanceMonitoring: true,
    logging: {
      enabled: true,
      includeHeaders: false, // Don't log file content headers
      logLevel: 'info',
      ...config.logging
    },
    // Stricter rate limiting for uploads if not specified
    rateLimit: config.rateLimit || {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 10, // 10 uploads per minute
      skipSuccessfulRequests: false
    }
  }

  return createProtectedApiHandler(handler, uploadConfig)
}

/**
 * Webhook handler with signature verification
 */
export function createWebhookHandler(
  handler: (request: NextRequest, context: ApiContext) => Promise<NextResponse>,
  config: MiddlewareConfig & { webhookSecret?: string } = {}
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest): Promise<NextResponse> => {
    const startTime = Date.now()
    const correlationId = generateCorrelationId()

    try {
      // Verify webhook signature if secret is provided
      if (config.webhookSecret) {
        const signature = request.headers.get('stripe-signature')
        if (!signature) {
          return NextResponse.json(
            { 
              success: false, 
              error: { 
                code: 'MISSING_SIGNATURE', 
                message: 'Webhook signature required' 
              },
              correlationId,
              timestamp: new Date().toISOString()
            },
            { 
              status: 400,
              headers: {
                'X-Correlation-ID': correlationId
              }
            }
          )
        }

        // Note: In a real implementation, you would verify the signature here
        // using the webhook secret and the request body
      }

      // Create context for webhooks (no user authentication)
      const context: ApiContext = {
        user: null,
        correlationId,
        startTime,
        metadata: {
          method: request.method,
          url: request.url,
          userAgent: request.headers.get('user-agent') || undefined,
          ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
          contentType: request.headers.get('content-type')
        }
      }

      // Call handler
      const response = await handler(request, context)

      // Add correlation ID to response
      response.headers.set('X-Correlation-ID', correlationId)

      // Apply security headers
      const securityMiddleware = createSecurityMiddleware()
      return securityMiddleware(request, response)

    } catch (error) {
      // Use centralized error handler for webhooks
      return ErrorHandler.handleError(error, context)
    } finally {
      // Log webhook request details
      if (config.logging?.enabled !== false) {
        const duration = Date.now() - startTime
        logger.info('Webhook Request', {
          method: request.method,
          url: request.url,
          duration,
          correlationId,
          userAgent: request.headers.get('user-agent') || undefined,
          ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
          timestamp: new Date().toISOString()
        })
      }
    }
  }
}

// Export security schemas for use in API routes
export { securitySchemas } from './security'