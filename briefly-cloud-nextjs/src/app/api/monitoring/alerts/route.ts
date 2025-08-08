import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { logger } from '@/app/lib/logger'
import { formatErrorResponse } from '@/app/lib/api-errors'
import { withRateLimit } from '@/app/lib/rate-limit'
import { createClient } from '@supabase/supabase-js'

// Alert schema
const AlertSchema = z.object({
  type: z.string(),
  message: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  timestamp: z.string().datetime(),
  metrics: z.record(z.any()).optional(),
  context: z.record(z.any()).optional(),
})

export async function POST(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      const body = await request.json()
      const { alerts } = z.object({
        alerts: z.array(AlertSchema),
      }).parse(body)

      // Store alerts in database
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      const alertRecords = alerts.map(alert => ({
        id: crypto.randomUUID(),
        type: alert.type,
        message: alert.message,
        severity: alert.severity,
        metrics: alert.metrics || {},
        context: alert.context || {},
        timestamp: alert.timestamp,
        created_at: new Date().toISOString(),
        status: 'active',
      }))

      const { error } = await supabase
        .from('monitoring_alerts')
        .insert(alertRecords)

      if (error) {
        logger.error('Failed to store alerts', { error })
        return formatErrorResponse('Failed to store alerts', 500)
      }

      // Send critical alerts immediately
      const criticalAlerts = alerts.filter(alert => alert.severity === 'critical')
      if (criticalAlerts.length > 0) {
        await sendCriticalAlerts(criticalAlerts)
      }

      logger.warn('Alerts stored', { 
        count: alerts.length,
        criticalCount: criticalAlerts.length 
      })

      return NextResponse.json({
        success: true,
        message: `${alerts.length} alerts stored successfully`
      })

    } catch (error) {
      logger.error('Alert storage error', { error })
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
      const status = searchParams.get('status') || 'active'

      // Get alerts
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      const cutoffDate = new Date()
      cutoffDate.setHours(cutoffDate.getHours() - hours)

      let query = supabase
        .from('monitoring_alerts')
        .select('*')
        .gte('created_at', cutoffDate.toISOString())
        .order('created_at', { ascending: false })

      if (severity) {
        query = query.eq('severity', severity)
      }

      if (status) {
        query = query.eq('status', status)
      }

      const { data: alerts, error } = await query

      if (error) {
        logger.error('Failed to get alerts', { error })
        return formatErrorResponse('Failed to retrieve alerts', 500)
      }

      // Calculate alert statistics
      const alertStats = alerts?.reduce((stats, alert) => {
        stats.totalAlerts++
        stats.bySeverity[alert.severity] = (stats.bySeverity[alert.severity] || 0) + 1
        stats.byType[alert.type] = (stats.byType[alert.type] || 0) + 1
        
        if (alert.severity === 'critical' || alert.severity === 'high') {
          stats.criticalAlerts++
        }
        
        return stats
      }, {
        totalAlerts: 0,
        criticalAlerts: 0,
        bySeverity: {} as Record<string, number>,
        byType: {} as Record<string, number>,
      }) || {
        totalAlerts: 0,
        criticalAlerts: 0,
        bySeverity: {},
        byType: {},
      }

      return NextResponse.json({
        success: true,
        data: {
          alerts: alerts || [],
          statistics: alertStats,
          summary: {
            totalAlerts: alertStats.totalAlerts,
            criticalAlerts: alertStats.criticalAlerts,
            alertRate: alertStats.totalAlerts / hours, // alerts per hour
            timeRange: `${hours} hours`,
          }
        }
      })

    } catch (error) {
      logger.error('Alerts retrieval error', { error })
      return formatErrorResponse('Internal server error', 500)
    }
  })
}

// Update alert status
export async function PATCH(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      const body = await request.json()
      const { alertId, status } = z.object({
        alertId: z.string(),
        status: z.enum(['active', 'acknowledged', 'resolved', 'dismissed']),
      }).parse(body)

      // Update alert status
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      const { error } = await supabase
        .from('monitoring_alerts')
        .update({ 
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', alertId)

      if (error) {
        logger.error('Failed to update alert status', { error })
        return formatErrorResponse('Failed to update alert', 500)
      }

      logger.info('Alert status updated', { alertId, status })

      return NextResponse.json({
        success: true,
        message: 'Alert status updated successfully'
      })

    } catch (error) {
      logger.error('Alert status update error', { error })
      return formatErrorResponse('Invalid request', 400)
    }
  })
}

// Send critical alerts via various channels
async function sendCriticalAlerts(alerts: any[]): Promise<void> {
  try {
    // Send to Slack/Teams/Discord
    await sendToSlack(alerts)
    
    // Send email alerts
    await sendEmailAlerts(alerts)
    
    // Send SMS alerts (if configured)
    await sendSMSAlerts(alerts)
    
    logger.info('Critical alerts sent', { count: alerts.length })
  } catch (error) {
    logger.error('Failed to send critical alerts', { error })
  }
}

async function sendToSlack(alerts: any[]): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) return

  try {
    const blocks = alerts.map(alert => ({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🚨 *${alert.type.toUpperCase()}*\n${alert.message}\n*Severity:* ${alert.severity}\n*Time:* ${new Date(alert.timestamp).toLocaleString()}`,
      },
    }))

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `Critical Alert: ${alerts.length} new critical alerts`,
        blocks,
      }),
    })
  } catch (error) {
    logger.error('Failed to send to Slack', { error })
  }
}

async function sendEmailAlerts(alerts: any[]): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail) return

  try {
    // This would integrate with your email service (Resend, SendGrid, etc.)
    const emailContent = alerts.map(alert => 
      `${alert.type}: ${alert.message} (${alert.severity})`
    ).join('\n\n')

    // Send email using your email service
    logger.info('Email alert would be sent', { 
      to: adminEmail,
      subject: `Critical Alerts: ${alerts.length} new alerts`,
      content: emailContent 
    })
  } catch (error) {
    logger.error('Failed to send email alerts', { error })
  }
}

async function sendSMSAlerts(alerts: any[]): Promise<void> {
  const adminPhone = process.env.ADMIN_PHONE
  if (!adminPhone) return

  try {
    // This would integrate with your SMS service (Twilio, etc.)
    const message = `Critical Alert: ${alerts.length} new critical alerts detected`
    
    logger.info('SMS alert would be sent', { 
      to: adminPhone,
      message 
    })
  } catch (error) {
    logger.error('Failed to send SMS alerts', { error })
  }
}
