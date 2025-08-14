/**
 * Audit Logging Service
 * 
 * This service provides comprehensive audit logging for security events,
 * data access, and administrative actions with proper tenant isolation.
 */

import { supabaseAdmin } from '@/app/lib/supabase'
import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'

export type AuditAction = 
  | 'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED' | 'PASSWORD_RESET'
  | 'USER_CREATED' | 'USER_UPDATED' | 'USER_DELETED'
  | 'DOCUMENT_UPLOADED' | 'DOCUMENT_ACCESSED' | 'DOCUMENT_DELETED'
  | 'CHAT_MESSAGE' | 'SEARCH_PERFORMED' | 'API_CALL'
  | 'TIER_UPGRADE' | 'TIER_DOWNGRADE' | 'USAGE_RESET'
  | 'RATE_LIMIT_EXCEEDED' | 'USAGE_LIMIT_EXCEEDED'
  | 'ADMIN_ACCESS' | 'PERMISSION_GRANTED' | 'PERMISSION_REVOKED'
  | 'DATA_EXPORT' | 'DATA_IMPORT' | 'BACKUP_CREATED'
  | 'SECURITY_VIOLATION' | 'SUSPICIOUS_ACTIVITY'
  | 'SYSTEM_ERROR' | 'CONFIGURATION_CHANGED'

export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical'

export type ResourceType = 
  | 'user' | 'document' | 'conversation' | 'subscription'
  | 'rate_limiter' | 'usage_tracking' | 'authentication'
  | 'system' | 'api' | 'security' | 'billing'

export interface AuditLogEntry {
  userId?: string
  action: AuditAction
  resourceType: ResourceType
  resourceId?: string
  oldValues?: Record<string, any>
  newValues?: Record<string, any>
  metadata?: Record<string, any>
  severity: AuditSeverity
  ipAddress?: string
  userAgent?: string
  sessionId?: string
}

export interface AuditLogFilter {
  userId?: string
  action?: AuditAction | AuditAction[]
  resourceType?: ResourceType | ResourceType[]
  severity?: AuditSeverity | AuditSeverity[]
  startDate?: string
  endDate?: string
  ipAddress?: string
  limit?: number
  offset?: number
}

export interface AuditLogResult {
  id: string
  userId?: string
  action: AuditAction
  resourceType: ResourceType
  resourceId?: string
  oldValues?: Record<string, any>
  newValues?: Record<string, any>
  metadata?: Record<string, any>
  severity: AuditSeverity
  ipAddress?: string
  userAgent?: string
  sessionId?: string
  createdAt: string
}

export interface SecurityAlert {
  id: string
  type: 'FAILED_LOGIN_ATTEMPTS' | 'SUSPICIOUS_IP' | 'RATE_LIMIT_ABUSE' | 'DATA_BREACH_ATTEMPT' | 'PRIVILEGE_ESCALATION'
  severity: AuditSeverity
  description: string
  userId?: string
  ipAddress?: string
  metadata: Record<string, any>
  createdAt: string
  resolved: boolean
  resolvedAt?: string
  resolvedBy?: string
}

/**
 * Audit Logger Service
 */
export class AuditLogger {
  /**
   * Log an audit event
   */
  async logAction(entry: AuditLogEntry): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('private.audit_logs')
        .insert({
          user_id: entry.userId,
          action: entry.action,
          resource_type: entry.resourceType,
          resource_id: entry.resourceId,
          old_values: entry.oldValues || null,
          new_values: entry.newValues || null,
          metadata: entry.metadata || null,
          severity: entry.severity,
          ip_address: entry.ipAddress,
          user_agent: entry.userAgent,
          session_id: entry.sessionId
        })

      if (error) {
        throw error
      }

      // Log to application logger as well for immediate visibility
      logger.info('Audit log entry created', {
        action: entry.action,
        resourceType: entry.resourceType,
        severity: entry.severity,
        userId: entry.userId
      })

