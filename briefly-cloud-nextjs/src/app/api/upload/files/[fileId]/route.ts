import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { logApiUsage } from '@/app/lib/logger'
import { filesRepo, fileIngestRepo, chunksRepo } from '@/app/lib/repos'
import type { FileIngestRecord } from '@/app/lib/repos/file-ingest-repo'
import type { AppFile } from '@/app/types/rag'

type ProcessingInfo = {
  job_id: string
  status: string
  progress: number
  message: string
}

const UPLOAD_SOURCE = 'upload'
const DEFAULT_STORAGE_BUCKET = 'documents'

function resolveExternalUrl(ingest?: FileIngestRecord | null): string | null {
  const meta = (ingest?.meta ?? null) as Record<string, unknown> | null
  if (!meta) return null

  const candidates = ['publicUrl', 'externalUrl', 'download_url', 'webViewLink']
  for (const key of candidates) {
    const value = meta[key as keyof typeof meta]
    if (typeof value === 'string' && value) {
      return value
    }
  }

  return null
}

function resolveStorageTarget(file: AppFile, ingest?: FileIngestRecord | null): { bucket: string | null; path: string | null } {
  const meta = (ingest?.meta ?? null) as Record<string, unknown> | null
  const bucket = (meta?.storageBucket as string | undefined) ?? (ingest?.source === UPLOAD_SOURCE ? DEFAULT_STORAGE_BUCKET : null)
  const path = (meta?.storagePath as string | undefined) ?? file.path ?? null
  return {
    bucket: bucket ?? null,
    path,
  }
}

function formatFileResponse(
  file: AppFile,
  ingest: FileIngestRecord | null,
  processingInfo: ProcessingInfo | null
) {
  const status = ingest?.status ?? 'pending'
  return {
    file: {
      id: file.id,
      name: file.name,
      size: file.size_bytes,
      mime_type: file.mime_type,
      source: ingest?.source ?? null,
      processed: status === 'ready',
      processing_status: status,
      error_message: ingest?.error_msg ?? null,
      external_url: resolveExternalUrl(ingest),
      created_at: file.created_at,
      updated_at: ingest?.updated_at ?? file.created_at,
      metadata: ingest?.meta ?? null,
      processing_info: processingInfo,
    },
  }
}

async function fetchProcessingInfo(userId: string, fileId: string) {
  const { data: jobs } = await supabaseAdmin
    .from('job_logs')
    .select('*')
    .eq('user_id', userId)
    .contains('input_data', { file_ids: [fileId] })
    .order('created_at', { ascending: false })
    .limit(1)

  if (jobs && jobs.length > 0) {
    return {
      job_id: jobs[0].id,
      status: jobs[0].status,
      progress: jobs[0].output_data?.progress || 0,
      message: jobs[0].output_data?.message || '',
    }
  }

  return null
}

// GET /api/upload/files/[fileId] - Get specific file details
async function getFileHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context

  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }

  try {
    const url = new URL(request.url)
    const fileId = url.pathname.split('/').pop()

    if (!fileId) {
      return ApiResponse.badRequest('File ID is required')
    }

    const file = await filesRepo.getById(user.id, fileId)
    if (!file) {
      return ApiResponse.notFound('File')
    }

    const ingest = await fileIngestRepo.get(user.id, fileId)
    const processingInfo = ingest?.status === 'ready' ? null : await fetchProcessingInfo(user.id, fileId)

    logApiUsage(user.id, '/api/upload/files/[fileId]', 'file_view', {
      file_id: fileId,
      file_name: file.name,
    })

    return ApiResponse.success(formatFileResponse(file, ingest, processingInfo))
  } catch (error) {
    console.error('Get file handler error:', error)
    return ApiResponse.internalError('Failed to get file details')
  }
}

