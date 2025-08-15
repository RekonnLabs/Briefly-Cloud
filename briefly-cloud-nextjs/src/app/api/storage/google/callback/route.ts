import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/app/lib/auth/supabase-auth'
import { storeEncryptedToken } from '@/app/lib/oauth/token-store'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest) {
  try {
    // Check if user is authenticated via Supabase Auth
    const supabase = createSupabaseServerClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error || !user) {
      return NextResponse.redirect(new URL('/briefly/app/auth/signin', req.url))
    }

    // Validate CSRF state
    const stateParam = req.nextUrl.searchParams.get('state')
    const stateCookie = cookies().get('oauth_state_google')?.value
    if (!stateParam || stateParam !== stateCookie) {
      return NextResponse.redirect(new URL('/briefly/app/dashboard?tab=storage&error=state_mismatch', req.url))
    }
    
    // Clear the state cookie
    cookies().delete('oauth_state_google')

    const code = req.nextUrl.searchParams.get('code')
    if (!code) {
      return NextResponse.redirect(new URL('/briefly/app/dashboard?tab=storage&error=no_code', req.url))
    }

    const origin = req.nextUrl.origin
    const redirect_uri = `${origin}/api/storage/google/callback`

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri,
        grant_type: 'authorization_code',
      }),
    })

    const tokenData = await tokenRes.json()
    const { access_token, refresh_token, expires_in, scope, token_type } = tokenData

    if (!access_token) {
      console.error('Google OAuth token exchange failed:', tokenData)
      return NextResponse.redirect(new URL('/briefly/app/dashboard?tab=storage&error=token_failed', req.url))
    }

    // Store encrypted tokens using secure token store
    await storeEncryptedToken({
      userId: user.id,
      provider: 'google',
      accessToken: access_token,
      refreshToken: refresh_token,
      scope,
      tokenType: token_type,
      expiresAt: new Date(Date.now() + (expires_in || 3600) * 1000),
    })

    // Redirect back to dashboard storage tab with success
    return NextResponse.redirect(new URL('/briefly/app/dashboard?tab=storage&connected=google', req.url))

  } catch (error) {
    console.error('Google storage OAuth callback error:', error)
    return NextResponse.redirect(new URL('/briefly/app/dashboard?tab=storage&error=callback_failed', req.url))
  }
}