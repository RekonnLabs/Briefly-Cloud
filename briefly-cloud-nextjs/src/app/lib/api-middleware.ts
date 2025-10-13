/**
 * Enhanced API middleware for Next.js API routes
 * Provides authentication, rate limiting, logging, validation, and performance monitoring
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
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

/**
 * Enhanced JWT token extraction from cookies with fallback mechanisms
 * Supports both Next.js cookies API and direct header parsing for edge cases
 */
function extractJwtFromCookies(request: Request): string | null {
  try {
    // Method 1: Try to extract from cookie header directly (most reliable for API routes)
    const cookieHeader = request.headers.get('cookie')
    if (cookieHeader) {
      const cookies = cookieHeader.split(';').map(c => c.trim())
      
      // Look for Supabase auth tokens (multiple possible names)
      const authCookieNames = [
        'sb-access-token',
        'sb-refresh-token', 
        'supabase-auth-token',
        'supabase.auth.token'
      ]
      
      for (const cookieName of authCookieNames) {
        const cookie = cookies.find(c => c.startsWith(`${cookieName}=`))
        if (cookie) {
          const token = cookie.split('=')[1]
          if (token && token !== 'undefined' && token !== 'null') {
            return decodeURIComponent(token)
          }
        }
      }
      
      // Look for any cookie that looks like a JWT (contains dots and base64-like content)
      for (const cookie of cookies) {
        const [name, value] = cookie.split('=')
        if (value && value.includes('.') && value.split('.').length === 3) {
          // Basic JWT structure validation (header.payload.signature)
          try {
            const parts = value.split('.')
            if (parts.length === 3 && parts.every(part => part.length > 0)) {
              return decodeURIComponent(value)
            }
          } catch {
            // Continue to next cookie if this one fails validation
          }
        }
      }
    }
    
    return null
  } catch (error) {
    console.warn('[auth:jwt-extraction] Failed to extract JWT from cookies:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      hasCookieHeader: !!request.headers.get('cookie')
    })
    return null
  }
}

/**
 * Enhanced user context extraction with comprehensive error handling
 * Validates JWT tokens and extracts user information with detailed logging
 */
async function extractUserContext(request: Request, correlationId: string): Promise<{
  user: { id: string } | null
  supabase: ReturnType<typeof createServerClient>
  authError?: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}> {
  try {
    // Create Supabase client using Next.js cookies (JWT-based, no DB queries)
    const supabase = await getServerSupabase()
    
    // Extract JWT token for debugging
    const jwtToken = extractJwtFromCookies(request)
    
    // Log authentication context for debugging
    const authContext = createAuthDebugContext(
      request,
      correlationId,
      'JWT_EXTRACTION',
      undefined,
      !!jwtToken,
      jwtToken?.length
    )
    logAuthenticationContext(authContext)
    
    // Get user from Supabase (validates JWT internally)
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error) {
      const authError = {
        code: 'SUPABASE_AUTH_ERROR',
        message: error.message,
        details: {
          supabaseError: error,
          hasJwtToken: !!jwtToken
        }
      }
      
      // Log authentication error with detailed context
      logAuthenticationError(correlationId, authError, request)
      
      // Log authentication context for debugging
      const authContext = createAuthDebugContext(
        request,
        correlationId,
        'SUPABASE_ERROR',
        undefined,
        !!jwtToken,
        jwtToken?.length
      )
      logAuthenticationContext(authContext)
      
      return {
        user: null,
        supabase,
        authError
      }
    }
    
    if (!user) {
      const authError = {
        code: 'NO_USER_IN_TOKEN',
        message: 'No user found in authentication token',
        details: {
          hasJwtToken: !!jwtToken
        }
      }
      
      // Log authentication error with detailed context
      logAuthenticationError(correlationId, authError, request)
      
      // Log authentication context for debugging
      const authContext = createAuthDebugContext(
        request,
        correlationId,
        'NO_USER_FOUND',
        undefined,
        !!jwtToken,
        jwtToken?.length
      )
      logAuthenticationContext(authContext)
      
      return {
        user: null,
        supabase,
        authError
      }
    }
    
    // Validate user ID format (should be UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(user.id)) {
      const authError = {
        code: 'INVALID_USER_ID',
        message: 'Invalid user ID format',
        details: {
          userId: user.id
        }
      }
      
      // Log authentication error with detailed context
      logAuthenticationError(correlationId, authError, request)
      
      // Log authentication context for debugging
      const authContext = createAuthDebugContext(
        request,
        correlationId,
        'INVALID_USER_ID',
        { id: user.id },
        !!jwtToken,
        jwtToken?.length
      )
      logAuthenticationContext(authContext)
      
      return {
        user: null,
        supabase,
        authError
      }
    }
    
    // Log successful authentication with detailed context
    const successContext = createAuthDebugContext(
      request,
      correlationId,
      'AUTH_SUCCESS',
      { id: user.id },
      !!jwtToken,
      jwtToken?.length
    )
    logAuthenticationContext(successContext)
    
    console.info('[auth:user-details]', {
      correlationId,
      userId: user.id,
      userEmail: user.email,
      hasJwtToken: !!jwtToken,
      jwtTokenLength: jwtToken?.length,
      timestamp: new Date().toISOString()
    })
    
    return {
      user: { id: user.id },
      supabase
    }
    
  } catch (error) {
    const authError = {
      code: 'AUTH_EXTRACTION_ERROR',
      message: 'Failed to extract user context',
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }
    }
    
    // Log authentication error with detailed context
    logAuthenticationError(correlationId, authError, request)
    
    // Log authentication context for debugging
    const authContext = createAuthDebugContext(
      request,
      correlationId,
      'EXTRACTION_ERROR',
      undefined,
      false
    )
    logAuthenticationContext(authContext)
    
    // Create a fallback Supabase client for error responses
    const fallbackSupabase = await getServerSupabase()
    
    return {
      user: null,
      supabase: fallbackSupabase,
      authError
    }
  }
}

