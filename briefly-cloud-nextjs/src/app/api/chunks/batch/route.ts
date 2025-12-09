import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { logApiUsage } from '@/app/lib/logger'
import { 
  DocumentChunker, 
  storeDocumentChunks, 
  getDocumentChunks,
  getChunkingStats
} from '@/app/lib/document-chunker'
import { extractTextFromBuffer } from '@/app/lib/document-extractor'
import { z } from 'zod'

// Validation schema
const batchChunkingSchema = z.object({
  file_ids: z.array(z.string()).min(1).max(10), // Limit to 10 files at once
  strategy: z.enum(['paragraph', 'sentence', 'fixed', 'semantic', 'sliding']).optional().default('paragraph'),
  maxChunkSize: z.number().min(100).max(5000).optional().default(1000),
  minChunkSize: z.number().min(50).max(2000).optional(),
  overlap: z.number().min(0).max(1000).optional(),
  preserveStructure: z.boolean().optional(),
  respectBoundaries: z.boolean().optional(),
  saveToDatabase: z.boolean().optional().default(true),
  forceReprocess: z.boolean().optional().default(false),
})

// POST /api/chunks/batch - Create chunks for multiple files
async function batchChunkingHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  
  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }
  
  try {
    const body = await request.json()
    const validation = batchChunkingSchema.safeParse(body)
    
    if (!validation.success) {
      return ApiResponse.badRequest('Invalid request data')
    }
    
    const {
      file_ids,
      strategy,
      maxChunkSize,
      minChunkSize,
      overlap,
      preserveStructure,
      respectBoundaries,
      saveToDatabase,
      forceReprocess,
    } = validation.data
    
    const supabase = supabaseAdmin
    
    // Get files metadata
    const { data: files, error: filesError } = await supabase
      .from('files')
      .select('*')
      .eq('user_id', user.id)
      .in('id', file_ids)
    
    if (filesError) {
      console.error('Files fetch error:', filesError)
      return ApiResponse.internalError('Failed to fetch files')
    }
    
    if (!files || files.length === 0) {
      return ApiResponse.notFound('No files found')
    }
    
    const results = {
      processed: [] as any[],
      skipped: [] as any[],
      failed: [] as any[],
      summary: {
        total_requested: file_ids.length,
        total_found: files.length,
        total_processed: 0,
        total_skipped: 0,
        total_failed: 0,
        total_chunks_created: 0,
        total_processing_time: 0,
      },
    }
    
    // Create chunker with configuration
    const chunker = new DocumentChunker({
      strategy,
      maxChunkSize,
      minChunkSize,
      overlap,
      preserveStructure,
      respectBoundaries,
    })
    
    // Process each file
    for (const file of files) {
      const startTime = Date.now()
      
      try {
        // Check if already processed and not forcing reprocess
        if (file.processed && !forceReprocess) {
          const existingChunks = await getDocumentChunks(file.id, user.id)
          
          if (existingChunks.length > 0) {
            const stats = getChunkingStats(existingChunks)
            
            results.processed.push({
              file_id: file.id,
              file_name: file.name,
              from_cache: true,
              chunk_count: existingChunks.length,
              processing_time: 0,
              stats,
            })
            
            results.summary.total_chunks_created += existingChunks.length
            continue
          }
        }
        
        // Extract text from file
        let text: string
        
        if (file.source === 'upload' && file.path) {
          const { data: fileData, error: downloadError } = await supabase.storage
            .from('documents')
            .download(file.path)
          
          if (downloadError || !fileData) {
            results.failed.push({
              file_id: file.id,
              file_name: file.name,
              error: 'Failed to download file',
            })
            continue
          }
          
          const buffer = Buffer.from(await fileData.arrayBuffer())
          const extractionResult = await extractTextFromBuffer(buffer, file.mime_type, file.name)
          text = extractionResult.text
        } else {
          results.skipped.push({
            file_id: file.id,
            file_name: file.name,
            reason: 'Cloud storage files not yet supported for batch chunking',
          })
          continue
        }
        
        if (!text.trim()) {
          results.skipped.push({
            file_id: file.id,
            file_name: file.name,
            reason: 'No text content found in file',
          })
          continue
        }
        
        // Create chunks
        const chunks = chunker.createChunks(text, file.id, file.name, file.mime_type, user.id)
        
        // Store in database if requested
        if (saveToDatabase) {
          try {
            await storeDocumentChunks(chunks, user.id, file.id)
            
            // Update file metadata
            await supabase
              .from('files')
              .update({
                processed: true,
                processing_status: 'completed',
                metadata: {
                  ...file.metadata,
                  chunk_count: chunks.length,
                  chunking_strategy: strategy,
                  max_chunk_size: maxChunkSize,
                  min_chunk_size: minChunkSize,
                  overlap,
                  preserve_structure: preserveStructure,
                  respect_boundaries: respectBoundaries,
                  processed_at: new Date().toISOString(),
                },
                updated_at: new Date().toISOString(),
              })
              .eq('id', file.id)
              .eq('user_id', user.id)
            
          } catch (dbError) {
            console.error(`Database save error for file ${file.id}:`, dbError)
            // Continue without failing the chunking
          }
        }
        
        const processingTime = Date.now() - startTime
        const stats = getChunkingStats(chunks)
        
        results.processed.push({
          file_id: file.id,
          file_name: file.name,
          from_cache: false,
          chunk_count: chunks.length,
          processing_time: processingTime,
          text_length: text.length,
          stats,
        })
        
        results.summary.total_chunks_created += chunks.length
        results.summary.total_processing_time += processingTime
        
      } catch (error) {
        console.error(`Error processing file ${file.id}:`, error)
        results.failed.push({
          file_id: file.id,
          file_name: file.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }
    
    // Update summary
    results.summary.total_processed = results.processed.length
    results.summary.total_skipped = results.skipped.length
    results.summary.total_failed = results.failed.length
    
    // Log usage
    logApiUsage(user.id, '/api/chunks/batch', 'batch_chunking', {
      requested_count: file_ids.length,
      processed_count: results.summary.total_processed,
      skipped_count: results.summary.total_skipped,
      failed_count: results.summary.total_failed,
      total_chunks_created: results.summary.total_chunks_created,
      total_processing_time: results.summary.total_processing_time,
      strategy,
      max_chunk_size: maxChunkSize,
      save_to_database: saveToDatabase,
    })
    
    return ApiResponse.success(results, 
      `Batch chunking completed: ${results.summary.total_processed} processed, ${results.summary.total_skipped} skipped, ${results.summary.total_failed} failed`
    )
    
  } catch (error) {
    console.error('Batch chunking handler error:', error)
    return ApiResponse.internalError('Failed to process batch chunking')
  }
}

// Export handler with middleware
export const POST = createProtectedApiHandler(batchChunkingHandler, {
  rateLimit: {
    ...rateLimitConfigs.embedding, // Use embedding rate limits (more restrictive)
    maxRequests: 3, // Very restrictive for batch operations
  },
  logging: {
    enabled: true,
    includeBody: true,
  },
})
