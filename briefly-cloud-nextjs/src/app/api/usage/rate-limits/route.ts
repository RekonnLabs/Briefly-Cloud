/**
 * Rate Limits API Route
 * 
 * This endpoint provides current rate limit status for the authenticated user
 * across all actions and time windows.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/app/lib/auth/auth-middleware'
import { withUsageControls } from '@/app/lib/usage/usage-middleware'
import { getRateLimiter } from '@/app/lib/usage/rate-limiter'
import { logger } from '@/app/lib/logger'

/**
 * GET /api/usage/rate-limits
 * 
 * Get current rate limit status for all actions and windows
 */
export const GET = withAuth(
  withUsageControls({
    trackUsage: {
      action: 'api_call',
      resourceType: 'rate_limit_status',
      quantity: 1
    },
    enforceRateLimit: {
      action: 'api_request',
      window: 'minute'
    },
    logMetadata: true
  }, async (request: NextRequest, context) => {
    try {
      const { user } = context
      const rateLimiter = getRateLimiter()
      
      // Get comprehensive rate limit status
      const rateLimitStatus = await rateLimiter.getRateLimitStatus(user.id)
      
      return NextResponse.json({
        success: true,
        data: {
          userId: user.id,
          rateLimits: rateLimitStatus,
          timestamp: new Date().toISOString()
        }
      })
      
    } catch (error) {
      logger.error('Failed to get rate limit status', {
        userId: context.user.id,
        error: (error as Error).message
      })
      
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to get rate limit status',
          message: 'Please try again later'
        },
        { status: 500 }
      )
    }
  })
)

/**
 * POST /api/usage/rate-limits/reset
 * 
 * Reset rate limits for the authenticated user (admin only)
 */
export const POST = withAuth(
  withUsageControls({
    trackUsage: {
      action: 'api_call',
      resourceType: 'rate_limit_reset',
      quantity: 1
    },
    enforceRateLimit: {
      action: 'api_request',
      window: 'minute'
    },
    requireFeature: 'admin_access',
    logMetadata: true
  }, async (request: NextRequest, context) => {
    try {
      const { user } = context
      const rateLimiter = getRateLimiter()
      
      // Parse request body for specific action/window to reset
      const body = await request.json().catch(() => ({}))
      const { action, window } = body
      
      // Reset rate limits
      await rateLimiter.resetRateLimits(user.id, action, window)
      
      // Get updated status
      const updatedStatus = await rateLimiter.getRateLimitStatus(user.id)
      
      return NextResponse.json({
        success: true,
        message: 'Rate limits reset successfully',
        data: {
          userId: user.id,
          resetAction: action || 'all',
          resetWindow: window || 'all',
          updatedRateLimits: updatedStatus,
          timestamp: new Date().toISOString()
        }
      })
      
    } catch (error) {
      logger.error('Failed to reset rate limits', {
        userId: context.user.id,
        error: (error as Error).message
      })
      
      if (error instanceof Error && error.message.includes('not authorized')) {
        return NextResponse.json(
          { success: false, error: 'Not authorized' },
          { status: 403 }
        )
      }
      
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to reset rate limits',
          message: 'Please try again later'
        },
        { status: 500 }
      )
    }
  })
)