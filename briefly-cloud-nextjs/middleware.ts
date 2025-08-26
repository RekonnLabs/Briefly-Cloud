import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { createServerClient } from '@supabase/ssr'
import { clampNext } from './src/app/lib/auth/utils'

// Rate limiting setup (fail-open if not configured)
const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED === '1'

const EXCLUDED = [
  "/auth/callback",
  "/auth/start",
  "/api/storage/google/callback",
  "/api/storage/microsoft/callback",
  "/api/billing/webhook"
]

function isExcluded(p: string) {
  return EXCLUDED.some(x => p.startsWith(x))
}

export async function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname
  if (
    p.startsWith('/auth/callback') ||
    p.startsWith('/auth/start') ||
    p.startsWith('/api/storage/google/callback') ||
    p.startsWith('/api/storage/microsoft/callback') ||
    p.startsWith('/api/billing/webhook')
  ) {
    return NextResponse.next()
  }

  const res = NextResponse.next()

  // Cookie normalizer - let Supabase defaults pass through, only strip domain
  const normalize = (o?: any) => {
    if (!o) return undefined
    const { domain, ...rest } = o
    return { ...rest }  // don't override sameSite/secure unless you must
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => req.cookies.get(name)?.value,
        set: (name, value, options) => res.cookies.set({ name, value, ...normalize(options) }),
        remove: (name, options) => res.cookies.set({ name, value: '', expires: new Date(0), ...normalize(options) }),
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()
  const path = req.nextUrl.pathname

  // Redirect authenticated users away from signin page
  if (session && req.nextUrl.pathname === '/auth/signin') {
    const to = clampNext(req.nextUrl.searchParams.get('next') || undefined)
    const redirect = NextResponse.redirect(new URL(to, req.url))
    // Propagate refreshed cookies from supabase.getSession()
    res.cookies.getAll().forEach(c => redirect.cookies.set(c))
    redirect.headers.set('x-sb-session', '1')
    return redirect
  }

  // Redirect unauthenticated users to signin
  if (!session && req.nextUrl.pathname.startsWith('/briefly/app')) {
    const url = req.nextUrl.clone()
    url.pathname = '/auth/signin'
    url.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search)
    const redirect = NextResponse.redirect(url)
    // Propagate any cookies from supabase.getSession()
    res.cookies.getAll().forEach(c => redirect.cookies.set(c))
    redirect.headers.set('x-sb-session', '0')
    return redirect
  }

  // ==== RATE LIMIT (fail-open if not configured) ====
  if (RATE_LIMIT_ENABLED && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN && !isExcluded(path)) {
    try {
      const { Ratelimit } = await import("@upstash/ratelimit")
      const { Redis } = await import("@upstash/redis")
      
      const redis = Redis.fromEnv()
      const limiterPerIP = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, "1 m") }) // 60 req/min/IP
      const limiterPerUser = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(120, "1 m") }) // 120 req/min/user

      const ip = req.ip ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0"
      const userId = session?.user?.id

      const [ipRes, userRes] = await Promise.all([
        limiterPerIP.limit(`ip:${ip}`),
        userId ? limiterPerUser.limit(`u:${userId}`) : Promise.resolve({ success: true })
      ])

      if (!ipRes.success || (userId && !userRes.success)) {
        return new NextResponse("Too Many Requests", { status: 429 })
      }
    } catch (error) {
      // Fail open - log error but don't block requests
      console.warn('Rate limiting error (failing open):', error)
    }
  }

  // Security headers
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  res.headers.set("X-Content-Type-Options", "nosniff")
  res.headers.set("X-Frame-Options", "DENY")
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin")
  res.headers.set("Cross-Origin-Resource-Policy", "same-site")
  res.headers.set("Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  )

  res.headers.set('x-sb-session', session ? '1' : '0')
  return res
}

export const config = {
  matcher: [
    // Protect app
    '/briefly/app/:path*',
    
    // Allow rate limiting & headers for general APIs, but skip callbacks/webhooks:
    '/api((?!/storage/(google|microsoft)/callback)(?!/billing/webhook).*)',
    
    // Gate /auth/signin, but NOT /auth/start or /auth/callback
    '/auth/signin',
  ],
}
