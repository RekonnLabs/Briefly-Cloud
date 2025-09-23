/**
 * Enhanced API middleware for Next.js API routes
 * Provides authentication, rate limiting, logging, validation, and performance monitoring
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
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
import { SchemaError, handleSchemaError, logSchemaError, extractSchemaContext } from './errors/schema-errors'

function getCookieFromReq(req: Request, name: string) {
  const raw = req.headers.get('cookie') || ''
  const hit = raw.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : undefined
}

export interface SchemaOperationMetrics {
  schema: 'app' | 'private' | 'public'
  operation: string
  table?: string
  duration?: number
  success: boolean
  errorCode?: string
}

export interface ApiContext {
  user: { id: string; email?: string | null }
  supabase: ReturnType<typeof createServerClient>
  correlationId: string
  startTime: number
  metadata: Record<string, unknown>
  schemaContext: {
    primarySchema: 'app' | 'private' | 'public'
    operations: SchemaOperationMetrics[]
    addOperation: (metrics: SchemaOperationMetrics) => void
    logSchemaError: (error: any, operation: string, schema: 'app' | 'private' | 'public', table?: string) => SchemaError
  }
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
 * Create schema context for tracking operations and errors
 */
function createSchemaContext(
  correlationId: string,
  userId?: string,
  primarySchema: 'app' | 'private' | 'public' = 'app'
) {
  const operations: SchemaOperationMetrics[] = []

  return {
    primarySchema,
    operations,
    addOperation: (metrics: SchemaOperationMetrics) => {
      operations.push({
        ...metrics,
        duration: metrics.duration || Date.now()
      })
    },
    logSchemaError: (
      error: any,
      operation: string,
      schema: 'app' | 'private' | 'public',
      table?: string
    ): SchemaError => {
      const schemaError = handleSchemaError(error, {
        schema,
        operation,
        table,
        userId,
        correlationId,
        originalError: error
      })
      
      logSchemaError(schemaError)
      
      // Track failed operation
      operations.push({
        schema,
        operation,
        table,
        success: false,
        errorCode: schemaError.code,
        duration: Date.now()
      })
      
      return schemaError
    }
  }
}

/**
 * Log performance metrics for schema operations
 */
function logSchemaPerformanceMetrics(
  correlationId: string,
  operations: SchemaOperationMetrics[],
  totalDuration: number
): void {
  if (operations.length === 0) return

  const metrics = {
    correlationId,
    totalDuration,
    operationCount: operations.length,
    schemaBreakdown: operations.reduce((acc, op) => {
      acc[op.schema] = (acc[op.schema] || 0) + 1
      return acc
    }, {} as Record<string, number>),
    successRate: operations.filter(op => op.success).length / operations.length,
    failedOperations: operations.filter(op => !op.success).map(op => ({
      schema: op.schema,
      operation: op.operation,
      table: op.table,
      errorCode: op.errorCode
    })),
    averageDuration: operations.reduce((sum, op) => sum + (op.duration || 0), 0) / operations.length
  }

  console.log('[schema-performance]', JSON.stringify(metrics, null, 2))
}

/**
 * Determine the primary schema based on API endpoint path
 */
function determinePrimarySchema(pathname: string): 'app' | 'private' | 'public' {
  // OAuth and storage callbacks typically use private schema for token storage
  if (pathname.includes('/storage/') && pathname.includes('/callback')) {
    return 'private'
  }
  
  // OAuth token endpoints use private schema
  if (pathname.includes('/auth/') || pathname.includes('/oauth/')) {
    return 'private'
  }
  
  // Health checks may use public schema for compatibility views
  if (pathname.includes('/health')) {
    return 'public'
  }
  
  // Most API endpoints use app schema for application data
  return 'app'
}

/**
 * Enhanced API handler with comprehensive middleware
 */
