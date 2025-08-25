import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const provider = (url.searchParams.get('provider') || 'google') as 'google'|'azure'
  const next = safeNext(url.searchParams.get('next') ?? '/briefly/app/dashboard')

  // 1) Collect cookies into a response we'll return
  const res = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => req.cookies.get(name)?.value,
        set: (name, value, options) => res.cookies.set(name, value, options),
        remove: (name, options) => res.cookies.set(name, '', { ...options, maxAge: 0 }),
      },
    }
  )

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      // keep this exact origin path—callback reads ?next=
      redirectTo: `${url.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      scopes: 'openid email profile',
      queryParams: { prompt: 'select_account' },
    },
  })

  if (error || !data?.url) {
    console.error('[auth/start] OAuth start error:', error)
    return NextResponse.redirect(`${url.origin}/auth/error?error=start_failed`)
  }

  // 2) CRUCIAL: forward the Set-Cookie headers with the redirect
  const redirect = NextResponse.redirect(data.url, { status: 302 })
  res.headers.forEach((val, key) => redirect.headers.set(key, val))
  return redirect
}

// only allow relative, internal next targets
function safeNext(next: string) {
  try {
    const u = new URL(next, 'https://dummy.local')
    return u.pathname.startsWith('/') ? u.pathname + (u.search || '') : '/briefly/app/dashboard'
  } catch {
    return '/briefly/app/dashboard'
  }
}