import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/app/lib/auth/auth-middleware'
import { NotificationManager, MIGRATION_TEMPLATES } from '@/app/lib/notifications'
import { logger } from '@/app/lib/logger'
import { formatErrorResponse } from '@/app/lib/api-errors'
import { z } from 'zod'

// Admin notification request schemas
const SendNotificationSchema = z.object({
  type: z.enum(['migration_announcement', 'migration_progress', 'migration_complete', 'migration_issue', 'maintenance_alert', 'feature_update', 'security_alert']),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(1000),
  action_url: z.string().url().optional(),
  action_text: z.string().max(50).optional(),
  user_ids: z.array(z.string().uuid()).optional(), // If not provided, sends to all active users
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
})

const SendMigrationAnnouncementSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  message: z.string().min(1).max(1000).optional(),
  action_url: z.string().url().optional(),
  action_text: z.string().max(50).optional(),
  use_template: z.boolean().optional().default(true),
})

const SendMaintenanceAlertSchema = z.object({
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(1000),
  scheduled_time: z.string().datetime().optional(),
  duration: z.string().optional(),
})

export async function POST(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user) {
        return formatErrorResponse('Unauthorized', 401)
      }

      // Check admin privileges
      const { data: user } = await fetch(`${process.env.NEXTAUTH_URL}/api/user/profile`, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      }).then(res => res.json())

      if (!user?.is_admin) {
        return formatErrorResponse('Admin privileges required', 403)
      }

      const body = await request.json()
      const { type, title, message, action_url, action_text, user_ids, priority } = SendNotificationSchema.parse(body)

      const notificationManager = new NotificationManager(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      if (user_ids && user_ids.length > 0) {
        // Send to specific users
        const notifications = user_ids.map(userId => ({
          user_id: userId,
          type,
          priority,
          title,
          message,
          action_url,
          action_text,
          status: 'pending' as const,
        }))

        for (const notification of notifications) {
          await notificationManager.createNotification(notification)
        }

        logger.info('Admin notification sent to specific users', { 
          adminId: session.user.id,
          type,
          userCount: user_ids.length,
          title 
        })
      } else {
        // Send to all active users
        if (type === 'migration_announcement') {
          await notificationManager.sendMigrationAnnouncement(title, message, action_url, action_text)
        } else if (type === 'maintenance_alert') {
          await notificationManager.sendMaintenanceAlert(title, message)
        } else {
          // For other types, we need to get all active users and send individually
          const { data: users, error: usersError } = await fetch(`${process.env.NEXTAUTH_URL}/api/admin/users/active`, {
            headers: { Authorization: `Bearer ${session.accessToken}` }
          }).then(res => res.json())

          if (usersError) throw new Error(usersError)

          const notifications = users.data.map((user: any) => ({
            user_id: user.id,
            type,
            priority,
            title,
            message,
            action_url,
            action_text,
            status: 'pending' as const,
          }))

          for (const notification of notifications) {
            await notificationManager.createNotification(notification)
          }

          logger.info('Admin notification sent to all users', { 
            adminId: session.user.id,
            type,
            userCount: users.data.length,
            title 
          })
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Notification sent successfully',
        data: {
          type,
          title,
          user_count: user_ids?.length || 'all_active_users'
        }
      })

    } catch (error) {
      logger.error('Failed to send admin notification', { error })
      return formatErrorResponse('Failed to send notification', 500)
    }
  })
}

// Special endpoint for migration announcements
export async function PUT(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user) {
        return formatErrorResponse('Unauthorized', 401)
      }

      // Check admin privileges
      const { data: user } = await fetch(`${process.env.NEXTAUTH_URL}/api/user/profile`, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      }).then(res => res.json())

      if (!user?.is_admin) {
        return formatErrorResponse('Admin privileges required', 403)
      }

      const body = await request.json()
      const { title, message, action_url, action_text, use_template } = SendMigrationAnnouncementSchema.parse(body)

      const notificationManager = new NotificationManager(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      let finalTitle = title
      let finalMessage = message
      let finalActionUrl = action_url
      let finalActionText = action_text

      if (use_template) {
        const template = MIGRATION_TEMPLATES.announcement
        finalTitle = title || template.title
        finalMessage = message || template.message
        finalActionUrl = action_url || '/briefly/app/migration-info'
        finalActionText = action_text || template.action_text
      }

      await notificationManager.sendMigrationAnnouncement(
        finalTitle,
        finalMessage,
        finalActionUrl,
        finalActionText
      )

      logger.info('Migration announcement sent', { 
        adminId: session.user.id,
        title: finalTitle,
        useTemplate: use_template
      })

      return NextResponse.json({
        success: true,
        message: 'Migration announcement sent successfully',
        data: {
          title: finalTitle,
          message: finalMessage,
          action_url: finalActionUrl,
          action_text: finalActionText,
        }
      })

    } catch (error) {
      logger.error('Failed to send migration announcement', { error })
      return formatErrorResponse('Failed to send migration announcement', 500)
    }
  })
}

// Maintenance alert endpoint
export async function PATCH(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user) {
        return formatErrorResponse('Unauthorized', 401)
      }

      // Check admin privileges
      const { data: user } = await fetch(`${process.env.NEXTAUTH_URL}/api/user/profile`, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      }).then(res => res.json())

      if (!user?.is_admin) {
        return formatErrorResponse('Admin privileges required', 403)
      }

      const body = await request.json()
      const { title, message, scheduled_time, duration } = SendMaintenanceAlertSchema.parse(body)

      const notificationManager = new NotificationManager(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      await notificationManager.sendMaintenanceAlert(title, message, scheduled_time, duration)

      logger.info('Maintenance alert sent', { 
        adminId: session.user.id,
        title,
        scheduledTime: scheduled_time,
        duration
      })

      return NextResponse.json({
        success: true,
        message: 'Maintenance alert sent successfully',
        data: {
          title,
          message,
          scheduled_time,
          duration,
        }
      })

    } catch (error) {
      logger.error('Failed to send maintenance alert', { error })
      return formatErrorResponse('Failed to send maintenance alert', 500)
    }
  })
}
