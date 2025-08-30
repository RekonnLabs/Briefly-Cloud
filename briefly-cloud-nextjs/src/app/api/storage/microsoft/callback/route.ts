import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/app/lib/auth/supabase-auth'
import { storeEncryptedToken } from '@/app/lib/oauth/token-store'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest) {
  try {
    // Guard: Check required environment variables first
    const clientId = process.env.MS_DRIVE_CLIENT_ID
    const clientSecret = process.env.MS_DRIVE_CLIENT_SECRET
    const redirectUri = process.env.MS_DRIVE_REDIRECT_URI
    const tenant = process.env.MS_DRIVE_TENANT_ID || 'common'
    
    if (!clientId || !clientSecret || !redirectUri) {
      return NextResponse.redirect(new URL(
        '/briefly/app/dashboard?link=microsoft&error=' +
        encodeURIComponent('missing_env: MS_DRIVE_CLIENT_ID/SECRET/REDIRECT_URI'),
        req.url
      ))
    }

    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')
    
    if (error) {
      const errorMsg = errorDescription || error
      return NextResponse.redirect(new URL('/briefly/app/dashboard?link=microsoft&error=' + encodeURIComponent(errorMsg), req.url))
    }
    
    if (!code) {
      return NextResponse.redirect(new URL('/briefly/app/dashboard?link=microsoft&error=missing_code', req.url))
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
    const stateCookie = cookieStore.get('oauth_state_microsoft_drive')?.value
    if (!stateParam || stateParam !== stateCookie) {
      return NextResponse.redirect(new URL('/briefly/app/dashboard?link=microsoft&error=state_mismatch', req.url))
    }
    
    // Clear the state cookie
    cookieStore.delete('oauth_state_microsoft_drive')

    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      console.error('Microsoft Drive token exchange failed:', err)
      return NextResponse.redirect(new URL('/briefly/app/dashboard?link=microsoft&error=' + encodeURIComponent(err.slice(0, 200)), req.url))
    }

    const tokens = await tokenRes.json() as {
      access_token: string
      refresh_token?: string
      expires_in: number
      token_type: 'Bearer'
      scope: string
    }

    if (!tokens.access_token) {
      console.error('Microsoft Drive OAuth token exchange failed:', tokens)
      return NextResponse.redirect(new URL('/briefly/app/dashboard?link=microsoft&error=token_failed', req.url))
    }

    // Store encrypted tokens using secure token store
    await storeEncryptedToken({
      userId: user.id,
      provider: 'microsoft_drive',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      scope: tokens.scope,
      tokenType: tokens.token_type,
      expiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
    })

    return NextResponse.redirect(new URL('/briefly/app/dashboard?link=microsoft=ok', req.url))

  } catch (error) {
    console.error('Microsoft Drive OAuth callback error:', error)
    return NextResponse.redirect(new URL('/briefly/app/dashboard?link=microsoft&error=callback_failed', req.url))
  }
}