/**
 * POST /api/upload/process
 *
 * Spec 10 — Presigned Upload Flow (Step 2 of 2)
 * Fluid Compute — post-response extraction via Next.js after()
 *
 * Called by the browser AFTER it has PUT the file directly to Supabase Storage
 * via the presigned URL from /api/upload/presign.
 *
 * Flow:
 *   1. Validate request + security check (storagePath ownership)
 *   2. Download file from Supabase Storage into Buffer
 *   3. Compute content hash — deduplicate early
 *   4. Upsert app.files row with processing_status = 'processing'
 *   5. Return 202 Accepted immediately (client sees success in ~3s)
 *   6. after() runs the full extraction + vector pipeline post-response
 *      — no timeout applies to after() under Fluid Compute
 *   7. On completion: set processing_status = 'completed'
 *      On failure:    set processing_status = 'failed'
 *
 * Client polls GET /api/upload/files?fileId=... until processing_status
 * flips to 'completed' or 'failed'.
 */

export const runtime = 'nodejs'
// maxDuration covers the synchronous portion only (download + hash + DB row).
// The after() callback runs outside the request lifecycle — no timeout applies.
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { after } from 'next/server'
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
  if (!storagePath.startsWith(`${user.id}/`)) {
    return ApiResponse.badRequest('Invalid storage path')
  }

  try {
    // ── 1. Download from Supabase Storage into Buffer ─────────────────────────
    const { data: blobData, error: downloadError } = await supabaseAdmin.storage
      .from('documents')
      .download(storagePath)

    if (downloadError || !blobData) {
      logErr(rid, 'process:download', downloadError, { userId: user.id, storagePath })
      return ApiResponse.serverError('Failed to download file from storage', 'STORAGE_DOWNLOAD_ERROR', rid)
    }

    const fileBuffer = Buffer.from(await blobData.arrayBuffer())
    logger.info('[process:downloaded]', { userId: user.id, storagePath, bytes: fileBuffer.length, rid })

    // ── 2. Compute content hash for deduplication ─────────────────────────────
    const contentHash = computeBufferHash(fileBuffer)

    // ── 3. Check for duplicate (same owner + content hash) ────────────────────
    const existingFile = await filesRepo.findByContentHash(user.id, contentHash)
    if (existingFile) {
      // Duplicate: clean up the just-uploaded storage object and return early
      supabaseAdmin.storage.from('documents').remove([storagePath]).catch(err =>
        logger.warn('[process:cleanup-dup-failed]', { storagePath, err: err?.message })
      )
      logger.info('[process:duplicate]', {
        userId: user.id,
        existingFileId: existingFile.id,
        fileName,
        contentHash,
        rid,
      })
      return ApiResponse.success({
        file: existingFile,
        duplicate: true,
        status: 'completed',
        message: 'File with identical content already exists',
      })
    }

    // ── 4. Upsert app.files row with processing_status = 'processing' ─────────
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

    // Set processing_status to 'processing' so the UI can show the indexing state
    await supabaseAdmin
      .from('files')
      .update({ processing_status: 'processing' })
      .eq('id', createdFile.id)

    // Create ingest record (pending → will be updated to processing in after())
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

    logger.info('[process:queued]', {
      userId: user.id,
      fileId: createdFile.id,
      fileName,
      bytes: fileBuffer.length,
      rid,
    })

    // ── 5. Return 202 immediately — extraction runs post-response ─────────────
    // after() is a Next.js 15 built-in that defers work until after the response
    // is sent. Under Vercel Fluid Compute (fluid: true in vercel.json), the
    // function continues executing without any timeout constraint.
    after(async () => {
      const fileId = createdFile.id
      try {
        await fileIngestRepo.updateStatus(user.id, fileId, 'processing', null)

        // Route document through text-only path (Spec 11 + Vision Queue)
        // PDFs: extract text pages immediately, return vision page indices for queue
        // Non-PDFs: extract everything (no vision needed)
        const { routeDocumentTextOnly } = await import('@/app/lib/document-router')
        const { contents, profile, visionPageIndices } = await routeDocumentTextOnly(
          fileBuffer, mimeType, fileName
        )

        // Embed text chunks immediately — user can query text content in ~30s
        const { processDocumentFromContents } = await import('@/app/lib/vector/document-processor')
        await processDocumentFromContents(user.id, fileId, fileName, contents, {
          fileType: mimeType,
          fileSize: fileBuffer.length,
          uploadedAt: new Date().toISOString(),
          source: 'upload',
          visionPageCount: profile.visionPageCount,
          totalPages: profile.totalPages,
        })

        // Queue vision pages for progressive enrichment by cron worker
        if (visionPageIndices.length > 0) {
          await supabaseAdmin.schema('app').from('vision_queue').insert({
            file_id: fileId,
            owner_id: user.id,
            storage_path: storagePath,
            file_name: fileName,
            vision_page_indices: visionPageIndices,
            next_batch_start: 0,
            status: 'pending',
          })
          logger.info('[process:vision-queued]', {
            userId: user.id,
            fileId,
            visionPages: visionPageIndices.length,
          })
        }

        // Mark text extraction completed
        await fileIngestRepo.updateStatus(user.id, fileId, 'ready', null)
        await supabaseAdmin
          .from('files')
          .update({ processing_status: 'completed', processed: true })
          .eq('id', fileId)

        // Increment usage counters (fire-and-forget)
        supabaseAdmin.rpc('increment_document_usage', {
          p_user_id: user.id,
          p_bytes: fileBuffer.length,
        }).then(({ error: usageErr }) => {
          if (usageErr) {
            logger.error('[process:usage-sync-failed]', { userId: user.id, error: usageErr.message })
          }
        })

        logger.info('[process:completed]', {
          userId: user.id,
          fileId,
          fileName,
          bytes: fileBuffer.length,
          textChunks: contents.length,
          visionPagesQueued: visionPageIndices.length,
          rid,
        })
      } catch (extractionError) {
        logger.error('[process:extraction-failed]', {
          userId: user.id,
          fileId,
          fileName,
          error: extractionError instanceof Error ? extractionError.message : String(extractionError),
          rid,
        })

        // Mark failed so the UI can show the error state
        await fileIngestRepo.updateStatus(
          user.id,
          fileId,
          'error',
          extractionError instanceof Error ? extractionError.message : 'Unknown error'
        ).catch(() => { /* best-effort */ })

        await filesRepo.updateProcessingStatus(user.id, fileId, 'failed').catch(() => { /* best-effort */ })
      }
    })

    // Return 202 — client should poll until processing_status = 'completed'
    return NextResponse.json(
      {
        success: true,
        data: {
          file: {
            id: createdFile.id,
            name: createdFile.name,
            size: fileBuffer.length,
            type: mimeType,
            uploaded_at: createdFile.created_at,
            processing_status: 'processing',
            source: 'upload',
          },
          uploaded: true,
          deduped: !isNew,
          processed: false,
          message: 'File uploaded — indexing in progress',
        },
      },
      { status: 202 }
    )

  } catch (error) {
    logErr(rid, 'process-handler', error, { userId: user?.id, storagePath })
    return ApiResponse.serverError('Failed to process uploaded file', 'PROCESS_ERROR', rid)
  }
}

export const POST = withPerformanceMonitoring(
  createProtectedApiHandler(processHandler, {
    rateLimit: rateLimitConfigs.upload,
    logging: { enabled: true, includeBody: false },
  })
)
