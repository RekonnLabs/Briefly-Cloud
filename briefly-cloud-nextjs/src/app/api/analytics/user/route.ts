import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/app/lib/auth/supabase-auth'
import { logger } from '@/app/lib/logger'
import { formatErrorResponse } from '@/app/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/app/lib/supabase'

// User analytics schema
const UserAnalyticsSchema = z.object({
  userId: z.string(),
  sessionId: z.string(),
  pageViews: z.number().optional(),
  timeOnSite: z.number().optional(),
  featuresUsed: z.array(z.string()).optional(),
  conversionFunnel: z.array(z.string()).optional(),
  deviceInfo: z.object({
    userAgent: z.string(),
    screenResolution: z.string(),
    language: z.string(),
    timezone: z.string(),
  }).optional(),
  location: z.object({
    country: z.string(),
    region: z.string(),
    city: z.string(),
  }).optional(),
  timestamp: z.string().datetime(),
})

export async function POST(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      const body = await request.json()
      const analytics = UserAnalyticsSchema.parse(body)

      // Store user analytics in database
      const supabase = supabaseAdmin

      const { error } = await supabase
        .from('user_analytics')
        .insert({
          id: crypto.randomUUID(),
          user_id: analytics.userId,
          session_id: analytics.sessionId,
          page_views: analytics.pageViews || 0,
          time_on_site: analytics.timeOnSite || 0,
          features_used: analytics.featuresUsed || [],
          conversion_funnel: analytics.conversionFunnel || [],
          device_info: analytics.deviceInfo || {},
          location: analytics.location || {},
          timestamp: analytics.timestamp,
          created_at: new Date().toISOString(),
        })

      if (error) {
        logger.error('Failed to store user analytics', { error, userId: analytics.userId })
        return formatErrorResponse('Failed to track user analytics', 500)
      }

      logger.info('User analytics tracked', { userId: analytics.userId, sessionId: analytics.sessionId })

      return NextResponse.json({
        success: true,
        message: 'User analytics tracked successfully'
      })

    } catch (error) {
      logger.error('User analytics tracking error', { error })
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

      const { searchParams } = new URL(request.url)
      const days = parseInt(searchParams.get('days') || '30')

      // Get user analytics
      const supabase = supabaseAdmin

      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - days)

      const { data: analytics, error } = await supabase
        .from('user_analytics')
        .select('*')
        .eq('user_id', session.user.id)
        .gte('created_at', cutoffDate.toISOString())
        .order('created_at', { ascending: false })

      if (error) {
        logger.error('Failed to get user analytics', { error })
        return formatErrorResponse('Failed to retrieve analytics', 500)
      }

      // Calculate aggregated metrics
      const totalPageViews = analytics?.reduce((sum, a) => sum + (a.page_views || 0), 0) || 0
      const totalTimeOnSite = analytics?.reduce((sum, a) => sum + (a.time_on_site || 0), 0) || 0
      const uniqueFeatures = new Set(analytics?.flatMap(a => a.features_used || []) || [])
      const conversionSteps = analytics?.flatMap(a => a.conversion_funnel || []) || []

      return NextResponse.json({
        success: true,
        data: {
          analytics: analytics || [],
          summary: {
            totalPageViews,
            totalTimeOnSite,
            averageTimeOnSite: analytics?.length ? totalTimeOnSite / analytics.length : 0,
            uniqueFeaturesUsed: uniqueFeatures.size,
            featuresList: Array.from(uniqueFeatures),
            conversionSteps,
            sessionsCount: analytics?.length || 0,
          }
        }
      })

    } catch (error) {
      logger.error('User analytics retrieval error', { error })
      return formatErrorResponse('Internal server error', 500)
    }
  })
}
