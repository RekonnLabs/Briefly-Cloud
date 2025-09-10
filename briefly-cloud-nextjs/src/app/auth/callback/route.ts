export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getSupabaseServerMutable } from '@/app/lib/auth/supabase-server-mutable'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') || '/briefly/app/dashboard'

  console.log('[auth/callback] received params:', { 
    code: code ? 'present' : 'missing', 
    next,
    cookies: request.headers.get('cookie')?.includes('sb-') ? 'has sb- cookies' : 'no sb- cookies'
  })

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
  const supabase = getSupabaseServerMutable(res, request)

  try {
    // 3) Exchange code for session
    console.log('[auth/callback] attempting code exchange...')
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (error) {
      console.error('[auth/callback] exchange error:', {
        message: error.message,
        status: error.status,
        name: error.name
      })
      return NextResponse.redirect(new URL('/auth/signin?err=exchange', url.origin))
    }

    console.log('[auth/callback] exchange successful:', {
      user: data.user?.email,
      session: data.session ? 'present' : 'missing'
    })

    // 4) Log cookie attachment
    const cookiesAttached = res.cookies.getAll().some(c => c.name.includes('sb-'))
    console.info('[auth/callback] cookies attached:', cookiesAttached ? 'yes' : 'no')

    // 5) Return the very response that holds Set-Cookie
    return res
  } catch (err) {
    console.error('[auth/callback] unexpected error:', err)
    return NextResponse.redirect(new URL('/auth/signin?err=unexpected', url.origin))
  }
}