/**
 * Create server-side Supabase client that reads from Next.js cookies
 * This avoids database queries and uses JWT validation only
 */
async function getServerSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )
}

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
  user: { id: string } | null
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
 * Generate correlation ID for request tracking with OAuth flow support
 */
function generateCorrelationId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Generate OAuth flow correlation ID for tracking OAuth sessions
 */
export function generateOAuthCorrelationId(): string {
  return `oauth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Authentication debugging context interface
 */
interface AuthDebugContext {
  correlationId: string
  userId?: string
  endpoint: string
  method: string
  userAgent?: string
  origin?: string
  referer?: string
  hasJwtToken: boolean
  jwtTokenLength?: number
  authStep: string
  timestamp: string
}

/**
 * Log authentication context for debugging OAuth flows and API access
 */
function logAuthenticationContext(context: AuthDebugContext): void {
  const logLevel = context.userId ? 'info' : 'warn'
  const message = context.userId 
    ? `[AUTH:SUCCESS] User authenticated successfully`
    : `[AUTH:FAILURE] Authentication failed`
  
  console[logLevel](message, {
    correlationId: context.correlationId,
    userId: context.userId,
    endpoint: context.endpoint,
    method: context.method,
    authStep: context.authStep,
    timestamp: context.timestamp,
    hasJwtToken: context.hasJwtToken,
    jwtTokenLength: context.jwtTokenLength,
    userAgent: context.userAgent?.substring(0, 100), // Truncate for logs
    origin: context.origin,
    referer: context.referer
  })
}

/**
 * Log OAuth flow step for debugging callback processing
 */
export function logOAuthFlowStep(
  correlationId: string,
  step: string,
  details: Record<string, unknown>,
  userId?: string
): void {
  console.info(`[OAUTH:${step.toUpperCase()}]`, {
    correlationId,
    userId,
    step,
    timestamp: new Date().toISOString(),
    ...details
  })
}

/**
 * Log authentication error with detailed context
 */
function logAuthenticationError(
  correlationId: string,
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  },
  request: Request
): void {
  console.error('[AUTH:ERROR]', {
    correlationId,
    errorCode: error.code,
    errorMessage: error.message,
    endpoint: new URL(request.url).pathname,
    method: request.method,
    timestamp: new Date().toISOString(),
    userAgent: request.headers.get('user-agent'),
    origin: request.headers.get('origin'),
    referer: request.headers.get('referer'),
    details: error.details
  })
}

/**
 * Validate user context and return standardized validation result
 */
export interface UserValidationResult {
  isValid: boolean
  user: { id: string } | null
  error?: {
    code: string
    message: string
    httpStatus: number
  }
}

/**
 * Helper function for consistent user validation across API routes
 */
export function validateUserContext(
  user: { id: string } | null,
  correlationId: string,
  requireAuth: boolean = true
): UserValidationResult {
  if (!requireAuth) {
    return {
      isValid: true,
      user
    }
  }
  
  if (!user) {
    return {
      isValid: false,
      user: null,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
        httpStatus: 401
      }
    }
  }
  
  if (!user.id) {
    return {
      isValid: false,
      user: null,
      error: {
        code: 'INVALID_USER_ID',
        message: 'Invalid user ID in authentication context',
        httpStatus: 401
      }
    }
  }
  
  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(user.id)) {
    console.error('[AUTH:INVALID-UUID]', {
      correlationId,
      userId: user.id,
      message: 'User ID is not a valid UUID'
    })
    
    return {
      isValid: false,
      user: null,
      error: {
        code: 'INVALID_USER_ID',
        message: 'Invalid user ID format',
        httpStatus: 401
      }
    }
  }
  
  return {
    isValid: true,
    user
  }
}

/**
 * Helper function to extract and validate user from API context
 */
export function requireAuthenticatedUser(context: ApiContext): { id: string } {
  const validation = validateUserContext(context.user, context.correlationId, true)
  
  if (!validation.isValid || !validation.user) {
    throw new Error(`Authentication required: ${validation.error?.message || 'Unknown error'}`)
  }
  
  return validation.user
}

/**
 * Helper function to get user ID safely from context
 */
export function getUserIdFromContext(context: ApiContext): string | null {
  const validation = validateUserContext(context.user, context.correlationId, false)
  return validation.user?.id || null
}

/**
 * Create authentication debug context for logging
 */
function createAuthDebugContext(
  request: Request,
  correlationId: string,
  authStep: string,
  user?: { id: string } | null,
  hasJwtToken?: boolean,
  jwtTokenLength?: number
): AuthDebugContext {
  const url = new URL(request.url)
  
  return {
    correlationId,
    userId: user?.id,
    endpoint: url.pathname,
    method: request.method,
    userAgent: request.headers.get('user-agent') || undefined,
    origin: request.headers.get('origin') || undefined,
    referer: request.headers.get('referer') || undefined,
    hasJwtToken: hasJwtToken || false,
    jwtTokenLength,
    authStep,
    timestamp: new Date().toISOString()
  }
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
 * Uses JWT-based authentication to avoid database queries and RLS issues
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

      // Enhanced user context extraction with comprehensive error handling
      const { user, supabase, authError } = await extractUserContext(request, correlationId)
      
      // Check if authentication is required
      if (config.requireAuth !== false) {
        const validation = validateUserContext(user, correlationId, true)
        
        if (!validation.isValid) {
          // Log authentication failure with detailed context
          console.warn('[api:auth-failure]', {
            correlationId,
            authError: authError?.message || validation.error?.message,
            authCode: authError?.code || validation.error?.code,
            requireAuth: config.requireAuth,
            url: request.url,
            method: request.method,
            timestamp: new Date().toISOString()
          })
          
          // Return specific error based on auth failure type
          if (authError?.code === 'SUPABASE_AUTH_ERROR') {
            return ApiResponse.unauthorized(
              'Invalid authentication token', 
              ApiErrorCode.INVALID_TOKEN, 
              correlationId
            )
          } else if (authError?.code === 'NO_USER_IN_TOKEN') {
            return ApiResponse.unauthorized(
              'Authentication token does not contain user information', 
              ApiErrorCode.INVALID_TOKEN, 
              correlationId
            )
          } else if (authError?.code === 'INVALID_USER_ID') {
            return ApiResponse.unauthorized(
              'Invalid user ID in authentication token', 
              ApiErrorCode.INVALID_TOKEN, 
              correlationId
            )
          } else {
            return ApiResponse.unauthorized(
              validation.error?.message || 'Authentication failed', 
              ApiErrorCode.UNAUTHORIZED, 
              correlationId
            )
          }
        }
        
        // Log successful authentication for protected endpoints
        console.info('[api:auth-success]', {
          correlationId,
          userId: user?.id,
          endpoint: new URL(request.url).pathname,
          method: request.method,
          timestamp: new Date().toISOString()
        })
      }

      // Determine primary schema based on request path
      const url = new URL(request.url)
      const primarySchema = determinePrimarySchema(url.pathname)

      // Create enhanced context with schema awareness
      const schemaContext = createSchemaContext(correlationId, user?.id, primarySchema)
      
      const context: ApiContext = {
        user: user ? { id: user.id } : null,
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
            userId: user?.id
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
