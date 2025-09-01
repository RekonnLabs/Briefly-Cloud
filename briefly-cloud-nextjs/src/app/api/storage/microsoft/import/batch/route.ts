/**
 * Microsoft OneDrive Batch Import API
 * 
 * Creates and manages batch import jobs for OneDrive folders
 * Supports folder-specific imports with server-side file listing
 * Returns job ID for progress tracking and status polling
 */

import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { ImportJobManager } from '@/app/lib/jobs/import-job-manager'
import { logger } from '@/app/lib/logger'

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
export const POST = createProtectedApiHandler(createMicrosoftBatchImportHandler, {
  rateLimit: rateLimitConfigs.embedding,
  logging: { enabled: true, includeBody: true }
})

export const GET = createProtectedApiHandler(getMicrosoftBatchImportStatusHandler, {
  rateLimit: rateLimitConfigs.api,
  logging: { enabled: true, includeBody: false }
})

export const DELETE = createProtectedApiHandler(cancelMicrosoftBatchImportHandler, {
  rateLimit: rateLimitConfigs.api,
  logging: { enabled: true, includeBody: true }
})

// Also support listing via PUT method
export const PUT = createProtectedApiHandler(listMicrosoftBatchImportsHandler, {
  rateLimit: rateLimitConfigs.api,
  logging: { enabled: true, includeBody: false }
})