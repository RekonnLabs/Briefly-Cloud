import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/app/lib/auth/supabase-auth'
import { logger } from '@/app/lib/logger'
import { formatErrorResponse } from '@/app/lib/api-errors'
import { rateLimitConfigs } from '@/app/lib/usage/rate-limiter'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/app/lib/supabase-admin'

// Analytics event schema
const AnalyticsEventSchema = z.object({
  event: z.string(),
  properties: z.record(z.any()).optional(),
  userId: z.string().optional(),
  sessionId: z.string(),
  timestamp: z.string().datetime(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { event, properties, userId, sessionId, timestamp } = AnalyticsEventSchema.parse(body)

    // Get user session if available
    let currentUserId = userId
    try {
      const user = await getAuthenticatedUser()
      currentUserId = userId || user?.id
    } catch {
      // User not authenticated, use provided userId or null
    }

      // Store analytics event in database
      const supabase = supabaseAdmin

      const { error } = await supabase
        .from('analytics_events')
        .insert({
          id: crypto.randomUUID(),
          event,
          properties: properties || {},
          user_id: currentUserId,
          session_id: sessionId,
          timestamp,
          created_at: new Date().toISOString(),
        })

      if (error) {
        logger.error('Failed to store analytics event', { error, event })
        return formatErrorResponse('Failed to track event', 500)
      }

      logger.info('Analytics event tracked', { event, userId: currentUserId, sessionId })

      return NextResponse.json({
        success: true,
        message: 'Event tracked successfully'
      })

    } catch (error) {
      logger.error('Analytics tracking error', { error })
      return formatErrorResponse('Invalid request', 400)
    }
}

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const user = await getAuthenticatedUser()
    if (!user) {
      return formatErrorResponse('Unauthorized', 401)
    }

    // Get analytics events for the user
    const supabase = supabaseAdmin

    const { data: events, error } = await supabase
      .from('analytics_events')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)

      if (error) {
        logger.error('Failed to get analytics events', { error })
        return formatErrorResponse('Failed to retrieve events', 500)
      }

      return NextResponse.json({
        success: true,
        data: {
          events: events || [],
          count: events?.length || 0
        }
      })

    } catch (error) {
      logger.error('Analytics retrieval error', { error })
      return formatErrorResponse('Internal server error', 500)
    }
}
