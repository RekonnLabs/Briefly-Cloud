/**
 * Signout Monitoring API
 * 
 * Provides endpoints for retrieving signout metrics and monitoring data
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/app/lib/auth/supabase-auth'
import { getSignoutMetrics, getSignoutMonitoring } from '@/app/lib/auth/signout-monitoring'
import { logger } from '@/app/lib/logger'

/**
 * GET /api/monitoring/signout
 * 
 * Retrieve signout metrics and monitoring data
 * Query parameters:
 * - timeWindow: '5m', '15m', '1h', '24h' (default: '1h')
 * - includeEvents: 'true' to include recent events (default: 'false')
 * - limit: number of recent events to include (default: 50)
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate the request
    const supabase = createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if user has admin privileges (you may want to implement proper role checking)
    const isAdmin = user.email?.endsWith('@briefly.cloud') || 
                   process.env.NODE_ENV === 'development'

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      )
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const timeWindow = searchParams.get('timeWindow') || '1h'
    const includeEvents = searchParams.get('includeEvents') === 'true'
    const limit = parseInt(searchParams.get('limit') || '50')

    // Validate timeWindow
    const validTimeWindows = ['5m', '15m', '1h', '24h']
    if (!validTimeWindows.includes(timeWindow)) {
      return NextResponse.json(
        { error: 'Invalid timeWindow. Must be one of: 5m, 15m, 1h, 24h' },
        { status: 400 }
      )
    }

    // Get metrics
    const metrics = getSignoutMetrics(timeWindow)
    
    // Prepare response
    const response: any = {
      metrics,
      timestamp: new Date().toISOString(),
      timeWindow
    }

    // Include recent events if requested
    if (includeEvents) {
      const monitoring = getSignoutMonitoring()
      const events = monitoring.getRecentSignoutEvents(limit)
      
      // Sanitize events (remove sensitive data)
      response.recentEvents = events.map(event => ({
        id: event.id,
        timestamp: event.timestamp,
        success: event.result.success,
        duration: event.duration,
        component: event.component,
        options: {
          skipCleanup: event.options.skipCleanup,
          forceRedirect: event.options.forceRedirect
        },
        cleanup: event.result.cleanup,
        error: event.error ? {
          message: event.error.message,
          category: event.error.category
        } : undefined,
        // Exclude sensitive data like userId, sessionId, userAgent
      }))
    }

    logger.info('Signout monitoring data retrieved', {
      userId: user.id,
      timeWindow,
      includeEvents,
      metricsCount: metrics.totalAttempts
    })

    return NextResponse.json(response)

  } catch (error) {
    logger.error('Failed to retrieve signout monitoring data', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/monitoring/signout/test
 * 
 * Test the signout monitoring system (development only)
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'Test endpoint only available in development' },
      { status: 403 }
    )
  }

  try {
    const supabase = createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Import test function dynamically to avoid bundling in production
    const { testSignoutMonitoring } = await import('@/app/lib/auth/signout-monitoring')
    
    // Run the test
    testSignoutMonitoring()

    // Get updated metrics
    const metrics = getSignoutMetrics('1h')

    logger.info('Signout monitoring test executed', {
      userId: user.id,
      testMetrics: metrics
    })

    return NextResponse.json({
      message: 'Test completed successfully',
      metrics,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    logger.error('Failed to execute signout monitoring test', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return NextResponse.json(
      { error: 'Test execution failed' },
      { status: 500 }
    )
  }
}