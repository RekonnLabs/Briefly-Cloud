/**
 * Comprehensive Audit Logging System
 * Provides detailed audit trail with correlation ID tracking, performance monitoring,
 * and error rate tracking for compliance and debugging
 */

import { logger } from '../logger'
import { supabaseAdmin } from '../supabase-admin'

export type AuditAction = 
  | 'user.login'
  | 'user.logout'
  | 'user.register'
  | 'user.profile_update'
  | 'file.upload'
  | 'file.download'
  | 'file.delete'
  | 'file.share'
  | 'file.import'
  | 'file.process'
  | 'chat.message'
  | 'chat.context_retrieval'
  | 'api.access'
  | 'api.error'
  | 'oauth.connect'
  | 'oauth.disconnect'
  | 'oauth.token_refresh'
  | 'storage.list'
  | 'storage.batch_import'
  | 'job.created'
  | 'job.completed'
  | 'job.failed'
  | 'security.threat'
  | 'security.rate_limit'
  | 'system.error'
  | 'system.health_check'
  | 'billing.subscription_change'
  | 'billing.payment'

export type AuditSeverity = 'low' | 'medium' | 'high' | 'critical'

export type AuditCategory = 
  | 'authentication'
  | 'authorization'
  | 'data_access'
  | 'data_modification'
  | 'system_operation'
  | 'security_event'
  | 'performance'
  | 'error'
  | 'compliance'

export interface AuditLogEntry {
  id: string
  timestamp: string
  correlationId: string
  action: AuditAction
  category: AuditCategory
  severity: AuditSeverity
  userId?: string
  sessionId?: string
  ipAddress?: string
  userAgent?: string
  resource?: string
  provider?: 'google_drive' | 'microsoft'
  fileIds?: string[]
  bytesProcessed?: number
  duration?: number
  errorClass?: string
  success: boolean
  details?: Record<string, unknown>
  performanceMetrics?: {
    responseTime: number
    memoryUsage?: number
    cpuUsage?: number
  }
}

export interface AuditLogFilter {
  userId?: string
  correlationId?: string
  action?: AuditAction
  category?: AuditCategory
  severity?: AuditSeverity
  provider?: string
  startDate?: string
  endDate?: string
  success?: boolean
  limit?: number
  offset?: number
}

export interface AuditStats {
  totalLogs: number
  logsByAction: Record<AuditAction, number>
  logsBySeverity: Record<AuditSeverity, number>
  logsByCategory: Record<AuditCategory, number>
  errorRate: number
  averageResponseTime: number
  recentErrors: number
  topErrors: Array<{ error: string; count: number }>
  performanceMetrics: {
    averageResponseTime: number
    p95ResponseTime: number
    slowestOperations: Array<{ action: string; duration: number }>
  }
}

/**
 * Comprehensive Audit Logger with database persistence and correlation tracking
 */
export class ComprehensiveAuditLogger {
  private static instance: ComprehensiveAuditLogger
  private memoryLogs: AuditLogEntry[] = []
  private maxMemoryLogs = 1000

  private constructor() {}

  static getInstance(): ComprehensiveAuditLogger {
    if (!ComprehensiveAuditLogger.instance) {
      ComprehensiveAuditLogger.instance = new ComprehensiveAuditLogger()
    }
    return ComprehensiveAuditLogger.instance
  }

  /**
   * Log an audit event with comprehensive tracking
   */
  async log(
    action: AuditAction,
    category: AuditCategory,
    severity: AuditSeverity,
    success: boolean,
    context: {
      correlationId: string
      userId?: string
      sessionId?: string
      ipAddress?: string
      userAgent?: string
      resource?: string
      provider?: 'google_drive' | 'microsoft'
      fileIds?: string[]
      bytesProcessed?: number
      duration?: number
      errorClass?: string
      details?: Record<string, unknown>
      performanceMetrics?: {
        responseTime: number
        memoryUsage?: number
        cpuUsage?: number
      }
    }
  ): Promise<void> {
    const entry: AuditLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      correlationId: context.correlationId,
      action,
      category,
      severity,
      success,
      userId: context.userId,
      sessionId: context.sessionId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      resource: context.resource,
      provider: context.provider,
      fileIds: context.fileIds,
      bytesProcessed: context.bytesProcessed,
      duration: context.duration,
      errorClass: context.errorClass,
      details: context.details,
      performanceMetrics: context.performanceMetrics
    }

    // Store in memory for quick access
    this.memoryLogs.push(entry)
    if (this.memoryLogs.length > this.maxMemoryLogs) {
      this.memoryLogs = this.memoryLogs.slice(-this.maxMemoryLogs)
    }

