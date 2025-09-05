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

  // Handle both API shapes: exchange(code) and exchange({ code })
  const ex: any = (supabase as any).auth.exchangeCodeForSession
  let error: any = null
  try {
    const argCount = typeof ex === 'function' ? ex.length : 0
    const res =
      argCount === 1
        ? await ex(code)                 // newer supabase-js
        : await ex({ authCode: code })   // older supabase-js
    error = res?.error ?? null
  } catch (e) {
    error = e
  }

  if (error) {
    console.error('[auth/callback] exchange error', error)
    // clear sb-* cookies so retries aren't poisoned
    const jar = cookies()
    for (const c of jar.getAll()) if (c.name.startsWith('sb-')) jar.set(c.name, '', { path: '/', maxAge: 0 })
    return NextResponse.redirect(new URL('/auth/signin?err=exchange', req.url))
  }

  const next = url.searchParams.get('next') || '/briefly/app/dashboard'
  const dest = new URL(next, url.origin)
  return NextResponse.redirect(dest, { headers: { 'Cache-Control': 'no-store' } })
}