      // Check for security patterns that require immediate attention
      await this.checkSecurityPatterns(entry)

    } catch (error) {
      // Audit logging failures should not break the main application
      logger.error('Failed to create audit log entry', {
        action: entry.action,
        resourceType: entry.resourceType,
        userId: entry.userId
      }, error as Error)
    }
  }

  /**
   * Log a security event with enhanced monitoring
   */
  async logSecurityEvent(
    action: AuditAction,
    severity: AuditSeverity,
    description: string,
    userId?: string,
    metadata?: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logAction({
      userId,
      action,
      resourceType: 'security',
      metadata: {
        description,
        ...metadata
      },
      severity,
      ipAddress,
      userAgent
    })

    // Create security alert for critical events
    if (severity === 'critical' || severity === 'error') {
      await this.createSecurityAlert({
        type: this.mapActionToAlertType(action),
        severity,
        description,
        userId,
        ipAddress,
        metadata: metadata || {}
      })
    }
  }

  /**
   * Log user authentication events
   */
  async logAuthEvent(
    action: 'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED' | 'PASSWORD_RESET',
    userId?: string,
    success: boolean = true,
    metadata?: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    const severity: AuditSeverity = success ? 'info' : 'warning'
    
    await this.logAction({
      userId,
      action,
      resourceType: 'authentication',
      metadata: {
        success,
        ...metadata
      },
      severity,
      ipAddress,
      userAgent
    })

    // Track failed login attempts for security monitoring
    if (!success && action === 'LOGIN_FAILED') {
      await this.trackFailedLoginAttempt(ipAddress, userId, userAgent)
    }
  }

  /**
   * Log data access events
   */
  async logDataAccess(
    action: 'DOCUMENT_ACCESSED' | 'SEARCH_PERFORMED' | 'DATA_EXPORT',
    userId: string,
    resourceId?: string,
    metadata?: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logAction({
      userId,
      action,
      resourceType: 'document',
      resourceId,
      metadata,
      severity: 'info',
      ipAddress,
      userAgent
    })
  }

  /**
   * Log administrative actions
   */
  async logAdminAction(
    action: AuditAction,
    adminUserId: string,
    targetUserId?: string,
    oldValues?: Record<string, any>,
    newValues?: Record<string, any>,
    metadata?: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logAction({
      userId: adminUserId,
      action,
      resourceType: 'user',
      resourceId: targetUserId,
      oldValues,
      newValues,
      metadata: {
        adminAction: true,
        targetUserId,
        ...metadata
      },
      severity: 'warning',
      ipAddress,
      userAgent
    })
  }

  /**
   * Get audit logs with filtering
   */
  async getAuditLogs(filter: AuditLogFilter = {}): Promise<{
    logs: AuditLogResult[]
    totalCount: number
    hasMore: boolean
  }> {
    try {
      let query = supabaseAdmin
        .from('private.audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })

      // Apply filters
      if (filter.userId) {
        query = query.eq('user_id', filter.userId)
      }

      if (filter.action) {
        if (Array.isArray(filter.action)) {
          query = query.in('action', filter.action)
        } else {
          query = query.eq('action', filter.action)
        }
      }

      if (filter.resourceType) {
        if (Array.isArray(filter.resourceType)) {
          query = query.in('resource_type', filter.resourceType)
        } else {
          query = query.eq('resource_type', filter.resourceType)
        }
      }

      if (filter.severity) {
        if (Array.isArray(filter.severity)) {
          query = query.in('severity', filter.severity)
        } else {
          query = query.eq('severity', filter.severity)
        }
      }

      if (filter.startDate) {
        query = query.gte('created_at', filter.startDate)
      }

      if (filter.endDate) {
        query = query.lte('created_at', filter.endDate)
      }

      if (filter.ipAddress) {
        query = query.eq('ip_address', filter.ipAddress)
      }

      // Apply pagination
      const limit = Math.min(filter.limit || 50, 1000) // Max 1000 records
      const offset = filter.offset || 0

      query = query.range(offset, offset + limit - 1)

      const { data, error, count } = await query

      if (error) {
        throw error
      }

      const logs: AuditLogResult[] = (data || []).map(log => ({
        id: log.id,
        userId: log.user_id,
        action: log.action,
        resourceType: log.resource_type,
        resourceId: log.resource_id,
        oldValues: log.old_values,
        newValues: log.new_values,
        metadata: log.metadata,
        severity: log.severity,
        ipAddress: log.ip_address,
        userAgent: log.user_agent,
        sessionId: log.session_id,
        createdAt: log.created_at
      }))

      return {
        logs,
        totalCount: count || 0,
        hasMore: (offset + limit) < (count || 0)
      }

    } catch (error) {
      logger.error('Failed to get audit logs', filter, error as Error)
      throw createError.databaseError('Failed to retrieve audit logs', error as Error)
    }
  }

  /**
   * Get security alerts
   */
  async getSecurityAlerts(
    resolved: boolean = false,
    limit: number = 50
  ): Promise<SecurityAlert[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('private.security_alerts')
        .select('*')
        .eq('resolved', resolved)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) {
        throw error
      }

      return (data || []).map(alert => ({
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        description: alert.description,
        userId: alert.user_id,
        ipAddress: alert.ip_address,
        metadata: alert.metadata,
        createdAt: alert.created_at,
        resolved: alert.resolved,
        resolvedAt: alert.resolved_at,
        resolvedBy: alert.resolved_by
      }))

    } catch (error) {
      logger.error('Failed to get security alerts', error as Error)
      throw createError.databaseError('Failed to retrieve security alerts', error as Error)
    }
  }

  /**
   * Resolve a security alert
   */
  async resolveSecurityAlert(
    alertId: string,
    resolvedBy: string,
    resolution?: string
  ): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('private.security_alerts')
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: resolvedBy,
          metadata: supabaseAdmin.rpc('jsonb_set', {
            target: supabaseAdmin.rpc('coalesce', { 
              value: supabaseAdmin.from('private.security_alerts').select('metadata').eq('id', alertId).single(),
              default_value: '{}'
            }),
            path: '{resolution}',
            new_value: JSON.stringify(resolution || 'Resolved by admin')
          })
        })
        .eq('id', alertId)

      if (error) {
        throw error
      }

      // Log the resolution
      await this.logAction({
        userId: resolvedBy,
        action: 'SECURITY_VIOLATION',
        resourceType: 'security',
        resourceId: alertId,
        metadata: {
          alertResolved: true,
          resolution
        },
        severity: 'info'
      })

    } catch (error) {
      logger.error('Failed to resolve security alert', { alertId, resolvedBy }, error as Error)
      throw createError.databaseError('Failed to resolve security alert', error as Error)
    }
  }

  /**
   * Get audit statistics
   */
  async getAuditStatistics(
    startDate?: string,
    endDate?: string
  ): Promise<{
    totalEvents: number
    eventsByAction: Record<string, number>
    eventsBySeverity: Record<string, number>
    eventsByResourceType: Record<string, number>
    topUsers: Array<{ userId: string; eventCount: number }>
    topIpAddresses: Array<{ ipAddress: string; eventCount: number }>
  }> {
    try {
      // Use database function for efficient aggregation
      const { data, error } = await supabaseAdmin
        .rpc('get_audit_statistics', {
          start_date: startDate,
          end_date: endDate
        })

      if (error) {
        throw error
      }

      return data || {
        totalEvents: 0,
        eventsByAction: {},
        eventsBySeverity: {},
        eventsByResourceType: {},
        topUsers: [],
        topIpAddresses: []
      }

    } catch (error) {
      logger.error('Failed to get audit statistics', { startDate, endDate }, error as Error)
      throw createError.databaseError('Failed to get audit statistics', error as Error)
    }
  }

  /**
   * Check for security patterns and create alerts
   */
  private async checkSecurityPatterns(entry: AuditLogEntry): Promise<void> {
    try {
      // Check for multiple failed login attempts
      if (entry.action === 'LOGIN_FAILED' && entry.ipAddress) {
        await this.checkFailedLoginPattern(entry.ipAddress, entry.userId)
      }

      // Check for suspicious API usage patterns
      if (entry.action === 'RATE_LIMIT_EXCEEDED') {
        await this.checkRateLimitAbusePattern(entry.userId, entry.ipAddress)
      }

      // Check for privilege escalation attempts
      if (entry.action === 'ADMIN_ACCESS' && entry.severity === 'warning') {
        await this.checkPrivilegeEscalationPattern(entry.userId, entry.ipAddress)
      }

    } catch (error) {
      logger.error('Failed to check security patterns', entry, error as Error)
    }
  }

  /**
   * Track failed login attempts and create alerts
   */
  private async trackFailedLoginAttempt(
    ipAddress?: string,
    userId?: string,
    userAgent?: string
  ): Promise<void> {
    if (!ipAddress) return

    try {
      // Count recent failed attempts from this IP
      const { data, error } = await supabaseAdmin
        .from('private.audit_logs')
        .select('id')
        .eq('action', 'LOGIN_FAILED')
        .eq('ip_address', ipAddress)
        .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString()) // Last 15 minutes

      if (error) throw error

      const failedAttempts = data?.length || 0

      // Create alert if threshold exceeded
      if (failedAttempts >= 5) {
        await this.createSecurityAlert({
          type: 'FAILED_LOGIN_ATTEMPTS',
          severity: 'error',
          description: `${failedAttempts} failed login attempts from IP ${ipAddress} in the last 15 minutes`,
          userId,
          ipAddress,
          metadata: {
            failedAttempts,
            timeWindow: '15 minutes',
            userAgent
          }
        })
      }

    } catch (error) {
      logger.error('Failed to track failed login attempt', { ipAddress, userId }, error as Error)
    }
  }

  /**
   * Check for failed login patterns
   */
  private async checkFailedLoginPattern(ipAddress: string, userId?: string): Promise<void> {
    // Implementation would check for patterns like:
    // - Multiple IPs trying same user
    // - Single IP trying multiple users
    // - Rapid succession attempts
  }

  /**
   * Check for rate limit abuse patterns
   */
  private async checkRateLimitAbusePattern(userId?: string, ipAddress?: string): Promise<void> {
    // Implementation would check for patterns like:
    // - Consistent rate limit hitting
    // - Distributed attacks from multiple IPs
    // - Unusual usage spikes
  }

  /**
   * Check for privilege escalation patterns
   */
  private async checkPrivilegeEscalationPattern(userId?: string, ipAddress?: string): Promise<void> {
    // Implementation would check for patterns like:
    // - Unauthorized admin access attempts
    // - Unusual permission requests
    // - Access to restricted resources
  }

  /**
   * Create a security alert
   */
  private async createSecurityAlert(alert: Omit<SecurityAlert, 'id' | 'createdAt' | 'resolved' | 'resolvedAt' | 'resolvedBy'>): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('private.security_alerts')
        .insert({
          type: alert.type,
          severity: alert.severity,
          description: alert.description,
          user_id: alert.userId,
          ip_address: alert.ipAddress,
          metadata: alert.metadata,
          resolved: false
        })

      if (error) {
        throw error
      }

      // Log critical alerts to application logger for immediate notification
      if (alert.severity === 'critical') {
        logger.error('CRITICAL SECURITY ALERT', {
          type: alert.type,
          description: alert.description,
          userId: alert.userId,
          ipAddress: alert.ipAddress
        })
      }

    } catch (error) {
      logger.error('Failed to create security alert', alert, error as Error)
    }
  }

  /**
   * Map audit actions to alert types
   */
  private mapActionToAlertType(action: AuditAction): SecurityAlert['type'] {
    switch (action) {
      case 'LOGIN_FAILED':
        return 'FAILED_LOGIN_ATTEMPTS'
      case 'RATE_LIMIT_EXCEEDED':
        return 'RATE_LIMIT_ABUSE'
      case 'ADMIN_ACCESS':
        return 'PRIVILEGE_ESCALATION'
      case 'SUSPICIOUS_ACTIVITY':
        return 'DATA_BREACH_ATTEMPT'
      default:
        return 'SUSPICIOUS_IP'
    }
  }

  /**
   * Clean up old audit logs (retention policy)
   */
  async cleanupOldAuditLogs(retentionDays: number = 365): Promise<void> {
    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)

      const { error, count } = await supabaseAdmin
        .from('private.audit_logs')
        .delete({ count: 'exact' })
        .lt('created_at', cutoffDate.toISOString())

      if (error) {
        throw error
      }

      logger.info('Audit log cleanup completed', {
        deletedCount: count || 0,
        retentionDays,
        cutoffDate: cutoffDate.toISOString()
      })

    } catch (error) {
      logger.error('Failed to cleanup old audit logs', { retentionDays }, error as Error)
    }
  }
}

