/**
 * Usage Middleware
 * 
 * This middleware integrates usage tracking, rate limiting, and tier enforcement
 * for all API routes in the multi-tenant architecture.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUsageTracker, type UsageAction } from './usage-tracker'
import { getRateLimiter, type RateLimitAction, type RateLimitWindow } from './rate-limiter'
import { getTierManager } from './tier-manager'
import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'
import type { AuthContext } from '@/app/lib/auth/auth-middleware'

export interface UsageMiddlewareConfig {
  trackUsage?: {
    action: UsageAction
    resourceType?: string
    quantity?: number
  }
  enforceRateLimit?: {
    action: RateLimitAction
    window?: RateLimitWindow
  }
  enforceTierLimits?: {
    action: 'upload' | 'chat' | 'api_call' | 'storage'
    quantity?: number
  }
  requireFeature?: string
  logMetadata?: boolean
}

/**
 * Usage tracking and enforcement middleware
 */
export function withUsageControls(
  config: UsageMiddlewareConfig,
  handler: (request: NextRequest, context: AuthContext) => Promise<NextResponse>
) {
  return async (request: NextRequest, context: AuthContext): Promise<NextResponse> => {
    const { user } = context
    const startTime = Date.now()

    try {
      // Extract request metadata for logging
      const metadata = config.logMetadata ? {
        method: request.method,
        url: request.url,
        userAgent: request.headers.get('user-agent'),
        ipAddress: request.headers.get('x-forwarded-for') || 
                   request.headers.get('x-real-ip') || 
                   'unknown',
        timestamp: new Date().toISOString()
      } : {}

      // 1. Check feature access if required
      if (config.requireFeature) {
        const tierManager = getTierManager()
        const hasAccess = await tierManager.hasFeatureAccess(user.id, config.requireFeature)
        
        if (!hasAccess) {
          return NextResponse.json(
            {
              success: false,
              error: 'FEATURE_NOT_AVAILABLE',
              message: `Feature '${config.requireFeature}' is not available for your subscription tier`,
              upgradeRequired: true
            },
            { status: 402 }
          )
        }
      }

      // 2. Enforce tier limits if configured
      if (config.enforceTierLimits) {
        const tierManager = getTierManager()
        await tierManager.enforceActionLimits(
          user.id,
          config.enforceTierLimits.action,
          config.enforceTierLimits.quantity
        )
      }

      // 3. Enforce rate limits if configured
      if (config.enforceRateLimit) {
        const rateLimiter = getRateLimiter()
        const rateLimitResult = await rateLimiter.enforceRateLimit(
          user.id,
          config.enforceRateLimit.action,
          config.enforceRateLimit.window
        )

        // Add rate limit headers to response
        const response = await handler(request, context)
        response.headers.set('X-RateLimit-Limit', rateLimitResult.limit.toString())
        response.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString())
        response.headers.set('X-RateLimit-Reset', rateLimitResult.resetTime.toISOString())

        // 4. Track usage after successful operation
        if (config.trackUsage) {
          const usageTracker = getUsageTracker()
          await usageTracker.logUsage(user.id, config.trackUsage.action, {
            resourceType: config.trackUsage.resourceType,
            quantity: config.trackUsage.quantity,
            ipAddress: metadata.ipAddress,
            userAgent: metadata.userAgent,
            metadata: {
              ...metadata,
              processingTime: Date.now() - startTime,
              rateLimitUsed: rateLimitResult.limit - rateLimitResult.remaining
            }
          })
        }

        return response
      }

      // Execute handler without rate limiting
      const response = await handler(request, context)

      // 4. Track usage after successful operation
      if (config.trackUsage) {
        const usageTracker = getUsageTracker()
        await usageTracker.logUsage(user.id, config.trackUsage.action, {
          resourceType: config.trackUsage.resourceType,
          quantity: config.trackUsage.quantity,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          metadata: {
            ...metadata,
            processingTime: Date.now() - startTime
          }
        })
      }

      return response

    } catch (error) {
      const processingTime = Date.now() - startTime

      // Log failed operation
      if (config.trackUsage) {
        try {
          const usageTracker = getUsageTracker()
          await usageTracker.logUsage(user.id, config.trackUsage.action, {
            resourceType: config.trackUsage.resourceType,
            quantity: 0, // No usage counted for failed operations
            metadata: {
              failed: true,
              error: (error as Error).message,
              processingTime
            }
          })
        } catch (loggingError) {
          logger.error('Failed to log failed operation', loggingError as Error)
        }
      }

      // Re-throw the original error
      throw error
    }
  }
}

