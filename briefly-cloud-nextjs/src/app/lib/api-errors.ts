/**
 * Centralized error handling for API routes
 * Provides consistent error responses and logging
 */

import { NextResponse } from 'next/server'

export enum ErrorCode {
  // Authentication errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  INVALID_TOKEN = 'INVALID_TOKEN',
  
  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_REQUEST = 'INVALID_REQUEST',
  
  // Resource errors
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  
  // Usage limit errors
  USAGE_LIMIT_EXCEEDED = 'USAGE_LIMIT_EXCEEDED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // External service errors
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  OPENAI_ERROR = 'OPENAI_ERROR',
  SUPABASE_ERROR = 'SUPABASE_ERROR',
  
  // Server errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

export interface ApiError {
  code: ErrorCode
  message: string
  details?: any
  statusCode: number
}

export class AppError extends Error {
  public readonly code: ErrorCode
  public readonly statusCode: number
  public readonly details?: any

  constructor(code: ErrorCode, message: string, statusCode: number = 500, details?: any) {
    super(message)
    this.code = code
    this.statusCode = statusCode
    this.details = details
    this.name = 'AppError'
  }
}

// Predefined error creators
export const createError = {
  unauthorized: (message = 'Unauthorized access') => 
    new AppError(ErrorCode.UNAUTHORIZED, message, 401),
    
  forbidden: (message = 'Access forbidden') => 
    new AppError(ErrorCode.FORBIDDEN, message, 403),
    
  invalidToken: (message = 'Invalid or expired token') => 
    new AppError(ErrorCode.INVALID_TOKEN, message, 401),
    
  validation: (message: string, details?: any) => 
    new AppError(ErrorCode.VALIDATION_ERROR, message, 400, details),
    
  notFound: (resource = 'Resource') => 
    new AppError(ErrorCode.NOT_FOUND, `${resource} not found`, 404),
    
  conflict: (message: string) => 
    new AppError(ErrorCode.CONFLICT, message, 409),
    
  usageLimitExceeded: (limitType: string, tier: string, current: number, limit: number) => 
    new AppError(
      ErrorCode.USAGE_LIMIT_EXCEEDED, 
      `You have exceeded your ${limitType} limit for the ${tier} tier`,
      429,
      { limitType, tier, current, limit, upgradeRequired: tier === 'free' }
    ),
    
  rateLimitExceeded: (message = 'Rate limit exceeded') => 
    new AppError(ErrorCode.RATE_LIMIT_EXCEEDED, message, 429),
    
  externalService: (service: string, message: string) => 
    new AppError(ErrorCode.EXTERNAL_SERVICE_ERROR, `${service} error: ${message}`, 502),
    
  openaiError: (message: string, details?: any) => 
    new AppError(ErrorCode.OPENAI_ERROR, `OpenAI API error: ${message}`, 502, details),
    
  supabaseError: (message: string, details?: any) => 
    new AppError(ErrorCode.SUPABASE_ERROR, `Database error: ${message}`, 500, details),
    
  internal: (message = 'Internal server error', details?: any) => 
    new AppError(ErrorCode.INTERNAL_ERROR, message, 500, details),
    
  serviceUnavailable: (service = 'Service') => 
    new AppError(ErrorCode.SERVICE_UNAVAILABLE, `${service} is currently unavailable`, 503),
}

// Error response formatter
export function formatErrorResponse(error: AppError | Error): NextResponse {
  if (error instanceof AppError) {
    const response = {
      success: false,
      error: error.code,
      message: error.message,
      ...(error.details && { details: error.details })
    }
    
    // Log error for monitoring
    console.error(`API Error [${error.code}]:`, {
      message: error.message,
      statusCode: error.statusCode,
      details: error.details,
      stack: error.stack
    })
    
    return NextResponse.json(response, { status: error.statusCode })
  }
  
  // Handle unexpected errors
  console.error('Unexpected API Error:', error)
  
  return NextResponse.json(
    {
      success: false,
      error: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred'
    },
    { status: 500 }
  )
}

// Success response formatter
export function formatSuccessResponse(data?: any, message?: string, status = 200): NextResponse {
  const response = {
    success: true,
    ...(data !== undefined && { data }),
    ...(message && { message })
  }
  
  return NextResponse.json(response, { status })
}

// Error handler wrapper for API routes
export function withErrorHandler(
  handler: (request: Request, context?: any) => Promise<NextResponse>
) {
  return async (request: Request, context?: any): Promise<NextResponse> => {
    try {
      return await handler(request, context)
    } catch (error) {
      return formatErrorResponse(error as Error)
    }
  }
}

// Async error handler for promises
export async function handleAsync<T>(
  promise: Promise<T>
): Promise<[T | null, AppError | null]> {
  try {
    const result = await promise
    return [result, null]
  } catch (error) {
    if (error instanceof AppError) {
      return [null, error]
    }
    return [null, createError.internal('Unexpected error occurred', error)]
  }
}