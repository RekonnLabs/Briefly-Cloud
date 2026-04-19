/**
 * Microsoft OneDrive Batch Import API
 *
 * Creates and manages batch import jobs for OneDrive folders.
 * Supports folder-specific imports with server-side file listing.
 * Returns job ID for progress tracking and status polling.
 *
 * Rate limiting (System B — Supabase-backed):
 *   POST (job creation) — folder_import/hour
 *   GET / DELETE / PUT — no rate limit (read-only status/management)
 */

import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { enforceRateLimit } from '@/app/lib/usage/rate-limiter'
import { ImportJobManager } from '@/app/lib/jobs/import-job-manager'
import { logger } from '@/app/lib/logger'
import { getUserLimits } from '@/app/lib/usage/quota-enforcement'

interface BatchImportRequest {
  folderId?: string
  batchSize?: number
  maxRetries?: number
}

async function createMicrosoftBatchImportHandler(
  request: Request,
  context: ApiContext
): Promise<NextResponse> {
  const { user } = context
  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }

  try {
    const body = await request.json().catch(() => ({})) as BatchImportRequest
    const folderId = body.folderId || 'root'
    const batchSize = body.batchSize || 5
    const maxRetries = body.maxRetries || 3

    // Validate batch size limits (server-side can handle larger batches)
    if (batchSize < 1 || batchSize > 20) {
      return ApiResponse.badRequest('Batch size must be between 1 and 20')
    }

    if (maxRetries < 1 || maxRetries > 5) {
      return ApiResponse.badRequest('Max retries must be between 1 and 5')
    }

    // ── Rate limit: folder_import (System B) ──────────────────────────────────
    try {
      await enforceRateLimit(user.id, 'folder_import', 'hour')
    } catch (err: any) {
      if (err?.code === 'RATE_LIMIT_EXCEEDED' || err?.statusCode === 429) {
        return ApiResponse.tooManyRequests(err.message || 'Rate limit exceeded', { retryAfter: err.details?.retryAfter ?? 3600 })
      }
      // Supabase unreachable — fail-closed: block the request
      return ApiResponse.tooManyRequests('Rate limit check unavailable. Please try again shortly.', { retryAfter: 60 })
    }

    // ── Quota pre-flight — fail-closed ────────────────────────────────────────
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
    // ─────────────────────────────────────────────────────────────────────────

    logger.info('Creating Microsoft OneDrive batch import job', {
      userId: user.id,
      folderId,
      batchSize,
      maxRetries
    })

    // Create and process the server-side batch import job
    const job = await ImportJobManager.createAndProcessBatchImport(
      user.id,
      'microsoft',
      folderId,
      {
        batchSize: Math.min(batchSize, 10), // Server-side can handle larger batches
        maxRetries,
        processImmediately: true
      }
    )

    return ApiResponse.success({
      jobId: job.id,
      status: job.status,
      provider: 'microsoft',
      folderId,
      createdAt: job.createdAt,
      progress: job.progress
    }, 'Batch import job created successfully')

  } catch (error) {
    logger.error('Error creating Microsoft OneDrive batch import', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return ApiResponse.serverError(
      'Failed to create batch import job',
      'BATCH_IMPORT_ERROR'
    )
  }
}

async function getMicrosoftBatchImportStatusHandler(
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

    // Get comprehensive batch import status
    const statusData = await ImportJobManager.getBatchImportStatus(jobId)

    // Verify job belongs to user
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
      errorMessage: statusData.job.errorMessage
    })

  } catch (error) {
    logger.error('Error getting Microsoft OneDrive batch import status', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return ApiResponse.serverError(
      'Failed to get batch import status',
      'BATCH_STATUS_ERROR'
    )
  }
}

async function listMicrosoftBatchImportsHandler(
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

    // Filter to only Microsoft jobs
    const microsoftJobs = jobs.filter(job => job.provider === 'microsoft')

    return ApiResponse.success({
      jobs: microsoftJobs.map(job => ({
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
      total: microsoftJobs.length
    })

  } catch (error) {
    logger.error('Error listing Microsoft OneDrive batch imports', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return ApiResponse.serverError(
      'Failed to list batch imports',
      'BATCH_LIST_ERROR'
    )
  }
}

async function cancelMicrosoftBatchImportHandler(
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

    // Verify job belongs to user
    if (job.userId !== user.id) {
      return ApiResponse.forbidden('Access denied to this job')
    }

    // Only allow cancellation of pending or processing jobs
    if (!['pending', 'processing'].includes(job.status)) {
      return ApiResponse.badRequest(`Cannot cancel job with status: ${job.status}`)
    }

    await ImportJobManager.cancelJob(body.jobId)

    logger.info('Microsoft OneDrive batch import cancelled', {
      userId: user.id,
      jobId: body.jobId
    })

    return ApiResponse.success({
      jobId: body.jobId,
      status: 'cancelled',
      message: 'Job cancelled successfully'
    })

  } catch (error) {
    logger.error('Error cancelling Microsoft OneDrive batch import', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return ApiResponse.serverError(
      'Failed to cancel batch import',
      'BATCH_CANCEL_ERROR'
    )
  }
}

// Export handlers for different HTTP methods
// System A rateLimitConfigs removed — System B wired directly in POST handler above.
// GET, DELETE, PUT are read-only status/management endpoints and do not need rate limiting.
export const POST = createProtectedApiHandler(createMicrosoftBatchImportHandler, {
  logging: { enabled: true, includeBody: true }
})

export const GET = createProtectedApiHandler(getMicrosoftBatchImportStatusHandler, {
  logging: { enabled: true, includeBody: false }
})

export const DELETE = createProtectedApiHandler(cancelMicrosoftBatchImportHandler, {
  logging: { enabled: true, includeBody: true }
})

// Also support listing via PUT method
export const PUT = createProtectedApiHandler(listMicrosoftBatchImportsHandler, {
  logging: { enabled: true, includeBody: false }
})
