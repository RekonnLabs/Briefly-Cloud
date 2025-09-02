import { NextRequest } from 'next/server'
import { createProtectedApiHandler, type ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-response'

async function startGoogleOAuth(request: NextRequest, context: ApiContext) {
  const { user } = context
  const url = new URL(request.url)
  const origin = `${url.protocol}//${url.host}`
  
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', process.env.GOOGLE_DRIVE_CLIENT_ID!)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('redirect_uri', `${origin}/api/storage/google/callback`)
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/drive.readonly')
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')
  authUrl.searchParams.set('state', user.id) // simplest CSRF tie to user
  
  return ApiResponse.ok({ url: authUrl.toString() })
}

export const GET = createProtectedApiHandler(startGoogleOAuth)