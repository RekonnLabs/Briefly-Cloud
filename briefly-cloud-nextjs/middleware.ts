import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { applySecurityHeaders } from './src/app/lib/security/headers'

const PRIMARY_HOST = 'briefly.rekonnlabs.com'

export async function middleware(req: NextRequest) {
  // Force canonical host redirect (PKCE requires same host)
  if (req.nextUrl.hostname !== PRIMARY_HOST && process.env.NODE_ENV === 'production') {
    const url = new URL(req.url)
    url.hostname = PRIMARY_HOST
    return NextResponse.redirect(url, 308)
  }

  const { pathname } = req.nextUrl

  // ---- Hard excludes: never gate these ----
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/robots.txt') ||
    pathname.startsWith('/sitemap.xml') ||
    pathname.startsWith('/images/') ||
    pathname.startsWith('/auth/') ||                   // All auth routes
    pathname.startsWith('/briefly/app/') ||            // App routes use page-level gating
    pathname.startsWith('/api/storage/google/callback') ||
    pathname.startsWith('/api/storage/microsoft/callback') ||
    pathname.startsWith('/api/billing/webhook') ||
    pathname.startsWith('/api/health')                 // Public health checks
  ) {
    return NextResponse.next()
  }

  const res = NextResponse.next()

  // Silent token refresh only - no authentication gating for app routes
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => 
            res.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Silent session refresh only - no user authentication checks for app routes
  await supabase.auth.getSession()

  // Optional: Protect sensitive API routes only
  if (pathname.startsWith('/api/secure/')) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      // Log security incident for audit trail
      const correlationId = crypto.randomUUID()
      const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0] || 
                       req.headers.get('x-real-ip') || 
                       'unknown'
      const userAgent = req.headers.get('user-agent') || 'unknown'
      
      // Log security event using structured logger
      const { logger } = await import('./src/app/lib/logger')
      logger.logSecurityEvent('Unauthorized API access attempt', {
        correlationId,
        endpoint: pathname,
        method: req.method,
        ip: ipAddress,
        userAgent,
        timestamp: new Date().toISOString(),
        securityEvent: true,
        severity: 'medium'
      })

      // Return proper 401 response with security headers
      const unauthorizedResponse = new NextResponse(
        JSON.stringify({ 
          error: 'Unauthorized', 
          message: 'Authentication required to access this resource',
          correlationId 
        }), 
        { 
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'WWW-Authenticate': 'Bearer',
            'X-Correlation-ID': correlationId,
            ...Object.fromEntries(res.headers.entries())
          }
        }
      )
      
      // Apply security headers to unauthorized response
      applySecurityHeaders(unauthorizedResponse)
      
      return unauthorizedResponse
    }
  }

  // Apply production security headers (only in production environment)
  applySecurityHeaders(res)

  return res
}

export const config = {
  matcher: ['/((?!api|_next|favicon.ico|assets).*)'],
}
