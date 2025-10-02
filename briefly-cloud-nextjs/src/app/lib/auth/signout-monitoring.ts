/**
 * Signout Flow Monitoring and Metrics Collection
 * 
 * Provides comprehensive monitoring for signout operations including:
 * - Success/failure rate tracking
 * - Performance metrics
 * - Error categorization and alerting
 * - Cleanup task monitoring
 */

import { getErrorMonitoring } from '../error-monitoring'
import { alertingService } from '../monitoring/alerting'
import { SignoutResult, SignoutOptions } from './signout-service'
import { 
  getSignoutAlerting,
  alertSignoutSuccessRate,
  alertSignoutCleanupFailures,
  alertSignoutPerformance,
  alertSignoutConsecutiveFailures,
  alertSignoutSystemHealth
} from './signout-alerts'

export interface SignoutMetrics {
  /** Total number of signout attempts */
  totalAttempts: number
  /** Number of successful signouts */
  successfulSignouts: number
  /** Number of failed signouts */
  failedSignouts: number
  /** Success rate percentage */
  successRate: number
  /** Average signout duration in milliseconds */
  averageDuration: number
  /** Cleanup task success rates */
  cleanupMetrics: {
    pickerTokens: {
      attempts: number
      successes: number
      successRate: number
    }
    storageCredentials: {
      attempts: number
      successes: number
      successRate: number
    }
    sessionData: {
      attempts: number
      successes: number
      successRate: number
    }
  }
  /** Error breakdown by category */
  errorCategories: {
    networkErrors: number
    authenticationErrors: number
    cleanupErrors: number
    timeoutErrors: number
    unknownErrors: number
  }
  /** Time window for these metrics */
  timeWindow: string
  /** Last updated timestamp */
  lastUpdated: string
}

export interface SignoutEvent {
  /** Unique event identifier */
  id: string
  /** User ID (if available) */
  userId?: string
  /** Session ID */
  sessionId?: string
  /** Correlation ID for tracking */
  correlationId: string
  /** Event timestamp */
  timestamp: string
  /** Signout options used */
  options: SignoutOptions
  /** Signout result */
  result: SignoutResult
  /** Duration in milliseconds */
  duration: number
  /** User agent */
  userAgent?: string
  /** Component that initiated signout */
  component?: string
  /** Error details if failed */
  error?: {
    message: string
    stack?: string
    category: 'network' | 'authentication' | 'cleanup' | 'timeout' | 'unknown'
  }
}

export interface SignoutAlert {
  id: string
  type: 'high_failure_rate' | 'cleanup_failures' | 'performance_degradation' | 'consecutive_failures'
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  message: string
  timestamp: string
  metadata: Record<string, any>
  resolved: boolean
}

class SignoutMonitoringService {
  private monitoring = getErrorMonitoring()
  private events: SignoutEvent[] = []
  private maxEvents = 1000 // Keep last 1000 events in memory
  private alertThresholds = {
    successRate: {
      warning: 95, // Alert if success rate drops below 95%
      critical: 90 // Critical alert if below 90%
    },
    cleanupFailureRate: {
      warning: 10, // Alert if cleanup failure rate exceeds 10%
      critical: 20 // Critical if exceeds 20%
    },
    averageDuration: {
      warning: 5000, // Alert if average duration exceeds 5 seconds
      critical: 10000 // Critical if exceeds 10 seconds
    },
    consecutiveFailures: {
      warning: 5, // Alert after 5 consecutive failures
      critical: 10 // Critical after 10 consecutive failures
    }
  }

  /**
   * Record a signout event
   */
  recordSignoutEvent(
    userId: string | undefined,
    sessionId: string | undefined,
    correlationId: string,
    options: SignoutOptions,
    result: SignoutResult,
    duration: number,
    userAgent?: string,
    component?: string,
    error?: Error
  ): void {
    const event: SignoutEvent = {
      id: crypto.randomUUID(),
      userId,
      sessionId,
      correlationId,
      timestamp: new Date().toISOString(),
      options,
      result,
      duration,
      userAgent,
      component,
      error: error ? {
        message: error.message,
        stack: error.stack,
        category: this.categorizeError(error)
      } : undefined
    }

    // Add to events list
    this.events.push(event)
    
    // Keep only the most recent events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents)
    }

    // Record metrics in monitoring system
    this.recordMetrics(event)

