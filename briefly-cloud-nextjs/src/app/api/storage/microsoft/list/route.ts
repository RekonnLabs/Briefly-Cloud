import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { OneDriveProvider } from '@/app/lib/cloud-storage'

async function listOneDriveFilesHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  if (!user) return ApiResponse.unauthorized('User not authenticated')

  try {
    const { searchParams } = new URL(request.url)
    const folderId = searchParams.get('folderId') || 'root'
    const pageSize = Math.min(1000, Math.max(1, parseInt(searchParams.get('pageSize') || '100')))

    const provider = new OneDriveProvider()
    const result = await provider.listFiles(user.id, folderId, undefined, pageSize)

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
      return ApiResponse.unauthorized('OneDrive access token is invalid or expired')
    }
    if (error instanceof Error && error.message.includes('OneDrive')) {
      return ApiResponse.serverError('OneDrive API error', 'ONEDRIVE_ERROR')
    }
    return ApiResponse.serverError('Failed to list OneDrive files')
  }
}

export const GET = createProtectedApiHandler(listOneDriveFilesHandler, {
  rateLimit: rateLimitConfigs.general,
  logging: { enabled: true, includeBody: false },
})



