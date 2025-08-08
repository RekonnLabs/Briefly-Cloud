import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { logger } from '@/app/lib/logger'
import { formatErrorResponse } from '@/app/lib/api-errors'
import { withRateLimit } from '@/app/lib/rate-limit'
import { createClient } from '@supabase/supabase-js'

// Error tracking schema
const ErrorTrackingSchema = z.object({
  message: z.string(),
  stack: z.string().optional(),
  context: z.record(z.any()).optional(),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  timestamp: z.string().datetime(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  errorType: z.string().optional(),
  url: z.string().optional(),
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
})

export async function POST(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      const body = await request.json()
      const errorData = ErrorTrackingSchema.parse(body)

      // Store error in database
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      const { error } = await supabase
        .from('error_logs')
        .insert({
          id: crypto.randomUUID(),
          message: errorData.message,
          stack: errorData.stack || '',
          context: errorData.context || {},
          user_id: errorData.userId,
          session_id: errorData.sessionId,
          severity: errorData.severity || 'medium',
          error_type: errorData.errorType || 'unknown',
          url: errorData.url,
          user_agent: errorData.userAgent,
          ip_address: errorData.ipAddress,
          timestamp: errorData.timestamp,
          created_at: new Date().toISOString(),
        })

      if (error) {
        logger.error('Failed to store error log', { error })
        return formatErrorResponse('Failed to store error', 500)
      }

      logger.error('Error tracked', { 
        message: errorData.message,
        severity: errorData.severity,
        userId: errorData.userId 
      })

      return NextResponse.json({
        success: true,
        message: 'Error tracked successfully'
      })

    } catch (error) {
      logger.error('Error tracking error', { error })
      return formatErrorResponse('Invalid request', 400)
    }
  })
}

export async function GET(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      const { searchParams } = new URL(request.url)
      const hours = parseInt(searchParams.get('hours') || '24')
      const severity = searchParams.get('severity')
      const errorType = searchParams.get('errorType')

      // Get error logs
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      const cutoffDate = new Date()
      cutoffDate.setHours(cutoffDate.getHours() - hours)

      let query = supabase
        .from('error_logs')
        .select('*')
        .gte('created_at', cutoffDate.toISOString())
        .order('created_at', { ascending: false })

      if (severity) {
        query = query.eq('severity', severity)
      }

      if (errorType) {
        query = query.eq('error_type', errorType)
      }

      const { data: errors, error } = await query

      if (error) {
        logger.error('Failed to get error logs', { error })
        return formatErrorResponse('Failed to retrieve errors', 500)
      }

      // Calculate error statistics
      const errorStats = errors?.reduce((stats, error) => {
        stats.totalErrors++
        stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1
        stats.byType[error.error_type] = (stats.byType[error.error_type] || 0) + 1
        
        if (error.severity === 'critical' || error.severity === 'high') {
          stats.criticalErrors++
        }
        
        return stats
      }, {
        totalErrors: 0,
        criticalErrors: 0,
        bySeverity: {} as Record<string, number>,
        byType: {} as Record<string, number>,
      }) || {
        totalErrors: 0,
        criticalErrors: 0,
        bySeverity: {},
        byType: {},
      }

      return NextResponse.json({
        success: true,
        data: {
          errors: errors || [],
          statistics: errorStats,
          summary: {
            totalErrors: errorStats.totalErrors,
            criticalErrors: errorStats.criticalErrors,
            errorRate: errorStats.totalErrors / hours, // errors per hour
            timeRange: `${hours} hours`,
          }
        }
      })

    } catch (error) {
      logger.error('Error logs retrieval error', { error })
      return formatErrorResponse('Internal server error', 500)
    }
  })
}
