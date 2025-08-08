import { NextRequest, NextResponse } from 'next/server'
import { logger } from './logger'

// Analytics event types
export type AnalyticsEvent = 
  | 'page_view'
  | 'file_upload'
  | 'chat_message'
  | 'search_query'
  | 'subscription_upgrade'
  | 'subscription_downgrade'
  | 'cloud_storage_connect'
  | 'migration_start'
  | 'migration_complete'
  | 'error_occurred'
  | 'performance_issue'
  | 'api_call'
  | 'user_signup'
  | 'user_login'
  | 'feature_usage'

// Performance metrics
export interface PerformanceMetrics {
  pageLoadTime: number
  apiResponseTime: number
  databaseQueryTime: number
  cacheHitRate: number
  memoryUsage: number
  cpuUsage: number
  errorRate: number
  activeUsers: number
  requestsPerMinute: number
}

// User analytics data
export interface UserAnalytics {
  userId: string
  sessionId: string
  pageViews: number
  timeOnSite: number
  featuresUsed: string[]
  conversionFunnel: string[]
  deviceInfo: {
    userAgent: string
    screenResolution: string
    language: string
    timezone: string
  }
  location: {
    country: string
    region: string
    city: string
  }
}

// Monitoring configuration
export interface MonitoringConfig {
  enableVercelAnalytics: boolean
  enableSentry: boolean
  enableCustomMetrics: boolean
  enablePerformanceTracking: boolean
  enableErrorTracking: boolean
  enableUserAnalytics: boolean
  enableRealTimeMonitoring: boolean
  alertThresholds: {
    errorRate: number
    responseTime: number
    memoryUsage: number
    cpuUsage: number
  }
}

export class MonitoringService {
  private config: MonitoringConfig
  private metrics: Map<string, any> = new Map()
  private alerts: any[] = []

  constructor(config: Partial<MonitoringConfig> = {}) {
    this.config = {
      enableVercelAnalytics: true,
      enableSentry: true,
      enableCustomMetrics: true,
      enablePerformanceTracking: true,
      enableErrorTracking: true,
      enableUserAnalytics: true,
      enableRealTimeMonitoring: true,
      alertThresholds: {
        errorRate: 5, // 5%
        responseTime: 2000, // 2 seconds
        memoryUsage: 80, // 80%
        cpuUsage: 70, // 70%
      },
      ...config,
    }
  }

  // Track custom analytics event
  async trackEvent(
    event: AnalyticsEvent,
    properties: Record<string, any> = {},
    userId?: string
  ): Promise<void> {
    try {
      const eventData = {
        event,
        properties,
        userId,
        timestamp: new Date().toISOString(),
        sessionId: this.getSessionId(),
      }

      // Send to Vercel Analytics if enabled
      if (this.config.enableVercelAnalytics) {
        await this.sendToVercelAnalytics(eventData)
      }

      // Send to custom analytics endpoint
      if (this.config.enableCustomMetrics) {
        await this.sendToCustomAnalytics(eventData)
      }

      // Log event
      logger.info('Analytics event tracked', { event, properties, userId })

    } catch (error) {
      logger.error('Failed to track analytics event', { error, event, properties })
    }
  }

  // Track performance metrics
  async trackPerformance(metrics: Partial<PerformanceMetrics>): Promise<void> {
    try {
      const timestamp = new Date().toISOString()
      
      // Store metrics
      this.metrics.set(`performance_${timestamp}`, {
        ...metrics,
        timestamp,
      })

      // Check alert thresholds
      await this.checkAlertThresholds(metrics)

      // Send to monitoring service
      if (this.config.enablePerformanceTracking) {
        await this.sendPerformanceMetrics(metrics)
      }

    } catch (error) {
      logger.error('Failed to track performance metrics', { error, metrics })
    }
  }

  // Track user analytics
  async trackUserAnalytics(analytics: Partial<UserAnalytics>): Promise<void> {
    try {
      const timestamp = new Date().toISOString()
      
      // Store user analytics
      this.metrics.set(`user_${analytics.userId}_${timestamp}`, {
        ...analytics,
        timestamp,
      })

      // Send to analytics service
      if (this.config.enableUserAnalytics) {
        await this.sendUserAnalytics(analytics)
      }

    } catch (error) {
      logger.error('Failed to track user analytics', { error, analytics })
    }
  }

