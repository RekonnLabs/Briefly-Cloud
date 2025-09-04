/**
 * Google Picker Retry Service
 * 
 * Provides automatic and manual retry mechanisms for Google Picker operations
 * with exponential backoff and intelligent retry logic.
 */

import { logger } from '@/app/lib/logger'
import { 
  PickerErrorInfo, 
  PickerErrorType, 
  ErrorSeverity,
  createErrorContext,
  logPickerError 
} from './error-handling'

/**
 * Retry configuration for different operation types
 */
export interface RetryConfig {
  maxAttempts: number
  baseDelay: number // milliseconds
  maxDelay: number // milliseconds
  backoffMultiplier: number
  jitterFactor: number // 0-1, adds randomness to prevent thundering herd
}

/**
 * Default retry configurations for different error types
 */
export const DEFAULT_RETRY_CONFIGS: Record<PickerErrorType, RetryConfig> = {
  // Network and temporary errors - aggressive retry
  [PickerErrorType.NETWORK_ERROR]: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitterFactor: 0.1
  },
  [PickerErrorType.TIMEOUT_ERROR]: {
    maxAttempts: 3,
    baseDelay: 2000,
    maxDelay: 15000,
    backoffMultiplier: 2,
    jitterFactor: 0.2
  },
  [PickerErrorType.SERVICE_UNAVAILABLE]: {
    maxAttempts: 2,
    baseDelay: 5000,
    maxDelay: 30000,
    backoffMultiplier: 3,
    jitterFactor: 0.3
  },

  // API loading errors - moderate retry
  [PickerErrorType.API_LOAD_FAILED]: {
    maxAttempts: 3,
    baseDelay: 2000,
    maxDelay: 8000,
    backoffMultiplier: 2,
    jitterFactor: 0.1
  },
  [PickerErrorType.PICKER_SCRIPT_LOAD_FAILED]: {
    maxAttempts: 3,
    baseDelay: 1500,
    maxDelay: 6000,
    backoffMultiplier: 2,
    jitterFactor: 0.1
  },
  [PickerErrorType.GAPI_LOAD_FAILED]: {
    maxAttempts: 2,
    baseDelay: 3000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitterFactor: 0.2
  },

  // Token errors - limited retry
  [PickerErrorType.TOKEN_REFRESH_FAILED]: {
    maxAttempts: 2,
    baseDelay: 2000,
    maxDelay: 5000,
    backoffMultiplier: 2,
    jitterFactor: 0.1
  },

  // Picker operation errors - quick retry
  [PickerErrorType.PICKER_INIT_FAILED]: {
    maxAttempts: 2,
    baseDelay: 1000,
    maxDelay: 3000,
    backoffMultiplier: 1.5,
    jitterFactor: 0.1
  },
  [PickerErrorType.FILE_SELECTION_FAILED]: {
    maxAttempts: 2,
    baseDelay: 500,
    maxDelay: 2000,
    backoffMultiplier: 2,
    jitterFactor: 0.1
  },

  // Quota errors - longer delay
  [PickerErrorType.QUOTA_EXCEEDED]: {
    maxAttempts: 1,
    baseDelay: 30000,
    maxDelay: 60000,
    backoffMultiplier: 1,
    jitterFactor: 0.2
  },

  // No retry for these error types
  [PickerErrorType.TOKEN_EXPIRED]: { maxAttempts: 0, baseDelay: 0, maxDelay: 0, backoffMultiplier: 1, jitterFactor: 0 },
  [PickerErrorType.TOKEN_NOT_FOUND]: { maxAttempts: 0, baseDelay: 0, maxDelay: 0, backoffMultiplier: 1, jitterFactor: 0 },
  [PickerErrorType.REFRESH_TOKEN_EXPIRED]: { maxAttempts: 0, baseDelay: 0, maxDelay: 0, backoffMultiplier: 1, jitterFactor: 0 },
  [PickerErrorType.INVALID_CREDENTIALS]: { maxAttempts: 0, baseDelay: 0, maxDelay: 0, backoffMultiplier: 1, jitterFactor: 0 },
  [PickerErrorType.DEVELOPER_KEY_INVALID]: { maxAttempts: 0, baseDelay: 0, maxDelay: 0, backoffMultiplier: 1, jitterFactor: 0 },
  [PickerErrorType.PERMISSION_DENIED]: { maxAttempts: 0, baseDelay: 0, maxDelay: 0, backoffMultiplier: 1, jitterFactor: 0 },
  [PickerErrorType.USER_CANCELLED]: { maxAttempts: 0, baseDelay: 0, maxDelay: 0, backoffMultiplier: 1, jitterFactor: 0 },
  [PickerErrorType.PICKER_CONFIG_ERROR]: { maxAttempts: 0, baseDelay: 0, maxDelay: 0, backoffMultiplier: 1, jitterFactor: 0 },
  [PickerErrorType.FILE_ACCESS_DENIED]: { maxAttempts: 0, baseDelay: 0, maxDelay: 0, backoffMultiplier: 1, jitterFactor: 0 },
  [PickerErrorType.UNKNOWN_ERROR]: {
    maxAttempts: 1,
    baseDelay: 2000,
    maxDelay: 5000,
    backoffMultiplier: 2,
    jitterFactor: 0.1
  }
}

