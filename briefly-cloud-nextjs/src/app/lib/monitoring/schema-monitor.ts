/**
 * Schema Health and Performance Monitoring Service
 * 
 * Provides continuous monitoring of schema health, performance metrics,
 * and alerting for schema connectivity issues
 */

import { supabaseAppAdmin } from '@/app/lib/auth/supabase-server-admin'
import { handleSchemaError, logSchemaError } from '@/app/lib/errors/schema-errors'
import { alertingService } from './alerting'

export interface SchemaMetrics {
  schema: 'app'
  timestamp: string
  status: 'healthy' | 'degraded' | 'unhealthy'
  responseTime: number
  errorCount: number
  successCount: number
  lastError?: string
  connectionPool?: {
    active: number
    idle: number
    waiting: number
  }
}

export interface PerformanceMetrics {
  timestamp: string
  totalRequests: number
  averageResponseTime: number
  errorRate: number
  schemaMetrics: {
    app: SchemaMetrics
  }
  alerts: Alert[]
}

export interface Alert {
  id: string
  type: 'error_rate' | 'response_time' | 'connectivity' | 'schema_unavailable'
  severity: 'low' | 'medium' | 'high' | 'critical'
  schema: 'app' | 'all'
  message: string
  timestamp: string
  resolved: boolean
  metadata?: Record<string, any>
}

class SchemaMonitor {
  private metrics: Map<string, SchemaMetrics[]> = new Map()
  private alerts: Alert[] = []
  private isMonitoring = false
  private monitoringInterval?: NodeJS.Timeout
  
  // Thresholds for alerting
  private readonly thresholds = {
    responseTime: {
      degraded: 1000, // 1 second
      unhealthy: 3000 // 3 seconds
    },
    errorRate: {
      degraded: 0.05, // 5%
      unhealthy: 0.15 // 15%
    },
    consecutiveFailures: 3
  }