  // Track error
  async trackError(
    error: Error,
    context: Record<string, any> = {},
    userId?: string
  ): Promise<void> {
    try {
      const errorData = {
        message: error.message,
        stack: error.stack,
        context,
        userId,
        timestamp: new Date().toISOString(),
        sessionId: this.getSessionId(),
      }

      // Send to Sentry if enabled
      if (this.config.enableSentry) {
        await this.sendToSentry(errorData)
      }

      // Send to custom error tracking
      if (this.config.enableErrorTracking) {
        await this.sendToErrorTracking(errorData)
      }

      // Log error
      logger.error('Error tracked', { error: errorData })

    } catch (trackingError) {
      logger.error('Failed to track error', { error: trackingError, originalError: error })
    }
  }

  // Get real-time metrics
  getRealTimeMetrics(): PerformanceMetrics {
    const now = Date.now()
    const oneMinuteAgo = now - 60000

    // Calculate metrics from stored data
    const recentMetrics = Array.from(this.metrics.entries())
      .filter(([key, data]) => {
        if (key.startsWith('performance_')) {
          const timestamp = new Date(data.timestamp).getTime()
          return timestamp > oneMinuteAgo
        }
        return false
      })
      .map(([, data]) => data)

    if (recentMetrics.length === 0) {
      return {
        pageLoadTime: 0,
        apiResponseTime: 0,
        databaseQueryTime: 0,
        cacheHitRate: 0,
        memoryUsage: 0,
        cpuUsage: 0,
        errorRate: 0,
        activeUsers: 0,
        requestsPerMinute: 0,
      }
    }

    const avgPageLoadTime = recentMetrics.reduce((sum, m) => sum + (m.pageLoadTime || 0), 0) / recentMetrics.length
    const avgApiResponseTime = recentMetrics.reduce((sum, m) => sum + (m.apiResponseTime || 0), 0) / recentMetrics.length
    const avgDatabaseQueryTime = recentMetrics.reduce((sum, m) => sum + (m.databaseQueryTime || 0), 0) / recentMetrics.length
    const avgCacheHitRate = recentMetrics.reduce((sum, m) => sum + (m.cacheHitRate || 0), 0) / recentMetrics.length
    const avgMemoryUsage = recentMetrics.reduce((sum, m) => sum + (m.memoryUsage || 0), 0) / recentMetrics.length
    const avgCpuUsage = recentMetrics.reduce((sum, m) => sum + (m.cpuUsage || 0), 0) / recentMetrics.length
    const errorRate = recentMetrics.filter(m => m.errorRate > 0).length / recentMetrics.length * 100
    const requestsPerMinute = recentMetrics.length

    return {
      pageLoadTime: avgPageLoadTime,
      apiResponseTime: avgApiResponseTime,
      databaseQueryTime: avgDatabaseQueryTime,
      cacheHitRate: avgCacheHitRate,
      memoryUsage: avgMemoryUsage,
      cpuUsage: avgCpuUsage,
      errorRate,
      activeUsers: this.getActiveUsersCount(),
      requestsPerMinute,
    }
  }

  // Get alerts
  getAlerts(): any[] {
    return this.alerts.slice(-50) // Return last 50 alerts
  }

  // Clear old metrics
  cleanupOldMetrics(maxAge: number = 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAge
    
    for (const [key, data] of this.metrics.entries()) {
      const timestamp = new Date(data.timestamp).getTime()
      if (timestamp < cutoff) {
        this.metrics.delete(key)
      }
    }
  }

  // Private methods
  private async sendToVercelAnalytics(data: any): Promise<void> {
    // Vercel Analytics integration
    // This would use @vercel/analytics package
    if (typeof window !== 'undefined') {
      // Client-side tracking
      const { track } = await import('@vercel/analytics')
      track(data.event, data.properties)
    }
  }

  private async sendToCustomAnalytics(data: any): Promise<void> {
    // Send to custom analytics endpoint
    try {
      await fetch('/api/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    } catch (error) {
      logger.error('Failed to send to custom analytics', { error })
    }
  }

  private async sendToSentry(data: any): Promise<void> {
    // Sentry integration
    try {
      const Sentry = await import('@sentry/nextjs')
      Sentry.captureException(new Error(data.message), {
        extra: data.context,
        user: data.userId ? { id: data.userId } : undefined,
      })
    } catch (error) {
      logger.error('Failed to send to Sentry', { error })
    }
  }

  private async sendToErrorTracking(data: any): Promise<void> {
    // Send to custom error tracking endpoint
    try {
      await fetch('/api/monitoring/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    } catch (error) {
      logger.error('Failed to send to error tracking', { error })
    }
  }

  private async sendPerformanceMetrics(metrics: Partial<PerformanceMetrics>): Promise<void> {
    // Send to performance monitoring endpoint
    try {
      await fetch('/api/monitoring/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metrics),
      })
    } catch (error) {
      logger.error('Failed to send performance metrics', { error })
    }
  }

  private async sendUserAnalytics(analytics: Partial<UserAnalytics>): Promise<void> {
    // Send to user analytics endpoint
    try {
      await fetch('/api/analytics/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(analytics),
      })
    } catch (error) {
      logger.error('Failed to send user analytics', { error })
    }
  }

