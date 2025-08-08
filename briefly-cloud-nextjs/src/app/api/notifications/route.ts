import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/lib/auth'
import { NotificationManager } from '@/app/lib/notifications'
import { logger } from '@/app/lib/logger'
import { formatErrorResponse } from '@/app/lib/api-errors'
import { withRateLimit } from '@/app/lib/rate-limit'
import { z } from 'zod'

// Request schemas
const GetNotificationsSchema = z.object({
  limit: z.number().min(1).max(100).optional().default(50),
  offset: z.number().min(0).optional().default(0),
  unread_only: z.boolean().optional().default(false),
})

const MarkReadSchema = z.object({
  notification_id: z.string().uuid(),
})

const UpdatePreferencesSchema = z.object({
  email_notifications: z.boolean().optional(),
  in_app_notifications: z.boolean().optional(),
  migration_updates: z.boolean().optional(),
  maintenance_alerts: z.boolean().optional(),
  feature_updates: z.boolean().optional(),
  security_alerts: z.boolean().optional(),
})

export async function GET(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user) {
        return formatErrorResponse('Unauthorized', 401)
      }

      const { searchParams } = new URL(request.url)
      const query = {
        limit: parseInt(searchParams.get('limit') || '50'),
        offset: parseInt(searchParams.get('offset') || '0'),
        unread_only: searchParams.get('unread_only') === 'true',
      }

      const validatedQuery = GetNotificationsSchema.parse(query)

      const notificationManager = new NotificationManager(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      const notifications = await notificationManager.getUserNotifications(
        session.user.id,
        validatedQuery.limit,
        validatedQuery.offset
      )

      // Filter unread only if requested
      const filteredNotifications = validatedQuery.unread_only
        ? notifications.filter(n => !n.read_at)
        : notifications

      return NextResponse.json({
        success: true,
        data: {
          notifications: filteredNotifications,
          count: filteredNotifications.length,
          has_more: filteredNotifications.length === validatedQuery.limit,
        }
      })

    } catch (error) {
      logger.error('Failed to get notifications', { error })
      return formatErrorResponse('Failed to get notifications', 500)
    }
  })
}

export async function POST(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user) {
        return formatErrorResponse('Unauthorized', 401)
      }

      const body = await request.json()
      const { notification_id } = MarkReadSchema.parse(body)

      const notificationManager = new NotificationManager(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      await notificationManager.markNotificationAsRead(notification_id)

      return NextResponse.json({
        success: true,
        message: 'Notification marked as read'
      })

    } catch (error) {
      logger.error('Failed to mark notification as read', { error })
      return formatErrorResponse('Failed to mark notification as read', 500)
    }
  })
}

export async function PUT(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user) {
        return formatErrorResponse('Unauthorized', 401)
      }

      const body = await request.json()
      const preferences = UpdatePreferencesSchema.parse(body)

      const notificationManager = new NotificationManager(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      await notificationManager.updateNotificationPreferences(
        session.user.id,
        preferences
      )

      return NextResponse.json({
        success: true,
        message: 'Notification preferences updated'
      })

    } catch (error) {
      logger.error('Failed to update notification preferences', { error })
      return formatErrorResponse('Failed to update notification preferences', 500)
    }
  })
}
