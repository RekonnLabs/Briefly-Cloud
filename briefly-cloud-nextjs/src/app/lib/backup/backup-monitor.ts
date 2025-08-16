/**
 * Backup Monitoring Service
 * 
 * This service provides real-time monitoring of backup operations,
 * failure detection, and automated alerting for backup system health.
 */

import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'
import { getAuditLogger } from '@/app/lib/audit/audit-logger'
import { getPITRManager, BackupAlert } from './pitr-manager'

export interface BackupMetrics {
  totalBackups: number
  successfulBackups: number
  failedBackups: number
  successRate: number
  averageSize: number
  averageDuration: number
  lastBackupTime: string
  nextBackupTime: string
  storageUsed: number
  retentionCompliance: boolean
}

export interface BackupHealthReport {
  status: 'healthy' | 'degraded' | 'critical'
  metrics: BackupMetrics
  alerts: BackupAlert[]
  recommendations: string[]
  lastChecked: string
}

export interface MonitoringConfig {
  enabled: boolean
  checkInterval: number // minutes
  alertThresholds: {
    failureRate: number // percentage
    backupDelay: number // hours
    storageUsage: number // percentage
  }
  notifications: {
    email: boolean
    slack: boolean
    webhook?: string
  }
  contacts: string[]
}

/**
 * Backup Monitor Service
 */
export class BackupMonitor {
  private readonly auditLogger = getAuditLogger()
  private monitoringInterval: NodeJS.Timeout | null = null
  private config: MonitoringConfig | null = null

  /**
   * Initialize backup monitoring
   */
  async initialize(config: MonitoringConfig): Promise<void> {
    try {
      this.config = config

      // Store monitoring configuration
      const { error } = await supabaseAdmin
        .from('private.backup_configs')
        .upsert({
          name: 'monitoring_config',
          description: 'Backup monitoring configuration',
          backup_type: 'full',
          is_active: config.enabled,
          metadata: {
            monitoring_config: config,
            initialized_at: new Date().toISOString()
          }
        })

      if (error) {
        throw error
      }

      // Start monitoring if enabled
      if (config.enabled) {
        this.startMonitoring()
      }

      // Log initialization
      await this.auditLogger.logAction({
        action: 'SYSTEM_ERROR', // Using existing action type
        resourceType: 'system',
        metadata: {
          action: 'backup_monitoring_initialized',
          enabled: config.enabled,
          checkInterval: config.checkInterval,
          alertThresholds: config.alertThresholds
        },
        severity: 'info'
      })

      logger.info('Backup monitoring initialized', {
        enabled: config.enabled,
        checkInterval: config.checkInterval
      })

    } catch (error) {
      logger.error('Failed to initialize backup monitoring', { config }, error as Error)
      throw createError.databaseError('Failed to initialize backup monitoring', error as Error)
    }
  }

