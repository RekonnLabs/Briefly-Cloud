/**
 * Google Drive Batch Import API
 *
 * Two-phase client-driven chunked processing to avoid Vercel timeout zombies:
 *
 * Phase 1 — Job creation (POST without offset/limit):
 *   Lists all files from the provider, stores the list in job.input_data.fileList,
 *   and returns immediately with { jobId, totalFiles }.
 *   The client then drives processing by calling Phase 2 repeatedly.
 *
 * Phase 2 — Chunk processing (POST with { jobId, offset, limit }):
 *   Processes exactly `limit` files starting at `offset`.
 *   Returns { processed, failed, skipped, done }.
 *   Client calls this in a loop until done === true.
 *   Each call completes in ~10-20s — well under any Vercel limit.
 *
 * GET  — Status polling (unchanged)
 * DELETE — Cancel job (unchanged)
 * PUT  — List jobs (unchanged)
 */

import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { ImportJobManager } from '@/app/lib/jobs/import-job-manager'
import { logger } from '@/app/lib/logger'
import { getUserLimits } from '@/app/lib/usage/quota-enforcement'

interface BatchCreateRequest {
  folderId?: string
  maxRetries?: number
}

interface BatchChunkRequest {
  jobId: string
  offset: number
  limit: number
}

type BatchImportRequest = BatchCreateRequest | BatchChunkRequest

function isChunkRequest(body: BatchImportRequest): body is BatchChunkRequest {
  return 'jobId' in body && 'offset' in body && 'limit' in body
}

async function createGoogleBatchImportHandler(
  request: Request,
  context: ApiContext
): Promise<NextResponse> {
  const { user } = context
  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }

  try {
    const body = await request.json().catch(() => ({})) as BatchImportRequest

    // ── Phase 2: chunk processing ──────────────────────────────────────────────
    if (isChunkRequest(body)) {
      const { jobId, offset, limit } = body

      if (offset < 0) return ApiResponse.badRequest('offset must be >= 0')
      if (limit < 1 || limit > 20) return ApiResponse.badRequest('limit must be between 1 and 20')

      // Verify job belongs to this user
      const job = await ImportJobManager.getJob(jobId)
      if (!job) return ApiResponse.notFound('Job not found')
      if (job.userId !== user.id) return ApiResponse.forbidden('Access denied to this job')

      logger.info('Processing import chunk', { userId: user.id, jobId, offset, limit })

      const result = await ImportJobManager.processChunk(jobId, offset, limit)

      return ApiResponse.success({
        jobId,
        offset,
        limit,
        ...result
      }, result.done ? 'Import complete' : 'Chunk processed')
    }

    // ── Phase 1: job creation ──────────────────────────────────────────────────
    const folderId = (body as BatchCreateRequest).folderId || 'root'
    const maxRetries = (body as BatchCreateRequest).maxRetries || 3

    if (maxRetries < 1 || maxRetries > 5) {
      return ApiResponse.badRequest('maxRetries must be between 1 and 5')
    }

    // Quota pre-flight — fail-closed before listing any files
    const limits = await getUserLimits(user.id)
    if (!limits) {
      return ApiResponse.serverError('Unable to verify account limits. Please try again.', 'QUOTA_CHECK_FAILED')
    }
    if (limits.files_limit_reached) {
      return ApiResponse.badRequest(
        `You have reached your file limit (${limits.files_used}/${limits.files_limit}). ` +
        `Delete some files or upgrade your plan before importing more.`
      )
    }
    if (limits.storage_limit_reached) {
      return ApiResponse.badRequest(
        `You have reached your storage limit (${limits.storage_used_mb} MB / ${limits.storage_limit_mb} MB). ` +
        `Free up storage or upgrade your plan before importing more.`
      )
    }

    logger.info('Preparing Google Drive batch import job', {
      userId: user.id,
      folderId,
      maxRetries
    })

    // List all files, store in job.input_data.fileList, return immediately
    const job = await ImportJobManager.prepareJobForChunkedProcessing(
      user.id,
      'google',
      folderId,
      { maxRetries }
    )

    return ApiResponse.success({
      jobId: job.id,
      status: job.status,
      provider: 'google',
      folderId,
      totalFiles: job.progress.total,
      createdAt: job.createdAt,
      progress: job.progress
    }, 'Batch import job created — call with { jobId, offset, limit } to process files')

  } catch (error) {
    logger.error('Error in Google Drive batch import handler', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return ApiResponse.serverError(
      'Failed to process batch import request',
      'BATCH_IMPORT_ERROR'
    )
  }
}

