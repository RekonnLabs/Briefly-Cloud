import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { google } from 'googleapis'
import { getDecryptedToken } from '@/app/lib/oauth/token-store'
import { supabaseAdmin } from '@/app/lib/supabase-admin'

async function batchImportHandler(req: Request, ctx: ApiContext) {
  const { user } = ctx
  const { folderId = 'root' } = await req.json()

  const token = await getDecryptedToken(user.id, 'google')
  if (!token?.accessToken) return ApiResponse.badRequest('Google not connected')

  const auth = new google.auth.OAuth2()
  auth.setCredentials({ 
    access_token: token.accessToken,
    refresh_token: token.refreshToken ?? undefined,
  })
  const drive = google.drive({ version: 'v3', auth })

  // 1) List all files in folder (with pagination)
  let pageToken: string | undefined
  const files: any[] = []

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder'`,
      fields: 'nextPageToken, files(id,name,mimeType,size)',
      pageToken,
      pageSize: 1000,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    files.push(...(res.data.files ?? []))
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)

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
        .eq('source', 'google_drive')
        .single()

      if (existing) {
        processed++
        continue // Skip if already imported
      }

      // Download file content
      const fileRes = await drive.files.get({
        fileId: file.id,
        alt: 'media',
      })

      if (!fileRes.data) continue

      // Convert buffer to text (basic implementation)
      const content = Buffer.isBuffer(fileRes.data) 
        ? fileRes.data.toString('utf-8')
        : String(fileRes.data)

      // Insert file metadata
      const { data: fileRecord, error } = await supabaseAdmin
        .from('file_metadata')
        .insert({
          user_id: user.id,
          name: file.name,
          size: file.size ? parseInt(file.size) : 0,
          mime_type: file.mimeType,
          source: 'google_drive',
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