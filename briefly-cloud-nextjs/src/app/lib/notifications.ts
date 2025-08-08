import { createClient } from '@supabase/supabase-js'
import { logger } from './logger'

// Notification types
export type NotificationType = 
  | 'migration_announcement'
  | 'migration_progress'
  | 'migration_complete'
  | 'migration_issue'
  | 'maintenance_alert'
  | 'feature_update'
  | 'security_alert'

// Notification priority levels
export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical'

// Notification status
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'cancelled'

// Notification interface
export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  priority: NotificationPriority
  title: string
  message: string
  action_url?: string
  action_text?: string
  status: NotificationStatus
  created_at: string
  sent_at?: string
  read_at?: string
  metadata?: Record<string, any>
}

// Notification template interface
export interface NotificationTemplate {
  id: string
  type: NotificationType
  title: string
  message: string
  action_text?: string
  priority: NotificationPriority
  is_active: boolean
  created_at: string
  updated_at: string
}

// User preferences for notifications
export interface NotificationPreferences {
  user_id: string
  email_notifications: boolean
  in_app_notifications: boolean
  migration_updates: boolean
  maintenance_alerts: boolean
  feature_updates: boolean
  security_alerts: boolean
  created_at: string
  updated_at: string
}

export class NotificationManager {
  private supabase: any

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey)
  }

  // Create a new notification
  async createNotification(notification: Omit<Notification, 'id' | 'created_at'>): Promise<Notification> {
    try {
      const { data, error } = await this.supabase
        .from('notifications')
        .insert({
          ...notification,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) throw error

      logger.info('Notification created', { 
        notificationId: data.id, 
        userId: notification.user_id, 
        type: notification.type 
      })

      return data
    } catch (error) {
      logger.error('Failed to create notification', { error, notification })
      throw error
    }
  }

  // Send migration announcement to all users
  async sendMigrationAnnouncement(
    title: string,
    message: string,
    actionUrl?: string,
    actionText?: string
  ): Promise<void> {
    try {
      // Get all active users
      const { data: users, error: usersError } = await this.supabase
        .from('users')
        .select('id')
        .eq('subscription_status', 'active')

      if (usersError) throw usersError

      // Create notifications for all users
      const notifications = users.map(user => ({
        user_id: user.id,
        type: 'migration_announcement' as NotificationType,
        priority: 'high' as NotificationPriority,
        title,
        message,
        action_url: actionUrl,
        action_text: actionText,
        status: 'pending' as NotificationStatus,
      }))

      // Batch insert notifications
      const { error: insertError } = await this.supabase
        .from('notifications')
        .insert(notifications.map(n => ({
          ...n,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
        })))

      if (insertError) throw insertError

      logger.info('Migration announcement sent', { 
        userCount: users.length,
        title 
      })
    } catch (error) {
      logger.error('Failed to send migration announcement', { error })
      throw error
    }
  }

  // Send migration progress update
  async sendMigrationProgress(
    userId: string,
    progress: number,
    status: string,
    estimatedTime?: string
  ): Promise<void> {
    try {
      const message = `Migration progress: ${progress}% complete. ${status}${estimatedTime ? ` Estimated completion: ${estimatedTime}` : ''}`
      
      await this.createNotification({
        user_id: userId,
        type: 'migration_progress',
        priority: 'medium',
        title: 'Migration in Progress',
        message,
        status: 'pending',
        metadata: { progress, status, estimatedTime }
      })
    } catch (error) {
      logger.error('Failed to send migration progress', { error, userId })
    }
  }

  // Send migration completion notification
  async sendMigrationComplete(userId: string, details?: string): Promise<void> {
    try {
      await this.createNotification({
        user_id: userId,
        type: 'migration_complete',
        priority: 'medium',
        title: 'Migration Complete',
        message: `Your data has been successfully migrated to the new system.${details ? ` ${details}` : ''}`,
        action_url: '/briefly/app',
        action_text: 'Access Your Data',
        status: 'pending'
      })
    } catch (error) {
      logger.error('Failed to send migration complete notification', { error, userId })
    }
  }

  // Send migration issue notification
  async sendMigrationIssue(
    userId: string,
    issue: string,
    supportUrl?: string
  ): Promise<void> {
    try {
      await this.createNotification({
        user_id: userId,
        type: 'migration_issue',
        priority: 'high',
        title: 'Migration Issue Detected',
        message: `We encountered an issue during your migration: ${issue}. Our team has been notified and will resolve this shortly.`,
        action_url: supportUrl || '/briefly/app/support',
        action_text: 'Get Support',
        status: 'pending',
        metadata: { issue }
      })
    } catch (error) {
      logger.error('Failed to send migration issue notification', { error, userId })
    }
  }

  // Get user notifications
  async getUserNotifications(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Notification[]> {
    try {
      const { data, error } = await this.supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) throw error
      return data || []
    } catch (error) {
      logger.error('Failed to get user notifications', { error, userId })
      return []
    }
  }

  // Mark notification as read
  async markNotificationAsRead(notificationId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId)

      if (error) throw error
    } catch (error) {
      logger.error('Failed to mark notification as read', { error, notificationId })
    }
  }

  // Get unread notification count
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const { count, error } = await this.supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('read_at', null)

      if (error) throw error
      return count || 0
    } catch (error) {
      logger.error('Failed to get unread count', { error, userId })
      return 0
    }
  }

  // Update notification preferences
  async updateNotificationPreferences(
    userId: string,
    preferences: Partial<NotificationPreferences>
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('notification_preferences')
        .upsert({
          user_id: userId,
          ...preferences,
          updated_at: new Date().toISOString(),
        })

      if (error) throw error
    } catch (error) {
      logger.error('Failed to update notification preferences', { error, userId })
      throw error
    }
  }

  // Get notification preferences
  async getNotificationPreferences(userId: string): Promise<NotificationPreferences | null> {
    try {
      const { data, error } = await this.supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (error) throw error
      return data
    } catch (error) {
      logger.error('Failed to get notification preferences', { error, userId })
      return null
    }
  }

  // Send maintenance alert
  async sendMaintenanceAlert(
    title: string,
    message: string,
    scheduledTime?: string,
    duration?: string
  ): Promise<void> {
    try {
      const { data: users, error: usersError } = await this.supabase
        .from('users')
        .select('id')
        .eq('subscription_status', 'active')

      if (usersError) throw usersError

      const notifications = users.map(user => ({
        user_id: user.id,
        type: 'maintenance_alert' as NotificationType,
        priority: 'high' as NotificationPriority,
        title,
        message,
        status: 'pending' as NotificationStatus,
        metadata: { scheduledTime, duration }
      }))

      const { error: insertError } = await this.supabase
        .from('notifications')
        .insert(notifications.map(n => ({
          ...n,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
        })))

      if (insertError) throw insertError

      logger.info('Maintenance alert sent', { userCount: users.length, title })
    } catch (error) {
      logger.error('Failed to send maintenance alert', { error })
      throw error
    }
  }

  // Clean up old notifications
  async cleanupOldNotifications(daysOld: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - daysOld)

      const { count, error } = await this.supabase
        .from('notifications')
        .delete()
        .lt('created_at', cutoffDate.toISOString())
        .eq('status', 'sent')

      if (error) throw error

      logger.info('Cleaned up old notifications', { count })
      return count || 0
    } catch (error) {
      logger.error('Failed to cleanup old notifications', { error })
      return 0
    }
  }
}

