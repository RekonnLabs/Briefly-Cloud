/**
 * Schema Performance Monitor
 * Utilities for monitoring and tracking database performance across schemas
 */

export interface PerformanceMetric {
  operation: string
  schema: 'app' | 'private' | 'public'
  duration: number
  timestamp: Date
  success: boolean
  error?: string
  metadata?: Record<string, any>
}

export interface PerformanceStats {
  totalOperations: number
  averageDuration: number
  minDuration: number
  maxDuration: number
  successRate: number
  errorCount: number
  operationsBySchema: Record<string, number>
  recentErrors: string[]
}

class SchemaPerformanceMonitor {
  private metrics: PerformanceMetric[] = []
  private maxMetrics = 1000 // Keep last 1000 metrics
  private enabled = process.env.NODE_ENV === 'development' || process.env.ENABLE_PERFORMANCE_MONITORING === 'true'

  /**
   * Record a performance metric
   */
  recordMetric(metric: Omit<PerformanceMetric, 'timestamp'>) {
    if (!this.enabled) return

    const fullMetric: PerformanceMetric = {
      ...metric,
      timestamp: new Date()
    }

    this.metrics.push(fullMetric)

    // Keep only the most recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics)
    }

    // Log slow operations
    if (metric.duration > 1000) {
      console.warn(`Slow ${metric.schema} schema operation: ${metric.operation} took ${metric.duration}ms`)
    }

