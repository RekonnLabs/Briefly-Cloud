import { NextRequest, NextResponse } from 'next/server'
import { createProtectedApiHandler } from '@/app/lib/api-middleware'
import { getCloudAuthContext, createApideckHeaders } from '@/app/lib/cloud/auth-context'
import { shouldReindexCloudFile, normalizeApideckFile } from '@/app/lib/cloud/change-detection'
import { syncConnectionsRepo } from '@/app/lib/repos/sync-connections-repo'
import { filesRepo } from '@/app/lib/repos/files-repo'
import { processDocument } from '@/app/lib/vector/document-processor'
import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'
import { computeBufferHash } from '@/app/lib/utils/content-hash'

/**
 * POST /api/sync/:provider/index
 * 
 * Download and index changed files from cloud storage
 * 
 * Request body:
 * - fileIds?: string[] - Optional list of specific file IDs to sync (if omitted, syncs all changed files)
 * - deletedIds?: string[] - Optional list of file IDs that were deleted from cloud
 * 
 * Returns:
 * - indexed: Files that were downloaded and indexed
 * - skipped: Files that were skipped (no changes)
 * - failed: Files that failed to process
 * - deleted: Files that were marked as deleted
 * - nextCursor: Delta cursor for next sync
 */
export const POST = createProtectedApiHandler(async (req: NextRequest, user) => {
  const provider = req.nextUrl.pathname.split('/')[3] as 'gdrive' | 'onedrive' | 'dropbox'

  if (!['gdrive', 'onedrive', 'dropbox'].includes(provider)) {
    throw createError.badRequest(`Invalid provider: ${provider}`)
  }

  const correlationId = `sync_index_${Date.now()}_${Math.random().toString(36).substring(7)}`

  // Parse request body
  const body = await req.json().catch(() => ({}))
  const specificFileIds: string[] | undefined = body.fileIds
  const deletedFileIds: string[] | undefined = body.deletedIds

  logger.info('[SYNC_INDEX] Starting', {
    correlationId,
    userId: user.id,
    provider,
    specificFileIds: specificFileIds?.length || 'all',
    deletedFileIds: deletedFileIds?.length || 0
  })

  try {
    // Get auth context
    const authContext = await getCloudAuthContext(user.id, provider)

    // Get sync connection for delta cursor
    const syncConnection = await syncConnectionsRepo.get(user.id, provider)
    const cursor = syncConnection?.cursor || null

    logger.info('[SYNC_INDEX] Fetching files from provider', {
      correlationId,
      provider,
      hasCursor: !!cursor
    })

    // Call Apideck Files API to list files
    const apideckUrl = cursor
      ? `https://unify.apideck.com/file-storage/files?cursor=${encodeURIComponent(cursor)}`
      : 'https://unify.apideck.com/file-storage/files'

    const response = await fetch(apideckUrl, {
      method: 'GET',
      headers: createApideckHeaders(authContext)
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('[SYNC_INDEX] Apideck API error', {
        correlationId,
        status: response.status,
        error: errorText
      })
      throw createError.serverError(`Cloud provider API error: ${response.status}`)
    }

    const apideckData = await response.json()
    let cloudFiles = apideckData.data || []
    const nextCursor = apideckData.meta?.cursors?.next || null

    // Filter to specific files if requested
    if (specificFileIds && specificFileIds.length > 0) {
      cloudFiles = cloudFiles.filter((f: any) => specificFileIds.includes(f.id))
    }

    logger.info('[SYNC_INDEX] Received files from provider', {
      correlationId,
      count: cloudFiles.length,
      hasNextCursor: !!nextCursor
    })

    // Get existing files for comparison
    const existingFiles = await filesRepo.listByUserAndSource(user.id, provider)
    const existingFileMap = new Map(
      existingFiles.map(f => [f.external_id, f])
    )

    // Process each file
    const indexed: any[] = []
    const skipped: any[] = []
    const failed: any[] = []
    const deleted: any[] = []

    for (const cloudFile of cloudFiles) {
      const normalizedFile = normalizeApideckFile(cloudFile)
      const existing = existingFileMap.get(normalizedFile.id)

      // Evaluate if file should be reindexed
      const evaluation = shouldReindexCloudFile(normalizedFile, existing || null)

      if (!evaluation.shouldReindex) {
        skipped.push({
          id: normalizedFile.id,
          name: normalizedFile.name,
          reason: 'No changes detected'
        })
        continue
      }

      logger.info('[SYNC_INDEX] Processing file', {
        correlationId,
        fileId: normalizedFile.id,
        fileName: normalizedFile.name,
        isNew: !existing,
        reasons: evaluation.reasons
      })

      try {
        // Download file content from Apideck
        const downloadUrl = `https://unify.apideck.com/file-storage/files/${normalizedFile.id}/download`
        const downloadResponse = await fetch(downloadUrl, {
          method: 'GET',
          headers: createApideckHeaders(authContext)
        })

        if (!downloadResponse.ok) {
          throw new Error(`Download failed: ${downloadResponse.status}`)
        }

         // Get file content as buffer
        const fileBuffer = Buffer.from(await downloadResponse.arrayBuffer())

        // Compute checksum for deduplication (Quest 3B)
        const contentHash = computeBufferHash(fileBuffer)

        // Use ensureFileRow for idempotent file creation (Quest 3B)
        const { file: fileRecord, isNew } = await filesRepo.ensureFileRow({
          ownerId: user.id,
          name: normalizedFile.name,
          path: normalizedFile.path || normalizedFile.name,
          sizeBytes: normalizedFile.size || fileBuffer.length,
          mimeType: normalizedFile.mimeType || 'application/octet-stream',
          checksum: contentHash,
          source: provider,
          externalId: normalizedFile.id,
          metadata: {
            external_id: normalizedFile.id,
            source_path: normalizedFile.path,
            source_revision: normalizedFile.revision,
            source_modified_at: normalizedFile.modifiedAt,
            source_size: normalizedFile.size
          }
        })

        if (!isNew) {
          logger.info('[sync-index:deduped]', {
            correlationId,
            userId: user.id,
            fileId: fileRecord.id,
            fileName: normalizedFile.name,
            contentHash
          })
        }

        // Process document (extract, chunk, embed, store)
        await processDocument(
          user.id,
          fileRecord.id,
          normalizedFile.name,
          fileBuffer,
          normalizedFile.mimeType || 'application/octet-stream'
        )

        indexed.push({
          id: normalizedFile.id,
          name: normalizedFile.name,
          fileRecordId: fileRecord.id,
          reasons: evaluation.reasons
        })

        logger.info('[SYNC_INDEX] File indexed successfully', {
          correlationId,
          fileId: normalizedFile.id,
          fileName: normalizedFile.name
        })
      } catch (error: any) {
        logger.error('[SYNC_INDEX] File processing failed', {
          correlationId,
          fileId: normalizedFile.id,
          fileName: normalizedFile.name,
          error: error.message
        })

        failed.push({
          id: normalizedFile.id,
          name: normalizedFile.name,
          error: error.message
        })
      }
    }

    // Handle deletions - mark files as deleted if they're no longer in cloud
    if (deletedFileIds && deletedFileIds.length > 0) {
      for (const deletedId of deletedFileIds) {
        try {
          const existing = existingFileMap.get(deletedId)
          if (existing) {
            await filesRepo.update(user.id, existing.id, {
              processing_status: 'deleted'
            })
            deleted.push({
              id: deletedId,
              fileRecordId: existing.id,
              name: existing.name
            })
            logger.info('[SYNC_INDEX] File marked as deleted', {
              correlationId,
              fileId: deletedId,
              fileRecordId: existing.id
            })
          }
        } catch (error: any) {
          logger.error('[SYNC_INDEX] Failed to mark file as deleted', {
            correlationId,
            fileId: deletedId,
            error: error.message
          })
        }
      }
    }

    // Update sync connection with new cursor and timestamp
    await syncConnectionsRepo.upsert({
      ownerId: user.id,
      provider,
      cursor: nextCursor,
      metadata: {
        last_sync_at: new Date().toISOString(),
        last_sync_summary: {
          indexed: indexed.length,
          skipped: skipped.length,
          failed: failed.length,
          deleted: deleted.length
        }
      }
    })

    logger.info('[SYNC_INDEX] Sync complete', {
      correlationId,
      indexed: indexed.length,
      skipped: skipped.length,
      failed: failed.length,
      deleted: deleted.length
    })

    return NextResponse.json({
      success: true,
      correlationId,
      summary: {
        indexed: indexed.length,
        skipped: skipped.length,
        failed: failed.length,
        deleted: deleted.length,
        total: cloudFiles.length
      },
      results: {
        indexed,
        skipped: skipped.slice(0, 10), // Limit skipped list
        failed,
        deleted
      },
      nextCursor,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    logger.error('[SYNC_INDEX] Failed', {
      correlationId,
      error: error.message,
      stack: error.stack
    })

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Sync indexing failed',
        correlationId,
        timestamp: new Date().toISOString()
      },
      { status: error.statusCode || 500 }
    )
  }
})
