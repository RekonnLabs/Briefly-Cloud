import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createSupabaseServerClient } from '@/app/lib/auth/supabase-auth'

export async function GET(req: NextRequest) {
  try {
    // Guard: Check required environment variables first
    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID
    const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI
    
    // Guardrail: Force correct scope to prevent connection issues
    const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'  // Force scope to drive.file only even if env is polluted
    const scope = DRIVE_SCOPE
    
    if (!clientId || !redirectUri) {
      // Fail fast with a clear message so we don't hit Google with redirect_uri=undefined
      return NextResponse.redirect(new URL(
        '/briefly/app/dashboard?link=google&error=' +
        encodeURIComponent('missing_env: GOOGLE_DRIVE_CLIENT_ID/REDIRECT_URI'),
        req.url
      ))
    }

    // Debug logging for troubleshooting
    console.log('[DriveStart] client tail:', clientId?.slice(-8), 'scope:', scope)

    // Check if user is authenticated via Supabase Auth
    const supabase = createSupabaseServerClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error || !user) {
      return NextResponse.redirect(new URL('/auth/signin', req.url))
    }

    // Generate CSRF state token
    const state = crypto.randomUUID()
    const cookieStore = await cookies()
    cookieStore.set('oauth_state_google_drive', state, { 
      httpOnly: true, 
      sameSite: 'lax', 
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 600 // 10 minutes
    })
    
    // Build OAuth URL with guardrails
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('access_type', 'offline')
    authUrl.searchParams.set('include_granted_scopes', 'true')
    authUrl.searchParams.set('scope', scope)  // Use our forced scope
    authUrl.searchParams.set('state', state)
    
    // Optional: Force consent on first-time connections
    authUrl.searchParams.set('prompt', 'consent')
    
    // Optional nicety if you have the email on the server
    if (user.email) {
      authUrl.searchParams.set('login_hint', user.email)
    }

    return NextResponse.redirect(authUrl.toString())
  } catch (error) {
    console.error('Google Drive OAuth start error:', error)
    return NextResponse.redirect(new URL('/briefly/app/dashboard?tab=storage&error=oauth_start_failed', req.url))
  }
}