import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { logApiUsage } from '@/app/lib/logger'
import { filesRepo, fileIngestRepo, chunksRepo } from '@/app/lib/repos'
import type { FileIngestRecord } from '@/app/lib/repos/file-ingest-repo'
import type { AppFile } from '@/app/types/rag'
import { z } from 'zod'

const UPLOAD_SOURCE = 'upload'
const DEFAULT_STORAGE_BUCKET = 'documents'

const bulkDeleteSchema = z.object({
  file_ids: z.array(z.string()).min(1).max(50),
})

const bulkUpdateSchema = z.object({
  file_ids: z.array(z.string()).min(1).max(50),
  updates: z.object({
    name: z.string().optional(),
    metadata: z.record(z.any()).optional(),
  }),
})

type BulkDeleteFailure = { id: string; error: string }
type BulkUpdateFailure = { id: string; error: string }

const isReady = (status: FileIngestRecord['status'] | undefined) => status === 'ready'

function resolveStorageTarget(file: AppFile, ingest?: FileIngestRecord | null): { bucket: string | null; path: string | null } {
  const meta = (ingest?.meta ?? null) as Record<string, unknown> | null
  const bucket = (meta?.storageBucket as string | undefined) ?? (ingest?.source === UPLOAD_SOURCE ? DEFAULT_STORAGE_BUCKET : null)
  const path = (meta?.storagePath as string | undefined) ?? file.path ?? null
  return { bucket: bucket ?? null, path }
}

// DELETE /api/upload/bulk - Delete multiple files
async function bulkDeleteHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context

  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }

  try {
    const body = await request.json()
    const validation = bulkDeleteSchema.safeParse(body)

    if (!validation.success) {
      return ApiResponse.badRequest('Invalid request data')
    }

    const { file_ids } = validation.data

    const files = await filesRepo.getByIds(user.id, file_ids)
    const fileMap = new Map(files.map(file => [file.id, file]))
    const ingestMap = await fileIngestRepo.getByFileIds(user.id, file_ids)

    const results = {
      deleted: [] as string[],
      failed: [] as BulkDeleteFailure[],
      total_size_freed: 0,
    }

    const successfulIds: string[] = []

    for (const fileId of file_ids) {
      const file = fileMap.get(fileId)
      if (!file) {
        results.failed.push({ id: fileId, error: 'File not found' })
        continue
      }

      const ingest = ingestMap[fileId] ?? null

      try {
        if (ingest?.source === UPLOAD_SOURCE) {
          const target = resolveStorageTarget(file, ingest)
          if (target.bucket && target.path) {
            const { error: storageError } = await supabaseAdmin.storage
              .from(target.bucket)
              .remove([target.path])

            if (storageError) {
              console.error(`Storage deletion error for ${fileId}:`, storageError)
            }
          }
        }

        try {
          await chunksRepo.deleteByFile(user.id, fileId)
        } catch (chunksError) {
          console.error(`Chunks deletion error for ${fileId}:`, chunksError)
        }

        successfulIds.push(fileId)
        results.deleted.push(fileId)
        results.total_size_freed += file.size_bytes
      } catch (error) {
        console.error(`Error deleting file ${fileId}:`, error)
        results.failed.push({ id: fileId, error: 'Unexpected error during deletion' })
      }
    }

    if (successfulIds.length) {
      try {
        await fileIngestRepo.deleteMany(user.id, successfulIds)
        await filesRepo.deleteMany(user.id, successfulIds)
      } catch (finalizationError) {
        console.error('Bulk delete finalization error:', finalizationError)
        return ApiResponse.internalError('Failed to finalize bulk delete')
      }

      const { data: userProfile } = await supabaseAdmin
        .from('users')
        .select('documents_uploaded, storage_used_bytes')
        .eq('id', user.id)
        .single()

      if (userProfile) {
        await supabaseAdmin
          .from('users')
          .update({
            documents_uploaded: Math.max(0, (userProfile.documents_uploaded || 0) - results.deleted.length),
            storage_used_bytes: Math.max(0, (userProfile.storage_used_bytes || 0) - results.total_size_freed),
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id)
      }
    }

    logApiUsage(user.id, '/api/upload/bulk', 'bulk_delete', {
      requested_count: file_ids.length,
      deleted_count: results.deleted.length,
      failed_count: results.failed.length,
      size_freed: results.total_size_freed,
    })

    return ApiResponse.success(
      results,
      `Bulk delete completed: ${results.deleted.length} deleted, ${results.failed.length} failed`
    )
  } catch (error) {
    console.error('Bulk delete handler error:', error)
    return ApiResponse.internalError('Failed to process bulk delete')
  }
}

