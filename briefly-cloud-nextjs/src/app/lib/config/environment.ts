/**
 * Environment Configuration and Validation
 * 
 * This module provides secure environment configuration management
 * with validation, sanitization, and production security settings.
 */

import { logger } from '@/app/lib/logger'

export type Environment = 'development' | 'staging' | 'production'

export interface SecurityConfig {
  environment: Environment
  debug: boolean
  cors: {
    origins: string[]
    credentials: boolean
    methods: string[]
    allowedHeaders: string[]
  }
  session: {
    secure: boolean
    httpOnly: boolean
    sameSite: 'strict' | 'lax' | 'none'
    maxAge: number
    domain?: string
  }
  headers: {
    hsts: {
      maxAge: number
      includeSubDomains: boolean
      preload: boolean
    }
    csp: {
      directives: Record<string, string[]>
    }
    frameOptions: 'DENY' | 'SAMEORIGIN'
    contentTypeOptions: boolean
    xssProtection: boolean
  }
  rateLimit: {
    windowMs: number
    max: number
    skipSuccessfulRequests: boolean
  }
  encryption: {
    algorithm: string
    keyLength: number
  }
}

/**
 * Environment variable schema for validation
 */
const ENV_SCHEMA = {
  // Core application
  NODE_ENV: { required: true, type: 'string', values: ['development', 'staging', 'production'] },
  NEXT_PUBLIC_APP_URL: { required: true, type: 'url' },
  
  // Database
  SUPABASE_URL: { required: true, type: 'url' },
  SUPABASE_ANON_KEY: { required: true, type: 'string', minLength: 100 },
  SUPABASE_SERVICE_ROLE_KEY: { required: true, type: 'string', minLength: 100 },
  
  // Authentication
  // Note: OAuth login is handled by Supabase Auth, not app environment variables
  
  // OAuth providers (Drive storage integration)
  // Note: Login OAuth is handled by Supabase Auth, not app environment variables
  GOOGLE_DRIVE_CLIENT_ID: { required: false, type: 'string' },
  GOOGLE_DRIVE_CLIENT_SECRET: { required: false, type: 'string' },
  GOOGLE_DRIVE_REDIRECT_URI: { required: false, type: 'url' },
  GOOGLE_DRIVE_SCOPES: { required: false, type: 'string' },
  
  MS_DRIVE_CLIENT_ID: { required: false, type: 'string' },
  MS_DRIVE_CLIENT_SECRET: { required: false, type: 'string' },
  MS_DRIVE_REDIRECT_URI: { required: false, type: 'url' },
  MS_DRIVE_SCOPES: { required: false, type: 'string' },
  MS_DRIVE_TENANT: { required: false, type: 'string' },
  
  // OpenAI
  OPENAI_API_KEY: { required: false, type: 'string', pattern: /^sk-/ },
  
  // Security
  ENCRYPTION_KEY: { required: true, type: 'string', minLength: 32 },
  JWT_SECRET: { required: true, type: 'string', minLength: 32 },
  
  // Optional production settings
  ALLOWED_ORIGINS: { required: false, type: 'string' },
  SESSION_DOMAIN: { required: false, type: 'string' },
  RATE_LIMIT_MAX: { required: false, type: 'number' },
  
  // Monitoring
  LOG_LEVEL: { required: false, type: 'string', values: ['error', 'warn', 'info', 'debug'] },
  SENTRY_DSN: { required: false, type: 'url' }
} as const

/**
 * Validate and sanitize environment variables
 */
