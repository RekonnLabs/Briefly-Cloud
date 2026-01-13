import { NextRequest, NextResponse } from 'next/server'
import { createProtectedApiHandler } from '@/app/lib/api-middleware'
import { getCloudAuthContext, createApideckHeaders } from '@/app/lib/cloud/auth-context'
import { syncConnectionsRepo } from '@/app/lib/repos/sync-connections-repo'
import { filesRepo } from '@/app/lib/repos/files-repo'
import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'

/**
 * POST /api/sync/:provider/check
 * 
 * Check for changed files in cloud storage without downloading or indexing
 * 
 * Returns:
 * - new: Files that don't exist in our DB
 * - updated: Files that exist but have changed (revision/size/modifiedAt)
 * - unchanged: Files that exist and haven't changed
 * - deleted: Files in our DB but no longer in provider
 * - nextCursor: Delta cursor for next sync
 */
export const POST = createProtectedApiHandler(async (req: NextRequest, user) => {
  const provider = req.nextUrl.pathname.split('/')[3] as 'gdrive' | 'onedrive' | 'dropbox'

  if (!['gdrive', 'onedrive', 'dropbox'].includes(provider)) {
    throw createError.badRequest(`Invalid provider: ${provider}`)
  }

  const correlationId = `sync_check_${Date.now()}_${Math.random().toString(36).substring(7)}`

  logger.info('[SYNC_CHECK] Starting', {
    correlationId,
    userId: user.id,
    provider
  })

  try {
    // Get auth context
    const authContext = await getCloudAuthContext(user.id, provider)

    // Get sync connection for delta cursor
    const syncConnection = await syncConnectionsRepo.get(user.id, provider)
    const cursor = syncConnection?.cursor || null

    logger.info('[SYNC_CHECK] Fetching files from provider', {
      correlationId,
      provider,
      hasCursor: !!cursor
    })

    // Call Apideck Files API to list files
    // https://developers.apideck.com/apis/file-storage/reference#operation/filesAll
    const apideckUrl = cursor
      ? `https://unify.apideck.com/file-storage/files?cursor=${encodeURIComponent(cursor)}`
      : 'https://unify.apideck.com/file-storage/files'

    const response = await fetch(apideckUrl, {
      method: 'GET',
      headers: createApideckHeaders(authContext)
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('[SYNC_CHECK] Apideck API error', {
        correlationId,
        status: response.status,
        error: errorText
      })
      throw createError.serverError(`Cloud provider API error: ${response.status}`)
    }

    const apideckData = await response.json()
    const cloudFiles = apideckData.data || []
    const nextCursor = apideckData.meta?.cursors?.next || null

    logger.info('[SYNC_CHECK] Received files from provider', {
      correlationId,
      count: cloudFiles.length,
      hasNextCursor: !!nextCursor
    })

    // Get all existing files for this user and provider
    const existingFiles = await filesRepo.listByUserAndSource(user.id, provider)
    const existingFileMap = new Map(
      existingFiles.map(f => [f.external_id, f])
    )

    // Categorize files
    const newFiles: any[] = []
    const updatedFiles: any[] = []
    const unchangedFiles: any[] = []

    for (const cloudFile of cloudFiles) {
      const fileId = cloudFile.id
      const existing = existingFileMap.get(fileId)

      if (!existing) {
        // New file
        newFiles.push({
          id: cloudFile.id,
          name: cloudFile.name,
          path: cloudFile.path,
          size: cloudFile.size,
          mimeType: cloudFile.mime_type,
          modifiedAt: cloudFile.updated_at || cloudFile.modified_at,
          revision: cloudFile.revision || cloudFile.version
        })
      } else {
        // Check if file changed
        const revisionChanged = cloudFile.revision && cloudFile.revision !== existing.source_revision
        const sizeChanged = cloudFile.size && cloudFile.size !== existing.source_size
        const modifiedAtChanged = cloudFile.updated_at && 
          new Date(cloudFile.updated_at).getTime() !== new Date(existing.source_modified_at || 0).getTime()

        if (revisionChanged || sizeChanged || modifiedAtChanged) {
          updatedFiles.push({
            id: cloudFile.id,
            name: cloudFile.name,
            path: cloudFile.path,
            size: cloudFile.size,
            mimeType: cloudFile.mime_type,
            modifiedAt: cloudFile.updated_at || cloudFile.modified_at,
            revision: cloudFile.revision || cloudFile.version,
            changes: {
              revision: revisionChanged,
              size: sizeChanged,
              modifiedAt: modifiedAtChanged
            }
          })
        } else {
          unchangedFiles.push({
            id: cloudFile.id,
            name: cloudFile.name
          })
        }

        // Mark as seen
        existingFileMap.delete(fileId)
      }
    }

    // Remaining files in map are deleted from provider
    const deletedFiles = Array.from(existingFileMap.values()).map(f => ({
      id: f.external_id,
      name: f.name
    }))

    logger.info('[SYNC_CHECK] Categorization complete', {
      correlationId,
      new: newFiles.length,
      updated: updatedFiles.length,
      unchanged: unchangedFiles.length,
      deleted: deletedFiles.length
    })

    // Update sync connection with new cursor
    if (nextCursor) {
      await syncConnectionsRepo.upsert({
        ownerId: user.id,
        provider,
        cursor: nextCursor,
        metadata: {
          last_check_at: new Date().toISOString()
        }
      })
    }

    return NextResponse.json({
      success: true,
      correlationId,
      summary: {
        new: newFiles.length,
        updated: updatedFiles.length,
        unchanged: unchangedFiles.length,
        deleted: deletedFiles.length,
        total: cloudFiles.length
      },
      files: {
        new: newFiles,
        updated: updatedFiles,
        unchanged: unchangedFiles.slice(0, 10), // Limit unchanged list
        deleted: deletedFiles
      },
      nextCursor,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    logger.error('[SYNC_CHECK] Failed', {
      correlationId,
      error: error.message,
      stack: error.stack
    })

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Sync check failed',
        correlationId,
        timestamp: new Date().toISOString()
      },
      { status: error.statusCode || 500 }
    )
  }
})
