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

function getCookieFromReq(req: Request, name: string) {
  const raw = req.headers.get('cookie') || ''
  const hit = raw.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : undefined
}

export interface ApiContext {
  user: { id: string; email?: string | null }
  supabase: ReturnType<typeof createServerClient>
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

      // Create enhanced context
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
          contentType: request.headers.get('content-type')
        }
      }

      return await handler(request, context)

    } catch (error) {
      console.error('[api:error]', error)
      return ApiResponse.serverError('Internal server error', ApiErrorCode.INTERNAL_ERROR, undefined, correlationId)
    }
  }
}

// Note: Error retry logic moved to ErrorHandler.isRetryableError()

// ✨ keep your existing imports/exports
export type PublicApiContext = { req: Request }

/**
 * Public API wrapper: no auth, no cookie mutation.
 * Centralizes future cross-cutting concerns (CORS, headers, metrics).
 */
export function createPublicApiHandler(
  handler: (req: Request, ctx: PublicApiContext) => Promise<Response> | Response
) {
  return async function wrapped(req: Request) {
    return handler(req, { req })
  }
}
