export const runtime = 'nodejs'

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

function newSupabaseFor(reqCookies = cookies()) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => reqCookies.get(n)?.value,
        set: (n, v, o) => reqCookies.set({ name: n, value: v, ...o }),
        remove: (n, o) => reqCookies.set({ name: n, value: '', ...o, maxAge: 0 }),
      },
    }
  )
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  // Provider-side error
  if (error) {
    console.error('[auth/callback] provider error:', error)
    return NextResponse.redirect(new URL('/auth/signin?err=provider', req.url))
  }

  if (!code) {
    console.error('[auth/callback] missing code')
    return NextResponse.redirect(new URL('/auth/signin?err=missing_code', req.url))
  }

  // Do exactly one exchange, then do not call auth again in this handler
  const supabase = newSupabaseFor()

  const { error: exchErr } = await supabase.auth.exchangeCodeForSession({ authCode: code })
  if (exchErr) {
    console.error('[auth/callback] exchange error', exchErr)
    // Nuke any partial PKCE/old cookies so retries aren't poisoned
    const jar = cookies()
    for (const c of jar.getAll()) {
      if (c.name.startsWith('sb-')) jar.set(c.name, '', { path: '/', maxAge: 0 })
    }
    return NextResponse.redirect(new URL('/auth/signin?err=exchange', req.url))
  }

  // Important: don't call getSession/getUser here; let the browser carry the new cookies
  const next = url.searchParams.get('next') || '/briefly/app/dashboard'
  const dest = new URL(next, url.origin)
  // No-store so browsers don't reuse a cached 302
  return NextResponse.redirect(dest, { headers: { 'Cache-Control': 'no-store' } })
}