/**
 * Convenience middleware creators
 */

/**
 * Middleware for chat operations
 */
export function withChatControls(
  handler: (request: NextRequest, context: AuthContext) => Promise<NextResponse>
) {
  return withUsageControls({
    trackUsage: {
      action: 'chat_message',
      resourceType: 'chat',
      quantity: 1
    },
    enforceRateLimit: {
      action: 'chat_message',
      window: 'minute'
    },
    enforceTierLimits: {
      action: 'chat',
      quantity: 1
    },
    requireFeature: 'ai_chat',
    logMetadata: true
  }, handler)
}

/**
 * Middleware for upload operations
 */
export function withUploadControls(
  handler: (request: NextRequest, context: AuthContext) => Promise<NextResponse>
) {
  return withUsageControls({
    trackUsage: {
      action: 'document_upload',
      resourceType: 'file',
      quantity: 1
    },
    enforceRateLimit: {
      action: 'document_upload',
      window: 'minute'
    },
    enforceTierLimits: {
      action: 'upload',
      quantity: 1
    },
    requireFeature: 'document_upload',
    logMetadata: true
  }, handler)
}

/**
 * Middleware for API operations
 */
export function withApiControls(
  handler: (request: NextRequest, context: AuthContext) => Promise<NextResponse>
) {
  return withUsageControls({
    trackUsage: {
      action: 'api_call',
      resourceType: 'api',
      quantity: 1
    },
    enforceRateLimit: {
      action: 'api_request',
      window: 'minute'
    },
    enforceTierLimits: {
      action: 'api_call',
      quantity: 1
    },
    logMetadata: true
  }, handler)
}

/**
 * Middleware for vector search operations
 */
export function withSearchControls(
  handler: (request: NextRequest, context: AuthContext) => Promise<NextResponse>
) {
  return withUsageControls({
    trackUsage: {
      action: 'vector_search',
      resourceType: 'search',
      quantity: 1
    },
    enforceRateLimit: {
      action: 'vector_search',
      window: 'minute'
    },
    logMetadata: true
  }, handler)
}

/**
 * Simple rate limiting wrapper for backward compatibility
 */
export function withRateLimit(
  request: NextRequest,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  // For now, just pass through - implement proper rate limiting later
  return handler();
}

/**
 * Get usage summary for a user
 */
export async function getUserUsageSummary(userId: string): Promise<{
  subscription: any
  currentUsage: any
  rateLimits: any
  recommendations?: any
}> {
  try {
    const tierManager = getTierManager()
    const rateLimiter = getRateLimiter()
    const usageTracker = getUsageTracker()

    const [subscription, rateLimits, usageStats] = await Promise.all([
      tierManager.getUserSubscription(userId),
      rateLimiter.getRateLimitStatus(userId),
      usageTracker.getUserUsageStats(userId)
    ])

    const recommendations = await tierManager.getUpgradeRecommendations(userId)

    return {
      subscription,
      currentUsage: usageStats,
      rateLimits,
      recommendations
    }

  } catch (error) {
    logger.error('Failed to get user usage summary', { userId }, error as Error)
    throw createError.databaseError('Failed to get usage summary', error as Error)
  }
}