/**
 * Retry attempt information
 */
export interface RetryAttempt {
  attemptNumber: number
  delay: number
  timestamp: string
  errorType: PickerErrorType
  errorMessage: string
}

/**
 * Retry state for tracking retry attempts
 */
export interface RetryState {
  operation: string
  attempts: RetryAttempt[]
  config: RetryConfig
  isRetrying: boolean
  nextRetryAt?: string
  canRetry: boolean
}

/**
 * Retry service for managing automatic and manual retries
 */
export class PickerRetryService {
  private retryStates = new Map<string, RetryState>()
  private retryTimeouts = new Map<string, NodeJS.Timeout>()

  /**
   * Execute an operation with automatic retry logic
   */
  async executeWithRetry<T>(
    operationId: string,
    operation: () => Promise<T>,
    errorInfo?: PickerErrorInfo,
    customConfig?: Partial<RetryConfig>
  ): Promise<T> {
    const config = this.getRetryConfig(errorInfo?.type, customConfig)
    const retryState: RetryState = {
      operation: operationId,
      attempts: [],
      config,
      isRetrying: false,
      canRetry: config.maxAttempts > 0
    }

    this.retryStates.set(operationId, retryState)

    try {
      return await this.attemptOperation(operationId, operation, retryState)
    } finally {
      // Clean up retry state after completion or final failure
      this.clearRetryState(operationId)
    }
  }

  /**
   * Manually retry a failed operation
   */
  async manualRetry<T>(
    operationId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const retryState = this.retryStates.get(operationId)
    if (!retryState) {
      throw new Error('No retry state found for operation')
    }

    if (!retryState.canRetry) {
      throw new Error('Operation cannot be retried')
    }

    // Reset retry state for manual retry
    retryState.isRetrying = false
    retryState.nextRetryAt = undefined

    logger.info('Manual retry initiated', {
      operationId,
      previousAttempts: retryState.attempts.length
    })

    return await this.attemptOperation(operationId, operation, retryState)
  }

  /**
   * Check if an operation can be retried
   */
  canRetry(operationId: string): boolean {
    const retryState = this.retryStates.get(operationId)
    return retryState?.canRetry ?? false
  }

  /**
   * Get retry state for an operation
   */
  getRetryState(operationId: string): RetryState | undefined {
    return this.retryStates.get(operationId)
  }

  /**
   * Cancel pending retry for an operation
   */
  cancelRetry(operationId: string): void {
    const timeout = this.retryTimeouts.get(operationId)
    if (timeout) {
      clearTimeout(timeout)
      this.retryTimeouts.delete(operationId)
    }

    const retryState = this.retryStates.get(operationId)
    if (retryState) {
      retryState.isRetrying = false
      retryState.nextRetryAt = undefined
    }

    logger.info('Retry cancelled', { operationId })
  }

  /**
   * Clear all retry states (useful for cleanup)
   */
  clearAllRetries(): void {
    for (const [operationId] of this.retryStates) {
      this.cancelRetry(operationId)
    }
    this.retryStates.clear()
  }

  /**
   * Attempt to execute an operation with retry logic
   */
  private async attemptOperation<T>(
    operationId: string,
    operation: () => Promise<T>,
    retryState: RetryState
  ): Promise<T> {
    const attemptNumber = retryState.attempts.length + 1

    try {
      logger.info('Attempting operation', {
        operationId,
        attemptNumber,
        maxAttempts: retryState.config.maxAttempts
      })

      const result = await operation()
      
      // Success - log if this was a retry
      if (attemptNumber > 1) {
        logger.info('Operation succeeded after retry', {
          operationId,
          attemptNumber,
          totalAttempts: retryState.attempts.length + 1
        })
      }

      return result

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      // Record this attempt
      const attempt: RetryAttempt = {
        attemptNumber,
        delay: 0, // Will be set if we retry
        timestamp: new Date().toISOString(),
        errorType: this.inferErrorType(error),
        errorMessage
      }
      retryState.attempts.push(attempt)

      // Check if we should retry
      const shouldRetry = attemptNumber < retryState.config.maxAttempts
      retryState.canRetry = shouldRetry

      if (!shouldRetry) {
        logger.error('Operation failed after all retry attempts', {
          operationId,
          totalAttempts: attemptNumber,
          finalError: errorMessage
        })
        throw error
      }

      // Calculate delay for next attempt
      const delay = this.calculateDelay(attemptNumber, retryState.config)
      attempt.delay = delay

      const nextRetryAt = new Date(Date.now() + delay)
      retryState.nextRetryAt = nextRetryAt.toISOString()
      retryState.isRetrying = true

      logger.warn('Operation failed, scheduling retry', {
        operationId,
        attemptNumber,
        nextAttemptIn: delay,
        nextRetryAt: retryState.nextRetryAt,
        error: errorMessage
      })

      // Wait for the calculated delay
      await this.delay(delay)

      // Recursive retry
      return await this.attemptOperation(operationId, operation, retryState)
    }
  }

