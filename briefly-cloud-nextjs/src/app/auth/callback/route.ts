import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const rawNext = url.searchParams.get('next') || '/briefly/app/dashboard'
  const next = rawNext.startsWith('/') ? rawNext : '/briefly/app/dashboard'

  if (!code) return NextResponse.redirect(new URL('/auth/signin', url.origin))

  const missing = ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY']
    .filter(k => !process.env[k])
  if (missing.length) {
    console.error('[auth/callback] Missing env:', missing.join(', '))
    return NextResponse.redirect(new URL('/auth/error?error=server_config', url.origin))
  }

  try {
    const cookieStore = cookies()
    
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
          get: (name) => cookieStore.get(name)?.value,
          set: (name, value, options) => cookieStore.set({ name, value, ...normalize(options) }),
          remove: (name, options) => cookieStore.set({ name, value: '', expires: new Date(0), ...normalize(options) }),
        },
      }
    )

    // Try common PKCE cookie names that the browser flow may set
    const codeVerifier =
      cookieStore.get('sb-code-verifier')?.value ||
      cookieStore.get('sb-auth-code-verifier')?.value ||
      cookieStore.get('code_verifier')?.value ||
      cookieStore.get('sb-briefly-auth-code-verifier')?.value ||
      undefined

    console.log('[auth/callback] PKCE debug:', { 
      hasCode: !!code, 
      hasCodeVerifier: !!codeVerifier,
      codeVerifierLength: codeVerifier?.length || 0
    })

    // Use the API signature your SDK supports; include codeVerifier when available
    const { error } = codeVerifier
      ? await supabase.auth.exchangeCodeForSession({ 
          authCode: code, 
          codeVerifier, 
          redirectTo: `${url.origin}/auth/callback` 
        } as any)
      : await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('[auth/callback] exchange error:', error)
      console.error('[auth/callback] PKCE context:', { 
        hasCodeVerifier: !!codeVerifier,
        errorCode: error.code,
        errorMessage: error.message 
      })
      return NextResponse.redirect(new URL('/auth/error?error=callback_exchange_failed', url.origin))
    }

    // Re-enable audit logging non-blocking (step 6)
    try {
      const { supabaseAdminPrivate } = await import('@/app/lib/supabase-admin-private')
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        await supabaseAdminPrivate.from('audit_log').insert({
          actor_id: user.id,
          action: 'auth.login',
          ip: req.headers.get('x-forwarded-for') ?? null,
          user_agent: req.headers.get('user-agent') ?? null,
          meta: { provider: user.app_metadata?.provider ?? 'unknown' }
        })
      }
    } catch (e) { 
      console.warn('[audit] insert failed:', e) 
    }

    const res = NextResponse.redirect(new URL(next, url.origin))
    res.headers.set('x-auth-exchanged', '1') // debug
    return res
  } catch (e) {
    console.error('[auth/callback] unexpected error:', e)
    return NextResponse.redirect(new URL('/auth/error?error=unexpected_error', url.origin))
  }
}