  /**
   * Start continuous monitoring
   */
  startMonitoring(intervalMs: number = 30000): void {
    if (this.isMonitoring) {
      console.log('Schema monitoring already running')
      return
    }

    this.isMonitoring = true
    console.log(`Starting schema monitoring with ${intervalMs}ms interval`)

    // Initial check
    this.collectMetrics()

    // Set up periodic monitoring
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics()
    }, intervalMs)
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = undefined
    }
    this.isMonitoring = false
    console.log('Schema monitoring stopped')
  }

  /**
   * Collect metrics for app schema only
   */
  private async collectMetrics(): Promise<void> {
    const timestamp = new Date().toISOString()
    
    try {
      // Collect metrics for app schema only
      const appMetrics = await this.checkSchemaHealth('app')

      // Store metrics
      this.storeMetrics('app', appMetrics)

      // Check for alerts
      this.checkAlerts(appMetrics)

      console.log(`Schema metrics collected at ${timestamp}`, {
        app: appMetrics.status
      })

    } catch (error) {
      console.error('Failed to collect schema metrics:', error)
      
      // Create critical alert for monitoring failure
      this.createAlert({
        type: 'connectivity',
        severity: 'critical',
        schema: 'all',
        message: `Schema monitoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: { error: error instanceof Error ? error.stack : String(error) }
      })
    }
  }

  /**
   * Check health of app schema using RPC function
   */
  private async checkSchemaHealth(schema: 'app'): Promise<SchemaMetrics> {
    const startTime = Date.now()
    const timestamp = new Date().toISOString()
    
    try {
      // Use RPC health check function for app schema
      const client = supabaseAppAdmin
      const { data, error } = await client.rpc('monitoring_health_check')
      const responseTime = Date.now() - startTime

      if (error) {
        const schemaError = handleSchemaError(error, {
          schema,
          operation: 'monitoring_health_check',
          correlationId: 'schema-monitor'
        })
        logSchemaError(schemaError)

        return {
          schema,
          timestamp,
          status: 'unhealthy',
          responseTime,
          errorCount: 1,
          successCount: 0,
          lastError: schemaError.message
        }
      }

      // Determine status based on response time
      let status: 'healthy' | 'degraded' | 'unhealthy'
      if (responseTime > this.thresholds.responseTime.unhealthy) {
        status = 'unhealthy'
      } else if (responseTime > this.thresholds.responseTime.degraded) {
        status = 'degraded'
      } else {
        status = 'healthy'
      }

      return {
        schema,
        timestamp,
        status,
        responseTime,
        errorCount: 0,
        successCount: 1
      }

    } catch (error) {
      const responseTime = Date.now() - startTime
      const schemaError = handleSchemaError(error, {
        schema,
        operation: 'monitoring_health_check',
        correlationId: 'schema-monitor',
        originalError: error
      })
      logSchemaError(schemaError)

      return {
        schema,
        timestamp,
        status: 'unhealthy',
        responseTime,
        errorCount: 1,
        successCount: 0,
        lastError: schemaError.message
      }
    }
  }

  /**
   * Store metrics for a schema
   */
  private storeMetrics(schema: string, metrics: SchemaMetrics): void {
    if (!this.metrics.has(schema)) {
      this.metrics.set(schema, [])
    }

    const schemaMetrics = this.metrics.get(schema)!
    schemaMetrics.push(metrics)

    // Keep only last 100 metrics per schema (about 50 minutes at 30s intervals)
    if (schemaMetrics.length > 100) {
      schemaMetrics.splice(0, schemaMetrics.length - 100)
    }
  }

  /**
   * Check for alert conditions
   */
  private checkAlerts(appMetrics: SchemaMetrics): void {
    const allMetrics = [appMetrics]

    for (const metrics of allMetrics) {
      // Check for unhealthy status
      if (metrics.status === 'unhealthy') {
        this.createAlert({
          type: 'schema_unavailable',
          severity: 'critical',
          schema: metrics.schema,
          message: `${metrics.schema} schema is unhealthy: ${metrics.lastError || 'Unknown error'}`,
          metadata: { responseTime: metrics.responseTime, lastError: metrics.lastError }
        })
      }

      // Check for high response times
      if (metrics.responseTime > this.thresholds.responseTime.unhealthy) {
        this.createAlert({
          type: 'response_time',
          severity: 'high',
          schema: metrics.schema,
          message: `${metrics.schema} schema response time is ${metrics.responseTime}ms (threshold: ${this.thresholds.responseTime.unhealthy}ms)`,
          metadata: { responseTime: metrics.responseTime, threshold: this.thresholds.responseTime.unhealthy }
        })
      }

      // Check error rate over last 10 measurements
      const recentMetrics = this.getRecentMetrics(metrics.schema, 10)
      if (recentMetrics.length >= 5) {
        const errorRate = this.calculateErrorRate(recentMetrics)
        if (errorRate > this.thresholds.errorRate.unhealthy) {
          this.createAlert({
            type: 'error_rate',
            severity: 'high',
            schema: metrics.schema,
            message: `${metrics.schema} schema error rate is ${(errorRate * 100).toFixed(1)}% (threshold: ${(this.thresholds.errorRate.unhealthy * 100).toFixed(1)}%)`,
            metadata: { errorRate, threshold: this.thresholds.errorRate.unhealthy, sampleSize: recentMetrics.length }
          })
        }
      }

      // Check for consecutive failures
      const consecutiveFailures = this.getConsecutiveFailures(metrics.schema)
      if (consecutiveFailures >= this.thresholds.consecutiveFailures) {
        this.createAlert({
          type: 'connectivity',
          severity: 'critical',
          schema: metrics.schema,
          message: `${metrics.schema} schema has ${consecutiveFailures} consecutive failures`,
          metadata: { consecutiveFailures, threshold: this.thresholds.consecutiveFailures }
        })
      }
    }
  }

  /**
   * Create an alert
   */
  private createAlert(alertData: Omit<Alert, 'id' | 'timestamp' | 'resolved'>): void {
    // Check if similar alert already exists and is not resolved
    const existingAlert = this.alerts.find(alert => 
      !alert.resolved &&
      alert.type === alertData.type &&
      alert.schema === alertData.schema &&
      alert.severity === alertData.severity
    )

    if (existingAlert) {
      // Update existing alert timestamp
      existingAlert.timestamp = new Date().toISOString()
      existingAlert.metadata = { ...existingAlert.metadata, ...alertData.metadata }
      return
    }

    const alert: Alert = {
      id: `${alertData.type}-${alertData.schema}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      resolved: false,
      ...alertData
    }

    this.alerts.push(alert)

    // Log alert
    console.warn(`Schema Alert [${alert.severity.toUpperCase()}]:`, alert.message, alert.metadata)

    // Send alert notifications
    alertingService.processAlert(alert).catch(error => {
      console.error('Failed to send alert notifications:', error)
    })

    // Keep only last 50 alerts
    if (this.alerts.length > 50) {
      this.alerts.splice(0, this.alerts.length - 50)
    }
  }

  /**
   * Get recent metrics for a schema
   */
  private getRecentMetrics(schema: string, count: number): SchemaMetrics[] {
    const schemaMetrics = this.metrics.get(schema) || []
    return schemaMetrics.slice(-count)
  }

  /**
   * Calculate error rate from metrics
   */
  private calculateErrorRate(metrics: SchemaMetrics[]): number {
    if (metrics.length === 0) return 0
    
    const totalErrors = metrics.reduce((sum, m) => sum + m.errorCount, 0)
    const totalRequests = metrics.reduce((sum, m) => sum + m.errorCount + m.successCount, 0)
    
    return totalRequests > 0 ? totalErrors / totalRequests : 0
  }

  /**
   * Get consecutive failures for a schema
   */
  private getConsecutiveFailures(schema: string): number {
    const schemaMetrics = this.metrics.get(schema) || []
    let failures = 0
    
    // Count failures from the end
    for (let i = schemaMetrics.length - 1; i >= 0; i--) {
      if (schemaMetrics[i].status === 'unhealthy') {
        failures++
      } else {
        break
      }
    }
    
    return failures
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    const timestamp = new Date().toISOString()
    const allMetrics = Array.from(this.metrics.values()).flat()
    
    // Calculate overall statistics
    const totalRequests = allMetrics.reduce((sum, m) => sum + m.errorCount + m.successCount, 0)
    const totalResponseTime = allMetrics.reduce((sum, m) => sum + m.responseTime, 0)
    const totalErrors = allMetrics.reduce((sum, m) => sum + m.errorCount, 0)
    
    const averageResponseTime = totalRequests > 0 ? totalResponseTime / allMetrics.length : 0
    const errorRate = totalRequests > 0 ? totalErrors / totalRequests : 0

    // Get latest metrics for app schema
    const getLatestMetrics = (schema: 'app'): SchemaMetrics => {
      const schemaMetrics = this.metrics.get(schema) || []
      return schemaMetrics[schemaMetrics.length - 1] || {
        schema,
        timestamp,
        status: 'unhealthy',
        responseTime: 0,
        errorCount: 0,
        successCount: 0,
        lastError: 'No metrics available'
      }
    }

    return {
      timestamp,
      totalRequests,
      averageResponseTime,
      errorRate,
      schemaMetrics: {
        app: getLatestMetrics('app')
      },
      alerts: this.alerts.filter(alert => !alert.resolved).slice(-10) // Last 10 unresolved alerts
    }
  }

  /**
   * Get all alerts
   */
  getAlerts(includeResolved: boolean = false): Alert[] {
    return includeResolved ? this.alerts : this.alerts.filter(alert => !alert.resolved)
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId)
    if (alert) {
      alert.resolved = true
      console.log(`Alert resolved: ${alert.message}`)
      return true
    }
    return false
  }

  /**
   * Get monitoring status
   */
  getMonitoringStatus(): {
    isMonitoring: boolean
    metricsCount: number
    alertsCount: number
    uptime: number
  } {
    return {
      isMonitoring: this.isMonitoring,
      metricsCount: Array.from(this.metrics.values()).reduce((sum, metrics) => sum + metrics.length, 0),
      alertsCount: this.alerts.filter(alert => !alert.resolved).length,
      uptime: this.isMonitoring ? Date.now() - (this.monitoringInterval ? 0 : Date.now()) : 0
    }
  }
}

// Singleton instance
export const schemaMonitor = new SchemaMonitor()

// Auto-start monitoring in production
if (process.env.NODE_ENV === 'production' && process.env.SCHEMA_MONITORING_ENABLED !== 'false') {
  // Start monitoring with 30 second intervals
  schemaMonitor.startMonitoring(30000)
}