    // Log to structured logger
    const logLevel = this.getLogLevel(severity)
    logger[logLevel](`Audit: ${action}`, {
      correlationId: context.correlationId,
      category,
      severity,
      success,
      userId: context.userId,
      resource: context.resource,
      provider: context.provider,
      duration: context.duration,
      bytesProcessed: context.bytesProcessed,
      errorClass: context.errorClass,
      performanceMetrics: context.performanceMetrics
    })

    // Persist to database for long-term storage and compliance
    try {
      await this.persistToDatabase(entry)
    } catch (error) {
      logger.error('Failed to persist audit log to database', {
        correlationId: context.correlationId,
        auditEntryId: entry.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }

    // Alert on critical events
    if (severity === 'critical') {
      await this.handleCriticalEvent(entry)
    }
  }

  /**
   * Persist audit log to database
   */
  private async persistToDatabase(entry: AuditLogEntry): Promise<void> {
    const { error } = await supabaseAdmin
      .from('audit_logs')
      .insert({
        id: entry.id,
        timestamp: entry.timestamp,
        correlation_id: entry.correlationId,
        action: entry.action,
        category: entry.category,
        severity: entry.severity,
        user_id: entry.userId,
        session_id: entry.sessionId,
        ip_address: entry.ipAddress,
        user_agent: entry.userAgent,
        resource: entry.resource,
        provider: entry.provider,
        file_ids: entry.fileIds,
        bytes_processed: entry.bytesProcessed,
        duration: entry.duration,
        error_class: entry.errorClass,
        success: entry.success,
        details: entry.details,
        performance_metrics: entry.performanceMetrics
      })

    if (error) {
      throw new Error(`Database audit log insertion failed: ${error.message}`)
    }
  }

  /**
   * Handle critical audit events
   */
  private async handleCriticalEvent(entry: AuditLogEntry): Promise<void> {
    // Log critical event with high visibility
    logger.error('CRITICAL AUDIT EVENT', {
      correlationId: entry.correlationId,
      action: entry.action,
      userId: entry.userId,
      resource: entry.resource,
      details: entry.details
    })

    // In production, you might want to:
    // - Send alerts to monitoring systems
    // - Notify security team
    // - Trigger automated responses
  }

  /**
   * Get appropriate log level for severity
   */
  private getLogLevel(severity: AuditSeverity): 'debug' | 'info' | 'warn' | 'error' {
    switch (severity) {
      case 'low': return 'info'
      case 'medium': return 'info'
      case 'high': return 'warn'
      case 'critical': return 'error'
      default: return 'info'
    }
  }

  /**
   * Query audit logs with filtering
   */
  async query(filter: AuditLogFilter = {}): Promise<AuditLogEntry[]> {
    try {
      let query = supabaseAdmin
        .from('audit_logs')
        .select('*')

      if (filter.userId) {
        query = query.eq('user_id', filter.userId)
      }

      if (filter.correlationId) {
        query = query.eq('correlation_id', filter.correlationId)
      }

      if (filter.action) {
        query = query.eq('action', filter.action)
      }

      if (filter.category) {
        query = query.eq('category', filter.category)
      }

      if (filter.severity) {
        query = query.eq('severity', filter.severity)
      }

      if (filter.provider) {
        query = query.eq('provider', filter.provider)
      }

      if (filter.success !== undefined) {
        query = query.eq('success', filter.success)
      }

      if (filter.startDate) {
        query = query.gte('timestamp', filter.startDate)
      }

      if (filter.endDate) {
        query = query.lte('timestamp', filter.endDate)
      }

      query = query
        .order('timestamp', { ascending: false })
        .range(filter.offset || 0, (filter.offset || 0) + (filter.limit || 100) - 1)

      const { data, error } = await query

      if (error) {
        throw new Error(`Audit log query failed: ${error.message}`)
      }

      return (data || []).map(this.mapDatabaseRowToEntry)
    } catch (error) {
      logger.error('Failed to query audit logs from database', {
        filter,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      // Fallback to memory logs
      return this.queryMemoryLogs(filter)
    }
  }

  /**
   * Query memory logs as fallback
   */
  private queryMemoryLogs(filter: AuditLogFilter): AuditLogEntry[] {
    let filtered = [...this.memoryLogs]

    if (filter.userId) {
      filtered = filtered.filter(log => log.userId === filter.userId)
    }

    if (filter.correlationId) {
      filtered = filtered.filter(log => log.correlationId === filter.correlationId)
    }

    if (filter.action) {
      filtered = filtered.filter(log => log.action === filter.action)
    }

    if (filter.category) {
      filtered = filtered.filter(log => log.category === filter.category)
    }

    if (filter.severity) {
      filtered = filtered.filter(log => log.severity === filter.severity)
    }

    if (filter.provider) {
      filtered = filtered.filter(log => log.provider === filter.provider)
    }

    if (filter.success !== undefined) {
      filtered = filtered.filter(log => log.success === filter.success)
    }

    if (filter.startDate) {
      filtered = filtered.filter(log => log.timestamp >= filter.startDate!)
    }

    if (filter.endDate) {
      filtered = filtered.filter(log => log.timestamp <= filter.endDate!)
    }

    // Sort by timestamp (newest first)
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    // Apply pagination
    const offset = filter.offset || 0
    const limit = filter.limit || 100
    
    return filtered.slice(offset, offset + limit)
  }

  /**
   * Map database row to AuditLogEntry
   */
  private mapDatabaseRowToEntry(row: any): AuditLogEntry {
    return {
      id: row.id,
      timestamp: row.timestamp,
      correlationId: row.correlation_id,
      action: row.action,
      category: row.category,
      severity: row.severity,
      userId: row.user_id,
      sessionId: row.session_id,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      resource: row.resource,
      provider: row.provider,
      fileIds: row.file_ids,
      bytesProcessed: row.bytes_processed,
      duration: row.duration,
      errorClass: row.error_class,
      success: row.success,
      details: row.details,
      performanceMetrics: row.performance_metrics
    }
  }

  /**
   * Get comprehensive audit statistics
   */
  async getStats(timeRange?: { start: string; end: string }): Promise<AuditStats> {
    try {
      let query = supabaseAdmin
        .from('audit_logs')
        .select('*')

      if (timeRange) {
        query = query
          .gte('timestamp', timeRange.start)
          .lte('timestamp', timeRange.end)
      }

      const { data, error } = await query

      if (error) {
        throw new Error(`Audit stats query failed: ${error.message}`)
      }

      const logs = (data || []).map(this.mapDatabaseRowToEntry)
      return this.calculateStats(logs)
    } catch (error) {
      logger.error('Failed to get audit stats from database', {
        timeRange,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      // Fallback to memory logs
      return this.calculateStats(this.memoryLogs)
    }
  }

  /**
   * Calculate statistics from audit logs
   */
  private calculateStats(logs: AuditLogEntry[]): AuditStats {
    const logsByAction = {} as Record<AuditAction, number>
    const logsBySeverity = {} as Record<AuditSeverity, number>
    const logsByCategory = {} as Record<AuditCategory, number>
    const errorCounts = {} as Record<string, number>
    const responseTimes: number[] = []
    const slowOperations: Array<{ action: string; duration: number }> = []

    let errorCount = 0
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    let recentErrors = 0

    for (const log of logs) {
      // Count by action
      logsByAction[log.action] = (logsByAction[log.action] || 0) + 1
      
      // Count by severity
      logsBySeverity[log.severity] = (logsBySeverity[log.severity] || 0) + 1
      
      // Count by category
      logsByCategory[log.category] = (logsByCategory[log.category] || 0) + 1
      
      // Count errors
      if (!log.success) {
        errorCount++
        
        if (log.errorClass) {
          errorCounts[log.errorClass] = (errorCounts[log.errorClass] || 0) + 1
        }
        
        if (new Date(log.timestamp) > oneHourAgo) {
          recentErrors++
        }
      }
      
      // Collect performance metrics
      if (log.performanceMetrics?.responseTime) {
        responseTimes.push(log.performanceMetrics.responseTime)
      }
      
      if (log.duration && log.duration > 1000) {
        slowOperations.push({
          action: log.action,
          duration: log.duration
        })
      }
    }

    // Calculate error rate
    const errorRate = logs.length > 0 ? (errorCount / logs.length) * 100 : 0

    // Calculate average response time
    const averageResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
      : 0

    // Calculate P95 response time
    const sortedTimes = responseTimes.sort((a, b) => a - b)
    const p95Index = Math.floor(sortedTimes.length * 0.95)
    const p95ResponseTime = sortedTimes[p95Index] || 0

    // Get top errors
    const topErrors = Object.entries(errorCounts)
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // Get slowest operations
    const slowestOperations = slowOperations
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10)

    return {
      totalLogs: logs.length,
      logsByAction,
      logsBySeverity,
      logsByCategory,
      errorRate,
      averageResponseTime,
      recentErrors,
      topErrors,
      performanceMetrics: {
        averageResponseTime,
        p95ResponseTime,
        slowestOperations
      }
    }
  }

  /**
   * Clear memory logs (for testing)
   */
  clearMemoryLogs(): void {
    this.memoryLogs = []
  }
}

// Singleton instance
export const auditLogger = ComprehensiveAuditLogger.getInstance()

// Utility functions for common audit scenarios
export async function auditUserAction(
  action: AuditAction,
  userId: string,
  success: boolean,
  correlationId: string,
  details?: Record<string, unknown>,
  severity: AuditSeverity = 'low'
): Promise<void> {
  await auditLogger.log(action, 'authentication', severity, success, {
    correlationId,
    userId,
    details
  })
}

export async function auditApiAccess(
  endpoint: string,
  userId: string | undefined,
  success: boolean,
  correlationId: string,
  duration?: number,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await auditLogger.log('api.access', 'data_access', 'low', success, {
    correlationId,
    userId,
    resource: endpoint,
    duration,
    ipAddress,
    userAgent,
    performanceMetrics: duration ? { responseTime: duration } : undefined
  })
}

export async function auditFileOperation(
  operation: 'upload' | 'download' | 'delete' | 'share' | 'import' | 'process',
  fileIds: string[],
  userId: string,
  success: boolean,
  correlationId: string,
  provider?: 'google_drive' | 'microsoft',
  bytesProcessed?: number,
  duration?: number,
  errorClass?: string,
  details?: Record<string, unknown>
): Promise<void> {
  const actionMap = {
    upload: 'file.upload' as const,
    download: 'file.download' as const,
    delete: 'file.delete' as const,
    share: 'file.share' as const,
    import: 'file.import' as const,
    process: 'file.process' as const
  }

  await auditLogger.log(
    actionMap[operation], 
    'data_modification', 
    'medium', 
    success, 
    {
      correlationId,
      userId,
      fileIds,
      provider,
      bytesProcessed,
      duration,
      errorClass,
      details,
      performanceMetrics: duration ? { responseTime: duration } : undefined
    }
  )
}

export async function auditOAuthOperation(
  operation: 'connect' | 'disconnect' | 'token_refresh',
  provider: 'google_drive' | 'microsoft',
  userId: string,
  success: boolean,
  correlationId: string,
  errorClass?: string,
  details?: Record<string, unknown>
): Promise<void> {
  const actionMap = {
    connect: 'oauth.connect' as const,
    disconnect: 'oauth.disconnect' as const,
    token_refresh: 'oauth.token_refresh' as const
  }

  await auditLogger.log(
    actionMap[operation],
    'authentication',
    'medium',
    success,
    {
      correlationId,
      userId,
      provider,
      errorClass,
      details
    }
  )
}

export async function auditStorageOperation(
  operation: 'list' | 'batch_import',
  provider: 'google_drive' | 'microsoft',
  userId: string,
  success: boolean,
  correlationId: string,
  fileIds?: string[],
  bytesProcessed?: number,
  duration?: number,
  errorClass?: string,
  details?: Record<string, unknown>
): Promise<void> {
  const actionMap = {
    list: 'storage.list' as const,
    batch_import: 'storage.batch_import' as const
  }

  await auditLogger.log(
    actionMap[operation],
    'data_access',
    'low',
    success,
    {
      correlationId,
      userId,
      provider,
      fileIds,
      bytesProcessed,
      duration,
      errorClass,
      details,
      performanceMetrics: duration ? { responseTime: duration } : undefined
    }
  )
}

export async function auditJobOperation(
  operation: 'created' | 'completed' | 'failed',
  jobId: string,
  userId: string,
  correlationId: string,
  provider?: 'google_drive' | 'microsoft',
  fileIds?: string[],
  bytesProcessed?: number,
  duration?: number,
  errorClass?: string,
  details?: Record<string, unknown>
): Promise<void> {
  const actionMap = {
    created: 'job.created' as const,
    completed: 'job.completed' as const,
    failed: 'job.failed' as const
  }

  const success = operation !== 'failed'

  await auditLogger.log(
    actionMap[operation],
    'system_operation',
    operation === 'failed' ? 'high' : 'low',
    success,
    {
      correlationId,
      userId,
      resource: jobId,
      provider,
      fileIds,
      bytesProcessed,
      duration,
      errorClass,
      details,
      performanceMetrics: duration ? { responseTime: duration } : undefined
    }
  )
}

export async function auditSecurityEvent(
  action: AuditAction,
  severity: AuditSeverity,
  correlationId: string,
  details: Record<string, unknown>,
  userId?: string,
  ipAddress?: string
): Promise<void> {
  await auditLogger.log(action, 'security_event', severity, false, {
    correlationId,
    userId,
    ipAddress,
    details
  })
}

export async function auditSystemError(
  errorClass: string,
  correlationId: string,
  duration?: number,
  userId?: string,
  resource?: string,
  details?: Record<string, unknown>
): Promise<void> {
  await auditLogger.log('system.error', 'error', 'high', false, {
    correlationId,
    userId,
    resource,
    errorClass,
    duration,
    details,
    performanceMetrics: duration ? { responseTime: duration } : undefined
  })
}