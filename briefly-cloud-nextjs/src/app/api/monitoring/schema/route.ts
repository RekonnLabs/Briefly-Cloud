/**
 * Schema Monitoring API Endpoint
 * 
 * Provides access to schema health metrics, performance data, and alerts
 * for monitoring dashboards and alerting systems
 */

import { NextRequest, NextResponse } from 'next/server'
import { schemaMonitor } from '@/app/lib/monitoring/schema-monitor'
import { createServerAdminClient } from '@/app/lib/auth/supabase-server-admin'

export const runtime = 'nodejs'

// Only monitor app schema (no private schema monitoring)
const SCHEMAS = ['app']

/**
 * Quick health check using admin client
 */
async function quickHealthCheck() {
  const admin = createServerAdminClient()
  const results: Record<string, 'ok' | string> = {}
  
  for (const schema of SCHEMAS) {
    try {
      // Use RPC health check function for app schema
      const { data, error } = await admin.rpc('monitoring_health_check')
      results[schema] = error ? String(error.message) : (data ?? 'ok')
    } catch (e: any) {
      results[schema] = String(e?.message ?? e)
    }
  }
  
  return results
}

/**
 * GET /api/monitoring/schema
 * Get current schema monitoring metrics and alerts
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const includeResolved = searchParams.get('includeResolved') === 'true'
    const format = searchParams.get('format') || 'json'
    const quick = searchParams.get('quick') === 'true'

    // Quick health check using admin client
    if (quick) {
      const healthStatus = await quickHealthCheck()
      return NextResponse.json({
        health: healthStatus,
        timestamp: new Date().toISOString()
      }, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      })
    }

    // Get performance metrics
    const performanceMetrics = schemaMonitor.getPerformanceMetrics()
    const monitoringStatus = schemaMonitor.getMonitoringStatus()
    const alerts = schemaMonitor.getAlerts(includeResolved)

    const response = {
      monitoring: monitoringStatus,
      performance: performanceMetrics,
      alerts: alerts,
      timestamp: new Date().toISOString()
    }

    // Support different response formats
    if (format === 'prometheus') {
      return new NextResponse(formatPrometheusMetrics(performanceMetrics), {
        headers: {
          'Content-Type': 'text/plain; version=0.0.4',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      })
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Monitoring-Status': monitoringStatus.isMonitoring ? 'active' : 'inactive',
        'X-Alerts-Count': alerts.length.toString()
      }
    })

  } catch (error) {
    console.error('Schema monitoring API error:', error)
    
    return NextResponse.json({
      error: 'Failed to retrieve monitoring data',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { 
      status: 500,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    })
  }
}

/**
 * POST /api/monitoring/schema/alerts/{alertId}/resolve
 * Resolve a specific alert
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    
    if (action === 'resolve') {
      const { alertId } = await request.json()
      
      if (!alertId) {
        return NextResponse.json({
          error: 'Alert ID is required',
          timestamp: new Date().toISOString()
        }, { status: 400 })
      }

      const resolved = schemaMonitor.resolveAlert(alertId)
      
      if (!resolved) {
        return NextResponse.json({
          error: 'Alert not found',
          alertId,
          timestamp: new Date().toISOString()
        }, { status: 404 })
      }

      return NextResponse.json({
        success: true,
        alertId,
        message: 'Alert resolved successfully',
        timestamp: new Date().toISOString()
      })
    }

    if (action === 'start-monitoring') {
      const { interval = 30000 } = await request.json()
      schemaMonitor.startMonitoring(interval)
      
      return NextResponse.json({
        success: true,
        message: 'Schema monitoring started',
        interval,
        timestamp: new Date().toISOString()
      })
    }

    if (action === 'stop-monitoring') {
      schemaMonitor.stopMonitoring()
      
      return NextResponse.json({
        success: true,
        message: 'Schema monitoring stopped',
        timestamp: new Date().toISOString()
      })
    }

    return NextResponse.json({
      error: 'Invalid action',
      validActions: ['resolve', 'start-monitoring', 'stop-monitoring'],
      timestamp: new Date().toISOString()
    }, { status: 400 })

  } catch (error) {
    console.error('Schema monitoring action error:', error)
    
    return NextResponse.json({
      error: 'Failed to perform monitoring action',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

/**
 * Format metrics for Prometheus scraping
 */
function formatPrometheusMetrics(metrics: any): string {
  const lines: string[] = []
  
  // Schema response times
  for (const [schema, schemaMetrics] of Object.entries(metrics.schemaMetrics)) {
    lines.push(`# HELP schema_response_time_ms Response time for ${schema} schema in milliseconds`)
    lines.push(`# TYPE schema_response_time_ms gauge`)
    lines.push(`schema_response_time_ms{schema="${schema}"} ${(schemaMetrics as any).responseTime}`)
  }

  // Schema status (1 = healthy, 0.5 = degraded, 0 = unhealthy)
  for (const [schema, schemaMetrics] of Object.entries(metrics.schemaMetrics)) {
    const statusValue = (schemaMetrics as any).status === 'healthy' ? 1 : 
                       (schemaMetrics as any).status === 'degraded' ? 0.5 : 0
    lines.push(`# HELP schema_status Schema health status (1=healthy, 0.5=degraded, 0=unhealthy)`)
    lines.push(`# TYPE schema_status gauge`)
    lines.push(`schema_status{schema="${schema}"} ${statusValue}`)
  }

  // Overall metrics
  lines.push(`# HELP schema_total_requests Total number of schema requests`)
  lines.push(`# TYPE schema_total_requests counter`)
  lines.push(`schema_total_requests ${metrics.totalRequests}`)

  lines.push(`# HELP schema_average_response_time_ms Average response time across all schemas`)
  lines.push(`# TYPE schema_average_response_time_ms gauge`)
  lines.push(`schema_average_response_time_ms ${metrics.averageResponseTime}`)

  lines.push(`# HELP schema_error_rate Error rate across all schemas (0-1)`)
  lines.push(`# TYPE schema_error_rate gauge`)
  lines.push(`schema_error_rate ${metrics.errorRate}`)

  // Active alerts
  lines.push(`# HELP schema_active_alerts Number of active alerts`)
  lines.push(`# TYPE schema_active_alerts gauge`)
  lines.push(`schema_active_alerts ${metrics.alerts.length}`)

  return lines.join('\n') + '\n'
}