// Email notification service
export class EmailNotificationService {
  private supabase: any

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey)
  }

  // Send email notification
  async sendEmailNotification(
    userId: string,
    subject: string,
    htmlContent: string,
    textContent?: string
  ): Promise<void> {
    try {
      // Get user email
      const { data: user, error: userError } = await this.supabase
        .from('users')
        .select('email')
        .eq('id', userId)
        .single()

      if (userError) throw userError

      // Check if user has email notifications enabled
      const preferences = await this.getNotificationPreferences(userId)
      if (preferences && !preferences.email_notifications) {
        logger.info('Email notifications disabled for user', { userId })
        return
      }

      // Send email using your email service (Resend, SendGrid, etc.)
      // This is a placeholder - implement with your email service
      await this.sendEmail(user.email, subject, htmlContent, textContent)

      logger.info('Email notification sent', { userId, subject })
    } catch (error) {
      logger.error('Failed to send email notification', { error, userId })
      throw error
    }
  }

  private async sendEmail(
    to: string,
    subject: string,
    htmlContent: string,
    textContent?: string
  ): Promise<void> {
    // Implement with your email service
    // Example with Resend:
    /*
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: 'noreply@rekonnlabs.com',
      to,
      subject,
      html: htmlContent,
      text: textContent,
    })
    */
    
    // For now, just log the email
    logger.info('Email would be sent', { to, subject })
  }

  private async getNotificationPreferences(userId: string): Promise<NotificationPreferences | null> {
    try {
      const { data, error } = await this.supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (error) throw error
      return data
    } catch (error) {
      return null
    }
  }
}

// Migration-specific notification templates
export const MIGRATION_TEMPLATES = {
  announcement: {
    title: 'Important: System Migration Update',
    message: 'We\'re upgrading our system to provide you with better performance and new features. Your data will be automatically migrated to the new system.',
    action_text: 'Learn More',
    priority: 'high' as NotificationPriority,
  },
  progress: {
    title: 'Migration in Progress',
    message: 'Your data is being migrated to our new system. This process is automatic and your data will remain safe.',
    priority: 'medium' as NotificationPriority,
  },
  complete: {
    title: 'Migration Complete!',
    message: 'Your data has been successfully migrated to our new system. You can now access all your documents and conversations.',
    action_text: 'Access Your Data',
    priority: 'medium' as NotificationPriority,
  },
  issue: {
    title: 'Migration Issue Detected',
    message: 'We encountered a minor issue during your migration. Our team has been notified and will resolve this shortly.',
    action_text: 'Get Support',
    priority: 'high' as NotificationPriority,
  },
} as const
