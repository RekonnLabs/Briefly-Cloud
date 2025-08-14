/**
 * Backup Monitoring API
 * 
 * Provides endpoints for backup monitoring, health checks,
 * and alert management.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/app/lib/auth/auth-middleware'
import { withRateLimit } from '@/app/lib/usage/usage-middleware'
import { createError } from '@/app/lib/api-errors'
import { logger } from '@/app/lib/logger'
import { 
  getBackupMonitor, 
  initializeBackupMonitoring, 
  getBackupHealthReport, 
  performBackupHealthCheck 
} from '@/app/lib/backup/backup-monitor'
import { verifyBackupIntegrity } from '@/app/lib/backup/pitr-manager'
import { z } from 'zod'

// Validation schemas
const MonitoringConfigSchema = z.object({
  enabled: z.boolean(),
  checkInterval: z.number().min(5).max(1440), // 5 minutes to 24 hours
  alertThresholds: z.object({
    failureRate: z.number().min(0).max(100), // percentage
    backupDelay: z.number().min(1).max(168), // hours (1 hour to 1 week)
    storageUsage: z.number().min(50).max(95) // percentage
  }),
  notifications: z.object({
    email: z.boolean(),
    slack: z.boolean(),
    webhook: z.string().url().optional()
  }),
  contacts: z.array(z.string().email())
})

const IntegrityCheckSchema = z.object({
  backupId: z.string().uuid().optional()
})

/**
 * GET /api/admin/backup/monitor
 * Get backup health report and monitoring status
 */
export async function GET(request: NextRequest) {
  return withAuth(async (request: NextRequest, { user }) => {
    return withRateLimit(async () => {
      try {
        // Check admin permissions
        if (!user.email?.endsWith('@rekonnlabs.com')) {
          return NextResponse.json(
            { error: 'Admin access required' },
            { status: 403 }
          )
        }

        // Get health report
        const healthReport = await getBackupHealthReport()

        logger.info('Backup health report retrieved', {
          userId: user.id,
          status: healthReport.status,
          alertCount: healthReport.alerts.length,
          recommendationCount: healthReport.recommendations.length
        })

        return NextResponse.json({
          success: true,
          data: healthReport
        })

      } catch (error) {
        logger.error('Failed to get backup health report', { userId: user.id }, error as Error)
        
        if (error instanceof Error && error.message.includes('database')) {
          return NextResponse.json(
            { error: 'Database error occurred' },
            { status: 500 }
          )
        }

        return NextResponse.json(
          { error: 'Failed to get backup health report' },
          { status: 500 }
        )
      }
    }, user.id, 'admin_backup_monitor')
  })(request)
}

/**
 * POST /api/admin/backup/monitor
 * Initialize or update backup monitoring configuration
 */
export async function POST(request: NextRequest) {
  return withAuth(async (request: NextRequest, { user }) => {
    return withRateLimit(async () => {
      try {
        // Check admin permissions
        if (!user.email?.endsWith('@rekonnlabs.com')) {
          return NextResponse.json(
            { error: 'Admin access required' },
            { status: 403 }
          )
        }

        const body = await request.json()
        
        // Validate request body
        const validationResult = MonitoringConfigSchema.safeParse(body)
        if (!validationResult.success) {
          return NextResponse.json(
            { 
              error: 'Invalid monitoring configuration',
              details: validationResult.error.errors
            },
            { status: 400 }
          )
        }

        const config = validationResult.data

        // Initialize monitoring
        await initializeBackupMonitoring(config)

        logger.info('Backup monitoring configured', {
          userId: user.id,
          enabled: config.enabled,
          checkInterval: config.checkInterval,
          alertThresholds: config.alertThresholds,
          contactCount: config.contacts.length
        })

        return NextResponse.json({
          success: true,
          message: 'Backup monitoring configured successfully',
          data: {
            enabled: config.enabled,
            checkInterval: config.checkInterval,
            alertThresholds: config.alertThresholds,
            contactCount: config.contacts.length
          }
        })

      } catch (error) {
        logger.error('Failed to configure backup monitoring', { userId: user.id }, error as Error)
        
        if (error instanceof Error) {
          if (error.message.includes('Invalid')) {
            return NextResponse.json(
              { error: error.message },
              { status: 400 }
            )
          }
          
          if (error.message.includes('database')) {
            return NextResponse.json(
              { error: 'Database error occurred' },
              { status: 500 }
            )
          }
        }

        return NextResponse.json(
          { error: 'Failed to configure backup monitoring' },
          { status: 500 }
        )
      }
    }, user.id, 'admin_backup_monitor_config')
  })(request)
}

/**
 * PUT /api/admin/backup/monitor
 * Perform manual health check
 */
export async function PUT(request: NextRequest) {
  return withAuth(async (request: NextRequest, { user }) => {
    return withRateLimit(async () => {
      try {
        // Check admin permissions
        if (!user.email?.endsWith('@rekonnlabs.com')) {
          return NextResponse.json(
            { error: 'Admin access required' },
            { status: 403 }
          )
        }

        // Perform health check
        const alerts = await performBackupHealthCheck()

        logger.info('Manual backup health check performed', {
          userId: user.id,
          alertCount: alerts.length,
          alertTypes: alerts.map(a => a.type)
        })

        return NextResponse.json({
          success: true,
          message: 'Health check completed',
          data: {
            alertCount: alerts.length,
            alerts: alerts.map(alert => ({
              type: alert.type,
              severity: alert.severity,
              message: alert.message,
              timestamp: alert.timestamp
            }))
          }
        })

      } catch (error) {
        logger.error('Failed to perform health check', { userId: user.id }, error as Error)
        
        if (error instanceof Error && error.message.includes('database')) {
          return NextResponse.json(
            { error: 'Database error occurred' },
            { status: 500 }
          )
        }

        return NextResponse.json(
          { error: 'Failed to perform health check' },
          { status: 500 }
        )
      }
    }, user.id, 'admin_backup_health_check')
  })(request)
}