import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createSupabaseServerClient } from '@/app/lib/auth/supabase-auth'

export async function GET(req: NextRequest) {
  try {
    // Guard: Check required environment variables first
    const clientId = process.env.MS_DRIVE_CLIENT_ID
    const redirectUri = process.env.MS_DRIVE_REDIRECT_URI
    const scopes = process.env.MS_DRIVE_SCOPES
    const tenant = process.env.MS_DRIVE_TENANT || 'common'
    
    if (!clientId || !redirectUri || !scopes) {
      // Fail fast with a clear message so we don't hit Microsoft with undefined params
      return NextResponse.redirect(new URL(
        '/briefly/app/dashboard?link=microsoft&error=' +
        encodeURIComponent('missing_env: MS_DRIVE_CLIENT_ID/REDIRECT_URI/SCOPES'),
        req.url
      ))
    }

    // Check if user is authenticated via Supabase Auth
    const supabase = createSupabaseServerClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error || !user) {
      return NextResponse.redirect(new URL('/auth/signin', req.url))
    }

    // Generate CSRF state token
    const state = crypto.randomUUID()
    const cookieStore = await cookies()
    cookieStore.set('oauth_state_microsoft_drive', state, { 
      httpOnly: true, 
      sameSite: 'lax', 
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 600 // 10 minutes
    })
    
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      response_mode: 'query',
      scope: scopes, // includes Files.ReadWrite
      state: state,
    })

    // Optional: Add login hint if available
    if (user.email) {
      params.set('login_hint', user.email)
    }

    // Optional: Add domain hint for consumer vs organization accounts
    // params.set('domain_hint', 'consumers') // or 'organizations'

    const url = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?` + params.toString()
    return NextResponse.redirect(url)
  } catch (error) {
    console.error('Microsoft Drive OAuth start error:', error)
    return NextResponse.redirect(new URL('/briefly/app/dashboard?tab=storage&error=oauth_start_failed', req.url))
  }
}