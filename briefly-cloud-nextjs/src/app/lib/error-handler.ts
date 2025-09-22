/**
 * Comprehensive Error Handler
 * Provides centralized error handling, categorization, and logging
 */

import { NextResponse } from 'next/server'
import { ApiResponse, ApiErrorCode, ErrorCategory } from './api-response'
import { logger } from './logger'
import type { ApiContext } from './api-middleware'

export interface AppError {
  category: ErrorCategory
  code: string
  message: string
  details?: Record<string, unknown>
  correlationId?: string
  retryable: boolean
  statusCode?: number
}

export interface ErrorMetrics {
  errorCount: number
  errorRate: number
  lastError?: Date
  errorsByCategory: Record<ErrorCategory, number>
  errorsByCode: Record<string, number>
}

/**
 * Comprehensive Error Handler with categorization and monitoring
 */
export class ErrorHandler {
  private static errorMetrics: ErrorMetrics = {
    errorCount: 0,
    errorRate: 0,
    errorsByCategory: {} as Record<ErrorCategory, number>,
    errorsByCode: {} as Record<string, number>
  }

  /**
   * Create a structured application error
   */
  static createError(
    category: ErrorCategory,
    code: string,
    message: string,
    details?: Record<string, unknown>,
    retryable = false,
    statusCode?: number
  ): AppError {
    return {
      category,
      code,
      message,
      details,
      correlationId: this.generateCorrelationId(),
      retryable,
      statusCode
    }
  }

  /**
   * Main error handling function - processes any error and returns appropriate response
   */
  static handleError(error: unknown, context: ApiContext): NextResponse {
    const correlationId = context.correlationId
    
    // Update error metrics
    this.updateErrorMetrics(error)

    // Handle structured AppError
    if (this.isAppError(error)) {
      return this.formatErrorResponse(error, correlationId)
    }

    // Handle known error types
    if (error instanceof Error) {
      const categorizedError = this.categorizeError(error, correlationId)
      return this.formatErrorResponse(categorizedError, correlationId)
    }

    // Handle unknown errors
    logger.error('Unexpected error type:', error, { correlationId, context: this.sanitizeContext(context) })
    
    return ApiResponse.serverError(
      'An unexpected error occurred',
      ApiErrorCode.INTERNAL_ERROR,
      { errorType: typeof error },
      correlationId
    )
  }

  /**
   * Categorize generic errors into structured AppErrors
   */
  private static categorizeError(error: Error, correlationId: string): AppError {
    const message = error.message.toLowerCase()
    
    // Authentication errors
    if (this.matchesPatterns(message, ['unauthorized', 'authentication', 'invalid token', 'token expired'])) {
      return this.createError(
        ErrorCategory.AUTHENTICATION,
        ApiErrorCode.UNAUTHORIZED,
        error.message,
        { originalError: error.name },
        false,
        401
      )
    }

    // Authorization errors
    if (this.matchesPatterns(message, ['forbidden', 'access denied', 'insufficient permissions'])) {
      return this.createError(
        ErrorCategory.AUTHORIZATION,
        ApiErrorCode.FORBIDDEN,
        error.message,
        { originalError: error.name },
        false,
        403
      )
    }

    // Validation errors
    if (this.matchesPatterns(message, ['validation', 'invalid input', 'bad request', 'missing required'])) {
      return this.createError(
        ErrorCategory.VALIDATION,
        ApiErrorCode.VALIDATION_ERROR,
        error.message,
        { originalError: error.name },
        false,
        400
      )
    }

    // Rate limiting errors
    if (this.matchesPatterns(message, ['rate limit', 'too many requests', 'quota exceeded'])) {
      return this.createError(
        ErrorCategory.RATE_LIMIT,
        ApiErrorCode.RATE_LIMIT_EXCEEDED,
        error.message,
        { originalError: error.name },
        true,
        429
      )
    }

    // External service errors
    if (this.matchesPatterns(message, ['openai', 'api error', 'external service', 'timeout', 'network'])) {
      return this.createError(
        ErrorCategory.EXTERNAL_SERVICE,
        ApiErrorCode.EXTERNAL_SERVICE_ERROR,
        error.message,
        { originalError: error.name },
        true,
        502
      )
    }

    // Database errors
    if (this.matchesPatterns(message, ['database', 'supabase', 'connection', 'query', 'sql'])) {
      return this.createError(
        ErrorCategory.DATABASE,
        ApiErrorCode.DATABASE_ERROR,
        error.message,
        { originalError: error.name },
        true,
        500
      )
    }

    // File processing errors
    if (this.matchesPatterns(message, ['file', 'upload', 'processing', 'mime type', 'size limit'])) {
      return this.createError(
        ErrorCategory.FILE_PROCESSING,
        ApiErrorCode.FILE_PROCESSING_ERROR,
        error.message,
        { originalError: error.name },
        false,
        422
      )
    }

    // Default to system error
    return this.createError(
      ErrorCategory.SYSTEM,
      ApiErrorCode.INTERNAL_ERROR,
      error.message,
      { originalError: error.name, stack: error.stack },
      false,
      500
    )
  }

