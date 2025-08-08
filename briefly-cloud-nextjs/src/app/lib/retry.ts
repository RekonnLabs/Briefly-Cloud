/**
 * Retry utilities for handling transient failures
 * Provides exponential backoff, jitter, and circuit breaker patterns
 */

export interface RetryConfig {
  maxAttempts: number
  baseDelay: number // in milliseconds
  maxDelay: number // in milliseconds
  backoffMultiplier: number
  jitter: boolean
  retryableErrors?: string[]
  onRetry?: (attempt: number, error: Error, delay: number) => void
}

export interface CircuitBreakerConfig {
  failureThreshold: number
  recoveryTimeout: number // in milliseconds
  expectedErrorRate: number // 0-1
}

export class RetryError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: Error
  ) {
    super(message)
    this.name = 'RetryError'
  }
}

export class CircuitBreakerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CircuitBreakerError'
  }
}

// Default retry configuration
export const defaultRetryConfig: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  jitter: true,
  retryableErrors: [
    'ECONNRESET',
    'ENOTFOUND',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'ENETUNREACH',
    'rate limit',
    'timeout',
    'network',
    'temporary',
    'temporarily unavailable'
  ]
}

// Exponential backoff with jitter
function calculateDelay(attempt: number, config: RetryConfig): number {
  const delay = Math.min(
    config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
    config.maxDelay
  )

  if (config.jitter) {
    // Add random jitter to prevent thundering herd
    const jitter = delay * 0.1 * Math.random()
    return delay + jitter
  }

  return delay
}

// Check if error is retryable
function isRetryableError(error: Error, config: RetryConfig): boolean {
  const errorMessage = error.message.toLowerCase()
  const errorName = error.name.toLowerCase()

  return config.retryableErrors?.some(retryableError => 
    errorMessage.includes(retryableError.toLowerCase()) ||
    errorName.includes(retryableError.toLowerCase())
  ) ?? true
}

// Main retry function
export async function retry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const finalConfig = { ...defaultRetryConfig, ...config }
  let lastError: Error

  for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error

      // Don't retry if it's the last attempt or error is not retryable
      if (attempt === finalConfig.maxAttempts || !isRetryableError(lastError, finalConfig)) {
        throw new RetryError(
          `Operation failed after ${attempt} attempts`,
          attempt,
          lastError
        )
      }

      // Calculate delay for next attempt
      const delay = calculateDelay(attempt, finalConfig)

      // Call onRetry callback if provided
      finalConfig.onRetry?.(attempt, lastError, delay)

      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw new RetryError(
    `Operation failed after ${finalConfig.maxAttempts} attempts`,
    finalConfig.maxAttempts,
    lastError!
  )
}

// Circuit breaker implementation
export class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED'
  private failureCount = 0
  private lastFailureTime = 0
  private successCount = 0

  constructor(
    private config: CircuitBreakerConfig,
    private name = 'CircuitBreaker'
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.config.recoveryTimeout) {
        this.state = 'HALF_OPEN'
      } else {
        throw new CircuitBreakerError(`${this.name} is OPEN`)
      }
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private onSuccess(): void {
    this.failureCount = 0
    this.successCount++

    if (this.state === 'HALF_OPEN' && this.successCount >= this.config.failureThreshold) {
      this.state = 'CLOSED'
      this.successCount = 0
    }
  }

  private onFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()

    if (this.state === 'HALF_OPEN' || 
        (this.state === 'CLOSED' && this.failureCount >= this.config.failureThreshold)) {
      this.state = 'OPEN'
    }
  }

  getStatus() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime
    }
  }
}

// Retry with circuit breaker
export async function retryWithCircuitBreaker<T>(
  fn: () => Promise<T>,
  retryConfig: Partial<RetryConfig> = {},
  circuitBreakerConfig: Partial<CircuitBreakerConfig> = {}
): Promise<T> {
  const circuitBreaker = new CircuitBreaker({
    failureThreshold: 5,
    recoveryTimeout: 30000,
    expectedErrorRate: 0.5,
    ...circuitBreakerConfig
  })

  return circuitBreaker.execute(() => retry(fn, retryConfig))
}

// Specialized retry functions for common scenarios
export const retryApiCall = <T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
) => retry(fn, {
  ...config,
  maxAttempts: 3,
  baseDelay: 1000,
  retryableErrors: [
    'rate limit',
    'timeout',
    'network',
    'temporary',
    'service unavailable'
  ]
})

export const retryFileUpload = <T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
) => retry(fn, {
  ...config,
  maxAttempts: 5,
  baseDelay: 2000,
  retryableErrors: [
    'network',
    'timeout',
    'connection',
    'upload failed'
  ]
})

export const retryDatabaseOperation = <T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
) => retry(fn, {
  ...config,
  maxAttempts: 3,
  baseDelay: 500,
  retryableErrors: [
    'connection',
    'timeout',
    'deadlock',
    'temporary'
  ]
})

// Timeout wrapper
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operation timed out'
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
  })

  return Promise.race([promise, timeoutPromise])
}

// Retry with timeout
export async function retryWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  retryConfig: Partial<RetryConfig> = {}
): Promise<T> {
  return retry(
    () => withTimeout(fn(), timeoutMs),
    retryConfig
  )
}
