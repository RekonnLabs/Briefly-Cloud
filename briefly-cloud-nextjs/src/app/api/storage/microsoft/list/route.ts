import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { getDecryptedToken } from '@/app/lib/oauth/token-store'

async function listOneDriveFilesHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  if (!user) return ApiResponse.unauthorized('User not authenticated')

  const token = await getDecryptedToken(user.id, 'microsoft')
  if (!token?.accessToken) return ApiResponse.badRequest('Microsoft account not connected')

  // B) Add folder support + pagination
  const { searchParams } = new URL(request.url)
  const folderId = searchParams.get('folderId') || 'root'
  
  let url = `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children`
  const allItems: any[] = []

  do {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token.accessToken}` },
    })
    if (!resp.ok) return ApiResponse.internalError('Failed to list OneDrive files')
    const data = await resp.json()
    
    allItems.push(...(data.value || []))
    url = data['@odata.nextLink'] // Pagination
  } while (url)

  const files = allItems
    .filter(f => f.file) // Only files, not folders
    .map((f: any) => ({
      id: f.id,
      name: f.name,
      size: f.size,
      mimeType: f.file?.mimeType,
      webUrl: f.webUrl,
    }))

  const folders = allItems
    .filter(f => f.folder) // Only folders
    .map((f: any) => ({
      id: f.id,
      name: f.name,
      childCount: f.folder?.childCount || 0,
    }))

  return ApiResponse.success({ files, folders })
}

export const GET = createProtectedApiHandler(listOneDriveFilesHandler, {
  rateLimit: rateLimitConfigs.general,
  logging: { enabled: true, includeBody: false },
})



