import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { TokenStore } from '@/app/lib/oauth/token-store'
import { filesRepo, fileIngestRepo } from '@/app/lib/repos'
import { extractTextFromBuffer } from '@/app/lib/document-extractor'

async function importOneDriveFileHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  if (!user) return ApiResponse.unauthorized('User not authenticated')

  const body = await request.json().catch(() => ({})) as { fileId?: string }
  if (!body.fileId) return ApiResponse.badRequest('fileId is required')

  const token = await TokenStore.getToken(user.id, 'microsoft')
  if (!token) return ApiResponse.badRequest('Microsoft account not connected')

  const headers = { Authorization: `Bearer ${token.accessToken}` }
  const metaResp = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${body.fileId}`, { headers })
  if (!metaResp.ok) return ApiResponse.internalError('Failed to fetch file metadata')
  const meta = await metaResp.json()

  const dlResp = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${body.fileId}/content`, { headers })
  if (!dlResp.ok) return ApiResponse.internalError('Failed to download file')
  const buffer = Buffer.from(await dlResp.arrayBuffer())

  const createdFile = await filesRepo.create({
    ownerId: user.id,
    name: meta.name ?? body.fileId,
    path: `onedrive:${meta.id}`,
    sizeBytes: Number(meta.size ?? buffer.byteLength),
    mimeType: meta.file?.mimeType ?? 'application/octet-stream',
    createdAt: new Date().toISOString(),
  })

  await fileIngestRepo.upsert({
    file_id: createdFile.id,
    owner_id: user.id,
    status: 'pending',
    source: 'microsoft',
    meta: {
      providerFileId: meta.id,
      driveId: meta.parentReference?.driveId,
      webUrl: meta.webUrl,
      mimeType: meta.file?.mimeType,
      sizeBytes: Number(meta.size ?? buffer.byteLength),
      fileName: meta.name,
    },
  })

  let processingStatus: 'pending' | 'processing' | 'ready' | 'error' = 'pending'

  try {
    processingStatus = 'processing'
    await fileIngestRepo.updateStatus(user.id, createdFile.id, 'processing', null)

    const extraction = await extractTextFromBuffer(buffer, meta.file?.mimeType ?? 'application/octet-stream', meta.name ?? body.fileId)
    const { processDocument } = await import('@/app/lib/vector/document-processor')
    await processDocument(user.id, createdFile.id, meta.name ?? body.fileId, extraction.text, {
      source: 'microsoft',
      mimeType: meta.file?.mimeType ?? 'application/octet-stream',
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

  return ApiResponse.success({ file_id: createdFile.id, name: meta.name ?? body.fileId, status: processingStatus })
}

export const POST = createProtectedApiHandler(importOneDriveFileHandler, {
  rateLimit: rateLimitConfigs.embedding,
  logging: { enabled: true, includeBody: true },
})
