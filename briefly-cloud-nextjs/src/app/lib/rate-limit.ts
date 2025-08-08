/**
 * Rate limiting middleware for API routes
 * Implements token bucket algorithm with Redis-like in-memory storage
 */

import { NextResponse } from 'next/server'
import { createError } from './api-errors'

export interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Maximum requests per window
  keyGenerator?: (request: Request) => string // Custom key generator
  skipSuccessfulRequests?: boolean // Don't count successful requests
  skipFailedRequests?: boolean // Don't count failed requests
}

interface RateLimitEntry {
  count: number
  resetTime: number
}

// In-memory store (in production, use Redis)
const rateLimitStore = new Map<string, RateLimitEntry>()

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key)
    }
  }
}, 5 * 60 * 1000)

// Default key generator (IP-based)
function defaultKeyGenerator(request: Request): string {
  // In production, get real IP from headers
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0] : 'unknown'
  return `rate_limit:${ip}`
}

// User-based key generator
export function userKeyGenerator(userId: string): string {
  return `rate_limit:user:${userId}`
}

// Endpoint-based key generator
export function endpointKeyGenerator(request: Request, endpoint: string): string {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
  return `rate_limit:${endpoint}:${ip}`
}

// Check rate limit
export function checkRateLimit(key: string, config: RateLimitConfig): {
  allowed: boolean
  remaining: number
  resetTime: number
  totalHits: number
} {
  const now = Date.now()
  const entry = rateLimitStore.get(key)
  
  if (!entry || entry.resetTime < now) {
    // Create new entry or reset expired one
    const newEntry: RateLimitEntry = {
      count: 1,
      resetTime: now + config.windowMs
    }
    rateLimitStore.set(key, newEntry)
    
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime: newEntry.resetTime,
      totalHits: 1
    }
  }
  
  // Increment existing entry
  entry.count++
  
  return {
    allowed: entry.count <= config.maxRequests,
    remaining: Math.max(0, config.maxRequests - entry.count),
    resetTime: entry.resetTime,
    totalHits: entry.count
  }
}

// Rate limit middleware
export function withRateLimit(config: RateLimitConfig) {
  return function rateLimitMiddleware<T extends (request: Request, context?: any) => Promise<NextResponse>>(
    handler: T
  ): T {
    return (async (request: Request, context?: any): Promise<NextResponse> => {
      const keyGenerator = config.keyGenerator || defaultKeyGenerator
      const key = keyGenerator(request)
      
      const result = checkRateLimit(key, config)
      
      if (!result.allowed) {
        throw createError.rateLimitExceeded(
          `Too many requests. Try again in ${Math.ceil((result.resetTime - Date.now()) / 1000)} seconds.`
        )
      }
      
      const response = await handler(request, context)
      
      // Add rate limit headers
      response.headers.set('X-RateLimit-Limit', config.maxRequests.toString())
      response.headers.set('X-RateLimit-Remaining', result.remaining.toString())
      response.headers.set('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000).toString())
      
      return response
    }) as T
  }
}

// Predefined rate limit configurations
export const rateLimitConfigs = {
  // General API endpoints
  general: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100, // 100 requests per 15 minutes
  },
  
  // Authentication endpoints
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 10, // 10 auth attempts per 15 minutes
  },
  
  // Chat endpoints (more restrictive)
  chat: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20, // 20 chat messages per minute
  },
  
  // File upload endpoints
  upload: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 50, // 50 uploads per hour
  },
  
  // Embedding/processing endpoints
  embedding: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10, // 10 embedding jobs per hour
  },
  
  // Strict rate limit for sensitive operations
  strict: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 5, // 5 requests per hour
  }
}

// Convenience functions for common rate limits
export const withGeneralRateLimit = () => withRateLimit(rateLimitConfigs.general)
export const withAuthRateLimit = () => withRateLimit(rateLimitConfigs.auth)
export const withChatRateLimit = () => withRateLimit(rateLimitConfigs.chat)
export const withUploadRateLimit = () => withRateLimit(rateLimitConfigs.upload)
export const withEmbeddingRateLimit = () => withRateLimit(rateLimitConfigs.embedding)
export const withStrictRateLimit = () => withRateLimit(rateLimitConfigs.strict)

// User-specific rate limiting
export function withUserRateLimit(userId: string, config: RateLimitConfig) {
  return withRateLimit({
    ...config,
    keyGenerator: () => userKeyGenerator(userId)
  })
}

// Endpoint-specific rate limiting
export function withEndpointRateLimit(endpoint: string, config: RateLimitConfig) {
  return withRateLimit({
    ...config,
    keyGenerator: (request) => endpointKeyGenerator(request, endpoint)
  })
}