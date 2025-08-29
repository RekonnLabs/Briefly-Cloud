import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/app/lib/auth/supabase-auth'
import { storeEncryptedToken } from '@/app/lib/oauth/token-store'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    const error = searchParams.get('error')
    
    if (error) {
      return NextResponse.redirect(new URL('/briefly/app/dashboard?link=google&error=' + encodeURIComponent(error), req.url))
    }
    
    if (!code) {
      return NextResponse.redirect(new URL('/briefly/app/dashboard?link=google&error=missing_code', req.url))
    }

    // Check if user is authenticated via Supabase Auth
    const supabase = createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.redirect(new URL('/auth/signin', req.url))
    }

    // Validate CSRF state
    const stateParam = searchParams.get('state')
    const cookieStore = await cookies()
    const stateCookie = cookieStore.get('oauth_state_google_drive')?.value
    if (!stateParam || stateParam !== stateCookie) {
      return NextResponse.redirect(new URL('/briefly/app/dashboard?link=google&error=state_mismatch', req.url))
    }
    
    // Clear the state cookie
    cookieStore.delete('oauth_state_google_drive')

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_DRIVE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_DRIVE_REDIRECT_URI!,
        code,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      return NextResponse.redirect(new URL('/briefly/app/dashboard?link=google&error=' + encodeURIComponent(err.slice(0, 200)), req.url))
    }

    const tokens = await tokenRes.json() as {
      access_token: string
      refresh_token?: string
      expires_in: number
      token_type: 'Bearer'
      scope: string
    }

    if (!tokens.access_token) {
      console.error('Google Drive OAuth token exchange failed:', tokens)
      return NextResponse.redirect(new URL('/briefly/app/dashboard?link=google&error=token_failed', req.url))
    }

    // Store encrypted tokens using secure token store
    await storeEncryptedToken({
      userId: user.id,
      provider: 'google_drive',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      scope: tokens.scope,
      tokenType: tokens.token_type,
      expiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
    })

    return NextResponse.redirect(new URL('/briefly/app/dashboard?link=google=ok', req.url))

  } catch (error) {
    console.error('Google Drive OAuth callback error:', error)
    return NextResponse.redirect(new URL('/briefly/app/dashboard?link=google&error=callback_failed', req.url))
  }
}