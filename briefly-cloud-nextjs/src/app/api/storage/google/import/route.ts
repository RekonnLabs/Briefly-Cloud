import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { google } from 'googleapis'
import { TokenStore } from '@/app/lib/oauth/token-store'
import { Apideck } from '@/app/lib/integrations/apideck'
import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { filesRepo, fileIngestRepo } from '@/app/lib/repos'
import { extractTextFromBuffer } from '@/app/lib/document-extractor'
import { computeBufferHash } from '@/app/lib/utils/content-hash'

async function importGoogleFileHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  if (!user) return ApiResponse.unauthorized('User not authenticated')

  const body = await request.json().catch(() => ({})) as {
    fileId?: string
    fileName?: string
    mimeType?: string
  }
  if (!body.fileId) return ApiResponse.badRequest('fileId is required')

  const token = await TokenStore.getToken(user.id, 'google')

  let buffer: Buffer
  let fileName: string
  let mimeType: string
  let fileSize: number
  let providerFileId: string = body.fileId

  if (token) {
    // Legacy direct Google Drive path
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: token.accessToken, refresh_token: token.refreshToken ?? undefined })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    const meta = await drive.files.get({ fileId: body.fileId, fields: 'id, name, mimeType, size' })
    const res = await drive.files.get({ fileId: body.fileId, alt: 'media' }, { responseType: 'arraybuffer' })

    buffer = Buffer.from(res.data as ArrayBuffer)
    fileName = meta.data.name ?? body.fileId
    mimeType = meta.data.mimeType ?? 'application/octet-stream'
    fileSize = Number(meta.data.size ?? buffer.byteLength)
    providerFileId = meta.data.id ?? body.fileId
  } else {
    // Apideck unified path — token not present, use Apideck to download
    const { data: conn } = await supabaseAdmin
      .from('apideck_connections')
      .select('connection_id')
      .eq('user_id', user.id)
      .eq('provider', 'google')
      .single()

    if (!conn) return ApiResponse.badRequest('Google account not connected')

    try {
      buffer = await Apideck.downloadFile(user.id, conn.connection_id, body.fileId)
    } catch (e) {
      console.error('[google-import:apideck-download-failed]', e)
      return ApiResponse.internalError('Failed to download file via Apideck')
    }

    // Apideck download doesn't return metadata — use values passed from the UI
    fileName = body.fileName ?? body.fileId
    mimeType = body.mimeType ?? 'application/octet-stream'
    fileSize = buffer.byteLength
  }

  // Compute checksum for deduplication
  const contentHash = computeBufferHash(buffer)

  // Use ensureFileRow for idempotent file creation
  const { file: createdFile, isNew } = await filesRepo.ensureFileRow({
    ownerId: user.id,
    name: fileName,
    path: `google:${providerFileId}`,
    sizeBytes: fileSize,
    mimeType,
    checksum: contentHash,
    source: 'google',
    createdAt: new Date().toISOString(),
  })

  if (!isNew) {
    console.log('[google-import:deduped]', {
      userId: user.id,
      fileId: createdFile.id,
      fileName,
      contentHash
    })
  }

  await fileIngestRepo.upsert({
    file_id: createdFile.id,
    owner_id: user.id,
    status: 'pending',
    source: 'google',
    meta: {
      providerFileId,
      publicUrl: `https://drive.google.com/file/d/${providerFileId}/view`,
      mimeType,
      sizeBytes: fileSize,
      fileName,
    },
  })

  let processingStatus: 'pending' | 'processing' | 'ready' | 'error' = 'pending'

  try {
    processingStatus = 'processing'
    await fileIngestRepo.updateStatus(user.id, createdFile.id, 'processing', null)

    const extraction = await extractTextFromBuffer(buffer, mimeType, fileName)
    const { processDocument } = await import('@/app/lib/vector/document-processor')
    await processDocument(user.id, createdFile.id, fileName, extraction.text, {
      source: 'google',
      mimeType,
      externalId: body.fileId,
      importedAt: new Date().toISOString(),
    })

    processingStatus = 'ready'
    await fileIngestRepo.updateStatus(user.id, createdFile.id, 'ready', null)
  } catch (error) {
    processingStatus = 'error'
    await fileIngestRepo.updateStatus(
      user.id,
      createdFile.id,
      'error',
      error instanceof Error ? error.message : 'Unknown error'
    )
  }

  return ApiResponse.success({ file_id: createdFile.id, name: fileName, status: processingStatus })
}

export const POST = createProtectedApiHandler(importGoogleFileHandler, {
  rateLimit: rateLimitConfigs.embedding,
  logging: { enabled: true, includeBody: true },
})
