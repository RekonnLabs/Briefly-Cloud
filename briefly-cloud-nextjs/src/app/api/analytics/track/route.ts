import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/lib/auth'
import { logger } from '@/app/lib/logger'
import { formatErrorResponse } from '@/app/lib/api-errors'
import { withRateLimit } from '@/app/lib/rate-limit'
import { createClient } from '@supabase/supabase-js'

// Analytics event schema
const AnalyticsEventSchema = z.object({
  event: z.string(),
  properties: z.record(z.any()).optional(),
  userId: z.string().optional(),
  sessionId: z.string(),
  timestamp: z.string().datetime(),
})

export async function POST(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      const body = await request.json()
      const { event, properties, userId, sessionId, timestamp } = AnalyticsEventSchema.parse(body)

      // Get user session if available
      const session = await getServerSession(authOptions)
      const currentUserId = userId || session?.user?.id

      // Store analytics event in database
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

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
  })
}

export async function GET(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      // Check authentication
      const session = await getServerSession(authOptions)
      if (!session?.user) {
        return formatErrorResponse('Unauthorized', 401)
      }

      // Get analytics events for the user
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      const { data: events, error } = await supabase
        .from('analytics_events')
        .select('*')
        .eq('user_id', session.user.id)
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
  })
}
