export const runtime = 'nodejs'

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

function sb() {
  const jar = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => jar.get(n)?.value,
        set: (n, v, o) => jar.set({ name: n, value: v, ...o }),
        remove: (n, o) => jar.set({ name: n, value: '', ...o, maxAge: 0 }),
      },
    }
  )
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const providerErr = url.searchParams.get('error')

  if (providerErr) {
    console.error('[auth/callback] provider error:', providerErr)
    return NextResponse.redirect(new URL('/auth/signin?err=provider', req.url))
  }
  if (!code || typeof code !== 'string') {
    console.error('[auth/callback] missing or invalid code', { code })
    return NextResponse.redirect(new URL('/auth/signin?err=missing_code', req.url))
  }

  const supabase = sb()

  // Drop-in replacement for exchange block - handle both signatures with bound method calls
  const auth: any = (supabase as any).auth
  let result: any = null
  let err: any = null

  try {
    // Try the 1-arg signature first (newer @supabase/supabase-js)
    if (typeof auth.exchangeCodeForSession === 'function' && auth.exchangeCodeForSession.length === 1) {
      result = await auth.exchangeCodeForSession(code)    // ✅ bound call
    } else {
      // Older versions expect an object
      result = await auth.exchangeCodeForSession({ code }) // ✅ bound call
    }
    err = result?.error ?? null
  } catch (e) {
    err = e
  }

  if (err) {
    console.error('[auth/callback] exchange error', err)
    // Clear poison cookies so a retry isn't doomed
    const jar = cookies()
    for (const c of jar.getAll()) if (c.name.startsWith('sb-')) jar.set(c.name, '', { path: '/', maxAge: 0 })
    return NextResponse.redirect(new URL('/auth/signin?err=exchange', req.url))
  }

  const next = url.searchParams.get('next') || '/briefly/app/dashboard'
  const dest = new URL(next, url.origin)
  return NextResponse.redirect(dest, { headers: { 'Cache-Control': 'no-store' } })
}