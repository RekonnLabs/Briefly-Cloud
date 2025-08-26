import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { clampNext } from './src/app/lib/auth/utils'

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl

  // ---- Hard excludes: never gate these ----
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/robots.txt') ||
    pathname.startsWith('/sitemap.xml') ||
    pathname.startsWith('/images/') ||
    pathname.startsWith('/auth/start') ||
    pathname.startsWith('/auth/callback') ||
    pathname.startsWith('/auth/v1/callback') ||        // Supabase callback
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
      cookies: {
        get: (n) => req.cookies.get(n)?.value,
        set: (n, v, o) => res.cookies.set({ name: n, value: v, ...o }),
        remove: (n, o) => res.cookies.set({ name: n, value: '', ...o, maxAge: 0 }),
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isApp = pathname.startsWith('/briefly')
  const isSignin = pathname === '/auth/signin'

  // Unauthed → protect app
  if (!user && isApp) {
    const url = req.nextUrl.clone()
    url.pathname = '/auth/signin'
    url.searchParams.set('next', clampNext(pathname + search))
    const redirect = NextResponse.redirect(url, { status: 307 })
    // propagate any Set-Cookie written on `res`
    res.cookies.getAll().forEach((c) => redirect.cookies.set(c))
    return redirect
  }

  // Authed → keep out of /auth/signin
  if (user && isSignin) {
    const url = req.nextUrl.clone()
    url.pathname = '/briefly/app/dashboard'
    url.search = ''
    const redirect = NextResponse.redirect(url, { status: 307 })
    res.cookies.getAll().forEach((c) => redirect.cookies.set(c))
    return redirect
  }

  // Helpful signal for RSC pages
  if (user) res.headers.set('x-sb-session', '1')
  return res
}

export const config = {
  matcher: [
    '/',                   // root (because it may redirect)
    '/briefly/:path*',     // ALL app routes
    '/auth/signin',        // gate signin when authed
    '/api/:path*',         // (we still early-exit callbacks above)
  ],
}
