/**
 * Standardized API Response Module
 * Provides consistent HTTP responses with proper status codes, error categorization,
 * and correlation ID support for debugging
 */

import { NextResponse } from 'next/server'
import { logger } from './logger'

// Generate correlation ID for request tracking
function generateCorrelationId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Standard API response interface
export interface StandardApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    message: string
    code: string
    details?: Record<string, unknown>
  }
  message?: string
  timestamp: string
  correlationId?: string
}

// Error categories for proper HTTP semantics
export enum ErrorCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization', 
  VALIDATION = 'validation',
  RATE_LIMIT = 'rate_limit',
  USAGE_LIMIT = 'usage_limit',
  EXTERNAL_SERVICE = 'external_service',
  DATABASE = 'database',
  FILE_PROCESSING = 'file_processing',
  SYSTEM = 'system'
}

// Machine-readable error codes
export enum ApiErrorCode {
  // Authentication (401)
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  
  // Authorization (403)
  FORBIDDEN = 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED',
  
  // Validation (400)
  BAD_REQUEST = 'BAD_REQUEST',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_REQUEST = 'INVALID_REQUEST',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  
  // Resource (404, 409)
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  DUPLICATE_RESOURCE = 'DUPLICATE_RESOURCE',
  
  // Rate/Usage Limits (429, 402)
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  USAGE_LIMIT_EXCEEDED = 'USAGE_LIMIT_EXCEEDED',
  PAYMENT_REQUIRED = 'PAYMENT_REQUIRED',
  TIER_UPGRADE_REQUIRED = 'TIER_UPGRADE_REQUIRED',
  
  // External Services (502, 503)
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  OPENAI_ERROR = 'OPENAI_ERROR',
  OAUTH_ERROR = 'OAUTH_ERROR',
  CLOUD_STORAGE_ERROR = 'CLOUD_STORAGE_ERROR',
  
  // Database (500)
  DATABASE_ERROR = 'DATABASE_ERROR',
  SUPABASE_ERROR = 'SUPABASE_ERROR',
  
  // File Processing (422)
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  UNSUPPORTED_FILE_TYPE = 'UNSUPPORTED_FILE_TYPE',
  FILE_PROCESSING_ERROR = 'FILE_PROCESSING_ERROR',
  
  // System (500, 503)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  METHOD_NOT_ALLOWED = 'METHOD_NOT_ALLOWED'
}

/**
 * Standardized API Response Helper
 * Provides consistent response formatting with proper HTTP semantics
 */
