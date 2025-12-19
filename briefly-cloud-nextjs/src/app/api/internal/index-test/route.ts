console.log("INDEX_TEST_ROUTE_FILE_LOADED");

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
import { ApiResponse, ApiErrorCode } from '@/app/lib/api-response'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { z } from 'zod'

console.log("INDEX_TEST_IMPORTS_COMPLETED");

// Force Node.js runtime (not Edge) - required for OpenAI SDK, Supabase admin, vector stores
export const runtime = 'nodejs'

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
  console.log("INDEX_TEST_HANDLER_ENTERED");
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
    
    // NOTE: Skipping file record creation for now due to RLS/client issues
    // The indexing pipeline will create file_ingest record automatically
    console.log(`[TEST_TRIGGER] Skipping file record creation, testing pipeline directly`)
    
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
      return ApiResponse.serverError(
        `Indexing failed: ${result.error}`,
        ApiErrorCode.INTERNAL_ERROR,
        {
          result,
          file_id: fileId,
          user_id: userId,
        }
      )
    }
    
  } catch (error) {
    console.error('[TEST_TRIGGER] Indexing test handler error:', error)
    
    return ApiResponse.serverError(
      'Failed to process indexing test',
      ApiErrorCode.INTERNAL_ERROR,
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
