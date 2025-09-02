import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/app/lib/auth/supabase-auth'
import { TokenStore } from '@/app/lib/oauth/token-store'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const error = url.searchParams.get('error')
    
    if (error) {
      return NextResponse.redirect(`${url.origin}/briefly/app/dashboard?tab=storage&error=${encodeURIComponent(error)}`)
    }
    
    if (!code) {
      return NextResponse.redirect(`${url.origin}/briefly/app/dashboard?tab=storage&error=missing_code`)
    }

    // Get authenticated user
    const user = await getAuthenticatedUser()
    
    // Exchange code for tokens
    const tokenRes = await fetch(`https://login.microsoftonline.com/common/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MS_DRIVE_CLIENT_ID!,
        client_secret: process.env.MS_DRIVE_CLIENT_SECRET!,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${url.origin}/api/storage/microsoft/callback`,
      })
    })
    
    const tokens = await tokenRes.json()
    if (!tokenRes.ok) {
      return NextResponse.redirect(`${url.origin}/briefly/app/dashboard?tab=storage&error=${encodeURIComponent(tokens.error_description || 'token_exchange_failed')}`)
    }

    // Save token with consistent provider key
    await TokenStore.saveToken(user.id, 'microsoft', {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
    })

    // Redirect back to storage tab so status call runs again
    return NextResponse.redirect(`${url.origin}/briefly/app/dashboard?tab=storage`, 302)

  } catch (error) {
    console.error('Microsoft callback error:', error)
    const url = new URL(req.url)
    return NextResponse.redirect(`${url.origin}/briefly/app/dashboard?tab=storage&error=callback_failed`)
  }
}