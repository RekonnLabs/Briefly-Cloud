/**
 * Next.js Middleware
 * 
 * This middleware applies security headers, CORS policies, and other
 * security measures to all requests before they reach the application.
 */

import { NextRequest, NextResponse } from 'next/server'
import { applySecurityHeaders, validateCORSOrigin } from '@/app/lib/security/security-headers'
import { getSecurityConfig, isProduction } from '@/app/lib/config/environment'
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'

/**
 * Middleware function that runs on every request
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next()
  
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

    // Gate authenticated app routes
    if (pathname.startsWith('/briefly/app/')) {
      const supabase = createMiddlewareClient({ req: request, res: response })

      const { data: { user }, error } = await supabase.auth.getUser()

      if (error || !user) {
        const redirectUrl = new URL('/auth/signin', request.url)
        // Preserve path and query for post-login return using 'next' parameter
        redirectUrl.searchParams.set('next', encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search))

        // Carry over rate limit headers for consistency
        const rateLimitHeaders = getRateLimitHeaders(request)
        Object.entries(rateLimitHeaders).forEach(([k, v]) => {
          response.headers.set(k, v)
        })

        // Apply global security headers
        const securedResponse = applySecurityHeaders(response, {
          enableHSTS: isProduction(),
          enableCSP: true,
          enableCORS: false,
          customHeaders: {
            'X-Request-ID': generateRequestId(),
            'X-Timestamp': new Date().toISOString()
          }
        })

        // Create redirect response preserving headers
        return NextResponse.redirect(redirectUrl, { headers: securedResponse.headers })
      }
    }
    
    // Enhanced security checks for production
    if (isProduction() && pathname.startsWith('/api/')) {
      const referer = request.headers.get('referer')
      const userAgent = request.headers.get('user-agent')
      const host = request.headers.get('host')
      
      // Define public endpoints that don't require strict origin validation
      const publicEndpoints = ['/api/share/', '/api/health', '/api/status', '/api/webhooks/']
      const isPublicEndpoint = publicEndpoints.some(endpoint => pathname.startsWith(endpoint))
      
      // Block requests from unauthorized hosts
      const allowedHosts = ['briefly-cloud.vercel.app', 'rekonnlabs.com', 'www.rekonnlabs.com']
      if (host && !allowedHosts.includes(host)) {
        return new NextResponse('Forbidden - Invalid Host', { status: 403 })
      }
      
      // Block requests without proper origin/referer (except for public endpoints and legitimate tools)
      if (!isPublicEndpoint) {
        const hasValidOrigin = origin && validateCORSOrigin(origin, securityConfig.cors.origins)
        const hasValidReferer = referer && securityConfig.cors.origins.some(allowed => referer.startsWith(allowed))
        const isLegitimateBot = userAgent && (
          userAgent.includes('curl') ||
          userAgent.includes('Postman') ||
          userAgent.includes('Insomnia') ||
          userAgent.includes('HTTPie')
        )
        
        if (!hasValidOrigin && !hasValidReferer && !isLegitimateBot) {
          return new NextResponse('Forbidden - Invalid Origin', { status: 403 })
        }
      }
      
      // Block suspicious user agents in production
      const suspiciousPatterns = [
        /bot/i,
        /crawler/i,
        /spider/i,
        /scraper/i,
        /scanner/i
      ]
      
      if (userAgent && suspiciousPatterns.some(pattern => pattern.test(userAgent))) {
        // Allow legitimate search engine bots for public endpoints only
        const legitimateBots = ['Googlebot', 'Bingbot', 'facebookexternalhit']
        const isLegitimateBot = legitimateBots.some(bot => userAgent.includes(bot))
        
        if (!isLegitimateBot || !isPublicEndpoint) {
          return new NextResponse('Forbidden - Suspicious User Agent', { status: 403 })
        }
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
    // Gate app pages only - avoid redirect loops and unnecessary middleware execution
    '/briefly/app/:path*',
  ],
}
