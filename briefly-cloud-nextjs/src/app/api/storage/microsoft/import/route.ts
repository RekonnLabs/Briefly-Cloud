import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { ImportJobManager } from '@/app/lib/jobs/import-job-manager'
import type { CloudStorageFile } from '@/app/lib/cloud-storage/types'

/**
 * POST /api/storage/microsoft/import
 *
 * Single-file import via the blue "Import" button (OneDrive / SharePoint).
 *
 * Previously this route downloaded + extracted + embedded the file
 * synchronously inside the HTTP request, which caused Vercel timeouts
 * on large files and bypassed all resilience work (heartbeat, vision
 * fallback, AbortController, progress bar).
 *
 * Now it creates a single-file job via ImportJobManager and returns
 * { jobId, totalFiles: 1 } immediately. The frontend kicks off the
 * same driveChunkLoop used by folder imports — the progress bar and
 * all resilience features (30s timeout, vision fallback, heartbeat,
 * image-PDF detection) work identically for single files.
 */
async function importOneDriveFileHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  if (!user) return ApiResponse.unauthorized('User not authenticated')

  const body = await request.json().catch(() => ({})) as {
    fileId?: string
    fileName?: string
    mimeType?: string
    fileSize?: number
  }

  if (!body.fileId) return ApiResponse.badRequest('fileId is required')

  // Build a minimal CloudStorageFile descriptor from the values the UI passes.
  // processChunkParallel resolves the full file via the provider during download —
  // we only need enough to identify it here.
  const fileDescriptor: CloudStorageFile = {
    id: body.fileId,
    name: body.fileName ?? body.fileId,
    mimeType: body.mimeType ?? '',
    size: body.fileSize,
  }

  const job = await ImportJobManager.prepareJobForChunkedProcessing(
    user.id,
    'microsoft',
    undefined, // no folderId — single file
    {
      files: [fileDescriptor],
      source: 'single-file-import',
    }
  )

  return ApiResponse.success({ jobId: job.id, totalFiles: 1 })
}

export const POST = createProtectedApiHandler(importOneDriveFileHandler, {
  rateLimit: rateLimitConfigs.embedding,
  logging: { enabled: true, includeBody: true },
})
