import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  const redirectUri = `${origin}/api/storage/google/callback`
  
  // Generate CSRF state token
  const state = crypto.randomUUID()
  cookies().set('oauth_state_google', state, { 
    httpOnly: true, 
    sameSite: 'lax', 
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600 // 10 minutes
  })
  
  // Storage-specific scopes for Google Drive access
  const scope = [
    'openid',
    'email', 
    'profile',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.metadata.readonly',
  ].join(' ')
  
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID!)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('scope', scope)
  url.searchParams.set('state', state)
  
  return NextResponse.redirect(url.toString())
}