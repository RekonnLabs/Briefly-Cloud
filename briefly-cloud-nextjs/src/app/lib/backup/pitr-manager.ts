/**
 * Point-in-Time Recovery (PITR) Manager
 * 
 * This service manages Supabase PITR configuration and provides
 * automated backup scheduling with monitoring and alerting.
 */

import { supabaseAdmin } from '@/app/lib/supabase'
import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'
import { getAuditLogger } from '@/app/lib/audit/audit-logger'

export interface PITRConfig {
  enabled: boolean
  retentionDays: number
  backupWindow: string // UTC time window for backups
  alertingEnabled: boolean
  alertContacts: string[]
  monitoringInterval: number // minutes
}

export interface BackupStatus {
  lastBackupTime: string
  nextBackupTime: string
  backupSize: number
  status: 'healthy' | 'warning' | 'error'
  issues: string[]
  retentionPeriod: number
}

export interface BackupAlert {
  id: string
  type: 'backup_failed' | 'backup_delayed' | 'retention_warning' | 'storage_full'
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  timestamp: string
  resolved: boolean
  metadata: Record<string, any>
}

/**
 * PITR Manager Service
 */
export class PITRManager {
  private readonly auditLogger = getAuditLogger()
  private monitoringInterval: NodeJS.Timeout | null = null

  /**
   * Enable PITR with configuration
   */
  async enablePITR(config: PITRConfig, userId?: string): Promise<void> {
    try {
      // Store PITR configuration
      const { error: configError } = await supabaseAdmin
        .from('private.backup_configs')
        .upsert({
          name: 'pitr_config',
          description: 'Point-in-Time Recovery Configuration',
          backup_type: 'full',
          schedule_cron: this.convertBackupWindowToCron(config.backupWindow),
          retention_days: config.retentionDays,
          retention_max_count: 50, // Keep more backups for PITR
          compression_enabled: true,
          encryption_enabled: true,
          include_storage: false,
          is_active: config.enabled,
          metadata: {
            pitr_enabled: config.enabled,
            backup_window: config.backupWindow,
            alerting_enabled: config.alertingEnabled,
            alert_contacts: config.alertContacts,
            monitoring_interval: config.monitoringInterval
          }
        })

      if (configError) {
        throw configError
      }

      // Log PITR configuration
      await this.auditLogger.logAction({
        userId,
        action: 'SYSTEM_ERROR', // Using existing action type
        resourceType: 'system',
        metadata: {
          action: 'pitr_configured',
          enabled: config.enabled,
          retentionDays: config.retentionDays,
          backupWindow: config.backupWindow,
          alertingEnabled: config.alertingEnabled
        },
        severity: 'info'
      })

      // Start monitoring if enabled
      if (config.enabled && config.alertingEnabled) {
        this.startMonitoring(config.monitoringInterval)
      }

      logger.info('PITR configuration updated', {
        enabled: config.enabled,
        retentionDays: config.retentionDays,
        backupWindow: config.backupWindow
      })

    } catch (error) {
      logger.error('Failed to configure PITR', { config }, error as Error)
      throw createError.databaseError('Failed to configure PITR', error as Error)
    }
  }

