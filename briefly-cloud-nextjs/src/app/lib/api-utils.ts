/**
 * API utility functions for common operations
 * Provides helpers for responses, pagination, and data transformation
 */

import { NextResponse } from 'next/server'
import { formatSuccessResponse, formatErrorResponse, createError } from './api-errors'

// Response helpers
export const ApiResponse = {
  success: (data?: any, message?: string, status = 200) => 
    formatSuccessResponse(data, message, status),
    
  created: (data?: any, message = 'Resource created successfully') => 
    formatSuccessResponse(data, message, 201),
    
  noContent: (message = 'Operation completed successfully') => 
    formatSuccessResponse(undefined, message, 204),
    
  badRequest: (message: string, details?: any) => 
    formatErrorResponse(createError.validation(message, details)),
    
  unauthorized: (message = 'Unauthorized access') => 
    formatErrorResponse(createError.unauthorized(message)),
    
  forbidden: (message = 'Access forbidden') => 
    formatErrorResponse(createError.forbidden(message)),
    
  notFound: (resource = 'Resource') => 
    formatErrorResponse(createError.notFound(resource)),
    
  conflict: (message: string) => 
    formatErrorResponse(createError.conflict(message)),
    
  tooManyRequests: (message = 'Rate limit exceeded') => 
    formatErrorResponse(createError.rateLimitExceeded(message)),
    
  internalError: (message = 'Internal server error') => 
    formatErrorResponse(createError.internal(message)),
    
  serviceUnavailable: (service = 'Service') => 
    formatErrorResponse(createError.serviceUnavailable(service)),
}

// Pagination helpers
export interface PaginationParams {
  page?: number
  limit?: number
  offset?: number
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

export function parsePaginationParams(searchParams: URLSearchParams): PaginationParams {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))
  const offset = (page - 1) * limit

  return { page, limit, offset }
}

export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginatedResponse<T> {
  const { page = 1, limit = 20 } = params
  const totalPages = Math.ceil(total / limit)

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  }
}

// Query parameter helpers
export function parseQueryParams(searchParams: URLSearchParams): Record<string, any> {
  const params: Record<string, any> = {}
  
  for (const [key, value] of searchParams.entries()) {
    // Handle arrays (key[]=value1&key[]=value2)
    if (key.endsWith('[]')) {
      const arrayKey = key.slice(0, -2)
      if (!params[arrayKey]) {
        params[arrayKey] = []
      }
      params[arrayKey].push(value)
    }
    // Handle boolean values
    else if (value === 'true' || value === 'false') {
      params[key] = value === 'true'
    }
    // Handle numeric values
    else if (!isNaN(Number(value)) && value !== '') {
      params[key] = Number(value)
    }
    // Handle regular strings
    else {
      params[key] = value
    }
  }
  
  return params
}

// Request body helpers
export async function parseRequestBody<T = any>(request: Request): Promise<T | null> {
  try {
    const contentType = request.headers.get('content-type')
    
    if (contentType?.includes('application/json')) {
      return await request.json()
    }
    
    if (contentType?.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData()
      const body: Record<string, any> = {}
      
      for (const [key, value] of formData.entries()) {
        body[key] = value
      }
      
      return body as T
    }
    
    if (contentType?.includes('multipart/form-data')) {
      const formData = await request.formData()
      return formData as unknown as T
    }
    
    return null
  } catch {
    return null
  }
}

// File upload helpers
export interface FileUploadResult {
  success: boolean
  file?: File
  error?: string
}

export function validateFileUpload(
  file: File,
  options: {
    maxSize?: number // in bytes
    allowedTypes?: string[]
    allowedExtensions?: string[]
  } = {}
): FileUploadResult {
  const {
    maxSize = 10 * 1024 * 1024, // 10MB default
    allowedTypes = [],
    allowedExtensions = []
  } = options

  // Check file size
  if (file.size > maxSize) {
    return {
      success: false,
      error: `File size exceeds maximum allowed size of ${formatFileSize(maxSize)}`
    }
  }

  // Check MIME type
  if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
    return {
      success: false,
      error: `File type ${file.type} is not allowed. Allowed types: ${allowedTypes.join(', ')}`
    }
  }

  // Check file extension
  if (allowedExtensions.length > 0) {
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!extension || !allowedExtensions.includes(extension)) {
      return {
        success: false,
        error: `File extension .${extension} is not allowed. Allowed extensions: ${allowedExtensions.join(', ')}`
      }
    }
  }

  return { success: true, file }
}

export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`
}

// Helper function to format bytes (alias for consistency)
export const formatBytes = formatFileSize

// Data transformation helpers
export function sanitizeObject(obj: any, allowedFields: string[]): any {
  if (!obj || typeof obj !== 'object') return obj

  const sanitized: any = {}
  for (const field of allowedFields) {
    if (obj.hasOwnProperty(field)) {
      sanitized[field] = obj[field]
    }
  }
  return sanitized
}

export function omitFields(obj: any, fieldsToOmit: string[]): any {
  if (!obj || typeof obj !== 'object') return obj

  const result = { ...obj }
  for (const field of fieldsToOmit) {
    delete result[field]
  }
  return result
}

export function pickFields(obj: any, fieldsToPick: string[]): any {
  if (!obj || typeof obj !== 'object') return obj

  const result: any = {}
  for (const field of fieldsToPick) {
    if (obj.hasOwnProperty(field)) {
      result[field] = obj[field]
    }
  }
  return result
}

// URL helpers
export function getBaseUrl(request: Request): string {
  const url = new URL(request.url)
  return `${url.protocol}//${url.host}`
}

export function buildUrl(baseUrl: string, path: string, params?: Record<string, string>): string {
  const url = new URL(path, baseUrl)
  
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }
  }
  
  return url.toString()
}

// Cache helpers
export function setCacheHeaders(
  response: NextResponse,
  options: {
    maxAge?: number // in seconds
    staleWhileRevalidate?: number // in seconds
    mustRevalidate?: boolean
    noCache?: boolean
  } = {}
): NextResponse {
  const {
    maxAge = 0,
    staleWhileRevalidate,
    mustRevalidate = false,
    noCache = false
  } = options

  if (noCache) {
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
  } else {
    const cacheDirectives = [`max-age=${maxAge}`]
    
    if (staleWhileRevalidate) {
      cacheDirectives.push(`stale-while-revalidate=${staleWhileRevalidate}`)
    }
    
    if (mustRevalidate) {
      cacheDirectives.push('must-revalidate')
    }
    
    response.headers.set('Cache-Control', cacheDirectives.join(', '))
  }

  return response
}

// Security headers
export function setSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  
  return response
}

// Health check helper
export function createHealthCheck(serviceName: string, version: string = '1.0.0') {
  return {
    service: serviceName,
    version,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  }
}

// Async operation helpers
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

export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number
    delay?: number
    backoff?: boolean
  } = {}
): Promise<T> {
  const { maxAttempts = 3, delay = 1000, backoff = true } = options
  
  let lastError: Error
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      
      if (attempt === maxAttempts) {
        throw lastError
      }
      
      const waitTime = backoff ? delay * Math.pow(2, attempt - 1) : delay
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
  }
  
  throw lastError!
}