    // Check for alert conditions
    this.checkAlertConditions(event)
  }

  /**
   * Record metrics in the monitoring system
   */
  private recordMetrics(event: SignoutEvent): void {
    // Set tags for filtering and grouping
    this.monitoring.setTag('operation', 'signout')
    this.monitoring.setTag('success', event.result.success.toString())
    this.monitoring.setTag('component', event.component || 'unknown')
    this.monitoring.setTag('skip_cleanup', event.options.skipCleanup?.toString() || 'false')
    this.monitoring.setTag('force_redirect', event.options.forceRedirect?.toString() || 'false')

    // Set extra data
    this.monitoring.setExtra('duration_ms', event.duration)
    this.monitoring.setExtra('cleanup_results', event.result.cleanup)
    this.monitoring.setExtra('correlation_id', event.correlationId)

    if (event.userId) {
      this.monitoring.setUser(event.userId)
    }

    // Record the event
    const level = event.result.success ? 'info' : 'error'
    const message = event.result.success 
      ? `Signout completed successfully in ${event.duration}ms`
      : `Signout failed: ${event.result.error}`

    this.monitoring.captureMessage(message, level, {
      userId: event.userId,
      sessionId: event.sessionId,
      timestamp: event.timestamp,
      environment: process.env.NODE_ENV || 'development'
    })

    // Record error if signout failed
    if (!event.result.success && event.error) {
      this.monitoring.setTag('error_category', event.error.category)
      this.monitoring.captureError(new Error(event.error.message), {
        userId: event.userId,
        sessionId: event.sessionId,
        timestamp: event.timestamp,
        environment: process.env.NODE_ENV || 'development'
      })
    }
  }

  /**
   * Check for alert conditions
   */
  private checkAlertConditions(event: SignoutEvent): void {
    const recentEvents = this.getRecentEvents('15m')
    
    // Check success rate
    this.checkSuccessRate(recentEvents)
    
    // Check cleanup failure rates
    this.checkCleanupFailures(recentEvents)
    
    // Check performance degradation
    this.checkPerformance(recentEvents)
    
    // Check consecutive failures
    this.checkConsecutiveFailures()
    
    // Check overall system health
    this.checkSystemHealth(recentEvents)
  }

  /**
   * Check signout success rate and alert if below threshold
   */
  private checkSuccessRate(events: SignoutEvent[]): void {
    if (events.length < 10) return // Need at least 10 events for meaningful rate

    const successfulEvents = events.filter(e => e.result.success)
    const successRate = (successfulEvents.length / events.length) * 100

    // Use the dedicated alerting system
    alertSignoutSuccessRate(
      successRate,
      events.length,
      successfulEvents.length,
      '15m'
    )
  }

  /**
   * Check cleanup task failure rates
   */
  private checkCleanupFailures(events: SignoutEvent[]): void {
    if (events.length < 5) return

    const cleanupEvents = events.filter(e => !e.options.skipCleanup)
    if (cleanupEvents.length === 0) return

    // Check picker token cleanup failures
    const pickerFailures = cleanupEvents.filter(e => !e.result.cleanup.pickerTokens).length
    const pickerFailureRate = (pickerFailures / cleanupEvents.length) * 100

    // Check storage credential cleanup failures
    const storageFailures = cleanupEvents.filter(e => !e.result.cleanup.storageCredentials).length
    const storageFailureRate = (storageFailures / cleanupEvents.length) * 100

    // Use the dedicated alerting system
    alertSignoutCleanupFailures(
      pickerFailureRate,
      storageFailureRate,
      cleanupEvents.length,
      '15m'
    )
  }

  /**
   * Check for performance degradation
   */
  private checkPerformance(events: SignoutEvent[]): void {
    if (events.length < 5) return

    const averageDuration = events.reduce((sum, e) => sum + e.duration, 0) / events.length

    // Use the dedicated alerting system
    alertSignoutPerformance(
      averageDuration,
      events.length,
      '15m'
    )
  }

  /**
   * Check for consecutive failures
   */
  private checkConsecutiveFailures(): void {
    const recentEvents = this.events.slice(-20) // Check last 20 events
    let consecutiveFailures = 0

    // Count consecutive failures from the end
    for (let i = recentEvents.length - 1; i >= 0; i--) {
      if (!recentEvents[i].result.success) {
        consecutiveFailures++
      } else {
        break
      }
    }

    // Prepare recent events data for alerting
    const recentEventsData = recentEvents.slice(-5).map(e => ({
      timestamp: e.timestamp,
      success: e.result.success,
      error: e.result.error
    }))

    // Use the dedicated alerting system
    alertSignoutConsecutiveFailures(consecutiveFailures, recentEventsData)
  }

  /**
   * Check overall system health
   */
  private checkSystemHealth(events: SignoutEvent[]): void {
    if (events.length === 0) return

    // Calculate error categories
    const errorCategories = {
      networkErrors: events.filter(e => e.error?.category === 'network').length,
      authenticationErrors: events.filter(e => e.error?.category === 'authentication').length,
      cleanupErrors: events.filter(e => e.error?.category === 'cleanup').length,
      timeoutErrors: events.filter(e => e.error?.category === 'timeout').length,
      unknownErrors: events.filter(e => e.error?.category === 'unknown').length
    }

    // Use the dedicated alerting system
    alertSignoutSystemHealth(events.length, errorCategories, '15m')
  }



  /**
   * Get events from a specific time window
   */
  private getRecentEvents(timeWindow: string): SignoutEvent[] {
    const now = Date.now()
    let cutoffTime: number

    switch (timeWindow) {
      case '5m':
        cutoffTime = now - (5 * 60 * 1000)
        break
      case '15m':
        cutoffTime = now - (15 * 60 * 1000)
        break
      case '1h':
        cutoffTime = now - (60 * 60 * 1000)
        break
      case '24h':
        cutoffTime = now - (24 * 60 * 60 * 1000)
        break
      default:
        cutoffTime = now - (15 * 60 * 1000) // Default to 15 minutes
    }

    return this.events.filter(event => 
      new Date(event.timestamp).getTime() > cutoffTime
    )
  }

  /**
   * Categorize error for better tracking
   */
  private categorizeError(error: Error): 'network' | 'authentication' | 'cleanup' | 'timeout' | 'unknown' {
    const message = error.message.toLowerCase()
    
    if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
      return 'network'
    }
    
    if (message.includes('auth') || message.includes('token') || message.includes('session')) {
      return 'authentication'
    }
    
    if (message.includes('cleanup') || message.includes('picker') || message.includes('storage')) {
      return 'cleanup'
    }
    
    if (message.includes('timeout') || message.includes('abort')) {
      return 'timeout'
    }
    
    return 'unknown'
  }

  /**
   * Get current metrics for a time window
   */
  getMetrics(timeWindow: string = '1h'): SignoutMetrics {
    const events = this.getRecentEvents(timeWindow)
    
    if (events.length === 0) {
      return {
        totalAttempts: 0,
        successfulSignouts: 0,
        failedSignouts: 0,
        successRate: 0,
        averageDuration: 0,
        cleanupMetrics: {
          pickerTokens: { attempts: 0, successes: 0, successRate: 0 },
          storageCredentials: { attempts: 0, successes: 0, successRate: 0 },
          sessionData: { attempts: 0, successes: 0, successRate: 0 }
        },
        errorCategories: {
          networkErrors: 0,
          authenticationErrors: 0,
          cleanupErrors: 0,
          timeoutErrors: 0,
          unknownErrors: 0
        },
        timeWindow,
        lastUpdated: new Date().toISOString()
      }
    }

    const successfulEvents = events.filter(e => e.result.success)
    const cleanupEvents = events.filter(e => !e.options.skipCleanup)
    
    // Calculate cleanup metrics
    const pickerSuccesses = cleanupEvents.filter(e => e.result.cleanup.pickerTokens).length
    const storageSuccesses = cleanupEvents.filter(e => e.result.cleanup.storageCredentials).length
    const sessionSuccesses = events.filter(e => e.result.cleanup.sessionData).length

    // Calculate error categories
    const errorCategories = {
      networkErrors: events.filter(e => e.error?.category === 'network').length,
      authenticationErrors: events.filter(e => e.error?.category === 'authentication').length,
      cleanupErrors: events.filter(e => e.error?.category === 'cleanup').length,
      timeoutErrors: events.filter(e => e.error?.category === 'timeout').length,
      unknownErrors: events.filter(e => e.error?.category === 'unknown').length
    }

    return {
      totalAttempts: events.length,
      successfulSignouts: successfulEvents.length,
      failedSignouts: events.length - successfulEvents.length,
      successRate: (successfulEvents.length / events.length) * 100,
      averageDuration: events.reduce((sum, e) => sum + e.duration, 0) / events.length,
      cleanupMetrics: {
        pickerTokens: {
          attempts: cleanupEvents.length,
          successes: pickerSuccesses,
          successRate: cleanupEvents.length > 0 ? (pickerSuccesses / cleanupEvents.length) * 100 : 0
        },
        storageCredentials: {
          attempts: cleanupEvents.length,
          successes: storageSuccesses,
          successRate: cleanupEvents.length > 0 ? (storageSuccesses / cleanupEvents.length) * 100 : 0
        },
        sessionData: {
          attempts: events.length,
          successes: sessionSuccesses,
          successRate: (sessionSuccesses / events.length) * 100
        }
      },
      errorCategories,
      timeWindow,
      lastUpdated: new Date().toISOString()
    }
  }

  /**
   * Get recent signout events
   */
  getRecentSignoutEvents(limit: number = 50): SignoutEvent[] {
    return this.events.slice(-limit).reverse() // Most recent first
  }

  /**
   * Clear old events to prevent memory leaks
   */
  clearOldEvents(maxAge: number = 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAge
    this.events = this.events.filter(event => 
      new Date(event.timestamp).getTime() > cutoff
    )
  }

  /**
   * Update alert thresholds
   */
  updateAlertThresholds(thresholds: Partial<typeof this.alertThresholds>): void {
    this.alertThresholds = { ...this.alertThresholds, ...thresholds }
  }

  /**
   * Get current alert thresholds
   */
  getAlertThresholds(): typeof this.alertThresholds {
    return { ...this.alertThresholds }
  }
}

