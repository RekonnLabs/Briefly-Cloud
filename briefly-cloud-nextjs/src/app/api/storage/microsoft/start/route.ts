import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  const redirectUri = `${origin}/api/storage/microsoft/callback`
  const tenant = process.env.AZURE_AD_TENANT_ID || 'common'
  
  // Generate CSRF state token
  const state = crypto.randomUUID()
  cookies().set('oauth_state_microsoft', state, { 
    httpOnly: true, 
    sameSite: 'lax', 
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600 // 10 minutes
  })
  
  const url = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`)
  url.searchParams.set('client_id', process.env.AZURE_AD_CLIENT_ID!)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_mode', 'query')
  url.searchParams.set('scope', 'openid email profile offline_access Files.Read.All')
  url.searchParams.set('state', state)
  
  return NextResponse.redirect(url.toString())
}