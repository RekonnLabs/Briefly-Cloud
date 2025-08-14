/**
 * Authentication Middleware for Supabase Auth
 * 
 * This middleware handles authentication for API routes and provides
 * user context for protected operations.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, getAuthenticatedUser, type AuthUser } from './supabase-auth'
import { supabaseAdmin } from '@/app/lib/supabase'

export interface AuthContext {
  user: AuthUser
  requestId: string
}

export interface AuthMiddlewareConfig {
  requireAuth?: boolean
  requireAdmin?: boolean
  allowedRoles?: string[]
}

/**
 * Authentication middleware wrapper for API routes
 */
export function withAuth(
  handler: (request: NextRequest, context: AuthContext) => Promise<NextResponse>,
  config: AuthMiddlewareConfig = { requireAuth: true }
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const requestId = crypto.randomUUID()
    
    try {
      // Always try to get user if auth is required
      if (config.requireAuth) {
        const user = await getAuthenticatedUser()
        
        // Check admin requirement
        if (config.requireAdmin && !user.email.endsWith('@rekonnlabs.com')) {
          return NextResponse.json(
            { 
              success: false, 
              error: 'FORBIDDEN', 
              message: 'Admin access required' 
            },
            { status: 403 }
          )
        }
        
        // Check role requirements
        if (config.allowedRoles && config.allowedRoles.length > 0) {
          const hasRequiredRole = config.allowedRoles.includes(user.subscription_tier)
          if (!hasRequiredRole) {
            return NextResponse.json(
              { 
                success: false, 
                error: 'INSUFFICIENT_PERMISSIONS', 
                message: 'Insufficient permissions for this operation' 
              },
              { status: 403 }
            )
          }
        }
        
        const context: AuthContext = { user, requestId }
        return await handler(request, context)
      } else {
        // For routes that don't require auth, still try to get user context
        try {
          const user = await getAuthenticatedUser()
          const context: AuthContext = { user, requestId }
          return await handler(request, context)
        } catch (error) {
          // If no auth, create minimal context
          const context = { 
            user: null as any, 
            requestId 
          }
          return await handler(request, context)
        }
      }
    } catch (error) {
      console.error('Authentication error:', error)
      
      return NextResponse.json(
        { 
          success: false, 
          error: 'UNAUTHORIZED', 
          message: 'Authentication required' 
        },
        { status: 401 }
      )
    }
  }
}

/**
 * Middleware for admin-only routes
 */
export function withAdminAuth(
  handler: (request: NextRequest, context: AuthContext) => Promise<NextResponse>
) {
  return withAuth(handler, { requireAuth: true, requireAdmin: true })
}

/**
 * Middleware for specific subscription tiers
 */
export function withTierAuth(
  allowedTiers: string[],
  handler: (request: NextRequest, context: AuthContext) => Promise<NextResponse>
) {
  return withAuth(handler, { requireAuth: true, allowedRoles: allowedTiers })
}

/**
 * Optional authentication middleware (user context if available)
 */
export function withOptionalAuth(
  handler: (request: NextRequest, context: Partial<AuthContext>) => Promise<NextResponse>
) {
  return withAuth(handler as any, { requireAuth: false })
}

/**
 * Set tenant context for database operations
 * This ensures RLS policies work correctly
 */
export async function setTenantContext(userId: string): Promise<void> {
  try {
    // Set the tenant context in the database session
    await supabaseAdmin.rpc('set_tenant', { tenant_id: userId })
  } catch (error) {
    console.warn('Failed to set tenant context:', error)
    // Don't throw - RLS policies will still work with auth.uid()
  }
}

/**
 * Clear tenant context
 */
export async function clearTenantContext(): Promise<void> {
  try {
    await supabaseAdmin.rpc('clear_tenant')
  } catch (error) {
    console.warn('Failed to clear tenant context:', error)
  }
}

/**
 * Middleware that sets tenant context automatically
 */
export function withTenantContext(
  handler: (request: NextRequest, context: AuthContext) => Promise<NextResponse>
) {
  return withAuth(async (request: NextRequest, context: AuthContext) => {
    // Set tenant context for this request
    await setTenantContext(context.user.id)
    
    try {
      return await handler(request, context)
    } finally {
      // Clear tenant context after request
      await clearTenantContext()
    }
  })
}

/**
 * Rate limiting check middleware
 */
export async function checkRateLimit(
  userId: string, 
  action: string, 
  windowType: 'minute' | 'hour' | 'day' = 'minute'
): Promise<{ allowed: boolean; retryAfter?: number }> {
  try {
    const windowStart = getWindowStart(windowType)
    const limit = getRateLimitForAction(action, windowType)
    
    // Get current count for this window
    const { data: rateLimit } = await supabaseAdmin
      .from('app.rate_limits')
      .select('count')
      .eq('user_id', userId)
      .eq('limit_type', windowType)
      .eq('action', action)
      .eq('window_start', windowStart.toISOString())
      .single()
    
    const currentCount = rateLimit?.count || 0
    
    if (currentCount >= limit) {
      const retryAfter = getRetryAfter(windowType, windowStart)
      return { allowed: false, retryAfter }
    }
    
    // Increment counter
    await supabaseAdmin
      .from('app.rate_limits')
      .upsert({
        user_id: userId,
        limit_type: windowType,
        action,
        window_start: windowStart.toISOString(),
        count: currentCount + 1
      })
    
    return { allowed: true }
  } catch (error) {
    console.error('Rate limit check failed:', error)
    // Allow request if rate limiting fails
    return { allowed: true }
  }
}

/**
 * Rate limiting middleware
 */
export function withRateLimit(
  action: string,
  windowType: 'minute' | 'hour' | 'day' = 'minute'
) {
  return function(
    handler: (request: NextRequest, context: AuthContext) => Promise<NextResponse>
  ) {
    return withAuth(async (request: NextRequest, context: AuthContext) => {
      const rateLimitResult = await checkRateLimit(context.user.id, action, windowType)
      
      if (!rateLimitResult.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
            retryAfter: rateLimitResult.retryAfter
          },
          {
            status: 429,
            headers: {
              'Retry-After': rateLimitResult.retryAfter?.toString() || '60',
              'X-RateLimit-Limit': getRateLimitForAction(action, windowType).toString(),
              'X-RateLimit-Remaining': '0'
            }
          }
        )
      }
      
      return await handler(request, context)
    })
  }
}

// Helper functions
function getWindowStart(windowType: string): Date {
  const now = new Date()
  switch (windowType) {
    case 'minute':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())
    case 'hour':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours())
    case 'day':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate())
    default:
      return now
  }
}

function getRateLimitForAction(action: string, windowType: string): number {
  const limits = {
    minute: { chat: 10, upload: 5, api: 60 },
    hour: { chat: 100, upload: 50, api: 1000 },
    day: { chat: 1000, upload: 100, api: 10000 }
  }
  
  return limits[windowType as keyof typeof limits]?.[action as keyof typeof limits.minute] || 10
}

function getRetryAfter(windowType: string, windowStart: Date): number {
  const now = new Date()
  switch (windowType) {
    case 'minute':
      return 60 - now.getSeconds()
    case 'hour':
      return (60 - now.getMinutes()) * 60 - now.getSeconds()
    case 'day':
      return ((24 - now.getHours()) * 60 - now.getMinutes()) * 60 - now.getSeconds()
    default:
      return 60
  }
}