import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code') || ''
  const next = url.searchParams.get('next') || '/briefly/app/dashboard'
  if (!code) return NextResponse.redirect(new URL('/auth/signin', url.origin))

  const jar = await cookies()
  const normalize = (o?: any) => {
    const { domain, ...rest } = o || {}
    return { httpOnly: true, secure: true, sameSite: 'none' as const, path: '/', ...rest }
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => jar.get(n)?.value,
        set: (n, v, o) => jar.set({ name: n, value: v, ...normalize(o) }),
        remove: (n, o) =>
          jar.set({ name: n, value: '', expires: new Date(0), ...normalize(o) }),
      },
    }
  )

  // Find a PKCE code_verifier saved by the browser flow
  const codeVerifier =
    jar.get('sb-code-verifier')?.value ||
    jar.get('sb-auth-code-verifier')?.value ||
    jar.get('code_verifier')?.value ||
    jar.get('sb-' + process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0] + '-auth-code-verifier')?.value || // best-effort project-ref style
    undefined

  // 1) Try the simplest SDK path first (string form).
  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Audit logging (non-blocking)
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

      // Use response proxy pattern to forward cookies
      const tempRes = NextResponse.next()
      const redirect = NextResponse.redirect(new URL(next, url.origin), { status: 307 })
      redirect.headers.set('x-auth-exchanged', '1')
      
      // Forward any cookies that might have been set
      tempRes.headers.forEach((val, key) => {
        if (key.toLowerCase().startsWith('set-cookie')) {
          redirect.headers.set(key, val)
        }
      })
      
      return redirect
    }
    // If it complains about missing verifier, we'll fall through to REST
    console.log('[auth/callback] SDK exchange (string) error:', error)
  } catch (e) {
    console.log('[auth/callback] SDK exchange exception, falling back to REST:', e)
    // continue to REST fallback
  }

  // 2) REST fallback: call GoTrue directly with exact PKCE JSON
  if (!codeVerifier) {
    // No verifier available → we can't complete PKCE
    console.error('[auth/callback] No code verifier found in cookies')
    return NextResponse.redirect(
      new URL('/auth/error?error=callback_exchange_failed', url.origin),
      { status: 307 }
    )
  }

  try {
    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    console.log('[auth/callback] Attempting REST fallback with PKCE')
    const r = await fetch(`${supaUrl}/auth/v1/token?grant_type=pkce`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: anon,
        authorization: `Bearer ${anon}`,
      },
      body: JSON.stringify({
        auth_code: code,            // exact field names for GoTrue
        code_verifier: codeVerifier,
        redirect_to: `${url.origin}/auth/callback`,
      }),
    })

    if (!r.ok) {
      // For visibility while stabilizing:
      const t = await r.text().catch(() => '')
      console.error('[auth/callback] REST exchange failed:', r.status, t)
      return NextResponse.redirect(
        new URL('/auth/error?error=callback_exchange_failed', url.origin),
        { status: 307 }
      )
    }

    const payload = await r.json()
    console.log('[auth/callback] REST exchange successful')
    // payload should include access_token, refresh_token, expires_in, token_type, etc.

    // 3) Set session via SDK so your cookie adapter writes sb-* cookies
    const { error: setErr } = await supabase.auth.setSession({
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
    })

    if (setErr) {
      console.error('[auth/callback] setSession error:', setErr)
      return NextResponse.redirect(
        new URL('/auth/error?error=callback_exchange_failed', url.origin),
        { status: 307 }
      )
    }

    // Audit logging (non-blocking)
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

    // Use response proxy pattern to forward session cookies
    const tempRes = NextResponse.next()
    const redirect = NextResponse.redirect(new URL(next, url.origin), { status: 307 })
    redirect.headers.set('x-auth-exchanged', '1')
    
    // Forward any session cookies that were set by setSession
    tempRes.headers.forEach((val, key) => {
      if (key.toLowerCase().startsWith('set-cookie')) {
        redirect.headers.set(key, val)
      }
    })
    
    return redirect
  } catch (e) {
    console.error('[auth/callback] REST exchange exception:', e)
    return NextResponse.redirect(
      new URL('/auth/error?error=callback_exchange_failed', url.origin),
      { status: 307 }
    )
  }
}