// Singleton instance
let auditLogger: AuditLogger | null = null

/**
 * Get the audit logger instance
 */
export function getAuditLogger(): AuditLogger {
  if (!auditLogger) {
    auditLogger = new AuditLogger()
  }
  return auditLogger
}

/**
 * Convenience functions
 */

export async function logAuditAction(entry: AuditLogEntry): Promise<void> {
  const logger = getAuditLogger()
  return logger.logAction(entry)
}

export async function logSecurityEvent(
  action: AuditAction,
  severity: AuditSeverity,
  description: string,
  userId?: string,
  metadata?: Record<string, any>,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  const logger = getAuditLogger()
  return logger.logSecurityEvent(action, severity, description, userId, metadata, ipAddress, userAgent)
}

export async function logAuthEvent(
  action: 'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED' | 'PASSWORD_RESET',
  userId?: string,
  success?: boolean,
  metadata?: Record<string, any>,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  const logger = getAuditLogger()
  return logger.logAuthEvent(action, userId, success, metadata, ipAddress, userAgent)
}

export async function logDataAccess(
  action: 'DOCUMENT_ACCESSED' | 'SEARCH_PERFORMED' | 'DATA_EXPORT',
  userId: string,
  resourceId?: string,
  metadata?: Record<string, any>,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  const logger = getAuditLogger()
  return logger.logDataAccess(action, userId, resourceId, metadata, ipAddress, userAgent)
}