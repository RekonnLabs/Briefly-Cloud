// @ts-nocheck — legacy route pending consolidation
import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { OneDriveProvider } from '@/app/lib/cloud-storage'
import { AppError } from '@/app/lib/api-errors'
import { Apideck, isApideckEnabled } from '@/app/lib/integrations/apideck'
import { supabaseAdmin } from '@/app/lib/supabase-admin'

// Sentinel prefix written by the Microsoft OAuth callback to create a placeholder
// apideck_connections row. This is NOT a real Apideck connection — it exists only
// so the status route shows OneDrive as connected. Any Apideck path must skip it.
const MS_LEGACY_SENTINEL_PREFIX = 'microsoft-'

async function listOneDriveFilesHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  if (!user) return ApiResponse.unauthorized('User not authenticated')

  try {
    const { searchParams } = new URL(request.url)
    const folderId = searchParams.get('folderId') || 'root'
    const pageSize = Math.min(1000, Math.max(1, parseInt(searchParams.get('pageSize') || '100')))

    if (isApideckEnabled()) {
      // Check for a real Apideck OneDrive connection (not the legacy placeholder row)
      const { data: conn } = await supabaseAdmin
        .from('apideck_connections')
        .select('consumer_id, connection_id')
        .eq('user_id', user.id)
        .eq('provider', 'microsoft')
        .maybeSingle()

      const isRealApideck = conn?.connection_id &&
        !conn.connection_id.startsWith(MS_LEGACY_SENTINEL_PREFIX)

      if (isRealApideck) {
        const resp = await Apideck.listFiles(
          conn.consumer_id || user.id,
          conn.connection_id,
          { folder_id: folderId === 'root' ? undefined : folderId, limit: pageSize }
        )
        const items = resp?.data ?? []
        const files = items
          .filter((i: any) => i.type !== 'folder')
          .map((i: any) => ({
            id: i.id, name: i.name,
            size: i.size || 0,
            mimeType: i.mime_type || '',
            modifiedTime: i.updated_at,
            webViewLink: i.web_url
          }))
        const folders = items
          .filter((i: any) => i.type === 'folder')
          .map((i: any) => ({
            id: i.id, name: i.name,
            mimeType: 'application/vnd.ms-folder',
            modifiedTime: i.updated_at,
            webViewLink: i.web_url
          }))
        return ApiResponse.success({
          files, folders,
          pagination: { nextPageToken: resp?.meta?.cursors?.next || null, hasMore: !!resp?.meta?.cursors?.next }
        })
      }
    }

    // Legacy path — uses direct Microsoft Graph API with token from oauth_tokens
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
    // Check AppError statusCode directly — string-matching .message is unreliable
    // because error messages like "No valid OneDrive token found" contain 'OneDrive'
    // and would fall into the wrong branch.
    if (error instanceof AppError && error.statusCode === 401) {
      return ApiResponse.unauthorized('OneDrive access token is invalid or expired')
    }
    if (error instanceof AppError && error.statusCode === 403) {
      return ApiResponse.forbidden('OneDrive access denied')
    }
    console.error('[onedrive:list:error]', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    return ApiResponse.serverError('OneDrive API error', 'ONEDRIVE_ERROR')
  }
}

export const GET = createProtectedApiHandler(listOneDriveFilesHandler, {
  rateLimit: rateLimitConfigs.general,
  logging: { enabled: true, includeBody: false },
})



