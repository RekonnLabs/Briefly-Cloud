/**
 * Security utilities and middleware for the application
 * Includes CORS, security headers, input sanitization, and API key management
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

// Security configuration
export const SECURITY_CONFIG = {
  // CORS settings
  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || [
      'https://rekonnlabs.com',
      'https://briefly.rekonnlabs.com',
      'http://localhost:3000'
    ],
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-API-Key'
    ],
    credentials: true,
    maxAge: 86400 // 24 hours
  },

  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100, // requests per window
    skipSuccessfulRequests: false,
    skipFailedRequests: false
  },

  // Input validation
  inputValidation: {
    maxStringLength: 10000,
    maxArrayLength: 100,
    allowedFileTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/markdown',
      'text/csv'
    ],
    maxFileSize: 50 * 1024 * 1024 // 50MB
  },

  // Security headers
  headers: {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
  }
}

// CORS middleware
export function corsMiddleware(request: NextRequest): NextResponse | null {
  const origin = request.headers.get('origin')
  const method = request.method

  // Handle preflight requests
  if (method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 200 })
    
    // Set CORS headers
    if (origin && SECURITY_CONFIG.cors.allowedOrigins.includes(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin)
    }
    response.headers.set('Access-Control-Allow-Methods', SECURITY_CONFIG.cors.allowedMethods.join(', '))
    response.headers.set('Access-Control-Allow-Headers', SECURITY_CONFIG.cors.allowedHeaders.join(', '))
    response.headers.set('Access-Control-Allow-Credentials', 'true')
    response.headers.set('Access-Control-Max-Age', SECURITY_CONFIG.cors.maxAge.toString())
    
    return response
  }

  // Handle actual requests
  if (origin && !SECURITY_CONFIG.cors.allowedOrigins.includes(origin)) {
    return new NextResponse(
      JSON.stringify({ error: 'CORS policy violation' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )
  }

  return null
}

// Security headers middleware
export function securityHeadersMiddleware(response: NextResponse): NextResponse {
  Object.entries(SECURITY_CONFIG.headers).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  
  // Add CSP header
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' https://api.openai.com https://api.stripe.com https://*.supabase.co https://*.chroma.cloud",
    "frame-src https://js.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ')
  
  response.headers.set('Content-Security-Policy', csp)
  
  return response
}

// Input sanitization utilities
export class InputSanitizer {
  // Sanitize string input
  static sanitizeString(input: string, maxLength = SECURITY_CONFIG.inputValidation.maxStringLength): string {
    if (typeof input !== 'string') {
      throw new Error('Input must be a string')
    }
    
    // Remove null bytes and control characters
    let sanitized = input.replace(/[\x00-\x1F\x7F]/g, '')
    
    // Trim whitespace
    sanitized = sanitized.trim()
    
    // Check length
    if (sanitized.length > maxLength) {
      throw new Error(`Input exceeds maximum length of ${maxLength} characters`)
    }
    
    return sanitized
  }

  // Sanitize file input
  static sanitizeFile(file: File): File {
    // Check file size
    if (file.size > SECURITY_CONFIG.inputValidation.maxFileSize) {
      throw new Error(`File size exceeds maximum of ${SECURITY_CONFIG.inputValidation.maxFileSize / 1024 / 1024}MB`)
    }
    
    // Check file type
    if (!SECURITY_CONFIG.inputValidation.allowedFileTypes.includes(file.type)) {
      throw new Error(`File type ${file.type} is not allowed`)
    }
    
    // Sanitize filename
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    
    return new File([file], sanitizedName, { type: file.type })
  }

  // Sanitize array input
  static sanitizeArray<T>(input: T[], maxLength = SECURITY_CONFIG.inputValidation.maxArrayLength): T[] {
    if (!Array.isArray(input)) {
      throw new Error('Input must be an array')
    }
    
    if (input.length > maxLength) {
      throw new Error(`Array length exceeds maximum of ${maxLength} items`)
    }
    
    return input
  }

  // Sanitize object input
  static sanitizeObject<T extends Record<string, any>>(input: T, allowedKeys: string[]): Partial<T> {
    const sanitized: Partial<T> = {}
    
    for (const key of allowedKeys) {
      if (key in input && input[key] !== undefined && input[key] !== null) {
        sanitized[key] = input[key]
      }
    }
    
    return sanitized
  }
}

// API key management
export class APIKeyManager {
  private static readonly KEY_PREFIX = 'briefly_'
  private static readonly KEY_LENGTH = 32

  // Generate a new API key
  static generateKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = this.KEY_PREFIX
    
    for (let i = 0; i < this.KEY_LENGTH; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    
    return result
  }

  // Validate API key format
  static validateKey(key: string): boolean {
    return key.startsWith(this.KEY_PREFIX) && key.length === this.KEY_PREFIX.length + this.KEY_LENGTH
  }

  // Hash API key for storage
  static async hashKey(key: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(key)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  // Verify API key
  static async verifyKey(key: string, hashedKey: string): Promise<boolean> {
    const hashed = await this.hashKey(key)
    return hashed === hashedKey
  }
}

// Zod schemas for input validation
export const securitySchemas = {
  // User input validation
  userInput: z.object({
    name: z.string().min(1).max(100).transform(InputSanitizer.sanitizeString),
    email: z.string().email().max(255),
    message: z.string().min(1).max(5000).transform(InputSanitizer.sanitizeString)
  }),

  // File upload validation
  fileUpload: z.object({
    file: z.instanceof(File).refine(
      (file) => SECURITY_CONFIG.inputValidation.allowedFileTypes.includes(file.type),
      'File type not allowed'
    ).refine(
      (file) => file.size <= SECURITY_CONFIG.inputValidation.maxFileSize,
      'File too large'
    )
  }),

  // Chat message validation
  chatMessage: z.object({
    message: z.string().min(1).max(5000).transform(InputSanitizer.sanitizeString),
    conversationId: z.string().optional(),
    stream: z.boolean().optional()
  }),

  // Search query validation
  searchQuery: z.object({
    query: z.string().min(1).max(1000).transform(InputSanitizer.sanitizeString),
    limit: z.number().min(1).max(50).optional().default(10),
    filters: z.record(z.string(), z.any()).optional()
  }),

  // Billing validation
  billingCheckout: z.object({
    tier: z.enum(['pro', 'pro_byok']),
    successUrl: z.string().url().optional(),
    cancelUrl: z.string().url().optional()
  })
}

// Rate limiting implementation
export class RateLimiter {
  private static readonly store = new Map<string, { count: number; resetTime: number }>()

  static isRateLimited(identifier: string): boolean {
    const now = Date.now()
    const record = this.store.get(identifier)

    if (!record || now > record.resetTime) {
      // Reset or create new record
      this.store.set(identifier, {
        count: 1,
        resetTime: now + SECURITY_CONFIG.rateLimit.windowMs
      })
      return false
    }

    if (record.count >= SECURITY_CONFIG.rateLimit.maxRequests) {
      return true
    }

    record.count++
    return false
  }

  static getRemainingRequests(identifier: string): number {
    const record = this.store.get(identifier)
    if (!record || Date.now() > record.resetTime) {
      return SECURITY_CONFIG.rateLimit.maxRequests
    }
    return Math.max(0, SECURITY_CONFIG.rateLimit.maxRequests - record.count)
  }

  static cleanup(): void {
    const now = Date.now()
    for (const [key, record] of this.store.entries()) {
      if (now > record.resetTime) {
        this.store.delete(key)
      }
    }
  }
}

// Security middleware composer
export function createSecurityMiddleware() {
  return function securityMiddleware(request: NextRequest, response: NextResponse): NextResponse {
    // Apply CORS
    const corsResponse = corsMiddleware(request)
    if (corsResponse) return corsResponse

    // Apply security headers
    return securityHeadersMiddleware(response)
  }
}

// Environment validation
export function validateEnvironment(): void {
  const requiredEnvVars = [
    'NEXTAUTH_URL',
    'NEXTAUTH_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'AZURE_AD_CLIENT_ID',
    'AZURE_AD_CLIENT_SECRET',
    'AZURE_AD_TENANT_ID',
    'OPENAI_API_KEY',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'STRIPE_SECRET_KEY',
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    'STRIPE_WEBHOOK_SECRET'
  ]

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName])
  
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`)
  }

  // Validate URLs
  const urlVars = ['NEXTAUTH_URL', 'NEXT_PUBLIC_SUPABASE_URL']
  for (const varName of urlVars) {
    try {
      new URL(process.env[varName]!)
    } catch {
      throw new Error(`Invalid URL in environment variable: ${varName}`)
    }
  }
}

// Cleanup rate limiter periodically
setInterval(() => {
  RateLimiter.cleanup()
}, 60000) // Clean up every minute