export function validateEnvironment(): {
  isValid: boolean
  errors: string[]
  warnings: string[]
  config: SecurityConfig
} {
  const errors: string[] = []
  const warnings: string[] = []
  
  // Validate required environment variables
  Object.entries(ENV_SCHEMA).forEach(([key, schema]) => {
    const value = process.env[key]
    
    if (schema.required && !value) {
      errors.push(`Missing required environment variable: ${key}`)
      return
    }
    
    if (value) {
      // Type validation
      if (schema.type === 'url') {
        try {
          new URL(value)
        } catch {
          errors.push(`Invalid URL format for ${key}: ${value}`)
        }
      }
      
      if (schema.type === 'number') {
        if (isNaN(Number(value))) {
          errors.push(`Invalid number format for ${key}: ${value}`)
        }
      }
      
      // Length validation
      if (schema.minLength && value.length < schema.minLength) {
        errors.push(`${key} must be at least ${schema.minLength} characters long`)
      }
      
      // Pattern validation
      if (schema.pattern && !schema.pattern.test(value)) {
        errors.push(`${key} does not match required pattern`)
      }
      
      // Value validation
      if (schema.values && !schema.values.includes(value as any)) {
        errors.push(`${key} must be one of: ${schema.values.join(', ')}`)
      }
    }
  })
  
  // Environment-specific validation
  const environment = (process.env.NODE_ENV || 'development') as Environment
  
  if (environment === 'production') {
    // Production-specific validations
    if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 32) {
      errors.push('ENCRYPTION_KEY must be at least 32 characters in production')
    }
    
    if (process.env.NEXT_PUBLIC_APP_URL?.includes('localhost')) {
      warnings.push('Using localhost URL in production environment')
    }
    
    if (!process.env.ALLOWED_ORIGINS) {
      warnings.push('ALLOWED_ORIGINS not set - using default CORS policy')
    }
  }
  
  // Generate security configuration
  const config = generateSecurityConfig(environment)
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    config
  }
}

/**
 * Generate security configuration based on environment
 */
function generateSecurityConfig(environment: Environment): SecurityConfig {
  const isProduction = environment === 'production'
  const isStaging = environment === 'staging'
  
  // Parse allowed origins with strict production defaults
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
    : isProduction
      ? [
          'https://briefly-cloud.vercel.app',
          'https://rekonnlabs.com',
          'https://www.rekonnlabs.com'
        ]
      : [
          'http://localhost:3000',
          'http://127.0.0.1:3000',
          'http://localhost:3001' // Alternative dev port
        ]
  
  return {
    environment,
    debug: !isProduction && !isStaging,
    
    cors: {
      origins: allowedOrigins.filter(Boolean),
      credentials: true,
      methods: isProduction 
        ? ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] // Production: Only necessary methods
        : ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'], // Development: Include PATCH
      allowedHeaders: isProduction
        ? [
            // Production: Minimal required headers only
            'Content-Type',
            'Authorization',
            'X-Requested-With',
            'Accept'
          ]
        : [
            // Development: More permissive for development tools
            'Content-Type',
            'Authorization',
            'X-Requested-With',
            'X-CSRF-Token',
            'Accept',
            'Accept-Version',
            'Content-Length',
            'Content-MD5',
            'Date',
            'X-Api-Version'
          ]
    },
    
    session: {
      secure: isProduction || isStaging,
      httpOnly: true,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 24 * 60 * 60, // 24 hours
      domain: process.env.SESSION_DOMAIN
    },
    
    headers: {
      hsts: {
        maxAge: isProduction ? 31536000 : 0, // 1 year in production
        includeSubDomains: isProduction,
        preload: isProduction
      },
      
      csp: {
        directives: isProduction ? {
          // PRODUCTION: Deny-by-default CSP with explicit allow-lists
          'default-src': ["'none'"], // Deny everything by default
          'script-src': [
            "'self'",
            "'nonce-{NONCE}'", // Use nonces for inline scripts
            'https://vercel.live', // Vercel analytics
            'https://va.vercel-scripts.com' // Vercel analytics
          ],
          'style-src': [
            "'self'",
            "'nonce-{NONCE}'", // Use nonces for inline styles
            'https://fonts.googleapis.com' // Google Fonts
          ],
          'font-src': [
            "'self'",
            'https://fonts.gstatic.com' // Google Fonts
          ],
          'img-src': [
            "'self'",
            'data:', // Base64 images
            'https://briefly-cloud.vercel.app', // Production domain
            'https://rekonnlabs.com' // Company domain
          ],
          'connect-src': [
            "'self'",
            process.env.SUPABASE_URL || '',
            'https://api.openai.com',
            'https://vercel.live' // Vercel analytics
          ],
          'media-src': ["'self'"],
          'object-src': ["'none'"],
          'child-src': ["'none'"],
          'frame-src': ["'none'"],
          'worker-src': ["'self'"],
          'manifest-src': ["'self'"],
          'frame-ancestors': ["'none'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
          'upgrade-insecure-requests': []
        } : {
          // DEVELOPMENT: More permissive for development workflow
          'default-src': ["'self'"],
          'script-src': [
            "'self'",
            "'unsafe-inline'", // Required for Next.js HMR
            "'unsafe-eval'", // Required for Next.js development
            'https://vercel.live',
            'https://va.vercel-scripts.com'
          ],
          'style-src': [
            "'self'",
            "'unsafe-inline'", // Required for styled-components and HMR
            'https://fonts.googleapis.com'
          ],
          'font-src': [
            "'self'",
            'https://fonts.gstatic.com',
            'data:'
          ],
          'img-src': [
            "'self'",
            'data:',
            'blob:',
            'https:',
            'http:' // Allow HTTP images in development
          ],
          'connect-src': [
            "'self'",
            process.env.SUPABASE_URL || '',
            'https://api.openai.com',
            'ws:', // WebSocket for HMR
            'wss:' // Secure WebSocket
          ],
          'frame-ancestors': ["'none'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"]
        }
      },
      
      frameOptions: 'DENY',
      contentTypeOptions: true,
      xssProtection: true
    },
    
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX || '') || (isProduction ? 100 : 1000),
      skipSuccessfulRequests: false
    },
    
    encryption: {
      algorithm: 'aes-256-gcm',
      keyLength: 32
    }
  }
}