// Singleton instance
let signoutMonitoring: SignoutMonitoringService

/**
 * Get the signout monitoring service instance
 */
export function getSignoutMonitoring(): SignoutMonitoringService {
  if (!signoutMonitoring) {
    signoutMonitoring = new SignoutMonitoringService()
  }
  return signoutMonitoring
}

/**
 * Utility function to record a signout event
 */
export function recordSignoutEvent(
  userId: string | undefined,
  sessionId: string | undefined,
  correlationId: string,
  options: SignoutOptions,
  result: SignoutResult,
  duration: number,
  userAgent?: string,
  component?: string,
  error?: Error
): void {
  const monitoring = getSignoutMonitoring()
  monitoring.recordSignoutEvent(
    userId,
    sessionId,
    correlationId,
    options,
    result,
    duration,
    userAgent,
    component,
    error
  )
}

/**
 * Setup periodic cleanup of old events
 */
export function setupSignoutMonitoringCleanup(): void {
  // Clean up old events every hour
  setInterval(() => {
    const monitoring = getSignoutMonitoring()
    monitoring.clearOldEvents()
  }, 60 * 60 * 1000) // 1 hour
}

/**
 * Get signout metrics for dashboard/reporting
 */
export function getSignoutMetrics(timeWindow: string = '1h'): SignoutMetrics {
  const monitoring = getSignoutMonitoring()
  return monitoring.getMetrics(timeWindow)
}

/**
 * Test the signout monitoring system
 */
export function testSignoutMonitoring(): void {
  const monitoring = getSignoutMonitoring()
  
  // Simulate some test events
  const testEvents = [
    {
      success: true,
      duration: 1200,
      cleanup: { pickerTokens: true, storageCredentials: true, sessionData: true, errors: [] }
    },
    {
      success: false,
      duration: 5000,
      error: 'Network timeout',
      cleanup: { pickerTokens: false, storageCredentials: false, sessionData: true, errors: ['Network timeout'] }
    }
  ]

  testEvents.forEach((event, index) => {
    monitoring.recordSignoutEvent(
      `test-user-${index}`,
      `test-session-${index}`,
      `test-correlation-${index}`,
      { showLoading: true },
      {
        success: event.success,
        error: event.error,
        redirectUrl: '/auth/signin',
        cleanup: event.cleanup
      },
      event.duration,
      'test-user-agent',
      'test-component',
      event.error ? new Error(event.error) : undefined
    )
  })

  console.log('Test signout monitoring events recorded')
  console.log('Current metrics:', monitoring.getMetrics('1h'))
}