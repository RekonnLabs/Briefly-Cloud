/**
 * POST /api/upload/process
 *
 * Spec 10 — Presigned Upload Flow (Step 2 of 2)
 *
 * Called by the browser AFTER it has PUT the file directly to Supabase Storage
 * via the presigned URL from /api/upload/presign.
 *
 * This route:
 *   1. Downloads the file from Supabase Storage into a Buffer
 *   2. Runs the same extraction + vector pipeline as /api/upload
 *   3. Creates/updates app.files and file_ingest records
 *   4. Returns the same response shape as /api/upload
 *
 * Request body (JSON):
 *   { storagePath: string, fileName: string, mimeType: string, fileSize: number }
 *
 * The extractTextFromBuffer interface is intentionally unchanged (Spec 10 constraint).
 * All extractors (mammoth, xlsx, unpdf) require a complete Buffer — no streaming.
 */

export const runtime = 'nodejs'
export const maxDuration = 120

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { filesRepo, fileIngestRepo } from '@/app/lib/repos'
import { computeBufferHash } from '@/app/lib/utils/content-hash'
import { logReq, logErr } from '@/app/lib/server/log'
import { withPerformanceMonitoring } from '@/app/lib/stubs/performance'
import { logger } from '@/app/lib/logger'

const processSchema = z.object({
  storagePath: z.string().min(1),
  fileName: z.string().min(1).max(512),
  mimeType: z.string().min(1),
  fileSize: z.number().int().nonnegative(),
})