/**
 * Get current security configuration
 */
export function getSecurityConfig(): SecurityConfig {
  const validation = validateEnvironment()
  
  if (!validation.isValid) {
    logger.error('Environment validation failed', { errors: validation.errors })
    throw new Error(`Environment validation failed: ${validation.errors.join(', ')}`)
  }
  
  if (validation.warnings.length > 0) {
    logger.warn('Environment validation warnings', { warnings: validation.warnings })
  }
  
  return validation.config
}

/**
 * Sanitize environment variables for logging
 */
export function sanitizeEnvForLogging(): Record<string, string> {
  const sensitiveKeys = [
    'SUPABASE_SERVICE_ROLE_KEY',
    'GOOGLE_DRIVE_CLIENT_SECRET',
    'MS_DRIVE_CLIENT_SECRET',
    'OPENAI_API_KEY',
    'ENCRYPTION_KEY',
    'JWT_SECRET',
    'SENTRY_DSN'
  ]
  
  const sanitized: Record<string, string> = {}
  
  Object.keys(process.env).forEach(key => {
    const value = process.env[key]
    if (value) {
      if (sensitiveKeys.includes(key)) {
        sanitized[key] = `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
      } else {
        sanitized[key] = value
      }
    }
  })
  
  return sanitized
}

/**
 * Initialize environment validation on startup
 */
export function initializeEnvironment(): void {
  const validation = validateEnvironment()
  
  if (!validation.isValid) {
    console.error('❌ Environment validation failed:')
    validation.errors.forEach(error => console.error(`  - ${error}`))
    process.exit(1)
  }
  
  if (validation.warnings.length > 0) {
    console.warn('⚠️  Environment validation warnings:')
    validation.warnings.forEach(warning => console.warn(`  - ${warning}`))
  }
  
  console.log(`✅ Environment validated successfully (${validation.config.environment})`)
  
  // Log sanitized configuration in development
  if (validation.config.environment === 'development') {
    console.log('🔧 Environment variables:', sanitizeEnvForLogging())
  }
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

/**
 * Check if running in development
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development'
}

/**
 * Check if debug mode is enabled
 */
export function isDebugEnabled(): boolean {
  return getSecurityConfig().debug
}

/**
 * Get allowed CORS origins
 */
export function getAllowedOrigins(): string[] {
  return getSecurityConfig().cors.origins
}

/**
 * Get session configuration
 */
export function getSessionConfig() {
  return getSecurityConfig().session
}

/**
 * Get security headers configuration
 */
export function getSecurityHeaders() {
  return getSecurityConfig().headers
}