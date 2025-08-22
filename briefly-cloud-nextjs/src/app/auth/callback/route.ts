/**
 * Supabase Auth Callback Handler
 * 
 * This route handles OAuth callbacks from Google and Microsoft.
 * User profiles are automatically created by database triggers.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/ssr'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const nextRaw = url.searchParams.get('next') || '/briefly/app/dashboard'
  
  // Only allow same-origin, absolute path redirects (prevent open redirects)
  const next = nextRaw.startsWith('/') ? nextRaw : '/briefly/app/dashboard'
  
  if (!code) {
    return NextResponse.redirect(new URL('/auth/signin', url.origin))
  }

  try {
    const supabase = createRouteHandlerClient(
      { cookies },
      {
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
        supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      }
    )
    
    const { data: { user, session }, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('[auth/callback] exchange error:', error)
      return NextResponse.redirect(new URL('/auth/error?error=callback_exchange_failed', url.origin))
    }

    // Lightweight observability: log successful auth
    if (user && session) {
      console.log(`[auth/callback] success: ${user.email} via ${session.user?.app_metadata?.provider ?? 'unknown'}`)
      
      try {
        // Create a private schema admin client for audit logging
        const { createClient } = await import('@supabase/supabase-js')
        const supabaseAdminPrivate = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { 
            auth: { autoRefreshToken: false, persistSession: false }, 
            db: { schema: 'private' } 
          }
        )
        
        await supabaseAdminPrivate
          .from('audit_log') // singular table name
          .insert({
            actor_id: user.id,
            action: 'auth.login',
            table_name: null,
            row_id: null,
            ip: request.headers.get('x-forwarded-for') ?? null,
            user_agent: request.headers.get('user-agent') ?? null,
            meta: { provider: session.user?.app_metadata?.provider ?? 'unknown' },
          })
      } catch (auditError) {
        console.warn('[auth/callback] audit log failed:', auditError)
      }
    }

    // Final redirect (same-origin)
    return NextResponse.redirect(new URL(next, url.origin))
  } catch (e) {
    console.error('[auth/callback] unexpected error:', e)
    return NextResponse.redirect(new URL('/auth/error?error=unexpected_error', url.origin))
  }
}