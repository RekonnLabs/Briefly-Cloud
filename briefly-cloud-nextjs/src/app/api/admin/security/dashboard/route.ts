/**
 * Security Dashboard API Route
 * 
 * This endpoint provides comprehensive security metrics and monitoring
 * data for administrators.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/app/lib/auth/auth-middleware'
import { withApiControls } from '@/app/lib/usage/usage-middleware'
import { getSecurityMonitor } from '@/app/lib/security/security-monitor'
import { getAuditLogger } from '@/app/lib/audit/audit-logger'
import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'

/**
 * GET /api/admin/security/dashboard
 * 
 * Get comprehensive security dashboard data (admin only)
 */
export const GET = withAuth(
  withApiControls(async (request: NextRequest, context) => {
    try {
      const { user } = context
      
      // Check if user is admin
      if (!user.email?.endsWith('@rekonnlabs.com')) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 403 }
        )
      }

      const { searchParams } = new URL(request.url)
      const startDate = searchParams.get('startDate')
      const endDate = searchParams.get('endDate')
      const includeDetails = searchParams.get('includeDetails') === 'true'

      const securityMonitor = getSecurityMonitor()
      const auditLogger = getAuditLogger()

      // Get comprehensive security data
      const [
        securityMetrics,
        securityAlerts,
        suspiciousIPs,
        auditStatistics
      ] = await Promise.all([
        securityMonitor.getSecurityMetrics(startDate || undefined, endDate || undefined),
        auditLogger.getSecurityAlerts(false, 50), // Get unresolved alerts
        securityMonitor.monitorSuspiciousIPs(),
        auditLogger.getAuditStatistics(startDate || undefined, endDate || undefined)
      ])

      // Get recent critical events
      const { logs: criticalEvents } = await auditLogger.getAuditLogs({
        severity: ['error', 'critical'],
        startDate: startDate || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        endDate: endDate || new Date().toISOString(),
        limit: 20
      })

      const response = {
        success: true,
        data: {
          overview: {
            totalThreats: securityMetrics.totalThreats,
            activeThreats: securityMetrics.activeThreats,
            criticalThreats: securityMetrics.criticalThreats,
            suspiciousIPCount: suspiciousIPs.length,
            totalAuditEvents: auditStatistics.totalEvents
          },
          metrics: securityMetrics,
          alerts: securityAlerts.map(alert => ({
            id: alert.id,
            type: alert.type,
            severity: alert.severity,
            description: alert.description,
            userId: alert.userId,
            ipAddress: alert.ipAddress,
            createdAt: alert.createdAt,
            metadata: includeDetails ? alert.metadata : undefined
          })),
          suspiciousIPs: suspiciousIPs.map(ip => ({
            ipAddress: ip,
            // Could add geolocation, threat intelligence, etc.
          })),
          criticalEvents: criticalEvents.map(event => ({
            id: event.id,
            action: event.action,
            severity: event.severity,
            userId: event.userId,
            ipAddress: event.ipAddress,
            createdAt: event.createdAt,
            resourceType: event.resourceType,
            metadata: includeDetails ? event.metadata : undefined
          })),
          auditStatistics,
          period: {
            start: startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            end: endDate || new Date().toISOString()
          },
          generatedAt: new Date().toISOString()
        }
      }

      // Log admin access
      await auditLogger.logAdminAction(
        'ADMIN_ACCESS',
        user.id,
        undefined,
        undefined,
        undefined,
        {
          endpoint: '/api/admin/security/dashboard',
          includeDetails,
          period: { startDate, endDate }
        },
        request.headers.get('x-forwarded-for') || 'unknown',
        request.headers.get('user-agent') || 'unknown'
      )

      return NextResponse.json(response)

    } catch (error) {
      logger.error('Failed to get security dashboard data', {
        userId: context.user.id,
        error: (error as Error).message
      })

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to get security dashboard data',
          message: 'Please try again later'
        },
        { status: 500 }
      )
    }
  })
)

/**
 * POST /api/admin/security/dashboard/resolve-alert
 * 
 * Resolve a security alert (admin only)
 */
export const POST = withAuth(
  withApiControls(async (request: NextRequest, context) => {
    try {
      const { user } = context
      
      // Check if user is admin
      if (!user.email?.endsWith('@rekonnlabs.com')) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 403 }
        )
      }

      const body = await request.json()
      const { alertId, resolution } = body

      if (!alertId) {
        return NextResponse.json(
          { success: false, error: 'Alert ID is required' },
          { status: 400 }
        )
      }

      const auditLogger = getAuditLogger()
      
      // Resolve the alert
      await auditLogger.resolveSecurityAlert(alertId, user.id, resolution)

      // Log the resolution
      await auditLogger.logAdminAction(
        'SECURITY_VIOLATION',
        user.id,
        undefined,
        undefined,
        { alertResolved: true, alertId, resolution },
        {
          endpoint: '/api/admin/security/dashboard/resolve-alert',
          alertId,
          resolution
        },
        request.headers.get('x-forwarded-for') || 'unknown',
        request.headers.get('user-agent') || 'unknown'
      )

      return NextResponse.json({
        success: true,
        message: 'Security alert resolved successfully',
        data: {
          alertId,
          resolvedBy: user.id,
          resolvedAt: new Date().toISOString(),
          resolution
        }
      })

    } catch (error) {
      logger.error('Failed to resolve security alert', {
        userId: context.user.id,
        error: (error as Error).message
      })

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to resolve security alert',
          message: 'Please try again later'
        },
        { status: 500 }
      )
    }
  })
)