import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { logger } from '@/app/lib/logger'
import { formatErrorResponse } from '@/app/lib/api-errors'
import { withRateLimit } from '@/app/lib/rate-limit'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/app/lib/supabase'

// Performance metrics schema
const PerformanceMetricsSchema = z.object({
  pageLoadTime: z.number().optional(),
  apiResponseTime: z.number().optional(),
  databaseQueryTime: z.number().optional(),
  cacheHitRate: z.number().optional(),
  memoryUsage: z.number().optional(),
  cpuUsage: z.number().optional(),
  errorRate: z.number().optional(),
  activeUsers: z.number().optional(),
  requestsPerMinute: z.number().optional(),
  coreWebVitals: z.object({
    lcp: z.number().optional(),
    fid: z.number().optional(),
    cls: z.number().optional(),
    ttfb: z.number().optional(),
    fcp: z.number().optional(),
  }).optional(),
  timestamp: z.string().datetime(),
})

export async function POST(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      const body = await request.json()
      const metrics = PerformanceMetricsSchema.parse(body)

      // Store performance metrics in database
      const supabase = supabaseAdmin

      const { error } = await supabase
        .from('performance_metrics')
        .insert({
          id: crypto.randomUUID(),
          page_load_time: metrics.pageLoadTime || 0,
          api_response_time: metrics.apiResponseTime || 0,
          database_query_time: metrics.databaseQueryTime || 0,
          cache_hit_rate: metrics.cacheHitRate || 0,
          memory_usage: metrics.memoryUsage || 0,
          cpu_usage: metrics.cpuUsage || 0,
          error_rate: metrics.errorRate || 0,
          active_users: metrics.activeUsers || 0,
          requests_per_minute: metrics.requestsPerMinute || 0,
          core_web_vitals: metrics.coreWebVitals || {},
          timestamp: metrics.timestamp,
          created_at: new Date().toISOString(),
        })

      if (error) {
        logger.error('Failed to store performance metrics', { error })
        return formatErrorResponse('Failed to store metrics', 500)
      }

      logger.info('Performance metrics stored', { 
        pageLoadTime: metrics.pageLoadTime,
        apiResponseTime: metrics.apiResponseTime,
        errorRate: metrics.errorRate 
      })

      return NextResponse.json({
        success: true,
        message: 'Performance metrics stored successfully'
      })

    } catch (error) {
      logger.error('Performance metrics error', { error })
      return formatErrorResponse('Invalid request', 400)
    }
  })
}

export async function GET(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      const { searchParams } = new URL(request.url)
      const hours = parseInt(searchParams.get('hours') || '24')

      // Get performance metrics
      const supabase = supabaseAdmin

      const cutoffDate = new Date()
      cutoffDate.setHours(cutoffDate.getHours() - hours)

      const { data: metrics, error } = await supabase
        .from('performance_metrics')
        .select('*')
        .gte('created_at', cutoffDate.toISOString())
        .order('created_at', { ascending: false })

      if (error) {
        logger.error('Failed to get performance metrics', { error })
        return formatErrorResponse('Failed to retrieve metrics', 500)
      }

      // Calculate aggregated metrics
      const aggregated = metrics?.reduce((acc, metric) => {
        acc.pageLoadTime += metric.page_load_time || 0
        acc.apiResponseTime += metric.api_response_time || 0
        acc.databaseQueryTime += metric.database_query_time || 0
        acc.cacheHitRate += metric.cache_hit_rate || 0
        acc.memoryUsage += metric.memory_usage || 0
        acc.cpuUsage += metric.cpu_usage || 0
        acc.errorRate += metric.error_rate || 0
        acc.activeUsers += metric.active_users || 0
        acc.requestsPerMinute += metric.requests_per_minute || 0
        acc.count++
        return acc
      }, {
        pageLoadTime: 0,
        apiResponseTime: 0,
        databaseQueryTime: 0,
        cacheHitRate: 0,
        memoryUsage: 0,
        cpuUsage: 0,
        errorRate: 0,
        activeUsers: 0,
        requestsPerMinute: 0,
        count: 0,
      }) || { count: 0 }

      // Calculate averages
      const averages = aggregated.count > 0 ? {
        pageLoadTime: aggregated.pageLoadTime / aggregated.count,
        apiResponseTime: aggregated.apiResponseTime / aggregated.count,
        databaseQueryTime: aggregated.databaseQueryTime / aggregated.count,
        cacheHitRate: aggregated.cacheHitRate / aggregated.count,
        memoryUsage: aggregated.memoryUsage / aggregated.count,
        cpuUsage: aggregated.cpuUsage / aggregated.count,
        errorRate: aggregated.errorRate / aggregated.count,
        activeUsers: aggregated.activeUsers / aggregated.count,
        requestsPerMinute: aggregated.requestsPerMinute / aggregated.count,
      } : {
        pageLoadTime: 0,
        apiResponseTime: 0,
        databaseQueryTime: 0,
        cacheHitRate: 0,
        memoryUsage: 0,
        cpuUsage: 0,
        errorRate: 0,
        activeUsers: 0,
        requestsPerMinute: 0,
      }

      return NextResponse.json({
        success: true,
        data: {
          metrics: metrics || [],
          averages,
          summary: {
            totalRecords: aggregated.count,
            timeRange: `${hours} hours`,
            latestMetrics: metrics?.[0] || null,
          }
        }
      })

    } catch (error) {
      logger.error('Performance metrics retrieval error', { error })
      return formatErrorResponse('Internal server error', 500)
    }
  })
}
