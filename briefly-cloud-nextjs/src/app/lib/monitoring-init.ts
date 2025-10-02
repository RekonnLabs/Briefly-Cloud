/**
 * Monitoring System Initialization
 * 
 * Initializes all monitoring systems for the application
 */

import { initializeSignoutMonitoring } from './auth/signout-monitoring-setup'
import { logger } from './logger'

/**
 * Initialize all monitoring systems
 */
export function initializeMonitoring(): void {
  try {
    logger.info('Initializing monitoring systems...')
    
    // Initialize signout monitoring
    initializeSignoutMonitoring()
    
    // Add other monitoring systems here as they are created
    // initializeAuthMonitoring()
    // initializeFileProcessingMonitoring()
    // etc.
    
    logger.info('All monitoring systems initialized successfully')
    
  } catch (error) {
    logger.error('Failed to initialize monitoring systems', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    
    // Don't throw - monitoring failure shouldn't break the app
    console.error('⚠️ Monitoring initialization failed:', error)
  }
}

/**
 * Initialize monitoring systems on server startup
 */
if (typeof window === 'undefined') {
  // Only run on server side
  initializeMonitoring()
}