  /**
   * Format AppError into appropriate HTTP response
   */
  private static formatErrorResponse(error: AppError, correlationId: string): NextResponse {
    // Log error with appropriate level
    const logLevel = this.getLogLevel(error.category)
    const logData = {
      category: error.category,
      code: error.code,
      message: error.message,
      details: error.details,
      correlationId,
      retryable: error.retryable
    }

    logger[logLevel](`${error.category} error`, logData)

    // Return appropriate response based on category and status code
    const statusCode = error.statusCode || this.getDefaultStatusCode(error.category)
    
    switch (statusCode) {
      case 400:
        return ApiResponse.badRequest(error.message, error.code, error.details, correlationId)
      case 401:
        return ApiResponse.unauthorized(error.message, error.code, correlationId)
      case 403:
        return ApiResponse.forbidden(error.message, error.code, error.details, correlationId)
      case 404:
        return ApiResponse.notFound(error.message, error.code, correlationId)
      case 409:
        return ApiResponse.conflict(error.message, error.code, error.details, correlationId)
      case 422:
        return ApiResponse.unprocessableEntity(error.message, error.code, error.details, correlationId)
      case 429:
        return ApiResponse.rateLimitExceeded(error.message, error.details, correlationId)
      case 502:
        return ApiResponse.badGateway('External Service', error.message, correlationId)
      case 503:
        return ApiResponse.serviceUnavailable('Service', error.message, correlationId)
      default:
        return ApiResponse.serverError(error.message, error.code, error.details, correlationId)
    }
  }

  /**
   * Get appropriate log level for error category
   */
  private static getLogLevel(category: ErrorCategory): 'debug' | 'info' | 'warn' | 'error' {
    switch (category) {
      case ErrorCategory.AUTHENTICATION:
      case ErrorCategory.AUTHORIZATION:
      case ErrorCategory.VALIDATION:
        return 'warn'
      case ErrorCategory.RATE_LIMIT:
        return 'info'
      case ErrorCategory.EXTERNAL_SERVICE:
        return 'warn'
      case ErrorCategory.DATABASE:
      case ErrorCategory.SYSTEM:
        return 'error'
      default:
        return 'error'
    }
  }

  /**
   * Get default HTTP status code for error category
   */
  private static getDefaultStatusCode(category: ErrorCategory): number {
    switch (category) {
      case ErrorCategory.AUTHENTICATION:
        return 401
      case ErrorCategory.AUTHORIZATION:
        return 403
      case ErrorCategory.VALIDATION:
        return 400
      case ErrorCategory.RATE_LIMIT:
        return 429
      case ErrorCategory.EXTERNAL_SERVICE:
        return 502
      case ErrorCategory.DATABASE:
      case ErrorCategory.SYSTEM:
        return 500
      case ErrorCategory.FILE_PROCESSING:
        return 422
      default:
        return 500
    }
  }

  /**
   * Check if error matches any of the given patterns
   */
  private static matchesPatterns(message: string, patterns: string[]): boolean {
    return patterns.some(pattern => message.includes(pattern.toLowerCase()))
  }

