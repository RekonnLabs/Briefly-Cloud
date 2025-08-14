/**
 * Next.js Middleware
 * 
 * This middleware applies security headers, CORS policies, and other
 * security measures to all requests before they reach the application.
 */

import { NextRequest, NextResponse } from 'next/server'
import { applySecurityHeaders, validateCORSOrigin } from '@/app/lib/security/security-headers'
import { getSecurityConfig, isProduction } from '@/app/lib/config/environment'

/**
 * Middleware function that runs on every request
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next()
  
  try {
    const securityConfig = getSecurityConfig()
    const origin = request.headers.get('origin')
    const pathname = request.nextUrl.pathname
    
    // Apply CORS headers for API routes
    if (pathname.startsWith('/api/')) {
      // Validate origin for CORS
      if (origin && validateCORSOrigin(origin, securityConfig.cors.origins)) {
        response.headers.set('Access-Control-Allow-Origin', origin)
        response.headers.set('Access-Control-Allow-Credentials', 'true')
      }
      
      // Handle preflight requests
      if (request.method === 'OPTIONS') {
        const preflightResponse = new NextResponse(null, { status: 200 })
        
        if (origin && validateCORSOrigin(origin, securityConfig.cors.origins)) {
          preflightResponse.headers.set('Access-Control-Allow-Origin', origin)
          preflightResponse.headers.set('Access-Control-Allow-Credentials', 'true')
        }
        
        preflightResponse.headers.set('Access-Control-Allow-Methods', securityConfig.cors.methods.join(', '))
        preflightResponse.headers.set('Access-Control-Allow-Headers', securityConfig.cors.allowedHeaders.join(', '))
        preflightResponse.headers.set('Access-Control-Max-Age', '86400')
        
        return applySecurityHeaders(preflightResponse)
      }
    }
    
    // Block requests from unauthorized origins in production
    if (isProduction() && pathname.startsWith('/api/')) {
      const referer = request.headers.get('referer')
      const userAgent = request.headers.get('user-agent')
      
      // Block requests without proper referer in production (except for specific endpoints)
      const publicEndpoints = ['/api/share/', '/api/health', '/api/status']
      const isPublicEndpoint = publicEndpoints.some(endpoint => pathname.startsWith(endpoint))
      
      if (!isPublicEndpoint && !referer && !userAgent?.includes('curl')) {
        return new NextResponse('Forbidden', { status: 403 })
      }
    }
    
    // Rate limiting headers (basic implementation)
    const rateLimitHeaders = getRateLimitHeaders(request)
    Object.entries(rateLimitHeaders).forEach(([key, value]) => {
      response.headers.set(key, value)
    })
    
    // Security headers for all responses
    return applySecurityHeaders(response, {
      enableHSTS: isProduction(),
      enableCSP: true,
      enableCORS: pathname.startsWith('/api/'),
      customHeaders: {
        'X-Request-ID': generateRequestId(),
        'X-Timestamp': new Date().toISOString()
      }
    })
    
  } catch (error) {
    console.error('Middleware error:', error)
    
    // Return error response with security headers
    const errorResponse = new NextResponse('Internal Server Error', { status: 500 })
    return applySecurityHeaders(errorResponse)
  }
}

/**
 * Generate basic rate limiting headers
 */
function getRateLimitHeaders(request: NextRequest): Record<string, string> {
  const securityConfig = getSecurityConfig()
  
  return {
    'X-RateLimit-Limit': securityConfig.rateLimit.max.toString(),
    'X-RateLimit-Window': securityConfig.rateLimit.windowMs.toString(),
    'X-RateLimit-Policy': `${securityConfig.rateLimit.max};w=${securityConfig.rateLimit.windowMs}`
  }
}

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Configuration for which paths the middleware should run on
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}