  /**
   * Get current PITR status
   */
  async getPITRStatus(): Promise<BackupStatus> {
    try {
      // Get PITR configuration
      const { data: config, error: configError } = await supabaseAdmin
        .from('private.backup_configs')
        .select('*')
        .eq('name', 'pitr_config')
        .single()

      if (configError && configError.code !== 'PGRST116') {
        throw configError
      }

      if (!config) {
        return {
          lastBackupTime: '',
          nextBackupTime: '',
          backupSize: 0,
          status: 'error',
          issues: ['PITR not configured'],
          retentionPeriod: 0
        }
      }

      // Get latest backup job
      const { data: latestBackup, error: backupError } = await supabaseAdmin
        .from('private.backup_jobs')
        .select('*')
        .eq('config_id', config.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .single()

      if (backupError && backupError.code !== 'PGRST116') {
        throw backupError
      }

      const issues: string[] = []
      let status: BackupStatus['status'] = 'healthy'

      // Check backup health
      if (!latestBackup) {
        issues.push('No backups found')
        status = 'error'
      } else {
        // Check if backup is recent (within 25 hours for daily backups)
        const backupAge = Date.now() - new Date(latestBackup.started_at).getTime()
        const maxAge = 25 * 60 * 60 * 1000 // 25 hours in milliseconds

        if (backupAge > maxAge) {
          issues.push('Backup is overdue')
          status = 'warning'
        }

        if (latestBackup.status === 'failed') {
          issues.push('Latest backup failed')
          status = 'error'
        }
      }

      // Calculate next backup time
      const nextBackupTime = this.calculateNextBackupTime(config.schedule_cron)

      return {
        lastBackupTime: latestBackup?.started_at || '',
        nextBackupTime,
        backupSize: latestBackup?.size || 0,
        status,
        issues,
        retentionPeriod: config.retention_days
      }

    } catch (error) {
      logger.error('Failed to get PITR status', {}, error as Error)
      throw createError.databaseError('Failed to get PITR status', error as Error)
    }
  }

  /**
   * Create daily backup configuration
   */
  async createDailyBackupConfig(
    retentionDays: number = 30,
    backupWindow: string = '02:00'
  ): Promise<string> {
    try {
      const cronExpression = this.convertBackupWindowToCron(backupWindow)

      const { data: config, error } = await supabaseAdmin
        .from('private.backup_configs')
        .insert({
          name: 'daily_automated_backup',
          description: 'Automated daily backup for disaster recovery',
          backup_type: 'full',
          schedule_cron: cronExpression,
          retention_days: retentionDays,
          retention_max_count: Math.max(retentionDays, 30),
          compression_enabled: true,
          encryption_enabled: true,
          include_storage: true,
          is_active: true
        })
        .select('id')
        .single()

      if (error) {
        throw error
      }

      logger.info('Daily backup configuration created', {
        configId: config.id,
        retentionDays,
        backupWindow,
        cronExpression
      })

      return config.id

    } catch (error) {
      logger.error('Failed to create daily backup config', { retentionDays, backupWindow }, error as Error)
      throw createError.databaseError('Failed to create daily backup config', error as Error)
    }
  }

  /**
   * Start backup monitoring
   */
  startMonitoring(intervalMinutes: number = 60): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
    }

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performHealthCheck()
      } catch (error) {
        logger.error('Backup monitoring health check failed', {}, error as Error)
      }
    }, intervalMinutes * 60 * 1000)

    logger.info('Backup monitoring started', { intervalMinutes })
  }

  /**
   * Stop backup monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
      logger.info('Backup monitoring stopped')
    }
  }

  /**
   * Perform backup health check
   */
  async performHealthCheck(): Promise<BackupAlert[]> {
    const alerts: BackupAlert[] = []

    try {
      // Check backup status
      const status = await this.getPITRStatus()

      // Generate alerts based on status
      if (status.status === 'error') {
        for (const issue of status.issues) {
          alerts.push({
            id: `backup_error_${Date.now()}`,
            type: 'backup_failed',
            severity: 'critical',
            message: `Backup system error: ${issue}`,
            timestamp: new Date().toISOString(),
            resolved: false,
            metadata: { issue, status }
          })
        }
      } else if (status.status === 'warning') {
        for (const issue of status.issues) {
          alerts.push({
            id: `backup_warning_${Date.now()}`,
            type: 'backup_delayed',
            severity: 'medium',
            message: `Backup system warning: ${issue}`,
            timestamp: new Date().toISOString(),
            resolved: false,
            metadata: { issue, status }
          })
        }
      }

      // Check retention policy compliance
      const retentionAlert = await this.checkRetentionCompliance()
      if (retentionAlert) {
        alerts.push(retentionAlert)
      }

      // Store alerts in database
      if (alerts.length > 0) {
        await this.storeAlerts(alerts)
        await this.sendAlertNotifications(alerts)
      }

      return alerts

    } catch (error) {
      logger.error('Health check failed', {}, error as Error)
      
      const criticalAlert: BackupAlert = {
        id: `health_check_failed_${Date.now()}`,
        type: 'backup_failed',
        severity: 'critical',
        message: `Backup health check failed: ${(error as Error).message}`,
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
   * Verify backup integrity
   */
  async verifyBackupIntegrity(backupId?: string): Promise<{
    isValid: boolean
    checks: {
      checksum: boolean
      completeness: boolean
      restoration: boolean
    }
    issues: string[]
  }> {
    try {
      let targetBackup = backupId

      // If no backup ID provided, use latest backup
      if (!targetBackup) {
        const { data: latestBackup, error } = await supabaseAdmin
          .from('private.backup_jobs')
          .select('id')
          .eq('status', 'completed')
          .order('started_at', { ascending: false })
          .limit(1)
          .single()

        if (error || !latestBackup) {
          throw new Error('No completed backups found')
        }

        targetBackup = latestBackup.id
      }

      // Use existing validation function
      const { data: validation, error } = await supabaseAdmin
        .rpc('validate_backup_integrity', { backup_job_id: targetBackup })

      if (error) {
        throw error
      }

      return {
        isValid: validation.is_valid,
        checks: {
          checksum: validation.checks.integrity,
          completeness: validation.checks.completeness,
          restoration: validation.checks.restoration
        },
        issues: validation.issues || []
      }

    } catch (error) {
      logger.error('Backup integrity verification failed', { backupId }, error as Error)
      throw createError.databaseError('Backup integrity verification failed', error as Error)
    }
  }

  /**
   * Convert backup window to cron expression
   */
  private convertBackupWindowToCron(backupWindow: string): string {
    // Parse time format HH:MM
    const [hours, minutes] = backupWindow.split(':').map(Number)
    
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      throw new Error('Invalid backup window format. Use HH:MM format.')
    }

    // Return cron expression for daily execution at specified time
    return `${minutes} ${hours} * * *`
  }

  /**
   * Calculate next backup time based on cron expression
   */
  private calculateNextBackupTime(cronExpression: string): string {
    try {
      // Simple calculation for daily backups (assumes format: "M H * * *")
      const [minutes, hours] = cronExpression.split(' ').map(Number)
      
      const now = new Date()
      const nextBackup = new Date()
      nextBackup.setHours(hours, minutes, 0, 0)
      
      // If time has passed today, schedule for tomorrow
      if (nextBackup <= now) {
        nextBackup.setDate(nextBackup.getDate() + 1)
      }
      
      return nextBackup.toISOString()
    } catch (error) {
      logger.warn('Failed to calculate next backup time', { cronExpression }, error as Error)
      return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // Default to 24 hours from now
    }
  }

  /**
   * Check retention policy compliance
   */
  private async checkRetentionCompliance(): Promise<BackupAlert | null> {
    try {
      const { data: configs, error } = await supabaseAdmin
        .from('private.backup_configs')
        .select('id, name, retention_days')
        .eq('is_active', true)

      if (error) {
        throw error
      }

      for (const config of configs || []) {
        const { data: oldBackups, error: backupError } = await supabaseAdmin
          .from('private.backup_jobs')
          .select('id, started_at')
          .eq('config_id', config.id)
          .lt('started_at', new Date(Date.now() - config.retention_days * 24 * 60 * 60 * 1000).toISOString())

        if (backupError) {
          continue
        }

        if (oldBackups && oldBackups.length > 0) {
          return {
            id: `retention_warning_${Date.now()}`,
            type: 'retention_warning',
            severity: 'medium',
            message: `${oldBackups.length} backups exceed retention policy for config ${config.name}`,
            timestamp: new Date().toISOString(),
            resolved: false,
            metadata: {
              configId: config.id,
              configName: config.name,
              retentionDays: config.retention_days,
              oldBackupCount: oldBackups.length
            }
          }
        }
      }

      return null

    } catch (error) {
      logger.error('Retention compliance check failed', {}, error as Error)
      return null
    }
  }

  /**
   * Store alerts in database
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
      logger.error('Failed to store backup alerts', { alertCount: alerts.length }, error as Error)
    }
  }

  /**
   * Send alert notifications
   */
  private async sendAlertNotifications(alerts: BackupAlert[]): Promise<void> {
    try {
      // Get alert contacts from PITR config
      const { data: config, error } = await supabaseAdmin
        .from('private.backup_configs')
        .select('metadata')
        .eq('name', 'pitr_config')
        .single()

      if (error || !config?.metadata?.alert_contacts) {
        logger.warn('No alert contacts configured for backup notifications')
        return
      }

      const contacts = config.metadata.alert_contacts as string[]
      const criticalAlerts = alerts.filter(alert => alert.severity === 'critical')

      if (criticalAlerts.length > 0) {
        // In a real implementation, this would send emails/SMS/Slack notifications
        logger.error('CRITICAL BACKUP ALERTS', {
          alertCount: criticalAlerts.length,
          contacts,
          alerts: criticalAlerts.map(alert => ({
            type: alert.type,
            message: alert.message,
            timestamp: alert.timestamp
          }))
        })

        // Log notification attempt
        await this.auditLogger.logAction({
          action: 'SYSTEM_ERROR', // Using existing action type
          resourceType: 'system',
          metadata: {
            action: 'backup_alerts_sent',
            alertCount: criticalAlerts.length,
            contacts: contacts.length,
            alertTypes: criticalAlerts.map(a => a.type)
          },
          severity: 'error'
        })
      }

    } catch (error) {
      logger.error('Failed to send alert notifications', { alertCount: alerts.length }, error as Error)
    }
  }
}

// Singleton instance
let pitrManager: PITRManager | null = null

/**
 * Get the PITR manager instance
 */
export function getPITRManager(): PITRManager {
  if (!pitrManager) {
    pitrManager = new PITRManager()
  }
  return pitrManager
}

/**
 * Convenience functions
 */

export async function enablePITR(config: PITRConfig, userId?: string): Promise<void> {
  const manager = getPITRManager()
  return manager.enablePITR(config, userId)
}

export async function getPITRStatus(): Promise<BackupStatus> {
  const manager = getPITRManager()
  return manager.getPITRStatus()
}

export async function createDailyBackupConfig(
  retentionDays?: number,
  backupWindow?: string
): Promise<string> {
  const manager = getPITRManager()
  return manager.createDailyBackupConfig(retentionDays, backupWindow)
}

export async function verifyBackupIntegrity(backupId?: string) {
  const manager = getPITRManager()
  return manager.verifyBackupIntegrity(backupId)
}