// PUT /api/upload/bulk - Update multiple files
async function bulkUpdateHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context

  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }

  try {
    const body = await request.json()
    const validation = bulkUpdateSchema.safeParse(body)

    if (!validation.success) {
      return ApiResponse.badRequest('Invalid request data')
    }

    const { file_ids, updates } = validation.data

    if (!updates.name && !updates.metadata) {
      return ApiResponse.badRequest('At least one update field is required')
    }

    const files = await filesRepo.getByIds(user.id, file_ids)
    const fileMap = new Map(files.map(file => [file.id, file]))
    const ingestMap = await fileIngestRepo.getByFileIds(user.id, file_ids)

    const results = {
      updated: [] as string[],
      failed: [] as BulkUpdateFailure[],
    }

    let updatedNameIds = new Set<string>()
    if (updates.name !== undefined) {
      const updatedRecords = await filesRepo.updateMany(user.id, files.map(file => file.id), { name: updates.name })
      updatedNameIds = new Set(updatedRecords.map(record => record.id))
    }

    for (const fileId of file_ids) {
      const file = fileMap.get(fileId)
      if (!file) {
        results.failed.push({ id: fileId, error: 'File not found' })
        continue
      }

      const errors: string[] = []

      if (updates.metadata) {
        const ingest = ingestMap[fileId] ?? null
        try {
          const mergedMeta = {
            ...(ingest?.meta ?? {}),
            ...updates.metadata,
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
        } catch (metaError) {
          console.error(`Metadata update error for ${fileId}:`, metaError)
          errors.push('Failed to update metadata')
        }
      }

      if (updates.name !== undefined && !updatedNameIds.has(fileId)) {
        errors.push('Failed to update name')
      }

      if (errors.length) {
        results.failed.push({ id: fileId, error: errors.join('; ') })
      } else {
        results.updated.push(fileId)
      }
    }

    logApiUsage(user.id, '/api/upload/bulk', 'bulk_update', {
      requested_count: file_ids.length,
      updated_count: results.updated.length,
      failed_count: results.failed.length,
      update_fields: Object.keys(updates),
    })

    return ApiResponse.success(
      results,
      `Bulk update completed: ${results.updated.length} updated, ${results.failed.length} failed`
    )
  } catch (error) {
    console.error('Bulk update handler error:', error)
    return ApiResponse.internalError('Failed to process bulk update')
  }
}

// POST /api/upload/bulk - Get multiple files info
async function bulkInfoHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context

  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }

  try {
    const body = await request.json()
    const { file_ids } = body ?? {}

    if (!Array.isArray(file_ids) || file_ids.length === 0 || file_ids.length > 100) {
      return ApiResponse.badRequest('file_ids must be an array with 1-100 items')
    }

    const files = await filesRepo.getByIds(user.id, file_ids)
    const fileMap = new Map(files.map(file => [file.id, file]))
    const ingestMap = await fileIngestRepo.getByFileIds(user.id, file_ids)

    const results = file_ids.map((id: string) => {
      const file = fileMap.get(id)
      if (!file) {
        return { id, found: false }
      }

      const ingest = ingestMap[id] ?? null
      const status = ingest?.status ?? 'pending'

      return {
        id: file.id,
        found: true,
        name: file.name,
        size: file.size_bytes,
        mime_type: file.mime_type,
        source: ingest?.source ?? null,
        processed: isReady(status),
        processing_status: status,
        created_at: file.created_at,
        updated_at: ingest?.updated_at ?? file.created_at,
        metadata: ingest?.meta ?? null,
        error_message: ingest?.error_msg ?? null,
      }
    })

    logApiUsage(user.id, '/api/upload/bulk', 'bulk_info', {
      requested_count: file_ids.length,
      found_count: results.filter(file => file.found).length,
    })

    return ApiResponse.success({
      files: results,
      summary: {
        requested: file_ids.length,
        found: results.filter(file => file.found).length,
        not_found: results.filter(file => !file.found).length,
      },
    })
  } catch (error) {
    console.error('Bulk info handler error:', error)
    return ApiResponse.internalError('Failed to get files info')
  }
}

export const DELETE = createProtectedApiHandler(bulkDeleteHandler, {
  rateLimit: {
    ...rateLimitConfigs.general,
    maxRequests: 10,
  },
  logging: {
    enabled: true,
    includeBody: true,
  },
})

export const PUT = createProtectedApiHandler(bulkUpdateHandler, {
  rateLimit: {
    ...rateLimitConfigs.general,
    maxRequests: 20,
  },
  logging: {
    enabled: true,
    includeBody: true,
  },
})

export const POST = createProtectedApiHandler(bulkInfoHandler, {
  rateLimit: rateLimitConfigs.general,
  logging: {
    enabled: true,
    includeBody: false,
  },
})

