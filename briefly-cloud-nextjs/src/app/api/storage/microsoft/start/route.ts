import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  const redirectUri = `${origin}/api/storage/microsoft/callback`
  const tenant = process.env.AZURE_AD_TENANT_ID || 'common'
  
  const url = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`)
  url.searchParams.set('client_id', process.env.AZURE_AD_CLIENT_ID!)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_mode', 'query')
  url.searchParams.set('scope', 'openid email profile offline_access Files.Read.All')
  url.searchParams.set('state', 'briefly_connect_onedrive')
  
  return NextResponse.redirect(url.toString())
}