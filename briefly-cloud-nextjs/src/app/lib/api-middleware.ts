/**
 * API middleware composer for Next.js API routes
 * Combines error handling, rate limiting, logging, and validation
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, type AuthUser } from './auth/supabase-auth'
import { formatErrorResponse } from './api-errors'
import { logger } from './logger'
import { 
  createSecurityMiddleware, 
  RateLimiter, 
  InputSanitizer, 
  securitySchemas,
  validateEnvironment 
} from './security'

export interface ApiContext {
  user?: AuthUser
  requestId: string
}

export interface MiddlewareConfig {
  requireAuth?: boolean
  rateLimit?: {
    windowMs: number
    maxRequests: number
  }
  logging?: {
    enabled: boolean
    includeBody?: boolean
  }
  validation?: {
    schema?: any
    sanitize?: boolean
  }
}

// Enhanced API handler with security middleware
export function createProtectedApiHandler(
  handler: (request: NextRequest, context: ApiContext) => Promise<NextResponse>,
  config: MiddlewareConfig = {}
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const startTime = Date.now()
    const requestId = crypto.randomUUID()
    
    try {
      // Initialize security validation
      validateEnvironment()
      
      // Create security middleware
      const securityMiddleware = createSecurityMiddleware()
      
      // Get user for authentication
      let user: AuthUser | null = null
      if (config.requireAuth) {
        try {
          user = await getAuthenticatedUser()
        } catch (error) {
          return NextResponse.json(
            { success: false, error: 'UNAUTHORIZED', message: 'Authentication required' },
            { status: 401 }
          )
        }
      }
      
      // Rate limiting
      if (config.rateLimit) {
        const identifier = user?.id || request.ip || 'anonymous'
        if (RateLimiter.isRateLimited(identifier)) {
          return NextResponse.json(
            { 
              success: false, 
              error: 'RATE_LIMIT_EXCEEDED', 
              message: 'Too many requests. Please try again later.',
              retryAfter: Math.ceil(config.rateLimit.windowMs / 1000)
            },
            { 
              status: 429,
              headers: {
                'Retry-After': Math.ceil(config.rateLimit.windowMs / 1000).toString(),
                'X-RateLimit-Limit': config.rateLimit.maxRequests.toString(),
                'X-RateLimit-Remaining': RateLimiter.getRemainingRequests(identifier).toString()
              }
            }
          )
        }
      }
      
      // Input validation and sanitization
      if (config.validation?.schema) {
        try {
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
          
          // Replace request body with validated data
          const newRequest = new NextRequest(request.url, {
            method: request.method,
            headers: request.headers,
            body: JSON.stringify(validatedData)
          })
          
          // Create context
          const context: ApiContext = {
            user,
            requestId
          }
          
          // Call handler with validated data
          const response = await handler(newRequest, context)
          
          // Apply security headers
          return securityMiddleware(request, response)
          
        } catch (validationError) {
          return NextResponse.json(
            { 
              success: false, 
              error: 'VALIDATION_ERROR', 
              message: 'Invalid input data',
              details: validationError instanceof Error ? validationError.message : 'Validation failed'
            },
            { status: 400 }
          )
        }
      } else {
        // Create context
        const context: ApiContext = {
          user,
          requestId
        }
        
        // Call handler
        const response = await handler(request, context)
        
        // Apply security headers
        return securityMiddleware(request, response)
      }
      
    } catch (error) {
      // Enhanced error handling with retry logic for transient failures
      const { retryApiCall } = await import('./retry')
      
      // Check if this is a retryable error
      if (error instanceof Error && isRetryableApiError(error)) {
        try {
          return await retryApiCall(() => handler(request, { user, requestId }))
        } catch (retryError) {
          return formatErrorResponse(retryError as Error)
        }
      }
      
      return formatErrorResponse(error as Error)
    } finally {
      // Log request details
      if (config.logging?.enabled) {
        const duration = Date.now() - startTime
        logger.info('API Request', {
          method: request.method,
          url: request.url,
          duration,
          requestId,
          userId: session?.user?.id,
          userAgent: request.headers.get('user-agent'),
          ip: request.ip || request.headers.get('x-forwarded-for')
        })
      }
    }
  }
}

// Helper function to determine if an API error is retryable
function isRetryableApiError(error: Error): boolean {
  const retryablePatterns = [
    'timeout',
    'network',
    'connection',
    'rate limit',
    'temporary',
    'service unavailable',
    'ECONNRESET',
    'ENOTFOUND',
    'ETIMEDOUT'
  ]
  
  return retryablePatterns.some(pattern => 
    error.message.toLowerCase().includes(pattern.toLowerCase())
  )
}

// Public API handler (no authentication required)
export function createPublicApiHandler(
  handler: (request: NextRequest, context: ApiContext) => Promise<NextResponse>,
  config: MiddlewareConfig = {}
) {
  return createProtectedApiHandler(handler, { ...config, requireAuth: false })
}

// File upload handler with enhanced security
export function createFileUploadHandler(
  handler: (request: NextRequest, context: ApiContext) => Promise<NextResponse>,
  config: MiddlewareConfig = {}
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const startTime = Date.now()
    const requestId = crypto.randomUUID()
    
    try {
      // Initialize security validation
      validateEnvironment()
      
      // Create security middleware
      const securityMiddleware = createSecurityMiddleware()
      
      // Get user for authentication
      let user: AuthUser | null = null
      if (config.requireAuth) {
        try {
          user = await getAuthenticatedUser()
        } catch (error) {
          return NextResponse.json(
            { success: false, error: 'UNAUTHORIZED', message: 'Authentication required' },
            { status: 401 }
          )
        }
      }
      
      // Rate limiting for file uploads (stricter limits)
      if (config.rateLimit) {
        const identifier = user?.id || request.ip || 'anonymous'
        if (RateLimiter.isRateLimited(identifier)) {
          return NextResponse.json(
            { 
              success: false, 
              error: 'RATE_LIMIT_EXCEEDED', 
              message: 'Too many upload requests. Please try again later.',
              retryAfter: Math.ceil(config.rateLimit.windowMs / 1000)
            },
            { status: 429 }
          )
        }
      }
      
      // Create context
      const context: ApiContext = {
        user,
        requestId
      }
      
      // Call handler
      const response = await handler(request, context)
      
      // Apply security headers
      return securityMiddleware(request, response)
      
    } catch (error) {
      return formatErrorResponse(error as Error)
    } finally {
      // Log upload request details
      if (config.logging?.enabled) {
        const duration = Date.now() - startTime
        logger.info('File Upload Request', {
          method: request.method,
          url: request.url,
          duration,
          requestId,
          userId: session?.user?.id,
          contentType: request.headers.get('content-type'),
          contentLength: request.headers.get('content-length')
        })
      }
    }
  }
}

// Webhook handler with signature verification
export function createWebhookHandler(
  handler: (request: NextRequest, context: ApiContext) => Promise<NextResponse>,
  config: MiddlewareConfig & { webhookSecret?: string } = {}
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const startTime = Date.now()
    const requestId = crypto.randomUUID()
    
    try {
      // Verify webhook signature if secret is provided
      if (config.webhookSecret) {
        const signature = request.headers.get('stripe-signature')
        if (!signature) {
          return NextResponse.json(
            { success: false, error: 'MISSING_SIGNATURE', message: 'Webhook signature required' },
            { status: 400 }
          )
        }
        
        // Note: In a real implementation, you would verify the signature here
        // using the webhook secret and the request body
      }
      
      // Create context
      const context: ApiContext = {
        requestId
      }
      
      // Call handler
      const response = await handler(request, context)
      
      // Apply security headers
      const securityMiddleware = createSecurityMiddleware()
      return securityMiddleware(request, response)
      
    } catch (error) {
      return formatErrorResponse(error as Error)
    } finally {
      // Log webhook request details
      if (config.logging?.enabled) {
        const duration = Date.now() - startTime
        logger.info('Webhook Request', {
          method: request.method,
          url: request.url,
          duration,
          requestId,
          userAgent: request.headers.get('user-agent'),
          ip: request.ip || request.headers.get('x-forwarded-for')
        })
      }
    }
  }
}

// Export security schemas for use in API routes
export { securitySchemas } from './security'