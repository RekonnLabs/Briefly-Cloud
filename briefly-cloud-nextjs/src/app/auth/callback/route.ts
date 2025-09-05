export const runtime = 'nodejs'

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { clampNext } from '@/app/lib/auth/utils'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const next = clampNext(url.searchParams.get('next') || undefined)
  const jar = cookies()

  const supabase = createServerClient(
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

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession({ authCode: code })
    if (error) {
      console.error('[auth/callback] exchange error', error)
      return NextResponse.redirect(new URL('/auth/signin?err=callback', req.url))
    }
  }

  // Optional: create profile row or bump last_login via RPC
  return NextResponse.redirect(new URL(next, req.url))
}