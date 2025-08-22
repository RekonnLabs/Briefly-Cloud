/**
 * Next.js Middleware
 * 
 * Simplified middleware that handles authentication and security.
 * Edge-safe with inlined security functions.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'

// Edge-safe CORS origin validation
function validateCORSOrigin(origin: string | null, allowedOrigins: string[]): boolean {
  if (!origin) return false
  return allowedOrigins.includes(origin)
}

// Edge-safe security headers
function applyBasicSecurityHeaders(res: NextResponse): void {
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-XSS-Protection', '1; mode=block')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  try {
    // Edge-safe allowed origins
    const isProduction = process.env.NODE_ENV === 'production'
    const allowedOrigins = isProduction
      ? ['https://briefly-cloud.vercel.app', 'https://rekonnlabs.com', 'https://www.rekonnlabs.com']
      : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001']
    
    const origin = req.headers.get('origin')
    
    // Apply security headers and CORS for API routes
    if (req.nextUrl.pathname.startsWith('/api/')) {
      if (origin && validateCORSOrigin(origin, allowedOrigins)) {
        res.headers.set('Access-Control-Allow-Origin', origin)
        res.headers.set('Access-Control-Allow-Credentials', 'true')
        res.headers.set('Vary', 'Origin') // Prevent cache poisoning
      }
    }
    
    // Apply basic security headers
    applyBasicSecurityHeaders(res)
    
    // Handle preflight OPTIONS requests
    if (req.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: res.headers })
    }

    // Always initialize the Supabase middleware client so it can refresh/attach cookies
    const supabase = createMiddlewareClient({ req, res })
    const { data: { session } } = await supabase.auth.getSession()

    // Gate only the app area - redirect if no session
    if (!session && req.nextUrl.pathname.startsWith('/briefly/app')) {
      // Lightweight observability: log auth redirects
      console.log(`[middleware] auth redirect: ${req.nextUrl.pathname} -> /auth/signin`)
      
      const url = req.nextUrl.clone()
      url.pathname = '/auth/signin'
      url.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search)
      return NextResponse.redirect(url, { headers: res.headers })
    }

    return res
  } catch (error) {
    console.error('Middleware error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

/**
 * Configuration for which paths the middleware should run on
 */
export const config = {
  matcher: [
    '/briefly/app/:path*',   // gate
    '/api/auth/:path*',      // run (no redirect) to attach/refresh cookies
  ],
}
