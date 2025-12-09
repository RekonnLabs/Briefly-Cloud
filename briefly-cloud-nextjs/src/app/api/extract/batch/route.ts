import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { logApiUsage } from '@/app/lib/logger'
import { 
  extractTextFromBuffer, 
  createTextChunks, 
  isSupportedMimeType,
  getExtractionStats 
} from '@/app/lib/document-extractor'
import { z } from 'zod'

// Validation schema
const batchExtractionSchema = z.object({
  file_ids: z.array(z.string()).min(1).max(10), // Limit to 10 files at once
  options: z.object({
    createChunks: z.boolean().optional().default(true),
    maxChunkSize: z.number().min(100).max(5000).optional().default(1000),
    saveToDatabase: z.boolean().optional().default(true),
    forceReprocess: z.boolean().optional().default(false),
  }).optional().default({}),
})

// POST /api/extract/batch - Extract text from multiple files
async function batchExtractionHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  
  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }
  
  try {
    const body = await request.json()
    const validation = batchExtractionSchema.safeParse(body)
    
    if (!validation.success) {
      return ApiResponse.badRequest('Invalid request data')
    }
    
    const { file_ids, options } = validation.data
    
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
        total_processing_time: 0,
      },
    }
    
    // Process each file
    for (const file of files) {
      try {
        // Check if file type is supported
        if (!isSupportedMimeType(file.mime_type)) {
          results.skipped.push({
            file_id: file.id,
            file_name: file.name,
            reason: `File type ${file.mime_type} is not supported for text extraction`,
          })
          continue
        }
        
        // Check if already processed and not forcing reprocess
        if (file.processed && !options.forceReprocess) {
          // Get existing chunks
          const { data: existingChunks } = await supabase
            .from('document_chunks')
            .select('*')
            .eq('file_id', file.id)
            .order('chunk_index', { ascending: true })
          
          if (existingChunks && existingChunks.length > 0) {
            results.processed.push({
              file_id: file.id,
              file_name: file.name,
              from_cache: true,
              chunk_count: existingChunks.length,
              text_length: file.metadata?.character_count || 0,
              processing_time: 0,
            })
            continue
          }
        }
        
        // Download file
        let fileBuffer: Buffer
        
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
          
          fileBuffer = Buffer.from(await fileData.arrayBuffer())
        } else {
          results.skipped.push({
            file_id: file.id,
            file_name: file.name,
            reason: 'Cloud storage files not yet supported for batch extraction',
          })
          continue
        }
        
        // Extract text
        const extractionResult = await extractTextFromBuffer(fileBuffer, file.mime_type, file.name)
        
        // Create chunks
        let chunks = null
        if (options.createChunks) {
          chunks = createTextChunks(
            extractionResult.text,
            file.id,
            file.name,
            file.mime_type,
            options.maxChunkSize
          )
        }
        
        // Save to database
        if (options.saveToDatabase && chunks) {
          try {
            // Delete existing chunks
            await supabase
              .from('document_chunks')
              .delete()
              .eq('file_id', file.id)
            
            // Insert new chunks
            const chunkData = chunks.map(chunk => ({
              file_id: file.id,
              user_id: user.id,
              chunk_index: chunk.chunkIndex,
              content: chunk.content,
              metadata: chunk.metadata,
            }))
            
            await supabase
              .from('document_chunks')
              .insert(chunkData)
            
            // Update file metadata
            await supabase
              .from('files')
              .update({
                processed: true,
                processing_status: 'completed',
                metadata: {
                  ...file.metadata,
                  chunk_count: chunks.length,
                  extractor_used: extractionResult.metadata.extractorUsed,
                  processing_time: extractionResult.metadata.processingTime,
                  word_count: extractionResult.metadata.wordCount,
                  character_count: extractionResult.metadata.characterCount,
                  page_count: extractionResult.metadata.pageCount,
                  warnings: extractionResult.warnings,
                  extracted_at: extractionResult.metadata.extractedAt,
                },
                updated_at: new Date().toISOString(),
              })
              .eq('id', file.id)
            
          } catch (dbError) {
            console.error(`Database save error for file ${file.id}:`, dbError)
            // Continue without failing the extraction
          }
        }
        
        // Add to results
        const stats = getExtractionStats(extractionResult)
        results.processed.push({
          file_id: file.id,
          file_name: file.name,
          from_cache: false,
          chunk_count: chunks?.length || 0,
          text_length: extractionResult.text.length,
          processing_time: extractionResult.metadata.processingTime,
          word_count: extractionResult.metadata.wordCount,
          page_count: extractionResult.metadata.pageCount,
          warnings: extractionResult.warnings,
          stats,
        })
        
        results.summary.total_processing_time += extractionResult.metadata.processingTime
        
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
    logApiUsage(user.id, '/api/extract/batch', 'batch_text_extraction', {
      requested_count: file_ids.length,
      processed_count: results.summary.total_processed,
      skipped_count: results.summary.total_skipped,
      failed_count: results.summary.total_failed,
      total_processing_time: results.summary.total_processing_time,
      options,
    })
    
    return ApiResponse.success(results, 
      `Batch extraction completed: ${results.summary.total_processed} processed, ${results.summary.total_skipped} skipped, ${results.summary.total_failed} failed`
    )
    
  } catch (error) {
    console.error('Batch extraction handler error:', error)
    return ApiResponse.internalError('Failed to process batch extraction')
  }
}

// Export handler with middleware
export const POST = createProtectedApiHandler(batchExtractionHandler, {
  rateLimit: {
    ...rateLimitConfigs.embedding, // Use embedding rate limits (more restrictive)
    maxRequests: 5, // Very restrictive for batch operations
  },
  logging: {
    enabled: true,
    includeBody: true,
  },
})