export const ApiResponse = {
  // Success responses
  ok: (data?: unknown, message?: string, correlationId?: string): NextResponse => {
    const response: StandardApiResponse = {
      success: true,
      data: data ?? { ok: true },
      message,
      timestamp: new Date().toISOString(),
      correlationId
    }
    
    const headers: Record<string, string> = {}
    if (correlationId) {
      headers['X-Correlation-ID'] = correlationId
    }
    
    return NextResponse.json(response, { 
      status: 200,
      headers
    })
  },

  created: (data: unknown, message = 'Resource created successfully', correlationId?: string): NextResponse => {
    const response: StandardApiResponse = {
      success: true,
      data,
      message,
      timestamp: new Date().toISOString(),
      correlationId
    }
    
    const headers: Record<string, string> = {}
    if (correlationId) {
      headers['X-Correlation-ID'] = correlationId
    }
    
    return NextResponse.json(response, { 
      status: 201,
      headers
    })
  },

  accepted: (data?: unknown, message = 'Request accepted for processing', correlationId?: string): NextResponse => {
    const response: StandardApiResponse = {
      success: true,
      data,
      message,
      timestamp: new Date().toISOString(),
      correlationId
    }
    
    const headers: Record<string, string> = {}
    if (correlationId) {
      headers['X-Correlation-ID'] = correlationId
    }
    
    return NextResponse.json(response, { 
      status: 202,
      headers
    })
  },

  // Client error responses (4xx)
  badRequest: (message = 'Bad request', code = ApiErrorCode.BAD_REQUEST, details?: Record<string, unknown>, correlationId?: string): NextResponse => {
    const id = correlationId || generateCorrelationId()
    const response: StandardApiResponse = {
      success: false,
      error: { message, code, details },
      timestamp: new Date().toISOString(),
      correlationId: id
    }
    
    logger.warn('Bad request', { code, message, details, correlationId: id })
    
    return NextResponse.json(response, { 
      status: 400,
      headers: { 'X-Correlation-ID': id }
    })
  },

  unauthorized: (message = 'Unauthorized access', code = ApiErrorCode.UNAUTHORIZED, correlationId?: string): NextResponse => {
    const id = correlationId || generateCorrelationId()
    const response: StandardApiResponse = {
      success: false,
      error: { message, code },
      timestamp: new Date().toISOString(),
      correlationId: id
    }
    
    logger.warn('Unauthorized access attempt', { code, message, correlationId: id })
    
    return NextResponse.json(response, { 
      status: 401,
      headers: { 'X-Correlation-ID': id }
    })
  },

  forbidden: (message = 'Access forbidden', code = ApiErrorCode.FORBIDDEN, details?: Record<string, unknown>, correlationId?: string): NextResponse => {
    const id = correlationId || generateCorrelationId()
    const response: StandardApiResponse = {
      success: false,
      error: { message, code, details },
      timestamp: new Date().toISOString(),
      correlationId: id
    }
    
    logger.warn('Forbidden access attempt', { code, message, details, correlationId: id })
    
    return NextResponse.json(response, { 
      status: 403,
      headers: { 'X-Correlation-ID': id }
    })
  },

  notFound: (message = 'Resource not found', code = ApiErrorCode.NOT_FOUND, correlationId?: string): NextResponse => {
    const id = correlationId || generateCorrelationId()
    const response: StandardApiResponse = {
      success: false,
      error: { message, code },
      timestamp: new Date().toISOString(),
      correlationId: id
    }
    
    return NextResponse.json(response, { 
      status: 404,
      headers: { 'X-Correlation-ID': id }
    })
  },

  methodNotAllowed: (message = 'Method not allowed', allowedMethods?: string[], correlationId?: string): NextResponse => {
    const id = correlationId || generateCorrelationId()
    const response: StandardApiResponse = {
      success: false,
      error: { 
        message, 
        code: ApiErrorCode.METHOD_NOT_ALLOWED,
        details: allowedMethods ? { allowedMethods } : undefined
      },
      timestamp: new Date().toISOString(),
      correlationId: id
    }
    
    const headers: Record<string, string> = { 'X-Correlation-ID': id }
    if (allowedMethods) {
      headers['Allow'] = allowedMethods.join(', ')
    }
    
    return NextResponse.json(response, { 
      status: 405,
      headers
    })
  },

  conflict: (message = 'Resource conflict', code = ApiErrorCode.CONFLICT, details?: Record<string, unknown>, correlationId?: string): NextResponse => {
    const id = correlationId || generateCorrelationId()
    const response: StandardApiResponse = {
      success: false,
      error: { message, code, details },
      timestamp: new Date().toISOString(),
      correlationId: id
    }
    
    return NextResponse.json(response, { 
      status: 409,
      headers: { 'X-Correlation-ID': id }
    })
  },

  unprocessableEntity: (message = 'Unprocessable entity', code = ApiErrorCode.VALIDATION_ERROR, details?: Record<string, unknown>, correlationId?: string): NextResponse => {
    const id = correlationId || generateCorrelationId()
    const response: StandardApiResponse = {
      success: false,
      error: { message, code, details },
      timestamp: new Date().toISOString(),
      correlationId: id
    }
    
    return NextResponse.json(response, { 
      status: 422,
      headers: { 'X-Correlation-ID': id }
    })
  },

  // Rate limiting and usage limits (429, 402)
  rateLimitExceeded: (message = 'Rate limit exceeded', details?: Record<string, unknown>, correlationId?: string): NextResponse => {
    const id = correlationId || generateCorrelationId()
    const response: StandardApiResponse = {
      success: false,
      error: { 
        message, 
        code: ApiErrorCode.RATE_LIMIT_EXCEEDED,
        details
      },
      timestamp: new Date().toISOString(),
      correlationId: id
    }
    
    logger.warn('Rate limit exceeded', { details, correlationId: id })
    
    return NextResponse.json(response, { 
      status: 429,
      headers: { 'X-Correlation-ID': id }
    })
  },

  usageLimitExceeded: (resource: string, tier: string, current: number, limit: number, correlationId?: string): NextResponse => {
    const id = correlationId || generateCorrelationId()
    const message = `${resource} limit exceeded for ${tier} tier`
    const response: StandardApiResponse = {
      success: false,
      error: {
        message,
        code: ApiErrorCode.USAGE_LIMIT_EXCEEDED,
        details: { resource, tier, current, limit }
      },
      timestamp: new Date().toISOString(),
      correlationId: id
    }
    
    logger.warn('Usage limit exceeded', { resource, tier, current, limit, correlationId: id })
    
    return NextResponse.json(response, { 
      status: 429,
      headers: { 'X-Correlation-ID': id }
    })
  },

  paymentRequired: (message = 'Payment required', details?: Record<string, unknown>, correlationId?: string): NextResponse => {
    const id = correlationId || generateCorrelationId()
    const response: StandardApiResponse = {
      success: false,
      error: { 
        message, 
        code: ApiErrorCode.PAYMENT_REQUIRED,
        details
      },
      timestamp: new Date().toISOString(),
      correlationId: id
    }
    
    return NextResponse.json(response, { 
      status: 402,
      headers: { 'X-Correlation-ID': id }
    })
  },

  // Server error responses (5xx)
  serverError: (message = 'Internal server error', code = ApiErrorCode.INTERNAL_ERROR, details?: Record<string, unknown>, correlationId?: string): NextResponse => {
    const id = correlationId || generateCorrelationId()
    const response: StandardApiResponse = {
      success: false,
      error: { message, code, details },
      timestamp: new Date().toISOString(),
      correlationId: id
    }
    
    logger.error('Server error', { code, message, details, correlationId: id })
    
    return NextResponse.json(response, { 
      status: 500,
      headers: { 'X-Correlation-ID': id }
    })
  },

  badGateway: (service: string, message?: string, correlationId?: string): NextResponse => {
    const id = correlationId || generateCorrelationId()
    const errorMessage = message || `${service} service error`
    const response: StandardApiResponse = {
      success: false,
      error: {
        message: errorMessage,
        code: ApiErrorCode.EXTERNAL_SERVICE_ERROR,
        details: { service }
      },
      timestamp: new Date().toISOString(),
      correlationId: id
    }
    
    logger.error('External service error', { service, message: errorMessage, correlationId: id })
    
    return NextResponse.json(response, { 
      status: 502,
      headers: { 'X-Correlation-ID': id }
    })
  },

  serviceUnavailable: (service = 'Service', message?: string, correlationId?: string): NextResponse => {
    const id = correlationId || generateCorrelationId()
    const errorMessage = message || `${service} is currently unavailable`
    const response: StandardApiResponse = {
      success: false,
      error: {
        message: errorMessage,
        code: ApiErrorCode.SERVICE_UNAVAILABLE,
        details: { service }
      },
      timestamp: new Date().toISOString(),
      correlationId: id
    }
    
    logger.error('Service unavailable', { service, message: errorMessage, correlationId: id })
    
    return NextResponse.json(response, { 
      status: 503,
      headers: { 'X-Correlation-ID': id }
    })
  },

  // Specialized error responses for common scenarios
  fileProcessingError: (message = 'File processing failed', details?: Record<string, unknown>, correlationId?: string): NextResponse => {
    return ApiResponse.unprocessableEntity(message, ApiErrorCode.FILE_PROCESSING_ERROR, details, correlationId)
  },

  fileTooLarge: (maxSize: string, actualSize?: string, correlationId?: string): NextResponse => {
    const details = actualSize ? { maxSize, actualSize } : { maxSize }
    return ApiResponse.unprocessableEntity(
      `File size exceeds limit of ${maxSize}`,
      ApiErrorCode.FILE_TOO_LARGE,
      details,
      correlationId
    )
  },

  unsupportedFileType: (fileType: string, supportedTypes: string[], correlationId?: string): NextResponse => {
    return ApiResponse.unprocessableEntity(
      `Unsupported file type: ${fileType}`,
      ApiErrorCode.UNSUPPORTED_FILE_TYPE,
      { fileType, supportedTypes },
      correlationId
    )
  },

  databaseError: (message = 'Database operation failed', details?: Record<string, unknown>, correlationId?: string): NextResponse => {
    return ApiResponse.serverError(message, ApiErrorCode.DATABASE_ERROR, details, correlationId)
  },

  openaiError: (message = 'OpenAI API error', details?: Record<string, unknown>, correlationId?: string): NextResponse => {
    return ApiResponse.badGateway('OpenAI', message, correlationId)
  },

  oauthError: (provider: string, message = 'OAuth authentication failed', correlationId?: string): NextResponse => {
    return ApiResponse.badGateway(provider, message, correlationId)
  },

  cloudStorageError: (provider: string, message = 'Cloud storage operation failed', correlationId?: string): NextResponse => {
    return ApiResponse.badGateway(provider, message, correlationId)
  }
}

// Helper function to extract correlation ID from request context
export function getCorrelationId(context?: { correlationId?: string }): string {
  return context?.correlationId || generateCorrelationId()
}

// Type guard for checking if response is an error
export function isErrorResponse(response: StandardApiResponse): response is StandardApiResponse & { error: NonNullable<StandardApiResponse['error']> } {
  return !response.success && !!response.error
}

// Helper to create custom error responses
export function createCustomErrorResponse(
  statusCode: number,
  message: string,
  code: string,
  details?: Record<string, unknown>,
  correlationId?: string
): NextResponse {
  const id = correlationId || generateCorrelationId()
  const response: StandardApiResponse = {
    success: false,
    error: { message, code, details },
    timestamp: new Date().toISOString(),
    correlationId: id
  }
  
  return NextResponse.json(response, {
    status: statusCode,
    headers: { 'X-Correlation-ID': id }
  })
}