import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { GoogleDriveProvider } from '@/app/lib/cloud-storage'

async function listGoogleFilesHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  if (!user) return ApiResponse.unauthorized('User not authenticated')

  try {
    const { searchParams } = new URL(request.url)
    const folderId = searchParams.get('folderId') || 'root'
    const pageToken = searchParams.get('pageToken') || undefined
    const pageSize = Math.min(1000, Math.max(1, parseInt(searchParams.get('pageSize') || '100')))

    const provider = new GoogleDriveProvider()
    const result = await provider.listFiles(user.id, folderId, pageToken, pageSize)

    return ApiResponse.success({
      files: result.files,
      folders: result.folders,
      pagination: {
        nextPageToken: result.nextPageToken,
        hasMore: result.hasMore
      }
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('unauthorized')) {
      return ApiResponse.unauthorized('Google Drive access token is invalid or expired')
    }
    if (error instanceof Error && error.message.includes('Google Drive')) {
      return ApiResponse.serverError('Google Drive API error', 'google_ERROR')
    }
    return ApiResponse.serverError('Failed to list Google Drive files')
  }
}

export const GET = createProtectedApiHandler(listGoogleFilesHandler, {
  rateLimit: rateLimitConfigs.general,
  logging: { enabled: true, includeBody: false },
})