async function processHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  const rid = logReq({ route: '/api/upload/process', method: 'POST', userId: user?.id })

  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return ApiResponse.badRequest('Invalid JSON payload')
  }

  const parsed = processSchema.safeParse(body)
  if (!parsed.success) {
    return ApiResponse.badRequest('Invalid request: storagePath, fileName, mimeType, and fileSize are required')
  }

  const { storagePath, fileName, mimeType, fileSize } = parsed.data

  // ── Security: ensure storagePath belongs to this user ─────────────────────
  // Storage paths are always `{userId}/{timestamp}_{random}.{ext}`
  if (!storagePath.startsWith(`${user.id}/`)) {
    return ApiResponse.badRequest('Invalid storage path')
  }

  let ingestStatus: 'pending' | 'processing' | 'ready' | 'error' = 'pending'
  let createdFileId: string | null = null

  try {
    // ── 1. Download from Supabase Storage into Buffer ─────────────────────────
    // Uses service role — bypasses RLS, works for any path the presign route created.
    const { data: blobData, error: downloadError } = await supabaseAdmin.storage
      .from('documents')
      .download(storagePath)

    if (downloadError || !blobData) {
      logErr(rid, 'process:download', downloadError, { userId: user.id, storagePath })
      return ApiResponse.serverError('Failed to download file from storage', 'STORAGE_DOWNLOAD_ERROR', rid)
    }

    const fileBuffer = Buffer.from(await blobData.arrayBuffer())
    console.log('[process:downloaded]', { userId: user.id, storagePath, bytes: fileBuffer.length, rid })

    // ── 2. Compute content hash for deduplication ─────────────────────────────
    const contentHash = computeBufferHash(fileBuffer)

    // ── 3. Check for duplicate (same owner + content hash) ────────────────────
    const existingFile = await filesRepo.findByContentHash(user.id, contentHash)
    if (existingFile) {
      // Duplicate: clean up the just-uploaded storage object and return early
      supabaseAdmin.storage.from('documents').remove([storagePath]).catch(err =>
        console.warn('[process:cleanup-dup-failed]', { storagePath, err: err?.message })
      )
      logger.info('Duplicate file detected in presign flow', {
        userId: user.id,
        existingFileId: existingFile.id,
        fileName,
        contentHash,
        rid,
      })
      return ApiResponse.success({
        file: existingFile,
        duplicate: true,
        message: 'File with identical content already exists',
      })
    }

    // ── 4. Upsert app.files record ────────────────────────────────────────────
    const { file: createdFile, isNew } = await filesRepo.ensureFileRow({
      ownerId: user.id,
      name: fileName,
      path: storagePath,
      sizeBytes: fileBuffer.length,
      mimeType,
      checksum: contentHash,
      source: 'upload',
      createdAt: new Date().toISOString(),
    })
    createdFileId = createdFile.id

    // ── 5. Create ingest record (pending) ─────────────────────────────────────
    await fileIngestRepo.upsert({
      file_id: createdFile.id,
      owner_id: user.id,
      status: 'pending',
      source: 'upload',
      meta: {
        storageBucket: 'documents',
        storagePath,
        uploadedAt: new Date().toISOString(),
        originalName: fileName,
        presignedFlow: true,
      },
    })

    // ── 6. Extract text + vector pipeline (identical to /api/upload) ──────────
    try {
      ingestStatus = 'processing'
      await fileIngestRepo.updateStatus(user.id, createdFile.id, 'processing', null)

      // Route document through Document Intelligence Router (Spec 11)
      const { routeDocument } = await import('@/app/lib/document-router')
      const { contents, profile } = await routeDocument(fileBuffer, mimeType, fileName)

      const { processDocumentFromContents } = await import('@/app/lib/vector/document-processor')
      await processDocumentFromContents(user.id, createdFile.id, fileName, contents, {
        fileType: mimeType,
        fileSize: fileBuffer.length,
        uploadedAt: new Date().toISOString(),
        source: 'upload',
        visionPageCount: profile.visionPageCount,
        totalPages: profile.totalPages,
      })

      ingestStatus = 'ready'
      await fileIngestRepo.updateStatus(user.id, createdFile.id, 'ready', null)

      // Update app.files processing_status to completed
      await supabaseAdmin
        .from('files')
        .update({ processing_status: 'completed', processed: true })
        .eq('id', createdFile.id)

      logger.info('File processed successfully via presign flow', {
        userId: user.id,
        fileId: createdFile.id,
        fileName,
        bytes: fileBuffer.length,
        contentHash,
        rid,
      })
    } catch (processingError) {
      console.error('[process:extraction-failed]', {
        userId: user.id,
        fileId: createdFile.id,
        fileName,
        error: processingError instanceof Error ? processingError.message : String(processingError),
        rid,
      })

      ingestStatus = 'error'
      await fileIngestRepo.updateStatus(
        user.id,
        createdFile.id,
        'error',
        processingError instanceof Error ? processingError.message : 'Unknown error'
      )

      // Sync files.processing_status to 'failed' so the Files tab reflects the error
      try {
        await filesRepo.updateProcessingStatus(user.id, createdFile.id, 'failed')
      } catch (statusSyncError) {
        console.error('[process:status-sync-failed]', {
          error: statusSyncError instanceof Error ? statusSyncError.message : String(statusSyncError),
          fileId: createdFile.id,
          rid,
        })
      }
    }

    // ── 7. Increment usage counters (fire-and-forget) ─────────────────────────
    supabaseAdmin.rpc('increment_document_usage', {
      p_user_id: user.id,
      p_bytes: fileBuffer.length,
    }).then(({ error: usageErr }) => {
      if (usageErr) {
        console.error('[process:usage-sync-failed]', { userId: user.id, error: usageErr.message })
      }
    })

    // Notify quota card to refresh
    // (client-side: window.dispatchEvent(new CustomEvent('briefly:quota-changed')) is in FileUpload.tsx)

    return ApiResponse.created({
      file: {
        id: createdFile.id,
        name: createdFile.name,
        size: fileBuffer.length,
        type: mimeType,
        uploaded_at: createdFile.created_at,
        processing_status: ingestStatus,
        source: 'upload',
      },
      uploaded: true,
      deduped: !isNew,
      processed: ingestStatus === 'ready',
    }, isNew ? 'File uploaded and processed successfully' : 'File already exists (deduplicated)')

  } catch (error) {
    logErr(rid, 'process-handler', error, { userId: user?.id, storagePath })

    // Best-effort: mark ingest record as error if we have a file ID
    if (createdFileId) {
      fileIngestRepo.updateStatus(user.id, createdFileId, 'error',
        error instanceof Error ? error.message : 'Unknown error'
      ).catch(() => { /* best-effort */ })
    }

    return ApiResponse.serverError('Failed to process uploaded file', 'PROCESS_ERROR', rid)
  }
}

export const POST = withPerformanceMonitoring(
  createProtectedApiHandler(processHandler, {
    rateLimit: rateLimitConfigs.upload,
    logging: { enabled: true, includeBody: false },
  })
)
