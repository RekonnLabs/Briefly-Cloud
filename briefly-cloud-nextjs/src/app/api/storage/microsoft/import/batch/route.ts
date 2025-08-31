import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { getDecryptedToken } from '@/app/lib/oauth/token-store'
import { supabaseAdmin } from '@/app/lib/supabase-admin'

async function batchImportHandler(req: Request, ctx: ApiContext) {
  const { user } = ctx
  const { folderId = 'root' } = await req.json()

  const token = await getDecryptedToken(user.id, 'microsoft')
  if (!token?.accessToken) return ApiResponse.badRequest('Microsoft not connected')

  // 1) List all files in folder (with pagination)
  let url = `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children`
  const allItems: any[] = []

  do {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token.accessToken}` },
    })
    if (!resp.ok) return ApiResponse.internalError('Failed to list OneDrive files')
    const data = await resp.json()
    
    allItems.push(...(data.value || []))
    url = data['@odata.nextLink']
  } while (url)

  const files = allItems.filter(f => f.file) // Only files, not folders
  let processed = 0
  const total = files.length

  // 2) Process each file
  for (const file of files) {
    try {
      // Check if file already exists
      const { data: existing } = await supabaseAdmin
        .from('file_metadata')
        .select('id')
        .eq('user_id', user.id)
        .eq('external_id', file.id)
        .eq('source', 'microsoft_drive')
        .single()

      if (existing) {
        processed++
        continue // Skip if already imported
      }

      // Download file content
      const downloadUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${file.id}/content`
      const fileRes = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      })

      if (!fileRes.ok) continue

      const content = await fileRes.text()

      // Insert file metadata
      const { data: fileRecord, error } = await supabaseAdmin
        .from('file_metadata')
        .insert({
          user_id: user.id,
          name: file.name,
          size: file.size || 0,
          mime_type: file.file?.mimeType,
          source: 'microsoft_drive',
          external_id: file.id,
          status: 'processing',
        })
        .select()
        .single()

      if (error || !fileRecord) continue

      // TODO: Call processDocument(user.id, fileRecord.id, file.name, content, metadata)
      // For now, just mark as completed
      await supabaseAdmin
        .from('file_metadata')
        .update({ status: 'completed' })
        .eq('id', fileRecord.id)

      processed++
    } catch (error) {
      console.error(`Failed to import file ${file.name}:`, error)
      // Continue with next file
    }
  }

  return ApiResponse.success({ total, processed })
}

export const POST = createProtectedApiHandler(batchImportHandler, {
  rateLimit: { points: 1, duration: 60 }, // 1 per minute for batch operations
  logging: { enabled: true, includeBody: false },
})