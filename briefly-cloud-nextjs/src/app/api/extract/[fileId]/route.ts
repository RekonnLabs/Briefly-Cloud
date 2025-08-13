import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { supabaseAdmin } from '@/app/lib/supabase'
import { logApiUsage } from '@/app/lib/logger'
import { 
  extractTextFromBuffer, 
  createTextChunks, 
  isSupportedMimeType,
  getExtractionStats 
} from '@/app/lib/document-extractor'

// POST /api/extract/[fileId] - Extract text from uploaded file by ID
async function extractFromFileHandler(request: Request, context: ApiContext): Promise<NextResponse> {
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
    
    const supabase = supabaseAdmin
    
    // Parse request options
    const body = await request.json().catch(() => ({}))
    const options = {
      createChunks: body.createChunks !== false,
      maxChunkSize: body.maxChunkSize || 1000,
      saveToDatabase: body.saveToDatabase === true,
      ...body,
    }
    
    // Get file metadata
    const { data: file, error: fileError } = await supabase
      .from('file_metadata')
      .select('*')
      .eq('id', fileId)
      .eq('user_id', user.id) // Ensure user owns the file
      .single()
    
    if (fileError || !file) {
      return ApiResponse.notFound('File')
    }
    
    // Check if file type is supported for extraction
    if (!isSupportedMimeType(file.mime_type)) {
      return ApiResponse.badRequest(
        `File type ${file.mime_type} is not supported for text extraction`
      )
    }
    
    // Check if file has already been processed
    if (file.processed && !options.forceReprocess) {
      // Try to get existing chunks
      const { data: existingChunks } = await supabase
        .from('document_chunks')
        .select('*')
        .eq('file_id', fileId)
        .order('chunk_index', { ascending: true })
      
      if (existingChunks && existingChunks.length > 0) {
        return ApiResponse.success({
          extraction: {
            text: existingChunks.map(chunk => chunk.content).join('\n\n'),
            metadata: {
              extractedAt: file.updated_at,
              extractorUsed: file.metadata?.extractor_used || 'unknown',
              processingTime: file.metadata?.processing_time || 0,
              wordCount: file.metadata?.word_count || 0,
              characterCount: file.metadata?.character_count || 0,
              pageCount: file.metadata?.page_count,
            },
            warnings: file.metadata?.warnings || [],
            stats: {
              success: true,
              textLength: file.metadata?.character_count || 0,
              wordCount: file.metadata?.word_count || 0,
              characterCount: file.metadata?.character_count || 0,
              pageCount: file.metadata?.page_count,
              processingTime: file.metadata?.processing_time || 0,
              warningCount: (file.metadata?.warnings || []).length,
              extractorUsed: file.metadata?.extractor_used || 'unknown',
              extractedAt: file.updated_at,
            },
          },
          chunks: existingChunks.map(chunk => ({
            content: chunk.content,
            chunkIndex: chunk.chunk_index,
            metadata: chunk.metadata,
          })),
          file_info: {
            id: file.id,
            name: file.name,
            size: file.size,
            type: file.mime_type,
          },
          from_cache: true,
        }, 'Text retrieved from existing processing')
      }
    }
    
    // Download file from storage
    let fileBuffer: Buffer
    
    if (file.source === 'upload' && file.path) {
      // Download from Supabase Storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('documents')
        .download(file.path)
      
      if (downloadError || !fileData) {
        console.error('File download error:', downloadError)
        return ApiResponse.internalError('Failed to download file for processing')
      }
      
      fileBuffer = Buffer.from(await fileData.arrayBuffer())
    } else {
      // For cloud storage files, we'd need to download from the external URL
      // This is a simplified implementation
      return ApiResponse.badRequest('Text extraction from cloud storage files is not yet implemented')
    }
    
    // Extract text
    const extractionResult = await extractTextFromBuffer(fileBuffer, file.mime_type, file.name)
    
    // Create chunks
    let chunks = null
    if (options.createChunks) {
      chunks = createTextChunks(
        extractionResult.text,
        fileId,
        file.name,
        file.mime_type,
        options.maxChunkSize
      )
    }
    
    // Save to database if requested
    if (options.saveToDatabase && chunks) {
      try {
        // Delete existing chunks
        await supabase
          .from('document_chunks')
          .delete()
          .eq('file_id', fileId)
        
        // Insert new chunks
        const chunkData = chunks.map(chunk => ({
          file_id: fileId,
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
          .from('file_metadata')
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
          .eq('id', fileId)
        
      } catch (dbError) {
        console.error('Database save error:', dbError)
        // Continue without failing the extraction
      }
    }
    
    // Get extraction statistics
    const stats = getExtractionStats(extractionResult)
    
    // Log usage
    logApiUsage(user.id, '/api/extract/[fileId]', 'file_text_extraction', {
      file_id: fileId,
      file_name: file.name,
      file_size: file.size,
      file_type: file.mime_type,
      text_length: extractionResult.text.length,
      processing_time: extractionResult.metadata.processingTime,
      extractor_used: extractionResult.metadata.extractorUsed,
      chunk_count: chunks?.length || 0,
      saved_to_database: options.saveToDatabase,
    })
    
    return ApiResponse.success({
      extraction: {
        text: extractionResult.text,
        metadata: extractionResult.metadata,
        warnings: extractionResult.warnings,
        stats,
      },
      ...(chunks && { chunks }),
      file_info: {
        id: file.id,
        name: file.name,
        size: file.size,
        type: file.mime_type,
      },
      from_cache: false,
    }, 'Text extracted successfully')
    
  } catch (error) {
    console.error('File extraction handler error:', error)
    
    // Re-throw known errors
    if (error instanceof Error && error.name === 'AppError') {
      throw error
    }
    
    return ApiResponse.internalError('Failed to extract text from file')
  }
}

// GET /api/extract/[fileId] - Get extraction status and existing chunks
async function getExtractionStatusHandler(request: Request, context: ApiContext): Promise<NextResponse> {
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
    
    const supabase = supabaseAdmin
    
    // Get file metadata
    const { data: file, error: fileError } = await supabase
      .from('file_metadata')
      .select('*')
      .eq('id', fileId)
      .eq('user_id', user.id)
      .single()
    
    if (fileError || !file) {
      return ApiResponse.notFound('File')
    }
    
    // Get existing chunks
    const { data: chunks } = await supabase
      .from('document_chunks')
      .select('chunk_index, content, metadata')
      .eq('file_id', fileId)
      .order('chunk_index', { ascending: true })
    
    // Check if extraction is supported
    const extractionSupported = isSupportedMimeType(file.mime_type)
    
    return ApiResponse.success({
      file_info: {
        id: file.id,
        name: file.name,
        size: file.size,
        type: file.mime_type,
        processed: file.processed,
        processing_status: file.processing_status,
      },
      extraction_info: {
        supported: extractionSupported,
        has_existing_chunks: (chunks?.length || 0) > 0,
        chunk_count: chunks?.length || 0,
        last_extracted: file.metadata?.extracted_at || file.updated_at,
        extractor_used: file.metadata?.extractor_used,
        processing_time: file.metadata?.processing_time,
        warnings: file.metadata?.warnings || [],
      },
      chunks: chunks || [],
    })
    
  } catch (error) {
    console.error('Get extraction status handler error:', error)
    return ApiResponse.internalError('Failed to get extraction status')
  }
}

// Export handlers with middleware
export const POST = createProtectedApiHandler(extractFromFileHandler, {
  rateLimit: {
    ...rateLimitConfigs.general,
    maxRequests: 20, // More restrictive for processing operations
  },
  logging: {
    enabled: true,
    includeBody: true,
  },
})

export const GET = createProtectedApiHandler(getExtractionStatusHandler, {
  rateLimit: rateLimitConfigs.general,
  logging: {
    enabled: true,
    includeBody: false,
  },
})