  /**
   * Get retry configuration for an error type
   */
  private getRetryConfig(
    errorType?: PickerErrorType,
    customConfig?: Partial<RetryConfig>
  ): RetryConfig {
    const baseConfig = errorType 
      ? DEFAULT_RETRY_CONFIGS[errorType]
      : DEFAULT_RETRY_CONFIGS[PickerErrorType.UNKNOWN_ERROR]

    return {
      ...baseConfig,
      ...customConfig
    }
  }

  /**
   * Calculate delay for retry attempt with exponential backoff and jitter
   */
  private calculateDelay(attemptNumber: number, config: RetryConfig): number {
    // Exponential backoff: baseDelay * (backoffMultiplier ^ (attemptNumber - 1))
    const exponentialDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attemptNumber - 1)
    
    // Apply maximum delay limit
    const cappedDelay = Math.min(exponentialDelay, config.maxDelay)
    
    // Add jitter to prevent thundering herd
    const jitter = cappedDelay * config.jitterFactor * (Math.random() - 0.5)
    const finalDelay = Math.max(0, cappedDelay + jitter)
    
    return Math.round(finalDelay)
  }

  /**
   * Infer error type from error object
   */
  private inferErrorType(error: any): PickerErrorType {
    if (error && typeof error === 'object' && 'type' in error) {
      return error.type as PickerErrorType
    }

    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()

    if (message.includes('network') || message.includes('fetch')) {
      return PickerErrorType.NETWORK_ERROR
    }
    if (message.includes('timeout')) {
      return PickerErrorType.TIMEOUT_ERROR
    }
    if (message.includes('token')) {
      return PickerErrorType.TOKEN_REFRESH_FAILED
    }
    if (message.includes('picker') && message.includes('load')) {
      return PickerErrorType.API_LOAD_FAILED
    }
    if (message.includes('quota') || message.includes('rate limit')) {
      return PickerErrorType.QUOTA_EXCEEDED
    }

    return PickerErrorType.UNKNOWN_ERROR
  }

  /**
   * Promise-based delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Clear retry state for an operation
   */
  private clearRetryState(operationId: string): void {
    this.cancelRetry(operationId)
    this.retryStates.delete(operationId)
  }
}

/**
 * Global retry service instance
 */
export const pickerRetryService = new PickerRetryService()

/**
 * Utility function to execute operation with retry
 */
export async function withRetry<T>(
  operationId: string,
  operation: () => Promise<T>,
  errorInfo?: PickerErrorInfo,
  customConfig?: Partial<RetryConfig>
): Promise<T> {
  return pickerRetryService.executeWithRetry(operationId, operation, errorInfo, customConfig)
}

/**
 * Utility function for manual retry
 */
export async function manualRetry<T>(
  operationId: string,
  operation: () => Promise<T>
): Promise<T> {
  return pickerRetryService.manualRetry(operationId, operation)
}

/**
 * Check if operation can be retried
 */
export function canRetryOperation(operationId: string): boolean {
  return pickerRetryService.canRetry(operationId)
}

/**
 * Get retry information for display in UI
 */
export function getRetryInfo(operationId: string): {
  canRetry: boolean
  isRetrying: boolean
  attemptCount: number
  nextRetryAt?: string
  lastError?: string
} {
  const retryState = pickerRetryService.getRetryState(operationId)
  
  if (!retryState) {
    return {
      canRetry: false,
      isRetrying: false,
      attemptCount: 0
    }
  }

  const lastAttempt = retryState.attempts[retryState.attempts.length - 1]

  return {
    canRetry: retryState.canRetry,
    isRetrying: retryState.isRetrying,
    attemptCount: retryState.attempts.length,
    nextRetryAt: retryState.nextRetryAt,
    lastError: lastAttempt?.errorMessage
  }
}

/**
 * Cancel retry for operation
 */
export function cancelRetry(operationId: string): void {
  pickerRetryService.cancelRetry(operationId)
}