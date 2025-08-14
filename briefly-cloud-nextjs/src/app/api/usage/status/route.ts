/**
 * Usage Status API Route
 * 
 * This endpoint provides comprehensive usage information for the authenticated user,
 * including subscription tier, current usage, rate limits, and upgrade recommendations.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/app/lib/auth/auth-middleware'
import { withUsageControls } from '@/app/lib/usage/usage-middleware'
import { getUserUsageSummary } from '@/app/lib/usage/usage-middleware'
import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'

/**
 * GET /api/usage/status
 * 
 * Get comprehensive usage status for the authenticated user
 */
export const GET = withAuth(
  withUsageControls({
    trackUsage: {
      action: 'api_call',
      resourceType: 'usage_status',
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
      
      // Get comprehensive usage summary
      const usageSummary = await getUserUsageSummary(user.id)
      
      return NextResponse.json({
        success: true,
        data: {
          userId: user.id,
          email: user.email,
          ...usageSummary,
          timestamp: new Date().toISOString()
        }
      })
      
    } catch (error) {
      logger.error('Failed to get usage status', {
        userId: context.user.id,
        error: (error as Error).message
      })
      
      if (error instanceof Error && error.message.includes('not found')) {
        return NextResponse.json(
          { success: false, error: 'User not found' },
          { status: 404 }
        )
      }
      
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to get usage status',
          message: 'Please try again later'
        },
        { status: 500 }
      )
    }
  })
)