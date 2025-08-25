import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { createServerClient } from '@supabase/ssr'

// Rate limiting setup (fail-open if not configured)
const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED === '1'
let limiterPerIP: any = null
let limiterPerUser: any = null

// Only initialize rate limiters if enabled and configured
if (RATE_LIMIT_ENABLED && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    const { Ratelimit } = require("@upstash/ratelimit")
    const { Redis } = require("@upstash/redis")
    
    const redis = Redis.fromEnv()
    limiterPerIP = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, "1 m") }) // 60 req/min/IP
    limiterPerUser = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(120, "1 m") }) // 120 req/min/user
  } catch (error) {
    console.warn('Rate limiting disabled: Upstash dependencies not available')
  }
}

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
  const res = NextResponse.next()

  // Cookie normalizer to strip domain and set safe defaults
  const normalize = (o?: any) => {
    const { domain, ...rest } = o || {}  // strip Domain
    return { httpOnly: true, secure: true, sameSite: 'none' as const, path: '/', ...rest }
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
    const to = req.nextUrl.searchParams.get('next') || '/briefly/app/dashboard'
    return NextResponse.redirect(new URL(to, req.url), { headers: res.headers })
  }

  // Redirect unauthenticated users to signin
  if (!session && req.nextUrl.pathname.startsWith('/briefly/app')) {
    const url = req.nextUrl.clone()
    url.pathname = '/auth/signin'
    url.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search)
    return NextResponse.redirect(url, { headers: res.headers })
  }

  // ==== RATE LIMIT (fail-open if not configured) ====
  if (RATE_LIMIT_ENABLED && limiterPerIP && limiterPerUser && !isExcluded(path)) {
    try {
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
    "/briefly/app/:path*",
    "/api/:path*",         // rate limit applies broadly…
    "/auth/signin"         // …but exclusions above skip sensitive callbacks
  ],
}
