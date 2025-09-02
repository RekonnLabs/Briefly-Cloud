import { NextRequest } from 'next/server'
import { createProtectedApiHandler, type ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-response'

async function startMicrosoftOAuth(request: NextRequest, context: ApiContext) {
  const { user } = context
  const url = new URL(request.url)
  const origin = `${url.protocol}//${url.host}`
  
  const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')
  authUrl.searchParams.set('client_id', process.env.MS_DRIVE_CLIENT_ID!)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('redirect_uri', `${origin}/api/storage/microsoft/callback`)
  authUrl.searchParams.set('scope', 'offline_access Files.Read User.Read openid profile email')
  authUrl.searchParams.set('state', user.id) // simplest CSRF tie to user
  
  return ApiResponse.ok({ url: authUrl.toString() })
}

export const GET = createProtectedApiHandler(startMicrosoftOAuth)