    // Log errors
    if (!metric.success && metric.error) {
      console.error(`Schema operation failed: ${metric.operation} in ${metric.schema} schema - ${metric.error}`)
    }
  }

  /**
   * Measure and record the performance of an async operation
   */
  async measureOperation<T>(
    operation: string,
    schema: 'app' | 'private' | 'public',
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const startTime = Date.now()
    let success = true
    let error: string | undefined

    try {
      const result = await fn()
      return result
    } catch (err) {
      success = false
      error = err instanceof Error ? err.message : 'Unknown error'
      throw err
    } finally {
      const duration = Date.now() - startTime
      this.recordMetric({
        operation,
        schema,
        duration,
        success,
        error,
        metadata
      })
    }
  }

  /**
   * Get performance statistics
   */
  getStats(timeWindowMs?: number): PerformanceStats {
    let metricsToAnalyze = this.metrics

    // Filter by time window if specified
    if (timeWindowMs) {
      const cutoff = new Date(Date.now() - timeWindowMs)
      metricsToAnalyze = this.metrics.filter(m => m.timestamp >= cutoff)
    }

    if (metricsToAnalyze.length === 0) {
      return {
        totalOperations: 0,
        averageDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        successRate: 0,
        errorCount: 0,
        operationsBySchema: {},
        recentErrors: []
      }
    }

    const durations = metricsToAnalyze.map(m => m.duration)
    const successfulOperations = metricsToAnalyze.filter(m => m.success)
    const failedOperations = metricsToAnalyze.filter(m => !m.success)

    const operationsBySchema = metricsToAnalyze.reduce((acc, metric) => {
      acc[metric.schema] = (acc[metric.schema] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const recentErrors = failedOperations
      .slice(-10) // Last 10 errors
      .map(m => `${m.operation} (${m.schema}): ${m.error}`)

    return {
      totalOperations: metricsToAnalyze.length,
      averageDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      successRate: successfulOperations.length / metricsToAnalyze.length,
      errorCount: failedOperations.length,
      operationsBySchema,
      recentErrors
    }
  }

  /**
   * Get metrics for a specific schema
   */
  getSchemaStats(schema: 'app' | 'private' | 'public', timeWindowMs?: number): PerformanceStats {
    const schemaMetrics = this.metrics.filter(m => m.schema === schema)
    
    // Temporarily replace metrics with schema-specific ones
    const originalMetrics = this.metrics
    this.metrics = schemaMetrics
    
    const stats = this.getStats(timeWindowMs)
    
    // Restore original metrics
    this.metrics = originalMetrics
    
    return stats
  }

  /**
   * Get slow operations (above threshold)
   */
  getSlowOperations(thresholdMs = 500, timeWindowMs?: number): PerformanceMetric[] {
    let metricsToAnalyze = this.metrics

    if (timeWindowMs) {
      const cutoff = new Date(Date.now() - timeWindowMs)
      metricsToAnalyze = this.metrics.filter(m => m.timestamp >= cutoff)
    }

    return metricsToAnalyze
      .filter(m => m.duration > thresholdMs)
      .sort((a, b) => b.duration - a.duration) // Sort by duration descending
  }

  /**
   * Get operation performance by type
   */
  getOperationStats(operation: string, timeWindowMs?: number): PerformanceStats {
    const operationMetrics = this.metrics.filter(m => m.operation === operation)
    
    // Temporarily replace metrics with operation-specific ones
    const originalMetrics = this.metrics
    this.metrics = operationMetrics
    
    const stats = this.getStats(timeWindowMs)
    
    // Restore original metrics
    this.metrics = originalMetrics
    
    return stats
  }

  /**
   * Clear all metrics
   */
  clearMetrics() {
    this.metrics = []
  }

  /**
   * Export metrics for analysis
   */
  exportMetrics(): PerformanceMetric[] {
    return [...this.metrics]
  }

  /**
   * Generate performance report
   */
  generateReport(timeWindowMs?: number): string {
    const stats = this.getStats(timeWindowMs)
    const appStats = this.getSchemaStats('app', timeWindowMs)
    const privateStats = this.getSchemaStats('private', timeWindowMs)
    const slowOps = this.getSlowOperations(500, timeWindowMs)

    const timeWindow = timeWindowMs ? `(Last ${timeWindowMs / 1000}s)` : '(All time)'

    return `
Schema Performance Report ${timeWindow}
=====================================

Overall Statistics:
- Total Operations: ${stats.totalOperations}
- Average Duration: ${stats.averageDuration.toFixed(2)}ms
- Min Duration: ${stats.minDuration}ms
- Max Duration: ${stats.maxDuration}ms
- Success Rate: ${(stats.successRate * 100).toFixed(2)}%
- Error Count: ${stats.errorCount}

Schema Breakdown:
- App Schema: ${appStats.totalOperations} operations (avg: ${appStats.averageDuration.toFixed(2)}ms)
- Private Schema: ${privateStats.totalOperations} operations (avg: ${privateStats.averageDuration.toFixed(2)}ms)

Slow Operations (>500ms):
${slowOps.length === 0 ? '- None' : slowOps.slice(0, 5).map(op => 
  `- ${op.operation} (${op.schema}): ${op.duration}ms`
).join('\n')}

Recent Errors:
${stats.recentErrors.length === 0 ? '- None' : stats.recentErrors.slice(0, 5).map(err => `- ${err}`).join('\n')}
`
  }
}

// Singleton instance
export const schemaMonitor = new SchemaPerformanceMonitor()

/**
 * Decorator for monitoring repository methods
 */
export function monitorPerformance(schema: 'app' | 'private' | 'public') {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value

    descriptor.value = async function (...args: any[]) {
      const operation = `${target.constructor.name}.${propertyKey}`
      return schemaMonitor.measureOperation(
        operation,
        schema,
        () => originalMethod.apply(this, args),
        { args: args.length }
      )
    }

    return descriptor
  }
}

/**
 * Performance thresholds for different operation types
 */
export const PERFORMANCE_THRESHOLDS = {
  SIMPLE_QUERY: 100,      // Simple SELECT queries
  COMPLEX_QUERY: 500,     // Complex queries with joins
  RPC_FUNCTION: 200,      // RPC function calls
  BULK_OPERATION: 1000,   // Bulk operations
  CONCURRENT_OPERATION: 2000, // Concurrent operations
} as const

/**
 * Check if an operation meets performance thresholds
 */
export function checkPerformanceThreshold(
  operation: string,
  duration: number,
  operationType: keyof typeof PERFORMANCE_THRESHOLDS = 'SIMPLE_QUERY'
): { withinThreshold: boolean; threshold: number; message?: string } {
  const threshold = PERFORMANCE_THRESHOLDS[operationType]
  const withinThreshold = duration <= threshold

  return {
    withinThreshold,
    threshold,
    message: withinThreshold 
      ? undefined 
      : `${operation} took ${duration}ms, exceeding ${operationType} threshold of ${threshold}ms`
  }
}