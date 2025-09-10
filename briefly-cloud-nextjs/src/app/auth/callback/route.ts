export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getSupabaseServerMutable } from '@/app/lib/auth/supabase-server-mutable'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') || '/briefly/app/dashboard'

  // Handle provider errors
  const providerErr = url.searchParams.get('error')
  if (providerErr) {
    console.error('[auth/callback] provider error:', providerErr)
    return NextResponse.redirect(new URL('/auth/signin?err=provider', url.origin))
  }

  // Handle missing code
  if (!code || typeof code !== 'string') {
    console.error('[auth/callback] missing or invalid code', { code })
    return NextResponse.redirect(new URL('/auth/signin?err=missing_code', url.origin))
  }

  // 1) Build the response *first*
  const res = NextResponse.redirect(new URL(next, url.origin))

  // 2) Create the client bound to THIS response
  const supabase = getSupabaseServerMutable(res)

  // 3) Exchange code for session
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    console.error('[auth/callback] exchange error', error)
    return NextResponse.redirect(new URL('/auth/signin?err=exchange', url.origin))
  }

  // 4) Optionally: quick sanity log – remove later
  console.info(
    '[auth/callback] cookies attached',
    res.cookies.getAll().some(c => c.name.includes('sb-')) ? 'yes' : 'no'
  )

  // 5) Return the very response that holds Set-Cookie
  return res
}