// Quest 0: Manual Indexing Test Trigger

/**
 * Quest 0: Manual Indexing Test Trigger
 * 
 * This endpoint allows testing the indexing pipeline with a real file from storage.
 * It fetches the file from app.files and Supabase Storage, then runs the indexing pipeline.
 * 
 * POST /api/internal/index-test
 * 
 * Body:
 * {
 *   "fileId": "uuid"
 * }
 * 
 * Authentication: JWT (owner_id derived from token)
 */

import { NextRequest, NextResponse } from 'next/server'
import { indexFile, FileReference } from '@/app/lib/indexing/indexingPipeline'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse, ApiErrorCode } from '@/app/lib/api-response'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { z } from 'zod'

const requestSchema = z.object({
  fileId: z.string().uuid('Invalid file ID format')
})

const DEFAULT_STORAGE_BUCKET = 'documents'

async function handler(request: NextRequest, context: ApiContext) {
  const correlationId = context.correlationId
  const userId = context.user?.id

  if (!userId) {
    return ApiResponse.unauthorized('User not authenticated', ApiErrorCode.UNAUTHORIZED, correlationId)
  }

  console.log(`[TEST_TRIGGER] Request received`, { correlationId, userId })

  try {
    const body = await request.json()
    const validation = requestSchema.safeParse(body)

    if (!validation.success) {
      return ApiResponse.badRequest(
        'Invalid request body',
        ApiErrorCode.VALIDATION_ERROR,
        correlationId,
        { errors: validation.error.errors }
      )
    }

    const { fileId } = validation.data

    console.log(`[TEST_TRIGGER] Fetching file from database`, { fileId, userId, correlationId })

    // Fetch file metadata from app.files
    const { data: fileRecord, error: fetchError } = await supabaseAdmin
      .from('app.files')
      .select('id, owner_id, name, path, mime_type, source, external_id, external_url')
      .eq('id', fileId)
      .eq('owner_id', userId)
      .single()

    if (fetchError || !fileRecord) {
      console.error(`[TEST_TRIGGER] File not found`, { fileId, userId, error: fetchError })
      return ApiResponse.notFound(
        'File not found or access denied',
        ApiErrorCode.NOT_FOUND,
        correlationId
      )
    }

    console.log(`[TEST_TRIGGER] File found`, { 
      fileId, 
      name: fileRecord.name, 
      path: fileRecord.path,
      mimeType: fileRecord.mime_type,
      correlationId 
    })

    // Read file content from Supabase Storage
    const { data: fileData, error: downloadError } = await supabaseAdmin
      .storage
      .from(DEFAULT_STORAGE_BUCKET)
      .download(fileRecord.path)

    if (downloadError || !fileData) {
      console.error(`[TEST_TRIGGER] Failed to download file from storage`, { 
        fileId, 
        path: fileRecord.path,
        bucket: DEFAULT_STORAGE_BUCKET,
        error: downloadError,
        correlationId 
      })
      return ApiResponse.serverError(
        'Failed to download file from storage',
        ApiErrorCode.INTERNAL_ERROR,
        correlationId,
        { bucket: DEFAULT_STORAGE_BUCKET, path: fileRecord.path }
      )
    }

    // Convert blob to text
    const fileContent = await fileData.text()
    console.log(`[TEST_TRIGGER] File content read`, { 
      fileId, 
      contentLength: fileContent.length,
      correlationId 
    })

    // Check if marker phrase is present in the file
    const markerPhrase = 'BRIEFLY_INDEX_TEST_PHRASE_9F3A7C2D'
    const markerFound = fileContent.includes(markerPhrase)
    console.log(`[TEST_TRIGGER] Marker phrase check`, { markerFound, correlationId })

    // Build FileReference for indexing pipeline
    const fileRef: FileReference = {
      user_id: userId,
      file_id: fileId,
      source: fileRecord.source || 'test',
      external_id: fileRecord.external_id || fileId,
      filename: fileRecord.name,
      mime_type: fileRecord.mime_type || 'text/plain',
      content: fileContent,
      download_url: fileRecord.external_url,
      last_modified: new Date().toISOString(),
    }

    console.log(`[TEST_TRIGGER] Starting indexing pipeline`, { fileId, userId, correlationId })

    // Run the indexing pipeline
    const result = await indexFile(fileRef)

    console.log(`[TEST_TRIGGER] Indexing completed`, { 
      success: result.success, 
      fileId, 
      chunksIndexed: result.chunks_indexed,
      correlationId 
    })

    if (result.success) {
      return ApiResponse.success(
        {
          success: true,
          file_id: fileId,
          chunks_inserted: result.chunks_indexed || 0,
          marker_found: markerFound,
          correlationId,
          result
        },
        'File indexed successfully'
      )
    } else {
      return ApiResponse.serverError(
        `Indexing failed: ${result.error}`,
        ApiErrorCode.INTERNAL_ERROR,
        correlationId,
        {
          success: false,
          file_id: fileId,
          marker_found: markerFound,
          result
        }
      )
    }
  } catch (error: any) {
    console.error(`[TEST_TRIGGER] Unexpected error`, { 
      error: error.message, 
      stack: error.stack,
      correlationId 
    })
    return ApiResponse.serverError(
      'Internal server error',
      ApiErrorCode.INTERNAL_ERROR,
      correlationId,
      { error: error.message }
    )
  }
}

export const POST = createProtectedApiHandler(handler, {
  requireAuth: true,
  rateLimit: rateLimitConfigs.internal
})