async function getGoogleBatchImportStatusHandler(
  request: Request,
  context: ApiContext
): Promise<NextResponse> {
  const { user } = context
  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }

  try {
    const url = new URL(request.url)
    const jobId = url.searchParams.get('jobId')

    if (!jobId) {
      return ApiResponse.badRequest('jobId parameter is required')
    }

    const statusData = await ImportJobManager.getBatchImportStatus(jobId)

    if (statusData.job.userId !== user.id) {
      return ApiResponse.forbidden('Access denied to this job')
    }

    return ApiResponse.success({
      jobId: statusData.job.id,
      status: statusData.job.status,
      provider: statusData.job.provider,
      folderId: statusData.job.folderId,
      progress: statusData.job.progress,
      summary: statusData.summary,
      recentFiles: statusData.recentFiles,
      createdAt: statusData.job.createdAt,
      startedAt: statusData.job.startedAt,
      completedAt: statusData.job.completedAt,
      estimatedCompletion: statusData.job.estimatedCompletion,
      outputData: statusData.job.outputData,
      errorMessage: statusData.job.errorMessage,
      // Include heartbeat so the frontend staleness detector can read it
      lastHeartbeat: (statusData.job as any).lastHeartbeat ?? null
    })

  } catch (error) {
    logger.error('Error getting Google Drive batch import status', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return ApiResponse.serverError(
      'Failed to get batch import status',
      'BATCH_STATUS_ERROR'
    )
  }
}

async function listGoogleBatchImportsHandler(
  request: Request,
  context: ApiContext
): Promise<NextResponse> {
  const { user } = context
  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }

  try {
    const url = new URL(request.url)
    const status = url.searchParams.get('status') || undefined
    const limit = parseInt(url.searchParams.get('limit') || '50')

    if (limit < 1 || limit > 100) {
      return ApiResponse.badRequest('Limit must be between 1 and 100')
    }

    const jobs = await ImportJobManager.getUserJobs(user.id, status, limit)
    const googleJobs = jobs.filter(job => job.provider === 'google')

    return ApiResponse.success({
      jobs: googleJobs.map(job => ({
        jobId: job.id,
        status: job.status,
        provider: job.provider,
        folderId: job.folderId,
        progress: job.progress,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        outputData: job.outputData,
        errorMessage: job.errorMessage
      })),
      total: googleJobs.length
    })

  } catch (error) {
    logger.error('Error listing Google Drive batch imports', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return ApiResponse.serverError(
      'Failed to list batch imports',
      'BATCH_LIST_ERROR'
    )
  }
}

async function cancelGoogleBatchImportHandler(
  request: Request,
  context: ApiContext
): Promise<NextResponse> {
  const { user } = context
  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }

  try {
    const body = await request.json().catch(() => ({})) as { jobId?: string }

    if (!body.jobId) {
      return ApiResponse.badRequest('jobId is required')
    }

    const job = await ImportJobManager.getJob(body.jobId)
    if (!job) {
      return ApiResponse.notFound('Job not found')
    }

    if (job.userId !== user.id) {
      return ApiResponse.forbidden('Access denied to this job')
    }

    if (!['pending', 'processing'].includes(job.status)) {
      return ApiResponse.badRequest(`Cannot cancel job with status: ${job.status}`)
    }

    await ImportJobManager.cancelJob(body.jobId)

    logger.info('Google Drive batch import cancelled', {
      userId: user.id,
      jobId: body.jobId
    })

    return ApiResponse.success({
      jobId: body.jobId,
      status: 'cancelled',
      message: 'Job cancelled successfully'
    })

  } catch (error) {
    logger.error('Error cancelling Google Drive batch import', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return ApiResponse.serverError(
      'Failed to cancel batch import',
      'BATCH_CANCEL_ERROR'
    )
  }
}

// Export handlers
export const POST = createProtectedApiHandler(createGoogleBatchImportHandler, {
  rateLimit: rateLimitConfigs.embedding,
  logging: { enabled: true, includeBody: true }
})

export const GET = createProtectedApiHandler(getGoogleBatchImportStatusHandler, {
  rateLimit: rateLimitConfigs.api,
  logging: { enabled: true, includeBody: false }
})

export const DELETE = createProtectedApiHandler(cancelGoogleBatchImportHandler, {
  rateLimit: rateLimitConfigs.api,
  logging: { enabled: true, includeBody: true }
})

export const PUT = createProtectedApiHandler(listGoogleBatchImportsHandler, {
  rateLimit: rateLimitConfigs.api,
  logging: { enabled: true, includeBody: false }
})
