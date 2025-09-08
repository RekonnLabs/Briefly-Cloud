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
  const provider = url.searchParams.get('provider') as 'google' | 'azure' | null
  
  if (!provider) {
    return NextResponse.json({ error: 'missing provider' }, { status: 400 })
  }

  const supabase = sb()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${url.origin}/auth/callback`,
      // Keep PKCE default; server will set the verifier cookie
    },
  })

  if (error || !data?.url) {
    console.error('[auth/start] signInWithOAuth error', error)
    return NextResponse.redirect(new URL('/auth/signin?err=start', url))
  }

  return NextResponse.redirect(data.url, 302)
}