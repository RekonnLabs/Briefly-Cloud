/**
 * Next.js Middleware
 * 
 * Simplified middleware that handles authentication and security.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { applySecurityHeaders, validateCORSOrigin } from '@/app/lib/security/security-headers'
import { getSecurityConfig } from '@/app/lib/config/environment'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  try {
    const securityConfig = getSecurityConfig()
    const origin = req.headers.get('origin')
    
    // Apply security headers and CORS for API routes
    if (req.nextUrl.pathname.startsWith('/api/')) {
      if (origin && validateCORSOrigin(origin, securityConfig.cors.origins)) {
        res.headers.set('Access-Control-Allow-Origin', origin)
        res.headers.set('Access-Control-Allow-Credentials', 'true')
      }
    }
    
    // Apply security headers
    applySecurityHeaders(res)
    
    // Handle preflight OPTIONS requests
    if (req.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: res.headers })
    }

    // Always initialize the Supabase middleware client so it can refresh/attach cookies
    const supabase = createMiddlewareClient({ req, res })
    const { data: { session } } = await supabase.auth.getSession()

    // Gate only the app area - redirect if no session
    if (!session && req.nextUrl.pathname.startsWith('/briefly/app')) {
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
