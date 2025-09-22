/**
 * User Activity API Route
 * 
 * This endpoint allows users to view their own activity history
 * with appropriate privacy controls and data filtering.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/app/lib/auth/auth-middleware'
import { withStandardSecurity } from '@/app/lib/security/security-middleware'
import { getAuditLogger, type AuditLogFilter } from '@/app/lib/stubs/audit/audit-logger'
import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { logger } from '@/app/lib/logger'

/**
 * GET /api/user/activity
 * 
 * Get user's own activity history
 */
export const GET = withAuth(
  withStandardSecurity(async (request: NextRequest, context) => {
    try {
      const { user } = context
      const { searchParams } = new URL(request.url)
      
      // Parse parameters
      const days = Math.min(parseInt(searchParams.get('days') || '30'), 90) // Max 90 days
      const action = searchParams.get('action') || undefined
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200) // Max 200
      const offset = parseInt(searchParams.get('offset') || '0')

      // Calculate date range
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      const endDate = new Date().toISOString()

      // Filter for user's own activities only
      const filter: AuditLogFilter = {
        userId: user.id,
        action: action as any,
        startDate,
        endDate,
        limit,
        offset
      }

      const auditLogger = getAuditLogger()
      const result = await auditLogger.getAuditLogs(filter)

      // Filter out sensitive information and format for user consumption
      const userFriendlyLogs = result.logs.map(log => ({
        id: log.id,
        action: formatActionForUser(log.action),
        resourceType: log.resourceType,
        timestamp: log.createdAt,
        details: formatDetailsForUser(log.action, log.metadata),
        // Don't include: oldValues, newValues, ipAddress, userAgent, etc.
      }))

      // Get activity summary
      const activitySummary = await getUserActivitySummary(user.id, days)

      return NextResponse.json({
        success: true,
        data: {
          activities: userFriendlyLogs,
          summary: activitySummary,
          pagination: {
            total: result.totalCount,
            limit,
            offset,
            hasMore: result.hasMore
          },
          period: {
            days,
            startDate,
            endDate
          }
        }
      })

    } catch (error) {
      logger.error('Failed to get user activity', {
        userId: context.user.id,
        error: (error as Error).message
      })

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to get activity history',
          message: 'Please try again later'
        },
        { status: 500 }
      )
    }
  })
)

/**
 * GET /api/user/activity/summary
 * 
 * Get user's activity summary and statistics
 */
export const POST = withAuth(
  withStandardSecurity(async (request: NextRequest, context) => {
    try {
      const { user } = context
      const body = await request.json()
      const { days = 30 } = body

      // Use database function for efficient summary
      const { data: summary, error } = await supabaseAdmin
        .rpc('get_user_activity_summary', {
          p_user_id: user.id,
          days_back: Math.min(days, 90) // Max 90 days
        })

      if (error) {
        throw error
      }

      // Format summary for user consumption
      const formattedSummary = {
        userId: user.id,
        period: {
          days: Math.min(days, 90),
          startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString()
        },
        totalActions: summary?.totalActions || 0,
        actionsByType: formatActionTypesForUser(summary?.actionsByType || {}),
        recentActions: (summary?.recentActions || []).map((action: any) => ({
          action: formatActionForUser(action.action),
          resourceType: action.resourceType,
          timestamp: action.createdAt,
          details: formatDetailsForUser(action.action, {})
        })).slice(0, 10), // Limit to 10 recent actions
        insights: generateUserInsights(summary)
      }

      return NextResponse.json({
        success: true,
        data: formattedSummary
      })

    } catch (error) {
      logger.error('Failed to get user activity summary', {
        userId: context.user.id,
        error: (error as Error).message
      })

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to get activity summary',
          message: 'Please try again later'
        },
        { status: 500 }
      )
    }
  })
)

/**
 * Format action names for user-friendly display
 */
function formatActionForUser(action: string): string {
  const actionMap: Record<string, string> = {
    'LOGIN': 'Signed in',
    'LOGOUT': 'Signed out',
    'DOCUMENT_UPLOADED': 'Uploaded document',
    'DOCUMENT_ACCESSED': 'Viewed document',
    'CHAT_MESSAGE': 'Sent chat message',
    'SEARCH_PERFORMED': 'Performed search',
    'DATA_EXPORT': 'Downloaded data',
    'TIER_UPGRADE': 'Upgraded subscription',
    'API_CALL': 'Used API',
    'USER_UPDATED': 'Updated profile',
    'PASSWORD_RESET': 'Reset password'
  }

  return actionMap[action] || action.toLowerCase().replace(/_/g, ' ')
}

/**
 * Format details for user consumption (remove sensitive info)
 */
function formatDetailsForUser(action: string, metadata: any): string {
  if (!metadata) return ''

  switch (action) {
    case 'DOCUMENT_UPLOADED':
      return metadata.fileName ? `File: ${metadata.fileName}` : 'Document uploaded'
    case 'CHAT_MESSAGE':
      return 'Chat conversation'
    case 'SEARCH_PERFORMED':
      return metadata.query ? `Searched for: ${metadata.query.substring(0, 50)}...` : 'Performed search'
    case 'DATA_EXPORT':
      return metadata.exportType ? `Exported: ${metadata.exportType}` : 'Downloaded data'
    case 'API_CALL':
      return metadata.endpoint ? `API: ${metadata.endpoint.split('/').pop()}` : 'API request'
    default:
      return ''
  }
}

/**
 * Format action types for user display
 */
function formatActionTypesForUser(actionTypes: Record<string, number>): Record<string, number> {
  const formatted: Record<string, number> = {}
  
  Object.entries(actionTypes).forEach(([action, count]) => {
    const userFriendlyName = formatActionForUser(action)
    formatted[userFriendlyName] = count
  })

  return formatted
}

/**
 * Generate insights for user
 */
function generateUserInsights(summary: any): any {
  if (!summary) return {}

  const totalActions = summary.totalActions || 0
  const actionsByType = summary.actionsByType || {}

  // Find most common action
  const mostCommonAction = Object.entries(actionsByType)
    .sort(([, a], [, b]) => (b as number) - (a as number))[0]

  return {
    mostCommonActivity: mostCommonAction ? formatActionForUser(mostCommonAction[0]) : 'None',
    totalActivities: totalActions,
    averagePerDay: Math.round(totalActions / 30),
    accountAge: 'Active user', // Could calculate from user creation date
    securityScore: calculateUserSecurityScore(summary)
  }
}

/**
 * Calculate a simple security score for the user
 */
function calculateUserSecurityScore(summary: any): string {
  // Simple scoring based on activity patterns
  const totalActions = summary.totalActions || 0
  const recentActions = summary.recentActions || []

  if (totalActions === 0) return 'New Account'
  if (totalActions < 10) return 'Low Activity'
  if (totalActions < 100) return 'Regular User'
  return 'Active User'
}

/**
 * Get user activity summary (helper function)
 */
async function getUserActivitySummary(userId: string, days: number): Promise<any> {
  try {
    const { data, error } = await supabaseAdmin
      .rpc('get_user_activity_summary', {
        p_user_id: userId,
        days_back: days
      })

    if (error) throw error
    return data
  } catch (error) {
    logger.error('Failed to get user activity summary', { userId, days }, error as Error)
    return null
  }
}
