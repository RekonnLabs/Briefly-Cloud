import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { google } from 'googleapis'
import { TokenStore } from '@/app/lib/oauth/token-store'
import { filesRepo, fileIngestRepo } from '@/app/lib/repos'
import { extractTextFromBuffer } from '@/app/lib/document-extractor'

async function importGoogleFileHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  if (!user) return ApiResponse.unauthorized('User not authenticated')

  const body = await request.json().catch(() => ({})) as { fileId?: string }
  if (!body.fileId) return ApiResponse.badRequest('fileId is required')

  const token = await TokenStore.getToken(user.id, 'google')
  if (!token) return ApiResponse.badRequest('Google account not connected')

  const oauth2Client = new google.auth.OAuth2()
  oauth2Client.setCredentials({ access_token: token.accessToken, refresh_token: token.refreshToken ?? undefined })
  const drive = google.drive({ version: 'v3', auth: oauth2Client })

  const meta = await drive.files.get({ fileId: body.fileId, fields: 'id, name, mimeType, size' })
  const res = await drive.files.get({ fileId: body.fileId, alt: 'media' }, { responseType: 'arraybuffer' })
  const buffer = Buffer.from(res.data as ArrayBuffer)

  const createdFile = await filesRepo.create({
    ownerId: user.id,
    name: meta.data.name ?? body.fileId,
    path: `google:${meta.data.id}`,
    sizeBytes: Number(meta.data.size ?? buffer.byteLength),
    mimeType: meta.data.mimeType ?? null,
    createdAt: new Date().toISOString(),
  })

  await fileIngestRepo.upsert({
    file_id: createdFile.id,
    owner_id: user.id,
    status: 'pending',
    source: 'google',
    meta: {
      providerFileId: meta.data.id,
      publicUrl: `https://drive.google.com/file/d/${meta.data.id}/view`,
      mimeType: meta.data.mimeType,
      sizeBytes: Number(meta.data.size ?? buffer.byteLength),
      fileName: meta.data.name,
    },
  })

  let processingStatus: 'pending' | 'processing' | 'ready' | 'error' = 'pending'

  try {
    processingStatus = 'processing'
    await fileIngestRepo.updateStatus(user.id, createdFile.id, 'processing', null)

    const extraction = await extractTextFromBuffer(buffer, meta.data.mimeType ?? 'application/octet-stream', meta.data.name ?? body.fileId)
    const { processDocument } = await import('@/app/lib/vector/document-processor')
    await processDocument(user.id, createdFile.id, meta.data.name ?? body.fileId, extraction.text, {
      source: 'google',
      mimeType: meta.data.mimeType,
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

  return ApiResponse.success({ file_id: createdFile.id, name: meta.data.name ?? body.fileId, status: processingStatus })
}

export const POST = createProtectedApiHandler(importGoogleFileHandler, {
  rateLimit: rateLimitConfigs.embedding,
  logging: { enabled: true, includeBody: true },
})
