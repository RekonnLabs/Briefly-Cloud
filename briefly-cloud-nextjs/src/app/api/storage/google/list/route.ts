import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { google } from 'googleapis'
import { getDecryptedToken } from '@/app/lib/oauth/token-store'

async function listGoogleFilesHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  if (!user) return ApiResponse.unauthorized('User not authenticated')

  const token = await getDecryptedToken(user.id, 'google')
  if (!token?.accessToken) return ApiResponse.badRequest('Google account not connected')

  const oauth2Client = new google.auth.OAuth2()
  oauth2Client.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken ?? undefined,
  })

  // B) Add folder support + pagination
  const { searchParams } = new URL(request.url)
  const folderId = searchParams.get('folderId') || 'root'
  
  const drive = google.drive({ version: 'v3', auth: oauth2Client })
  let pageToken: string | undefined
  const files: any[] = []

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents`,
      fields: 'nextPageToken, files(id,name,mimeType,size,webViewLink)',
      pageToken,
      pageSize: 1000,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    files.push(...(res.data.files ?? []))
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)

  const mapped = files
    .filter(f => f.mimeType !== 'application/vnd.google-apps.folder')
    .map(file => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size ? parseInt(file.size) : 0,
      webViewLink: file.webViewLink,
    }))

  const folders = files
    .filter(f => f.mimeType === 'application/vnd.google-apps.folder')
    .map(folder => ({
      id: folder.id,
      name: folder.name,
      mimeType: folder.mimeType,
    }))

  return ApiResponse.success({ files: mapped, folders })
}

export const GET = createProtectedApiHandler(listGoogleFilesHandler, {
  rateLimit: rateLimitConfigs.general,
  logging: { enabled: true, includeBody: false },
})



