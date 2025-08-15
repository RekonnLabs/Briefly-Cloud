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
    const stateCookie = cookies().get('oauth_state_microsoft')?.value
    if (!stateParam || stateParam !== stateCookie) {
      return NextResponse.redirect(new URL('/briefly/app/dashboard?tab=storage&error=state_mismatch', req.url))
    }
    
    // Clear the state cookie
    cookies().delete('oauth_state_microsoft')

    const code = req.nextUrl.searchParams.get('code')
    if (!code) {
      return NextResponse.redirect(new URL('/briefly/app/dashboard?tab=storage&error=no_code', req.url))
    }

    const origin = req.nextUrl.origin
    const redirect_uri = `${origin}/api/storage/microsoft/callback`
    const tenant = process.env.AZURE_AD_TENANT_ID || 'common'

    // Exchange code for tokens
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.AZURE_AD_CLIENT_ID!,
        client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
        grant_type: 'authorization_code',
        code,
        redirect_uri,
      }),
    })

    const tokenData = await tokenRes.json()
    const { access_token, refresh_token, expires_in, scope, token_type } = tokenData

    if (!access_token) {
      console.error('Microsoft OAuth token exchange failed:', tokenData)
      return NextResponse.redirect(new URL('/briefly/app/dashboard?tab=storage&error=token_failed', req.url))
    }

    // Store encrypted tokens using secure token store
    await storeEncryptedToken({
      userId: user.id,
      provider: 'microsoft',
      accessToken: access_token,
      refreshToken: refresh_token,
      scope,
      tokenType: token_type,
      expiresAt: new Date(Date.now() + (expires_in || 3600) * 1000),
    })

    // Redirect back to dashboard storage tab with success
    return NextResponse.redirect(new URL('/briefly/app/dashboard?tab=storage&connected=microsoft', req.url))

  } catch (error) {
    console.error('Microsoft storage OAuth callback error:', error)
    return NextResponse.redirect(new URL('/briefly/app/dashboard?tab=storage&error=callback_failed', req.url))
  }
}