export function createProtectedApiHandler(
  handler: (request: Request, context: ApiContext) => Promise<Response> | Response,
  config: MiddlewareConfig = {}
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const startTime = Date.now()
    const correlationId = generateCorrelationId()

    try {
      // Initialize security validation
      validateEnvironment()

      // Create Supabase client that can read cookies from request
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            get: (name: string) => getCookieFromReq(request, name),
            set: () => {},    // no-ops; start endpoints must not mutate cookies
            remove: () => {},
          },
        }
      )

      // Authentication handling
      const { data, error } = await supabase.auth.getUser()
      if (error || !data?.user) {
        return ApiResponse.unauthorized('Authentication failed', ApiErrorCode.UNAUTHORIZED, correlationId)
      }

      // Determine primary schema based on request path
      const url = new URL(request.url)
      const primarySchema = determinePrimarySchema(url.pathname)

      // Create enhanced context with schema awareness
      const schemaContext = createSchemaContext(correlationId, data.user.id, primarySchema)
      
      const context: ApiContext = {
        user: data.user,
        supabase,
        correlationId,
        startTime,
        metadata: {
          method: request.method,
          url: request.url,
          userAgent: request.headers.get('user-agent') || undefined,
          ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
          contentType: request.headers.get('content-type'),
          primarySchema
        },
        schemaContext
      }

      // Execute handler with schema-aware error handling
      let response: Response
      try {
        response = await handler(request, context)
        
        // Log successful completion
        schemaContext.addOperation({
          schema: primarySchema,
          operation: `${request.method} ${url.pathname}`,
          success: true,
          duration: Date.now() - startTime
        })
        
      } catch (error) {
        // Handle schema-specific errors
        if (error instanceof SchemaError) {
          console.error('[schema-error]', {
            correlationId,
            schema: error.schema,
            operation: error.operation,
            message: error.message,
            code: error.code,
            userId: data.user.id
          })
          
          return ApiResponse.serverError(
            error.message,
            error.code as ApiErrorCode,
            undefined,
            correlationId
          )
        }
        
        // Handle other errors with schema context
        const schemaError = schemaContext.logSchemaError(
          error,
          `${request.method} ${url.pathname}`,
          primarySchema
        )
        
        return ApiResponse.serverError(
          'Internal server error',
          ApiErrorCode.INTERNAL_ERROR,
          undefined,
          correlationId
        )
      } finally {
        // Log performance metrics
        const totalDuration = Date.now() - startTime
        logSchemaPerformanceMetrics(correlationId, schemaContext.operations, totalDuration)
      }

      return response

    } catch (error) {
      // Enhanced error logging with schema context
      console.error('[api:error]', {
        correlationId,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : error,
        metadata: {
          method: request.method,
          url: request.url,
          timestamp: new Date().toISOString()
        }
      })
      
      return ApiResponse.serverError('Internal server error', ApiErrorCode.INTERNAL_ERROR, undefined, correlationId)
    }
  }
}

// Note: Error retry logic moved to ErrorHandler.isRetryableError()

// ✨ keep your existing imports/exports
export type PublicApiContext = { 
  req: Request
  correlationId: string
  schemaContext: {
    primarySchema: 'app' | 'private' | 'public'
    operations: SchemaOperationMetrics[]
    addOperation: (metrics: SchemaOperationMetrics) => void
    logSchemaError: (error: any, operation: string, schema: 'app' | 'private' | 'public', table?: string) => SchemaError
  }
}

/**
 * Public API wrapper: no auth, no cookie mutation.
 * Centralizes future cross-cutting concerns (CORS, headers, metrics, schema context).
 */
export function createPublicApiHandler(
  handler: (req: Request, ctx: PublicApiContext) => Promise<Response> | Response
) {
  return async function wrapped(req: Request) {
    const startTime = Date.now()
    const correlationId = generateCorrelationId()
    
    try {
      // Determine primary schema for public endpoints
      const url = new URL(req.url)
      const primarySchema = determinePrimarySchema(url.pathname)
      
      // Create schema context for public endpoints
      const schemaContext = createSchemaContext(correlationId, undefined, primarySchema)
      
      const context: PublicApiContext = {
        req,
        correlationId,
        schemaContext
      }

      // Execute handler with schema-aware error handling
      let response: Response
      try {
        response = await handler(req, context)
        
        // Log successful completion
        schemaContext.addOperation({
          schema: primarySchema,
          operation: `${req.method} ${url.pathname}`,
          success: true,
          duration: Date.now() - startTime
        })
        
      } catch (error) {
        // Handle schema-specific errors
        if (error instanceof SchemaError) {
          console.error('[public-schema-error]', {
            correlationId,
            schema: error.schema,
            operation: error.operation,
            message: error.message,
            code: error.code
          })
          
          return ApiResponse.serverError(
            error.message,
            error.code as ApiErrorCode,
            undefined,
            correlationId
          )
        }
        
        // Handle other errors with schema context
        const schemaError = schemaContext.logSchemaError(
          error,
          `${req.method} ${url.pathname}`,
          primarySchema
        )
        
        return ApiResponse.serverError(
          'Internal server error',
          ApiErrorCode.INTERNAL_ERROR,
          undefined,
          correlationId
        )
      } finally {
        // Log performance metrics
        const totalDuration = Date.now() - startTime
        logSchemaPerformanceMetrics(correlationId, schemaContext.operations, totalDuration)
      }

      return response
      
    } catch (error) {
      // Enhanced error logging for public endpoints
      console.error('[public-api:error]', {
        correlationId,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : error,
        metadata: {
          method: req.method,
          url: req.url,
          timestamp: new Date().toISOString()
        }
      })
      
      return ApiResponse.serverError('Internal server error', ApiErrorCode.INTERNAL_ERROR, undefined, correlationId)
    }
  }
}
