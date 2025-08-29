import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createSupabaseServerClient } from '@/app/lib/auth/supabase-auth'

export async function GET(req: NextRequest) {
  try {
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
    
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_DRIVE_CLIENT_ID!,
      redirect_uri: process.env.GOOGLE_DRIVE_REDIRECT_URI!,
      response_type: 'code',
      scope: process.env.GOOGLE_DRIVE_SCOPES!, // includes drive.file
      access_type: 'offline',
      include_granted_scopes: 'true',
      // OAuth Consent Policy:
      // - First link attempt: Use prompt=consent to ensure user grants permissions
      // - Subsequent links: Omit prompt=consent to avoid re-prompting users
      // TODO: Check user's connection status and set prompt=consent only if needed
      // prompt: 'consent',
      // Optional nicety if you have the email on the server:
      login_hint: user.email || '',
      state: state,
    })

    const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString()
    return NextResponse.redirect(url)
  } catch (error) {
    console.error('Google Drive OAuth start error:', error)
    return NextResponse.redirect(new URL('/briefly/app/dashboard?tab=storage&error=oauth_start_failed', req.url))
  }
}