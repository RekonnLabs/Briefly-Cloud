import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { TokenStore } from '@/app/lib/oauth/token-store'
import { Apideck } from '@/app/lib/integrations/apideck'
import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { filesRepo, fileIngestRepo } from '@/app/lib/repos'
import { extractTextFromBuffer } from '@/app/lib/document-extractor'
import { computeBufferHash } from '@/app/lib/utils/content-hash'

async function importOneDriveFileHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  if (!user) return ApiResponse.unauthorized('User not authenticated')

  const body = await request.json().catch(() => ({})) as {
    fileId?: string
    fileName?: string
    mimeType?: string
  }
  if (!body.fileId) return ApiResponse.badRequest('fileId is required')

  const token = await TokenStore.getToken(user.id, 'microsoft')

  let buffer: Buffer
  let fileName: string
  let mimeType: string
  let fileSize: number
  let providerFileId: string = body.fileId
  let webUrl: string | undefined
  let driveId: string | undefined

  if (token) {
    // Legacy direct Graph API path
    const headers = { Authorization: `Bearer ${token.accessToken}` }
    const metaResp = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${body.fileId}`, { headers })
    if (!metaResp.ok) return ApiResponse.internalError('Failed to fetch file metadata')
    const meta = await metaResp.json()

    const dlResp = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${body.fileId}/content`, { headers })
    if (!dlResp.ok) return ApiResponse.internalError('Failed to download file')

    buffer = Buffer.from(await dlResp.arrayBuffer())
    fileName = meta.name ?? body.fileId
    mimeType = meta.file?.mimeType ?? 'application/octet-stream'
    fileSize = Number(meta.size ?? buffer.byteLength)
    providerFileId = meta.id ?? body.fileId
    webUrl = meta.webUrl
    driveId = meta.parentReference?.driveId
  } else {
    // Apideck unified path — token not present, use Apideck to download
    const { data: conn } = await supabaseAdmin
      .from('apideck_connections')
      .select('connection_id')
      .eq('user_id', user.id)
      .eq('provider', 'microsoft')
      .single()

    if (!conn) return ApiResponse.badRequest('Microsoft account not connected')

    // connection_id is stored as 'file-storage+onedrive' — extract service id
    const serviceId = conn.connection_id.replace('file-storage+', '')

    try {
      buffer = await Apideck.downloadFile(user.id, serviceId, body.fileId)
    } catch (e) {
      console.error('[microsoft-import:apideck-download-failed]', e)
      return ApiResponse.internalError('Failed to download file via Apideck')
    }

    // Apideck download doesn't return metadata — use values passed from the UI
    fileName = body.fileName ?? body.fileId
    mimeType = body.mimeType ?? 'application/octet-stream'
    fileSize = buffer.byteLength
    providerFileId = body.fileId
  }

  // Compute checksum for deduplication
  const contentHash = computeBufferHash(buffer)

  // Use ensureFileRow for idempotent file creation
  const { file: createdFile, isNew } = await filesRepo.ensureFileRow({
    ownerId: user.id,
    name: fileName,
    path: `onedrive:${providerFileId}`,
    sizeBytes: fileSize,
    mimeType,
    checksum: contentHash,
    source: 'microsoft',
    createdAt: new Date().toISOString(),
  })

  if (!isNew) {
    console.log('[microsoft-import:deduped]', {
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
    source: 'microsoft',
    meta: {
      providerFileId,
      driveId,
      webUrl,
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
      source: 'microsoft',
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

export const POST = createProtectedApiHandler(importOneDriveFileHandler, {
  rateLimit: rateLimitConfigs.embedding,
  logging: { enabled: true, includeBody: true },
})
