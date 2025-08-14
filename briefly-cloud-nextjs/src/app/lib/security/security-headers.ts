/**
 * Security Headers Middleware
 * 
 * This middleware implements comprehensive security headers including
 * HSTS, CSP, CORS, and other security-focused HTTP headers.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSecurityConfig, isProduction } from '@/app/lib/config/environment'
import { logger } from '@/app/lib/logger'

export interface SecurityHeadersConfig {
  enableHSTS?: boolean
  enableCSP?: boolean
  enableCORS?: boolean
  enableFrameProtection?: boolean
  enableContentTypeProtection?: boolean
  enableXSSProtection?: boolean
  enableReferrerPolicy?: boolean
  enablePermissionsPolicy?: boolean
  customHeaders?: Record<string, string>
}

/**
 * Apply comprehensive security headers to response
 */
export function applySecurityHeaders(
  response: NextResponse,
  config: SecurityHeadersConfig = {}
): NextResponse {
  try {
    const securityConfig = getSecurityConfig()
    const {
      enableHSTS = true,
      enableCSP = true,
      enableCORS = true,
      enableFrameProtection = true,
      enableContentTypeProtection = true,
      enableXSSProtection = true,
      enableReferrerPolicy = true,
      enablePermissionsPolicy = true,
      customHeaders = {}
    } = config

    // HSTS (HTTP Strict Transport Security)
    if (enableHSTS && securityConfig.headers.hsts.maxAge > 0) {
      const hstsValue = [
        `max-age=${securityConfig.headers.hsts.maxAge}`,
        securityConfig.headers.hsts.includeSubDomains ? 'includeSubDomains' : '',
        securityConfig.headers.hsts.preload ? 'preload' : ''
      ].filter(Boolean).join('; ')
      
      response.headers.set('Strict-Transport-Security', hstsValue)
    }

    // Content Security Policy
    if (enableCSP) {
      const cspDirectives = Object.entries(securityConfig.headers.csp.directives)
        .filter(([, values]) => values && values.length > 0)
        .map(([directive, values]) => `${directive} ${values.join(' ')}`)
        .join('; ')
      
      response.headers.set('Content-Security-Policy', cspDirectives)
    }

    // Frame Protection
    if (enableFrameProtection) {
      response.headers.set('X-Frame-Options', securityConfig.headers.frameOptions)
    }

    // Content Type Protection
    if (enableContentTypeProtection) {
      response.headers.set('X-Content-Type-Options', 'nosniff')
    }

    // XSS Protection
    if (enableXSSProtection) {
      response.headers.set('X-XSS-Protection', '1; mode=block')
    }

    // Referrer Policy
    if (enableReferrerPolicy) {
      response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    }

    // Permissions Policy
    if (enablePermissionsPolicy) {
      const permissionsPolicy = [
        'camera=()',
        'microphone=()',
        'geolocation=()',
        'interest-cohort=()',
        'payment=()',
        'usb=()',
        'bluetooth=()',
        'magnetometer=()',
        'gyroscope=()',
        'accelerometer=()'
      ].join(', ')
      
      response.headers.set('Permissions-Policy', permissionsPolicy)
    }

    // CORS Headers (if enabled)
    if (enableCORS) {
      applyCORSHeaders(response, securityConfig.cors.origins)
    }

    // Additional security headers
    response.headers.set('X-DNS-Prefetch-Control', 'off')
    response.headers.set('X-Download-Options', 'noopen')
    response.headers.set('X-Permitted-Cross-Domain-Policies', 'none')
    response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
    response.headers.set('Cross-Origin-Resource-Policy', 'same-origin')

    // Custom headers
    Object.entries(customHeaders).forEach(([name, value]) => {
      response.headers.set(name, value)
    })

    // Security metadata headers
    response.headers.set('X-Security-Headers', 'applied')
    response.headers.set('X-Content-Security-Policy-Report-Only', 'false')
    
    if (isProduction()) {
      response.headers.set('Server', 'Briefly-Cloud')
      response.headers.delete('X-Powered-By')
    }

    return response

  } catch (error) {
    logger.error('Failed to apply security headers', error as Error)
    return response
  }
}

/**
 * Apply CORS headers based on origin validation
 */
function applyCORSHeaders(response: NextResponse, allowedOrigins: string[]): void {
  // Note: In middleware, we don't have access to the request origin
  // This is typically handled in API routes or middleware.ts
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
  response.headers.set('Access-Control-Max-Age', '86400') // 24 hours
}

/**
 * Validate CORS origin against allowed origins
 */
