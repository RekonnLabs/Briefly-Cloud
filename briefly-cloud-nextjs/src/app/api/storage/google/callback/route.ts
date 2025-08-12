import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/lib/auth'
import { supabaseAdmin } from '@/app/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    // Check if user is authenticated via NextAuth
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.redirect(new URL('/briefly/app/auth/signin', req.url))
    }

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

    // Store tokens in oauth_tokens table using supabaseAdmin
    await supabaseAdmin.from('oauth_tokens').upsert({
      user_id: session.user.id,
      provider: 'google',
      access_token,
      refresh_token,
      scope,
      token_type,
      expires_at: new Date(Date.now() + (expires_in || 3600) * 1000).toISOString(),
    }, { 
      onConflict: 'user_id,provider' 
    })

    // Redirect back to dashboard storage tab with success
    return NextResponse.redirect(new URL('/briefly/app/dashboard?tab=storage&connected=google', req.url))

  } catch (error) {
    console.error('Google storage OAuth callback error:', error)
    return NextResponse.redirect(new URL('/briefly/app/dashboard?tab=storage&error=callback_failed', req.url))
  }
}