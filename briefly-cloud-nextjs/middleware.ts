import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { clampNext } from './src/app/lib/auth/utils'
import { applySecurityHeaders } from './src/app/lib/security/headers'

const PRIMARY_HOST = 'briefly.rekonnlabs.com'

export async function middleware(req: NextRequest) {
  // Force canonical host redirect (PKCE requires same host)
  if (req.nextUrl.hostname !== PRIMARY_HOST && process.env.NODE_ENV === 'production') {
    const url = new URL(req.url)
    url.hostname = PRIMARY_HOST
    return NextResponse.redirect(url, 308)
  }

  const { pathname, search } = req.nextUrl

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

  // Allow Supabase to refresh tokens via middleware (cookie writes allowed here)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: 'public' },
      cookies: {
        get: (n) => req.cookies.get(n)?.value,
        set: (n, v, o) => res.cookies.set({ name: n, value: v, ...o }),
        remove: (n, o) => res.cookies.set({ name: n, value: '', ...o, maxAge: 0 }),
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isSignin = pathname === '/auth/signin'

  // Authed → keep out of /auth/signin
  if (user && isSignin) {
    const url = req.nextUrl.clone()
    url.pathname = '/briefly/app/dashboard'
    url.search = ''
    const redirect = NextResponse.redirect(url, { status: 307 })
    res.cookies.getAll().forEach((c) => redirect.cookies.set(c))
    return redirect
  }

  // For app pages, do nothing — let page-level guards handle it

  // Helpful signal for RSC pages
  if (user) res.headers.set('x-sb-session', '1')

  // Apply production security headers (only in production environment)
  applySecurityHeaders(res)

  return res
}

export const config = {
  matcher: ['/((?!api|_next|favicon.ico|assets).*)'],
}