export function validateCORSOrigin(origin: string | null, allowedOrigins: string[]): boolean {
  if (!origin) return false
  
  // Exact match
  if (allowedOrigins.includes(origin)) return true
  
  // Wildcard matching for development
  if (!isProduction()) {
    return allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        const pattern = allowed.replace(/\*/g, '.*')
        return new RegExp(`^${pattern}$`).test(origin)
      }
      return false
    })
  }
  
  return false
}

/**
 * Create CORS middleware for API routes
 */
export function createCORSMiddleware(allowedOrigins?: string[]) {
  return (request: NextRequest, response: NextResponse) => {
    const securityConfig = getSecurityConfig()
    const origins = allowedOrigins || securityConfig.cors.origins
    const origin = request.headers.get('origin')
    
    // Validate origin
    if (origin && validateCORSOrigin(origin, origins)) {
      response.headers.set('Access-Control-Allow-Origin', origin)
      response.headers.set('Access-Control-Allow-Credentials', 'true')
    }
    
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      response.headers.set('Access-Control-Allow-Methods', securityConfig.cors.methods.join(', '))
      response.headers.set('Access-Control-Allow-Headers', securityConfig.cors.allowedHeaders.join(', '))
      response.headers.set('Access-Control-Max-Age', '86400')
      return new NextResponse(null, { status: 200 })
    }
    
    return response
  }
}

/**
 * Security headers for different content types
 */
export const CONTENT_TYPE_HEADERS = {
  json: {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
  },
  html: {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  },
  css: {
    'Content-Type': 'text/css; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
  },
  javascript: {
    'Content-Type': 'application/javascript; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
  }
}

/**
 * Apply content-type specific security headers
 */
export function applyContentTypeHeaders(
  response: NextResponse,
  contentType: keyof typeof CONTENT_TYPE_HEADERS
): NextResponse {
  const headers = CONTENT_TYPE_HEADERS[contentType]
  
  Object.entries(headers).forEach(([name, value]) => {
    response.headers.set(name, value)
  })
  
  return response
}

/**
 * Create a secure response with all security headers
 */
export function createSecureResponse(
  data: any,
  options: {
    status?: number
    headers?: Record<string, string>
    contentType?: keyof typeof CONTENT_TYPE_HEADERS
    securityConfig?: SecurityHeadersConfig
  } = {}
): NextResponse {
  const {
    status = 200,
    headers = {},
    contentType = 'json',
    securityConfig = {}
  } = options
  
  // Create response
  const response = NextResponse.json(data, { status, headers })
  
  // Apply content-type headers
  applyContentTypeHeaders(response, contentType)
  
  // Apply security headers
  applySecurityHeaders(response, securityConfig)
  
  return response
}

/**
 * Middleware to add security headers to all responses
 */
export function securityHeadersMiddleware(
  handler: (request: NextRequest) => Promise<NextResponse> | NextResponse
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      // Execute the handler
      const response = await handler(request)
      
      // Apply security headers to the response
      return applySecurityHeaders(response)
      
    } catch (error) {
      logger.error('Security headers middleware error', error as Error)
      
      // Create error response with security headers
      const errorResponse = NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
      
      return applySecurityHeaders(errorResponse)
    }
  }
}

/**
 * Validate security headers in response (for testing)
 */
export function validateSecurityHeaders(response: Response): {
  valid: boolean
  missing: string[]
  warnings: string[]
} {
  const requiredHeaders = [
    'X-Content-Type-Options',
    'X-Frame-Options',
    'X-XSS-Protection',
    'Referrer-Policy',
    'Permissions-Policy'
  ]
  
  const productionHeaders = [
    'Strict-Transport-Security',
    'Content-Security-Policy'
  ]
  
  const missing: string[] = []
  const warnings: string[] = []
  
  // Check required headers
  requiredHeaders.forEach(header => {
    if (!response.headers.get(header)) {
      missing.push(header)
    }
  })
  
  // Check production-specific headers
  if (isProduction()) {
    productionHeaders.forEach(header => {
      if (!response.headers.get(header)) {
        warnings.push(`Missing production header: ${header}`)
      }
    })
  }
  
  // Validate CSP
  const csp = response.headers.get('Content-Security-Policy')
  if (csp) {
    if (csp.includes("'unsafe-eval'") && isProduction()) {
      warnings.push("CSP contains 'unsafe-eval' in production")
    }
    if (csp.includes("'unsafe-inline'") && isProduction()) {
      warnings.push("CSP contains 'unsafe-inline' in production")
    }
  }
  
  return {
    valid: missing.length === 0,
    missing,
    warnings
  }
}