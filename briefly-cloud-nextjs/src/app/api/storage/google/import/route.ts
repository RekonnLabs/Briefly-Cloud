import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { google } from 'googleapis'
import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { extractTextFromBuffer } from '@/app/lib/document-extractor'
import { createTextChunks } from '@/app/lib/document-extractor'
import { storeDocumentChunks } from '@/app/lib/document-chunker'
import { createEmbeddingsService } from '@/app/lib/embeddings'
import { storeDocumentVectors } from '@/app/lib/vector-storage'

const schema = {
  // Expect { fileId: string }
}

async function importGoogleFileHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  if (!user) return ApiResponse.unauthorized('User not authenticated')
  const body = await request.json().catch(() => ({})) as { fileId?: string }
  if (!body.fileId) return ApiResponse.badRequest('fileId is required')

  const { data: token } = await supabaseAdmin
    .from('oauth_tokens')
    .select('*')
    .eq('user_id', user.id)
    .eq('provider', 'google')
    .single()

  if (!token?.access_token) return ApiResponse.badRequest('Google account not connected')

  const oauth2Client = new google.auth.OAuth2()
  oauth2Client.setCredentials({ access_token: token.access_token, refresh_token: token.refresh_token })
  const drive = google.drive({ version: 'v3', auth: oauth2Client })

  // Get file metadata
  const meta = await drive.files.get({ fileId: body.fileId, fields: 'id, name, mimeType, size' })
  // Download file content
  const res = await drive.files.get({ fileId: body.fileId, alt: 'media' }, { responseType: 'arraybuffer' })
  const buffer = Buffer.from(res.data as ArrayBuffer)

  // Create file metadata row
  const { data: created } = await supabaseAdmin
    .from('file_metadata')
    .insert({
      user_id: user.id,
      name: meta.data.name,
      path: `google:${meta.data.id}`,
      size: Number(meta.data.size || buffer.byteLength),
      mime_type: meta.data.mimeType,
      source: 'google',
      external_id: meta.data.id,
      external_url: `https://drive.google.com/file/d/${meta.data.id}/view`,
      processed: false,
      processing_status: 'pending',
      metadata: { provider: 'google' },
    })
    .select()
    .single()

  const fileId = created.id
  // Extract text and process with new vector pipeline
  const extraction = await extractTextFromBuffer(buffer, meta.data.mimeType!, meta.data.name!)
  
  const { processDocument } = await import('@/app/lib/vector/document-processor')
  await processDocument(user.id, fileId, meta.data.name!, extraction.text, {
    source: 'google_drive',
    mimeType: meta.data.mimeType,
    externalId: body.fileId,
    importedAt: new Date().toISOString()
  })

  return ApiResponse.success({ file_id: fileId, name: meta.data.name })
}

export const POST = createProtectedApiHandler(importGoogleFileHandler, {
  rateLimit: rateLimitConfigs.embedding,
  logging: { enabled: true, includeBody: true },
})



