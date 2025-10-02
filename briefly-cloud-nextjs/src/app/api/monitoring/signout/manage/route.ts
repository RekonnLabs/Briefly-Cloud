/**
 * Signout Monitoring Management API
 * 
 * Provides endpoints for managing signout monitoring configuration and alerts
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/app/lib/auth/supabase-auth'
import { 
  getMonitoringHealth,
  configureAlertThresholds,
  getAlertThresholds,
  getActiveAlerts,
  resolveAlert,
  testSignoutMonitoring
} from '@/app/lib/auth/signout-monitoring-setup'
import { logger } from '@/app/lib/logger'

/**
 * GET /api/monitoring/signout/manage
 * 
 * Get monitoring system status and configuration
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

    // Check if user has admin privileges
    const isAdmin = user.email?.endsWith('@briefly.cloud') || 
                   process.env.NODE_ENV === 'development'

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      )
    }

    // Get system health
    const health = getMonitoringHealth()
    
    // Get current thresholds
    const thresholds = getAlertThresholds()
    
    // Get active alerts
    const activeAlerts = getActiveAlerts()

    const response = {
      health,
      thresholds,
      activeAlerts,
      timestamp: new Date().toISOString()
    }

    logger.info('Monitoring management data retrieved', {
      userId: user.id,
      healthStatus: health.status,
      activeAlertsCount: activeAlerts.length
    })

    return NextResponse.json(response)

  } catch (error) {
    logger.error('Failed to retrieve monitoring management data', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/monitoring/signout/manage
 * 
 * Manage monitoring system (update thresholds, resolve alerts, etc.)
 */
export async function POST(request: NextRequest) {
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

    // Check if user has admin privileges
    const isAdmin = user.email?.endsWith('@briefly.cloud') || 
                   process.env.NODE_ENV === 'development'

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { action, ...params } = body

    let result: any = {}

    switch (action) {
      case 'updateThresholds':
        if (!params.thresholds) {
          return NextResponse.json(
            { error: 'Missing thresholds parameter' },
            { status: 400 }
          )
        }
        
        configureAlertThresholds(params.thresholds)
        result = { 
          message: 'Thresholds updated successfully',
          newThresholds: getAlertThresholds()
        }
        break

      case 'resolveAlert':
        if (!params.alertId) {
          return NextResponse.json(
            { error: 'Missing alertId parameter' },
            { status: 400 }
          )
        }
        
        const resolved = resolveAlert(params.alertId)
        result = { 
          message: resolved ? 'Alert resolved successfully' : 'Alert not found or already resolved',
          resolved
        }
        break

      case 'test':
        if (process.env.NODE_ENV !== 'development') {
          return NextResponse.json(
            { error: 'Test action only available in development' },
            { status: 403 }
          )
        }
        
        await testSignoutMonitoring()
        result = { 
          message: 'Test completed successfully',
          timestamp: new Date().toISOString()
        }
        break

      case 'getHealth':
        result = {
          health: getMonitoringHealth(),
          timestamp: new Date().toISOString()
        }
        break

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }

    logger.info('Monitoring management action executed', {
      userId: user.id,
      action,
      params: Object.keys(params)
    })

    return NextResponse.json(result)

  } catch (error) {
    logger.error('Failed to execute monitoring management action', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}