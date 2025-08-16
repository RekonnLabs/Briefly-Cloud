import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { google } from 'googleapis'
import { supabaseAdmin } from '@/app/lib/supabase-admin'

async function listGoogleFilesHandler(_request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  if (!user) return ApiResponse.unauthorized('User not authenticated')

  const { data: token } = await supabaseAdmin
    .from('oauth_tokens')
    .select('*')
    .eq('user_id', user.id)
    .eq('provider', 'google')
    .single()

  if (!token?.access_token) return ApiResponse.badRequest('Google account not connected')

  const oauth2Client = new google.auth.OAuth2()
  oauth2Client.setCredentials({
    access_token: token.access_token,
    refresh_token: token.refresh_token,
  })

  const drive = google.drive({ version: 'v3', auth: oauth2Client })
  const res = await drive.files.list({
    pageSize: 50,
    fields: 'files(id, name, mimeType, size, webViewLink)',
    q: "mimeType != 'application/vnd.google-apps.folder'",
  })

  return ApiResponse.success({ files: res.data.files || [] })
}

export const GET = createProtectedApiHandler(listGoogleFilesHandler, {
  rateLimit: rateLimitConfigs.general,
  logging: { enabled: true, includeBody: false },
})