  /**
   * Type guard for AppError
   */
  private static isAppError(error: unknown): error is AppError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'category' in error &&
      'code' in error &&
      'message' in error &&
      'retryable' in error
    )
  }

  /**
   * Update error metrics for monitoring
   */
  private static updateErrorMetrics(error: unknown): void {
    this.errorMetrics.errorCount++
    this.errorMetrics.lastError = new Date()

    if (this.isAppError(error)) {
      // Update category metrics
      if (!this.errorMetrics.errorsByCategory[error.category]) {
        this.errorMetrics.errorsByCategory[error.category] = 0
      }
      this.errorMetrics.errorsByCategory[error.category]++

      // Update code metrics
      if (!this.errorMetrics.errorsByCode[error.code]) {
        this.errorMetrics.errorsByCode[error.code] = 0
      }
      this.errorMetrics.errorsByCode[error.code]++
    }

    // Calculate error rate (errors per minute over last hour)
    // This is a simplified calculation - in production you'd want a sliding window
    const now = Date.now()
    const oneHourAgo = now - (60 * 60 * 1000)
    this.errorMetrics.errorRate = this.errorMetrics.errorCount / 60 // Simplified rate
  }

  /**
   * Get current error metrics
   */
  static getErrorMetrics(): ErrorMetrics {
    return { ...this.errorMetrics }
  }

  /**
   * Reset error metrics (useful for testing)
   */
  static resetErrorMetrics(): void {
    this.errorMetrics = {
      errorCount: 0,
      errorRate: 0,
      errorsByCategory: {} as Record<ErrorCategory, number>,
      errorsByCode: {} as Record<string, number>
    }
  }

  /**
   * Sanitize context for logging (remove sensitive data)
   */
  private static sanitizeContext(context: ApiContext): Partial<ApiContext> {
    return {
      correlationId: context.correlationId,
      startTime: context.startTime,
      metadata: {
        method: context.metadata.method,
        url: context.metadata.url,
        userAgent: context.metadata.userAgent,
        ip: context.metadata.ip
        // Exclude potentially sensitive data
      }
    }
  }

  /**
   * Generate correlation ID
   */
  private static generateCorrelationId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Check if error is retryable
   */
  static isRetryableError(error: unknown): boolean {
    if (this.isAppError(error)) {
      return error.retryable
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase()
      return this.matchesPatterns(message, [
        'timeout',
        'network',
        'connection',
        'rate limit',
        'temporary',
        'service unavailable',
        'econnreset',
        'enotfound',
        'etimedout'
      ])
    }

    return false
  }

  /**
   * Create specific error types for common scenarios
   */
  static authenticationError(message = 'Authentication required', details?: Record<string, unknown>): AppError {
    return this.createError(
      ErrorCategory.AUTHENTICATION,
      ApiErrorCode.UNAUTHORIZED,
      message,
      details,
      false,
      401
    )
  }

  static validationError(message = 'Validation failed', details?: Record<string, unknown>): AppError {
    return this.createError(
      ErrorCategory.VALIDATION,
      ApiErrorCode.VALIDATION_ERROR,
      message,
      details,
      false,
      400
    )
  }

  static rateLimitError(message = 'Rate limit exceeded', details?: Record<string, unknown>): AppError {
    return this.createError(
      ErrorCategory.RATE_LIMIT,
      ApiErrorCode.RATE_LIMIT_EXCEEDED,
      message,
      details,
      true,
      429
    )
  }

  static externalServiceError(service: string, message?: string, details?: Record<string, unknown>): AppError {
    return this.createError(
      ErrorCategory.EXTERNAL_SERVICE,
      ApiErrorCode.EXTERNAL_SERVICE_ERROR,
      message || `${service} service error`,
      { service, ...details },
      true,
      502
    )
  }

  static databaseError(message = 'Database operation failed', details?: Record<string, unknown>): AppError {
    return this.createError(
      ErrorCategory.DATABASE,
      ApiErrorCode.DATABASE_ERROR,
      message,
      details,
      true,
      500
    )
  }

  static fileProcessingError(message = 'File processing failed', details?: Record<string, unknown>): AppError {
    return this.createError(
      ErrorCategory.FILE_PROCESSING,
      ApiErrorCode.FILE_PROCESSING_ERROR,
      message,
      details,
      false,
      422
    )
  }
}
