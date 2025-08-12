import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Define paths that should be excluded from middleware
const excludedPaths = [
  '/_next',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/public'
]

// Define public API routes that don't require authentication
const publicApiRoutes = [
  '/api/health',
  '/api/auth',
  '/api/client-ip',
  '/api/cron'
]

// Define admin-only routes
const adminRoutes = [
  '/api/admin',
  '/api/monitoring',
  '/api/feature-flags'
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const startTime = Date.now()

  // Skip middleware for excluded paths
  if (excludedPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  // Create response
  const response = NextResponse.next()

  // Add comprehensive security headers
  addSecurityHeaders(response, request)

  // Add monitoring headers
  addMonitoringHeaders(response, startTime)

  // Handle authentication for protected routes
  if (pathname.startsWith('/api') && !publicApiRoutes.some(route => pathname.startsWith(route))) {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
    
    // Check admin routes
    if (adminRoutes.some(route => pathname.startsWith(route))) {
      if (!token || !token.email?.endsWith('@rekonnlabs.com')) {
        return NextResponse.json(
          { error: 'Admin access required' },
          { status: 403 }
        )
      }
    }
    
    // Check general protected routes
    else if (pathname.startsWith('/api/upload') || 
             pathname.startsWith('/api/chat') ||
             pathname.startsWith('/api/embed') ||
             pathname.startsWith('/api/user') ||
             pathname.startsWith('/api/storage') ||
             pathname.startsWith('/api/gdpr')) {
      if (!token) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        )
      }
    }
  }

  // Skip authentication check for app routes when accessed via proxy
  // The Website project handles authentication for proxied requests
  if (pathname.startsWith('/dashboard') || 
      pathname.startsWith('/chat') || 
      pathname.startsWith('/documents') || 
      pathname.startsWith('/storage') ||
      pathname === '/') {
    // For now, skip authentication check to allow proxy access
    // TODO: Implement proper proxy authentication validation
    return NextResponse.next()
  }

  return response
}

function addSecurityHeaders(response: NextResponse, request: NextRequest) {
  // Basic security headers
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  
  // HSTS header for HTTPS
  if (request.nextUrl.protocol === 'https:') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  }
  
  // Content Security Policy
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com https://checkout.stripe.com https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://api.openai.com https://*.supabase.co https://api.stripe.com https://*.chromadb.com https://www.google-analytics.com",
    "frame-src https://js.stripe.com https://checkout.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests"
  ].join('; ')
  
  response.headers.set('Content-Security-Policy', csp)
  
  // Additional security headers
  response.headers.set('X-DNS-Prefetch-Control', 'on')
  response.headers.set('X-Download-Options', 'noopen')
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none')
}

function addMonitoringHeaders(response: NextResponse, startTime: number) {
  // Request tracking
  response.headers.set('X-Request-ID', crypto.randomUUID())
  response.headers.set('X-Timestamp', new Date().toISOString())
  response.headers.set('X-Response-Time', `${Date.now() - startTime}ms`)
  
  // Rate limiting headers (placeholder - would be implemented with actual rate limiting)
  response.headers.set('X-RateLimit-Limit', '1000')
  response.headers.set('X-RateLimit-Remaining', '999')
  response.headers.set('X-RateLimit-Reset', String(Math.floor(Date.now() / 1000) + 3600))
  
  // Version and environment info
  response.headers.set('X-App-Version', process.env.npm_package_version || '2.0.0')
  response.headers.set('X-Environment', process.env.NODE_ENV || 'production')
}

// Configure which paths the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
}
