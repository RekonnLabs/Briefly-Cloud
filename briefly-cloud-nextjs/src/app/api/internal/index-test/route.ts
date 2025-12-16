/**
 * Quest 0: Manual Indexing Test Trigger
 * 
 * This endpoint allows testing the indexing pipeline without Apideck/OAuth.
 * It accepts a mocked file reference and calls the pipeline directly.
 * 
 * POST /api/internal/index-test
 * 
 * Body:
 * {
 *   "user_id": "uuid",
 *   "file_id": "uuid",
 *   "source": "test",
 *   "external_id": "test-file-123",
 *   "filename": "test.txt",
 *   "mime_type": "text/plain",
 *   "content": "Text content to index..."
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { indexFile, FileReference } from '@/app/lib/indexing/indexingPipeline'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-response'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { z } from 'zod'

// Validation schema
const indexTestSchema = z.object({
  user_id: z.string().uuid().optional(), // Optional: will use authenticated user if not provided
  file_id: z.string().uuid().optional(), // Optional: will generate if not provided
  source: z.string().default('test'),
  external_id: z.string(),
  filename: z.string(),
  mime_type: z.string(),
  content: z.string().optional(),
  download_url: z.string().url().optional(),
}).refine(
  (data) => data.content || data.download_url,
  { message: 'Either content or download_url must be provided' }
)

async function indexTestHandler(request: NextRequest, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  
  try {
    const body = await request.json()
    const validation = indexTestSchema.safeParse(body)
    
    if (!validation.success) {
      return ApiResponse.badRequest(
        'Invalid request body',
        validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      )
    }
    
    const data = validation.data
    
    // Use authenticated user ID if not provided
    const userId = data.user_id || user.id
    
    // Generate file_id if not provided (must be done BEFORE creating file record)
    const fileId = data.file_id || crypto.randomUUID()
    
    console.log(`[TEST_TRIGGER] Starting manual indexing test for file_id=${fileId} user_id=${userId}`)
    
    // Create file record in database first (required for pipeline)
    // Use admin client to bypass RLS for test endpoint
    try {
      const { data: fileRecord, error: createError } = await supabaseAdmin
        .from('files')
        .insert({
          id: fileId,
          owner_id: userId,
          name: data.filename,
          path: `test/${fileId}`,
          size_bytes: data.content?.length || 0,
          mime_type: data.mime_type,
          source: data.source,
          external_id: data.external_id,
          metadata: {
            test_file: true,
            created_by_test_endpoint: true,
          },
          processed: false,
          processing_status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single()
      
      if (createError) {
        throw createError
      }
      
      console.log(`[TEST_TRIGGER] Created file record: id=${fileRecord.id}`)
    } catch (createError) {
      console.error(`[TEST_TRIGGER] Failed to create file record: ${createError}`)
      return ApiResponse.internalError(
        `Failed to create file record: ${createError instanceof Error ? createError.message : 'Unknown error'}`,
        { file_id: fileId, user_id: userId }
      )
    }
    
    // Create file reference
    const fileRef: FileReference = {
      user_id: userId,
      file_id: fileId,
      source: data.source,
      external_id: data.external_id,
      filename: data.filename,
      mime_type: data.mime_type,
      content: data.content,
      download_url: data.download_url,
      last_modified: new Date().toISOString(),
    }
    
    console.log(`[TEST_TRIGGER] Starting manual indexing test for file_id=${fileId} user_id=${userId}`)
    
    // Call the indexing pipeline
    const result = await indexFile(fileRef)
    
    console.log(`[TEST_TRIGGER] Indexing completed: success=${result.success} file_id=${fileId}`)
    
    if (result.success) {
      return ApiResponse.success(
        {
          result,
          message: 'Indexing completed successfully',
          file_id: fileId,
          user_id: userId,
        },
        'File indexed successfully'
      )
    } else {
      return ApiResponse.internalError(
        `Indexing failed: ${result.error}`,
        {
          result,
          file_id: fileId,
          user_id: userId,
        }
      )
    }
    
  } catch (error) {
    console.error('[TEST_TRIGGER] Indexing test handler error:', error)
    
    return ApiResponse.internalError(
      'Failed to process indexing test',
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    )
  }
}

export const POST = createProtectedApiHandler(indexTestHandler, {
  rateLimit: {
    ...rateLimitConfigs.embedding,
    maxRequests: 10, // Restrictive for test endpoint
  },
  logging: {
    enabled: true,
    includeBody: true,
  },
})