// DELETE /api/upload/files/[fileId] - Delete specific file
async function deleteFileHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context

  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }

  try {
    const url = new URL(request.url)
    const fileId = url.pathname.split('/').pop()

    if (!fileId) {
      return ApiResponse.badRequest('File ID is required')
    }

    const file = await filesRepo.getById(user.id, fileId)
    if (!file) {
      return ApiResponse.notFound('File')
    }

    const ingest = await fileIngestRepo.get(user.id, fileId)

    if (ingest?.source === UPLOAD_SOURCE) {
      const storageTarget = resolveStorageTarget(file, ingest)
      if (storageTarget.bucket && storageTarget.path) {
        const { error: storageError } = await supabaseAdmin.storage
          .from(storageTarget.bucket)
          .remove([storageTarget.path])

        if (storageError) {
          console.error('Storage deletion error:', storageError)
        }
      }
    }

    try {
      await chunksRepo.deleteByFile(user.id, fileId)
    } catch (chunkError) {
      console.error('Chunks deletion error:', chunkError)
    }

    await fileIngestRepo.deleteByFile(user.id, fileId)
    await filesRepo.delete(user.id, fileId)

    const { data: userProfile } = await supabaseAdmin
      .from('users')
      .select('documents_uploaded, storage_used_bytes')
      .eq('id', user.id)
      .single()

    if (userProfile) {
      await supabaseAdmin
        .from('users')
        .update({
          documents_uploaded: Math.max(0, (userProfile.documents_uploaded || 0) - 1),
          storage_used_bytes: Math.max(0, (userProfile.storage_used_bytes || 0) - file.size_bytes),
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
    }

    logApiUsage(user.id, '/api/upload/files/[fileId]', 'file_delete', {
      file_id: fileId,
      file_name: file.name,
      file_size: file.size_bytes,
    })

    return ApiResponse.success(null, 'File deleted successfully')
  } catch (error) {
    console.error('Delete file handler error:', error)
    return ApiResponse.internalError('Failed to delete file')
  }
}

// PUT /api/upload/files/[fileId] - Update file metadata
async function updateFileHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context

  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }

  try {
    const url = new URL(request.url)
    const fileId = url.pathname.split('/').pop()

    if (!fileId) {
      return ApiResponse.badRequest('File ID is required')
    }

    const body = await request.json()
    const { name, metadata } = body ?? {}

    if (!name && !metadata) {
      return ApiResponse.badRequest('Name or metadata is required for update')
    }

    const file = await filesRepo.getById(user.id, fileId)
    if (!file) {
      return ApiResponse.notFound('File')
    }

    const ingest = await fileIngestRepo.get(user.id, fileId)
    const updatedFields: string[] = []

    if (name) {
      await filesRepo.update(user.id, fileId, { name })
      updatedFields.push('name')
    }

    if (metadata) {
      const mergedMeta = {
        ...(ingest?.meta ?? {}),
        ...metadata,
      }

      await fileIngestRepo.upsert({
        file_id: fileId,
        owner_id: user.id,
        status: ingest?.status ?? 'pending',
        source: ingest?.source ?? null,
        error_msg: ingest?.error_msg ?? null,
        page_count: ingest?.page_count ?? null,
        lang: ingest?.lang ?? null,
        meta: mergedMeta,
      })

      updatedFields.push('metadata')
    }

    const updatedFile = (await filesRepo.getById(user.id, fileId)) ?? file
    const updatedIngest = await fileIngestRepo.get(user.id, fileId)

    logApiUsage(user.id, '/api/upload/files/[fileId]', 'file_update', {
      file_id: fileId,
      file_name: updatedFile.name,
      updated_fields: updatedFields,
    })

    return ApiResponse.success(
      formatFileResponse(updatedFile, updatedIngest, null),
      'File updated successfully'
    )
  } catch (error) {
    console.error('Update file handler error:', error)
    return ApiResponse.internalError('Failed to update file')
  }
}

export const GET = createProtectedApiHandler(getFileHandler, {
  rateLimit: rateLimitConfigs.general,
  logging: {
    enabled: true,
    includeBody: false,
  },
})

export const DELETE = createProtectedApiHandler(deleteFileHandler, {
  rateLimit: {
    ...rateLimitConfigs.general,
    maxRequests: 50,
  },
  logging: {
    enabled: true,
    includeBody: false,
  },
})

export const PUT = createProtectedApiHandler(updateFileHandler, {
  rateLimit: rateLimitConfigs.general,
  logging: {
    enabled: true,
    includeBody: true,
  },
})

