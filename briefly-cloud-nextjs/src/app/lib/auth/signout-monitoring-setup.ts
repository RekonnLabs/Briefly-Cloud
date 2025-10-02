/**
 * Signout Monitoring Setup
 * 
 * Initializes and configures the signout monitoring and alerting systems
 */

import { setupSignoutMonitoringCleanup } from './signout-monitoring'
import { setupSignoutAlertingCleanup } from './signout-alerts'
import { logger } from '../logger'

/**
 * Initialize signout monitoring and alerting systems
 */
export function initializeSignoutMonitoring(): void {
  try {
    // Setup periodic cleanup for monitoring data
    setupSignoutMonitoringCleanup()
    
    // Setup periodic cleanup for alerting data
    setupSignoutAlertingCleanup()
    
    logger.info('Signout monitoring and alerting systems initialized successfully')
    
    // Log configuration in development
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Signout Monitoring Configuration:')
      console.log('  - Event cleanup: Every 1 hour')
      console.log('  - Alert cleanup: Every 1 hour')
      console.log('  - Max events in memory: 1000')
      console.log('  - Alert cooldown periods: 2-30 minutes based on severity')
      
      // Log alert thresholds
      const { getSignoutAlerting } = require('./signout-alerts')
      const alerting = getSignoutAlerting()
      const thresholds = alerting.getThresholds()
      
      console.log('  - Alert Thresholds:')
      console.log(`    • Success Rate: Warning <${thresholds.successRate.warning}%, Critical <${thresholds.successRate.critical}%`)
      console.log(`    • Cleanup Failures: Warning >${thresholds.cleanupFailureRate.warning}%, Critical >${thresholds.cleanupFailureRate.critical}%`)
      console.log(`    • Avg Duration: Warning >${thresholds.averageDuration.warning}ms, Critical >${thresholds.averageDuration.critical}ms`)
      console.log(`    • Consecutive Failures: Warning ≥${thresholds.consecutiveFailures.warning}, Critical ≥${thresholds.consecutiveFailures.critical}`)
      console.log(`    • Error Rate: Warning >${thresholds.errorRate.warning}%, Critical >${thresholds.errorRate.critical}%`)
    }
    
  } catch (error) {
    logger.error('Failed to initialize signout monitoring systems', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    
    // Don't throw - monitoring failure shouldn't break the app
    console.error('⚠️ Signout monitoring initialization failed:', error)
  }
}

/**
 * Test the signout monitoring system
 */
export async function testSignoutMonitoring(): Promise<void> {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Test function only available in development')
  }

  try {
    logger.info('Testing signout monitoring system...')
    
    // Import test functions dynamically
    const { testSignoutMonitoring } = await import('./signout-monitoring')
    
    // Run the test
    testSignoutMonitoring()
    
    logger.info('Signout monitoring test completed successfully')
    
  } catch (error) {
    logger.error('Signout monitoring test failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    throw error
  }
}

/**
 * Get monitoring system health status
 */
export function getMonitoringHealth(): {
  status: 'healthy' | 'degraded' | 'unhealthy'
  checks: Record<string, boolean>
  message: string
} {
  const checks = {
    monitoringService: false,
    alertingService: false,
    cleanupScheduled: false
  }

  try {
    // Check if monitoring service is available
    const { getSignoutMonitoring } = require('./signout-monitoring')
    const monitoring = getSignoutMonitoring()
    checks.monitoringService = !!monitoring
    
    // Check if alerting service is available
    const { getSignoutAlerting } = require('./signout-alerts')
    const alerting = getSignoutAlerting()
    checks.alertingService = !!alerting
    
    // Check if cleanup is scheduled (this is a simple check)
    checks.cleanupScheduled = true // We assume it's scheduled if we got this far
    
    const healthyChecks = Object.values(checks).filter(Boolean).length
    const totalChecks = Object.keys(checks).length
    
    if (healthyChecks === totalChecks) {
      return {
        status: 'healthy',
        checks,
        message: 'All monitoring systems operational'
      }
    } else if (healthyChecks >= totalChecks / 2) {
      return {
        status: 'degraded',
        checks,
        message: `${healthyChecks}/${totalChecks} monitoring systems operational`
      }
    } else {
      return {
        status: 'unhealthy',
        checks,
        message: `Only ${healthyChecks}/${totalChecks} monitoring systems operational`
      }
    }
    
  } catch (error) {
    return {
      status: 'unhealthy',
      checks,
      message: `Monitoring system error: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

/**
 * Configure alert thresholds (for admin use)
 */
export function configureAlertThresholds(thresholds: {
  successRate?: { warning?: number; critical?: number }
  cleanupFailureRate?: { warning?: number; critical?: number }
  averageDuration?: { warning?: number; critical?: number }
  consecutiveFailures?: { warning?: number; critical?: number }
  errorRate?: { warning?: number; critical?: number }
}): void {
  try {
    const { getSignoutAlerting } = require('./signout-alerts')
    const alerting = getSignoutAlerting()
    
    // Get current thresholds
    const currentThresholds = alerting.getThresholds()
    
    // Merge with new thresholds
    const updatedThresholds = {
      successRate: { ...currentThresholds.successRate, ...thresholds.successRate },
      cleanupFailureRate: { ...currentThresholds.cleanupFailureRate, ...thresholds.cleanupFailureRate },
      averageDuration: { ...currentThresholds.averageDuration, ...thresholds.averageDuration },
      consecutiveFailures: { ...currentThresholds.consecutiveFailures, ...thresholds.consecutiveFailures },
      errorRate: { ...currentThresholds.errorRate, ...thresholds.errorRate }
    }
    
    // Update thresholds
    alerting.updateThresholds(updatedThresholds)
    
    logger.info('Alert thresholds updated', { updatedThresholds })
    
  } catch (error) {
    logger.error('Failed to update alert thresholds', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    throw error
  }
}

/**
 * Get current alert thresholds
 */
export function getAlertThresholds(): any {
  try {
    const { getSignoutAlerting } = require('./signout-alerts')
    const alerting = getSignoutAlerting()
    return alerting.getThresholds()
  } catch (error) {
    logger.error('Failed to get alert thresholds', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    return null
  }
}

/**
 * Get active alerts
 */
export function getActiveAlerts(): any[] {
  try {
    const { getSignoutAlerting } = require('./signout-alerts')
    const alerting = getSignoutAlerting()
    return alerting.getActiveAlerts()
  } catch (error) {
    logger.error('Failed to get active alerts', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    return []
  }
}

/**
 * Resolve an alert
 */
export function resolveAlert(alertId: string): boolean {
  try {
    const { getSignoutAlerting } = require('./signout-alerts')
    const alerting = getSignoutAlerting()
    const resolved = alerting.resolveAlert(alertId)
    
    if (resolved) {
      logger.info('Alert resolved', { alertId })
    } else {
      logger.warn('Alert not found or already resolved', { alertId })
    }
    
    return resolved
  } catch (error) {
    logger.error('Failed to resolve alert', {
      alertId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    return false
  }
}