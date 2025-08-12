import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { supabaseAdmin } from '@/app/lib/supabase'
import { extractTextFromBuffer, createTextChunks } from '@/app/lib/document-extractor'
import { storeDocumentChunks } from '@/app/lib/document-chunker'
import { createEmbeddingsService } from '@/app/lib/embeddings'
import { storeDocumentVectors } from '@/app/lib/vector-storage'

async function importOneDriveFileHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  if (!user) return ApiResponse.unauthorized('User not authenticated')
  const body = await request.json().catch(() => ({})) as { fileId?: string }
  if (!body.fileId) return ApiResponse.badRequest('fileId is required')

  const { data: token } = await supabaseAdmin
    .from('oauth_tokens')
    .select('*')
    .eq('user_id', user.id)
    .eq('provider', 'microsoft')
    .single()

  if (!token?.access_token) return ApiResponse.badRequest('Microsoft account not connected')

  // Get metadata
  const metaResp = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${body.fileId}`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })
  if (!metaResp.ok) return ApiResponse.internalError('Failed to fetch file metadata')
  const meta = await metaResp.json()

  // Download
  const dl = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${body.fileId}/content`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })
  if (!dl.ok) return ApiResponse.internalError('Failed to download file')
  const arrayBuf = await dl.arrayBuffer()
  const buffer = Buffer.from(arrayBuf)

  const { data: created } = await supabaseAdmin
    .from('file_metadata')
    .insert({
      user_id: user.id,
      name: meta.name,
      path: `onedrive:${meta.id}`,
      size: Number(meta.size || buffer.byteLength),
      mime_type: meta.file?.mimeType || 'application/octet-stream',
      source: 'microsoft',
      external_id: meta.id,
      external_url: meta.webUrl,
      processed: false,
      processing_status: 'pending',
      metadata: { provider: 'microsoft' },
    })
    .select()
    .single()

  const fileId = created.id
  const extraction = await extractTextFromBuffer(buffer, created.mime_type, created.name)
  const chunks = createTextChunks(extraction.text, fileId, created.name, created.mime_type, 1000)
  await storeDocumentChunks(chunks as any, user.id, fileId)

  const embeddings = await createEmbeddingsService().generateBatchEmbeddings(chunks.map(c => c.content))
  await storeDocumentVectors(chunks as any, embeddings.embeddings.map(e => e.embedding), user.id, created.name)

  await supabaseAdmin
    .from('file_metadata')
    .update({ processed: true, processing_status: 'completed' })
    .eq('id', fileId)

  return ApiResponse.success({ file_id: fileId, name: created.name })
}

export const POST = createProtectedApiHandler(importOneDriveFileHandler, {
  rateLimit: rateLimitConfigs.embedding,
  logging: { enabled: true, includeBody: true },
})



