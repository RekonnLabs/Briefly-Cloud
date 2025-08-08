/**
 * API middleware composer for Next.js API routes
 * Combines error handling, rate limiting, logging, and validation
 */

import { NextResponse } from 'next/server'
import { withErrorHandler } from './api-errors'
import { withRateLimit, RateLimitConfig } from './rate-limit'
import { withRequestLogging } from './logger'
import { z } from 'zod'

export interface ApiMiddlewareConfig {
  rateLimit?: RateLimitConfig
  validation?: {
    body?: z.ZodSchema
    query?: z.ZodSchema
    params?: z.ZodSchema
  }
  auth?: {
    required?: boolean
    roles?: string[]
  }
  logging?: {
    enabled?: boolean
    includeBody?: boolean
    includeHeaders?: boolean
  }
}

export interface ApiContext {
  user?: {
    id: string
    email: string
    subscription_tier: string
    [key: string]: any
  }
  validatedData?: {
    body?: any
    query?: any
    params?: any
  }
  requestId: string
  startTime: number
}

export type ApiHandler = (
  request: Request,
  context: ApiContext
) => Promise<NextResponse>

// Authentication middleware
function withAuth(
  handler: ApiHandler,
  authConfig?: { required?: boolean; roles?: string[] }
): ApiHandler {
  return async (request: Request, context: ApiContext): Promise<NextResponse> => {
    if (!authConfig?.required) {
      return handler(request, context)
    }

    // Extract token from Authorization header
    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' },
        { status: 401 }
      )
    }

    const token = authHeader.split(' ')[1]

    try {
      // Import Supabase client dynamically to avoid circular dependencies
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY!
      )

      // Verify token with Supabase
      const { data: { user }, error } = await supabase.auth.getUser(token)

      if (error || !user) {
        return NextResponse.json(
          { success: false, error: 'INVALID_TOKEN', message: 'Invalid or expired token' },
          { status: 401 }
        )
      }

      // Get user profile from database
      const { data: userProfile } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()

      if (!userProfile) {
        return NextResponse.json(
          { success: false, error: 'USER_NOT_FOUND', message: 'User profile not found' },
          { status: 404 }
        )
      }

      // Check role requirements
      if (authConfig.roles && authConfig.roles.length > 0) {
        const userRole = userProfile.subscription_tier || 'free'
        if (!authConfig.roles.includes(userRole)) {
          return NextResponse.json(
            { success: false, error: 'FORBIDDEN', message: 'Insufficient permissions' },
            { status: 403 }
          )
        }
      }

      // Add user to context
      context.user = {
        id: user.id,
        email: user.email!,
        subscription_tier: userProfile.subscription_tier,
        ...userProfile,
      }

      return handler(request, context)
    } catch (error) {
      console.error('Auth middleware error:', error)
      return NextResponse.json(
        { success: false, error: 'INTERNAL_ERROR', message: 'Authentication failed' },
        { status: 500 }
      )
    }
  }
}

// Enhanced validation middleware
function withEnhancedValidation(
  handler: ApiHandler,
  validationConfig?: {
    body?: z.ZodSchema
    query?: z.ZodSchema
    params?: z.ZodSchema
  }
) {
  return async (request: Request, context: ApiContext): Promise<NextResponse> => {
    if (!validationConfig) {
      return handler(request, context)
    }

    const validatedData: any = {}

    try {
      // Validate request body
      if (validationConfig.body) {
        const body = await request.json().catch(() => ({}))
        validatedData.body = validationConfig.body.parse(body)
      }

      // Validate query parameters
      if (validationConfig.query) {
        const url = new URL(request.url)
        const queryParams = Object.fromEntries(url.searchParams.entries())
        validatedData.query = validationConfig.query.parse(queryParams)
      }

      // Validate route parameters (if provided in context)
      if (validationConfig.params && (context as any).params) {
        validatedData.params = validationConfig.params.parse((context as any).params)
      }

      // Add validated data to context
      context.validatedData = validatedData

      return handler(request, context)
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessage = error.errors
          .map(err => `${err.path.join('.')}: ${err.message}`)
          .join(', ')
        
        return NextResponse.json(
          { success: false, error: 'VALIDATION_ERROR', message: errorMessage },
          { status: 400 }
        )
      }

      return NextResponse.json(
        { success: false, error: 'INVALID_REQUEST', message: 'Request validation failed' },
        { status: 400 }
      )
    }
  }
}

// CORS middleware
function withCors(handler: ApiHandler) {
  return async (request: Request, context: ApiContext): Promise<NextResponse> => {
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      })
    }

    const response = await handler(request, context)

    // Add CORS headers to response
    response.headers.set('Access-Control-Allow-Origin', '*')
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    return response
  }
}

// Main middleware composer
export function createApiHandler(
  handler: ApiHandler,
  config: ApiMiddlewareConfig = {}
): (request: Request, context?: any) => Promise<NextResponse> {
  let composedHandler = handler

  // Apply middleware in reverse order (last applied runs first)
  
  // 1. CORS (runs last, wraps response)
  composedHandler = withCors(composedHandler)

  // 2. Authentication
  if (config.auth) {
    composedHandler = withAuth(composedHandler, config.auth)
  }

  // 3. Validation
  if (config.validation) {
    composedHandler = withEnhancedValidation(composedHandler, config.validation)
  }

  // 4. Rate limiting
  if (config.rateLimit) {
    const rateLimitMiddleware = withRateLimit(config.rateLimit)
    composedHandler = rateLimitMiddleware(composedHandler)
  }

  // 5. Request logging
  if (config.logging?.enabled !== false) {
    composedHandler = withRequestLogging(composedHandler)
  }

  // 6. Error handling (runs first, catches all errors)
  composedHandler = withErrorHandler(composedHandler)

  // Return final handler with context initialization
  return async (request: Request, routeContext?: any): Promise<NextResponse> => {
    const context: ApiContext = {
      requestId: crypto.randomUUID(),
      startTime: Date.now(),
      ...routeContext,
    }

    return composedHandler(request, context)
  }
}

// Convenience functions for common API patterns
export const createPublicApiHandler = (
  handler: ApiHandler,
  config: Omit<ApiMiddlewareConfig, 'auth'> = {}
) => createApiHandler(handler, { ...config, auth: { required: false } })

export const createProtectedApiHandler = (
  handler: ApiHandler,
  config: Omit<ApiMiddlewareConfig, 'auth'> = {}
) => createApiHandler(handler, { ...config, auth: { required: true } })

export const createAdminApiHandler = (
  handler: ApiHandler,
  config: Omit<ApiMiddlewareConfig, 'auth'> = {}
) => createApiHandler(handler, { 
  ...config, 
  auth: { required: true, roles: ['admin'] } 
})

// HTTP method helpers
export const GET = (handler: ApiHandler, config?: ApiMiddlewareConfig) => 
  createApiHandler(handler, config)

export const POST = (handler: ApiHandler, config?: ApiMiddlewareConfig) => 
  createApiHandler(handler, config)

export const PUT = (handler: ApiHandler, config?: ApiMiddlewareConfig) => 
  createApiHandler(handler, config)

export const DELETE = (handler: ApiHandler, config?: ApiMiddlewareConfig) => 
  createApiHandler(handler, config)

export const PATCH = (handler: ApiHandler, config?: ApiMiddlewareConfig) => 
  createApiHandler(handler, config)