  private async checkAlertThresholds(metrics: Partial<PerformanceMetrics>): Promise<void> {
    const alerts = []

    if (metrics.errorRate && metrics.errorRate > this.config.alertThresholds.errorRate) {
      alerts.push({
        type: 'error_rate_high',
        message: `Error rate is ${metrics.errorRate}%, above threshold of ${this.config.alertThresholds.errorRate}%`,
        severity: 'high',
        timestamp: new Date().toISOString(),
        metrics,
      })
    }

    if (metrics.apiResponseTime && metrics.apiResponseTime > this.config.alertThresholds.responseTime) {
      alerts.push({
        type: 'response_time_slow',
        message: `API response time is ${metrics.apiResponseTime}ms, above threshold of ${this.config.alertThresholds.responseTime}ms`,
        severity: 'medium',
        timestamp: new Date().toISOString(),
        metrics,
      })
    }

    if (metrics.memoryUsage && metrics.memoryUsage > this.config.alertThresholds.memoryUsage) {
      alerts.push({
        type: 'memory_usage_high',
        message: `Memory usage is ${metrics.memoryUsage}%, above threshold of ${this.config.alertThresholds.memoryUsage}%`,
        severity: 'high',
        timestamp: new Date().toISOString(),
        metrics,
      })
    }

    if (metrics.cpuUsage && metrics.cpuUsage > this.config.alertThresholds.cpuUsage) {
      alerts.push({
        type: 'cpu_usage_high',
        message: `CPU usage is ${metrics.cpuUsage}%, above threshold of ${this.config.alertThresholds.cpuUsage}%`,
        severity: 'medium',
        timestamp: new Date().toISOString(),
        metrics,
      })
    }

    // Store alerts
    this.alerts.push(...alerts)

    // Send alerts if configured
    if (alerts.length > 0) {
      await this.sendAlerts(alerts)
    }
  }

  private async sendAlerts(alerts: any[]): Promise<void> {
    // Send alerts to monitoring service
    try {
      await fetch('/api/monitoring/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alerts }),
      })
    } catch (error) {
      logger.error('Failed to send alerts', { error })
    }
  }

  private getSessionId(): string {
    // Generate or retrieve session ID
    if (typeof window !== 'undefined') {
      let sessionId = sessionStorage.getItem('analytics_session_id')
      if (!sessionId) {
        sessionId = crypto.randomUUID()
        sessionStorage.setItem('analytics_session_id', sessionId)
      }
      return sessionId
    }
    return 'server-session'
  }

  private getActiveUsersCount(): number {
    // Calculate active users from stored metrics
    const now = Date.now()
    const fiveMinutesAgo = now - 5 * 60 * 1000

    const activeSessions = new Set()
    
    for (const [key, data] of this.metrics.entries()) {
      if (key.startsWith('user_') && data.timestamp) {
        const timestamp = new Date(data.timestamp).getTime()
        if (timestamp > fiveMinutesAgo) {
          activeSessions.add(data.sessionId)
        }
      }
    }

    return activeSessions.size
  }
}

// Global monitoring instance
export const monitoringService = new MonitoringService()

// Performance monitoring middleware
export function withPerformanceMonitoring(
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const startTime = Date.now()
    
    try {
      const response = await handler(req)
      const duration = Date.now() - startTime
      
      // Track performance
      await monitoringService.trackPerformance({
        apiResponseTime: duration,
        requestsPerMinute: 1, // Will be aggregated
      })
      
      return response
    } catch (error) {
      // Track error
      await monitoringService.trackError(error as Error, {
        url: req.url,
        method: req.method,
        userAgent: req.headers.get('user-agent'),
      })
      
      throw error
    }
  }
}

// Analytics tracking hook for React components
export function useAnalytics() {
  const trackEvent = async (
    event: AnalyticsEvent,
    properties: Record<string, any> = {}
  ) => {
    await monitoringService.trackEvent(event, properties)
  }

  const trackPageView = async (page: string, properties: Record<string, any> = {}) => {
    await trackEvent('page_view', { page, ...properties })
  }

  const trackFeatureUsage = async (feature: string, properties: Record<string, any> = {}) => {
    await trackEvent('feature_usage', { feature, ...properties })
  }

  return {
    trackEvent,
    trackPageView,
    trackFeatureUsage,
  }
}