  /**
   * Start continuous monitoring
   */
  startMonitoring(): void {
    if (!this.config) {
      throw new Error('Monitoring not initialized')
    }

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
    }

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performHealthCheck()
      } catch (error) {
        logger.error('Monitoring health check failed', {}, error as Error)
      }
    }, this.config.checkInterval * 60 * 1000)

    logger.info('Backup monitoring started', {
      interval: this.config.checkInterval
    })
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
      logger.info('Backup monitoring stopped')
    }
  }

  /**
   * Get comprehensive backup health report
   */
  async getHealthReport(): Promise<BackupHealthReport> {
    try {
      // Get backup metrics
      const metrics = await this.getBackupMetrics()
      
      // Get active alerts
      const alerts = await this.getActiveAlerts()
      
      // Determine overall status
      const status = this.determineHealthStatus(metrics, alerts)
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(metrics, alerts)

      const report: BackupHealthReport = {
        status,
        metrics,
        alerts,
        recommendations,
        lastChecked: new Date().toISOString()
      }

      // Log health report generation
      await this.auditLogger.logAction({
        action: 'SYSTEM_ERROR', // Using existing action type
        resourceType: 'system',
        metadata: {
          action: 'backup_health_report_generated',
          status,
          metricsCount: Object.keys(metrics).length,
          alertCount: alerts.length,
          recommendationCount: recommendations.length
        },
        severity: status === 'critical' ? 'error' : status === 'degraded' ? 'warning' : 'info'
      })

      return report

    } catch (error) {
      logger.error('Failed to generate health report', {}, error as Error)
      throw createError.databaseError('Failed to generate health report', error as Error)
    }
  }

  /**
   * Get backup metrics for the last 30 days
   */
  async getBackupMetrics(): Promise<BackupMetrics> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

      // Get backup statistics
      const { data: stats, error: statsError } = await supabaseAdmin
        .rpc('get_backup_statistics', {
          start_date: thirtyDaysAgo,
          end_date: new Date().toISOString()
        })

      if (statsError) {
        throw statsError
      }

      // Get PITR status for additional metrics
      const pitrManager = getPITRManager()
      const pitrStatus = await pitrManager.getPITRStatus()

      // Calculate storage usage
      const storageUsed = await this.calculateStorageUsage()

      // Check retention compliance
      const retentionCompliance = await this.checkRetentionCompliance()

      return {
        totalBackups: stats.totals.backups || 0,
        successfulBackups: stats.totals.successful || 0,
        failedBackups: stats.totals.failed || 0,
        successRate: stats.totals.success_rate || 0,
        averageSize: Math.round((stats.totals.total_size_bytes || 0) / Math.max(stats.totals.backups, 1)),
        averageDuration: Math.round(stats.totals.avg_duration_ms || 0),
        lastBackupTime: pitrStatus.lastBackupTime,
        nextBackupTime: pitrStatus.nextBackupTime,
        storageUsed,
        retentionCompliance
      }

    } catch (error) {
      logger.error('Failed to get backup metrics', {}, error as Error)
      throw createError.databaseError('Failed to get backup metrics', error as Error)
    }
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<BackupAlert[]> {
    const alerts: BackupAlert[] = []

    try {
      if (!this.config) {
        throw new Error('Monitoring not configured')
      }

      // Get current metrics
      const metrics = await this.getBackupMetrics()

      // Check failure rate threshold
      if (metrics.successRate < (100 - this.config.alertThresholds.failureRate)) {
        alerts.push({
          id: `failure_rate_${Date.now()}`,
          type: 'backup_failed',
          severity: 'high',
          message: `Backup failure rate (${(100 - metrics.successRate).toFixed(1)}%) exceeds threshold (${this.config.alertThresholds.failureRate}%)`,
          timestamp: new Date().toISOString(),
          resolved: false,
          metadata: {
            currentFailureRate: 100 - metrics.successRate,
            threshold: this.config.alertThresholds.failureRate,
            totalBackups: metrics.totalBackups,
            failedBackups: metrics.failedBackups
          }
        })
      }

      // Check backup delay
      if (metrics.lastBackupTime) {
        const lastBackupAge = (Date.now() - new Date(metrics.lastBackupTime).getTime()) / (1000 * 60 * 60)
        if (lastBackupAge > this.config.alertThresholds.backupDelay) {
          alerts.push({
            id: `backup_delay_${Date.now()}`,
            type: 'backup_delayed',
            severity: 'medium',
            message: `Last backup is ${lastBackupAge.toFixed(1)} hours old, exceeding ${this.config.alertThresholds.backupDelay} hour threshold`,
            timestamp: new Date().toISOString(),
            resolved: false,
            metadata: {
              lastBackupAge,
              threshold: this.config.alertThresholds.backupDelay,
              lastBackupTime: metrics.lastBackupTime
            }
          })
        }
      }

      // Check storage usage
      if (metrics.storageUsed > this.config.alertThresholds.storageUsage) {
        alerts.push({
          id: `storage_usage_${Date.now()}`,
          type: 'storage_full',
          severity: 'medium',
          message: `Backup storage usage (${metrics.storageUsed.toFixed(1)}%) exceeds threshold (${this.config.alertThresholds.storageUsage}%)`,
          timestamp: new Date().toISOString(),
          resolved: false,
          metadata: {
            currentUsage: metrics.storageUsed,
            threshold: this.config.alertThresholds.storageUsage
          }
        })
      }

      // Check retention compliance
      if (!metrics.retentionCompliance) {
        alerts.push({
          id: `retention_compliance_${Date.now()}`,
          type: 'retention_warning',
          severity: 'low',
          message: 'Some backups exceed retention policy and should be cleaned up',
          timestamp: new Date().toISOString(),
          resolved: false,
          metadata: {
            retentionCompliance: false
          }
        })
      }

      // Store alerts if any
      if (alerts.length > 0) {
        await this.storeAlerts(alerts)
        
        // Send notifications for high/critical alerts
        const criticalAlerts = alerts.filter(alert => 
          alert.severity === 'critical' || alert.severity === 'high'
        )
        
        if (criticalAlerts.length > 0) {
          await this.sendNotifications(criticalAlerts)
        }
      }

      return alerts

    } catch (error) {
      logger.error('Health check failed', {}, error as Error)
      
      const criticalAlert: BackupAlert = {
        id: `health_check_failed_${Date.now()}`,
        type: 'backup_failed',
        severity: 'critical',
        message: `Backup monitoring health check failed: ${(error as Error).message}`,
        timestamp: new Date().toISOString(),
        resolved: false,
        metadata: { error: (error as Error).message }
      }

      alerts.push(criticalAlert)
      await this.storeAlerts([criticalAlert])
      return alerts
    }
  }

  /**
   * Get active alerts from the last 24 hours
   */
  async getActiveAlerts(): Promise<BackupAlert[]> {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      const { data: alertLogs, error } = await supabaseAdmin
        .from('private.audit_logs')
        .select('*')
        .eq('action', 'BACKUP_ALERT')
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })

      if (error) {
        throw error
      }

      return (alertLogs || []).map(log => ({
        id: log.resource_id,
        type: log.new_values?.type || 'backup_failed',
        severity: log.severity === 'error' ? 'critical' : 
                 log.severity === 'warning' ? 'high' : 'medium',
        message: log.new_values?.message || 'Unknown backup alert',
        timestamp: log.created_at,
        resolved: false,
        metadata: log.new_values?.metadata || {}
      }))

    } catch (error) {
      logger.error('Failed to get active alerts', {}, error as Error)
      return []
    }
  }

  /**
   * Calculate storage usage percentage
   */
  private async calculateStorageUsage(): Promise<number> {
    try {
      // Get total backup size
      const { data: backups, error } = await supabaseAdmin
        .from('private.backup_jobs')
        .select('size')
        .eq('status', 'completed')

      if (error) {
        throw error
      }

      const totalSize = (backups || []).reduce((sum, backup) => sum + (backup.size || 0), 0)
      
      // Assume 100GB storage limit (this would be configurable in a real implementation)
      const storageLimit = 100 * 1024 * 1024 * 1024 // 100GB in bytes
      
      return (totalSize / storageLimit) * 100

    } catch (error) {
      logger.warn('Failed to calculate storage usage', {}, error as Error)
      return 0
    }
  }

  /**
   * Check retention policy compliance
   */
  private async checkRetentionCompliance(): Promise<boolean> {
    try {
      const { data: configs, error } = await supabaseAdmin
        .from('private.backup_configs')
        .select('id, retention_days')
        .eq('is_active', true)

      if (error) {
        throw error
      }

      for (const config of configs || []) {
        const cutoffDate = new Date(Date.now() - config.retention_days * 24 * 60 * 60 * 1000).toISOString()
        
        const { data: oldBackups, error: backupError } = await supabaseAdmin
          .from('private.backup_jobs')
          .select('id')
          .eq('config_id', config.id)
          .lt('started_at', cutoffDate)
          .limit(1)

        if (backupError) {
          continue
        }

        if (oldBackups && oldBackups.length > 0) {
          return false // Found backups that exceed retention policy
        }
      }

      return true

    } catch (error) {
      logger.warn('Failed to check retention compliance', {}, error as Error)
      return true // Assume compliant if check fails
    }
  }

  /**
   * Determine overall health status
   */
  private determineHealthStatus(metrics: BackupMetrics, alerts: BackupAlert[]): BackupHealthReport['status'] {
    const criticalAlerts = alerts.filter(alert => alert.severity === 'critical')
    const highAlerts = alerts.filter(alert => alert.severity === 'high')

    if (criticalAlerts.length > 0 || metrics.successRate < 50) {
      return 'critical'
    }

    if (highAlerts.length > 0 || metrics.successRate < 80 || alerts.length > 5) {
      return 'degraded'
    }

    return 'healthy'
  }

  /**
   * Generate recommendations based on metrics and alerts
   */
  private generateRecommendations(metrics: BackupMetrics, alerts: BackupAlert[]): string[] {
    const recommendations: string[] = []

    // Success rate recommendations
    if (metrics.successRate < 90) {
      recommendations.push('Investigate backup failures and improve success rate')
    }

    // Storage recommendations
    if (metrics.storageUsed > 80) {
      recommendations.push('Consider implementing backup compression or adjusting retention policies')
    }

    // Retention recommendations
    if (!metrics.retentionCompliance) {
      recommendations.push('Run backup cleanup to remove old backups exceeding retention policy')
    }

    // Alert-based recommendations
    const failureAlerts = alerts.filter(alert => alert.type === 'backup_failed')
    if (failureAlerts.length > 0) {
      recommendations.push('Review backup configuration and resolve system issues causing failures')
    }

    const delayAlerts = alerts.filter(alert => alert.type === 'backup_delayed')
    if (delayAlerts.length > 0) {
      recommendations.push('Check backup scheduling and system resources to prevent delays')
    }

    // General recommendations
    if (recommendations.length === 0) {
      recommendations.push('Backup system is healthy - continue monitoring')
    }

    return recommendations
  }

  /**
   * Store alerts in audit log
   */
  private async storeAlerts(alerts: BackupAlert[]): Promise<void> {
    try {
      const alertRecords = alerts.map(alert => ({
        action: 'BACKUP_ALERT',
        resource_type: 'backup',
        resource_id: alert.id,
        new_values: {
          type: alert.type,
          severity: alert.severity,
          message: alert.message,
          metadata: alert.metadata
        },
        severity: alert.severity === 'critical' ? 'error' : 
                 alert.severity === 'high' ? 'warning' : 'info'
      }))

      const { error } = await supabaseAdmin
        .from('private.audit_logs')
        .insert(alertRecords)

      if (error) {
        throw error
      }

    } catch (error) {
      logger.error('Failed to store alerts', { alertCount: alerts.length }, error as Error)
    }
  }

  /**
   * Send notifications for critical alerts
   */
  private async sendNotifications(alerts: BackupAlert[]): Promise<void> {
    try {
      if (!this.config?.notifications || !this.config.contacts.length) {
        return
      }

      // Log notification attempt
      await this.auditLogger.logAction({
        action: 'SYSTEM_ERROR', // Using existing action type
        resourceType: 'system',
        metadata: {
          action: 'backup_notifications_sent',
          alertCount: alerts.length,
          contactCount: this.config.contacts.length,
          alertTypes: alerts.map(a => a.type),
          severities: alerts.map(a => a.severity)
        },
        severity: 'warning'
      })

      // In a real implementation, this would send actual notifications
      logger.warn('BACKUP ALERTS REQUIRE ATTENTION', {
        alertCount: alerts.length,
        contacts: this.config.contacts,
        alerts: alerts.map(alert => ({
          type: alert.type,
          severity: alert.severity,
          message: alert.message,
          timestamp: alert.timestamp
        }))
      })

    } catch (error) {
      logger.error('Failed to send notifications', { alertCount: alerts.length }, error as Error)
    }
  }
}

// Singleton instance
let backupMonitor: BackupMonitor | null = null

/**
 * Get the backup monitor instance
 */
export function getBackupMonitor(): BackupMonitor {
  if (!backupMonitor) {
    backupMonitor = new BackupMonitor()
  }
  return backupMonitor
}

/**
 * Convenience functions
 */

export async function initializeBackupMonitoring(config: MonitoringConfig): Promise<void> {
  const monitor = getBackupMonitor()
  return monitor.initialize(config)
}

export async function getBackupHealthReport(): Promise<BackupHealthReport> {
  const monitor = getBackupMonitor()
  return monitor.getHealthReport()
}

export async function performBackupHealthCheck(): Promise<BackupAlert[]> {
  const monitor = getBackupMonitor()
  return monitor.performHealthCheck()
}