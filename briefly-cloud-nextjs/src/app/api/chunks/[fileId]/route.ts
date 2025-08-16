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
  deleteDocumentChunks,
  getChunkingStats
} from '@/app/lib/document-chunker'
import { extractTextFromBuffer } from '@/app/lib/document-extractor'
import { z } from 'zod'

// Force Node.js runtime and dynamic rendering
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Validation schema
const fileChunkingSchema = z.object({
  strategy: z.enum(['paragraph', 'sentence', 'fixed', 'semantic', 'sliding']).optional().default('paragraph'),
  maxChunkSize: z.number().min(100).max(5000).optional().default(1000),
  minChunkSize: z.number().min(50).max(2000).optional(),
  overlap: z.number().min(0).max(1000).optional(),
  preserveStructure: z.boolean().optional(),
  respectBoundaries: z.boolean().optional(),
  saveToDatabase: z.boolean().optional().default(true),
  forceReprocess: z.boolean().optional().default(false),
})

// POST /api/chunks/[fileId] - Create chunks from existing file
async function createFileChunksHandler(request: Request, context: ApiContext): Promise<NextResponse> {
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
    const validation = fileChunkingSchema.safeParse(body)
    
    if (!validation.success) {
      return ApiResponse.badRequest('Invalid request data')
    }
    
    const {
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
    
    // Check if file has already been chunked and not forcing reprocess
    if (file.processed && !forceReprocess) {
      const existingChunks = await getDocumentChunks(fileId, user.id)
      
      if (existingChunks.length > 0) {
        const stats = getChunkingStats(existingChunks)
        
        return ApiResponse.success({
          chunks: existingChunks,
          stats,
          config: {
            strategy: file.metadata?.chunking_strategy || 'paragraph',
            maxChunkSize: file.metadata?.max_chunk_size || 1000,
          },
          from_cache: true,
          saved_to_database: true,
        }, 'Chunks retrieved from existing processing')
      }
    }
    
    // Extract text from file
    let text: string
    
    if (file.source === 'upload' && file.path) {
      // Download from Supabase Storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('documents')
        .download(file.path)
      
      if (downloadError || !fileData) {
        console.error('File download error:', downloadError)
        return ApiResponse.internalError('Failed to download file for processing')
      }
      
      const buffer = Buffer.from(await fileData.arrayBuffer())
      const extractionResult = await extractTextFromBuffer(buffer, file.mime_type, file.name)
      text = extractionResult.text
    } else {
      return ApiResponse.badRequest('Chunking from cloud storage files is not yet implemented')
    }
    
    if (!text.trim()) {
      return ApiResponse.badRequest('No text content found in file')
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
    
    // Create chunks
    const chunks = chunker.createChunks(text, fileId, file.name, file.mime_type, user.id)
    
    // Store in database if requested
    let storedChunks = null
    if (saveToDatabase) {
      storedChunks = await storeDocumentChunks(chunks, user.id, fileId)
      
      // Update file metadata
      await supabase
        .from('file_metadata')
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
        .eq('id', fileId)
        .eq('user_id', user.id)
    }
    
    // Get chunking statistics
    const stats = getChunkingStats(chunks)
    
    // Log usage
    logApiUsage(user.id, '/api/chunks/[fileId]', 'file_chunking', {
      file_id: fileId,
      file_name: file.name,
      strategy,
      chunk_count: chunks.length,
      text_length: text.length,
      max_chunk_size: maxChunkSize,
      saved_to_database: saveToDatabase,
      force_reprocess: forceReprocess,
    })
    
    return ApiResponse.success({
      chunks: storedChunks || chunks,
      stats,
      config: {
        strategy,
        maxChunkSize,
        minChunkSize,
        overlap,
        preserveStructure,
        respectBoundaries,
      },
      from_cache: false,
      saved_to_database: saveToDatabase,
      file_info: {
        id: file.id,
        name: file.name,
        size: file.size,
        type: file.mime_type,
      },
    }, 'File chunks created successfully')
    
  } catch (error) {
    console.error('Create file chunks handler error:', error)
    
    if (error instanceof Error && error.name === 'AppError') {
      throw error
    }
    
    return ApiResponse.internalError('Failed to create file chunks')
  }
}

// GET /api/chunks/[fileId] - Get existing chunks for file
async function getFileChunksHandler(request: Request, context: ApiContext): Promise<NextResponse> {
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
    const chunks = await getDocumentChunks(fileId, user.id)
    const stats = getChunkingStats(chunks)
    
    // Log usage
    logApiUsage(user.id, '/api/chunks/[fileId]', 'get_file_chunks', {
      file_id: fileId,
      chunk_count: chunks.length,
    })
    
    return ApiResponse.success({
      chunks,
      stats,
      file_info: {
        id: file.id,
        name: file.name,
        size: file.size,
        type: file.mime_type,
        processed: file.processed,
        processing_status: file.processing_status,
      },
      chunking_info: {
        has_chunks: chunks.length > 0,
        chunk_count: chunks.length,
        strategy: file.metadata?.chunking_strategy || 'unknown',
        max_chunk_size: file.metadata?.max_chunk_size,
        processed_at: file.metadata?.processed_at,
      },
    })
    
  } catch (error) {
    console.error('Get file chunks handler error:', error)
    return ApiResponse.internalError('Failed to get file chunks')
  }
}

// DELETE /api/chunks/[fileId] - Delete chunks for file
async function deleteFileChunksHandler(request: Request, context: ApiContext): Promise<NextResponse> {
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
    
    // Verify file ownership
    const { data: file, error: fileError } = await supabase
      .from('file_metadata')
      .select('id, name')
      .eq('id', fileId)
      .eq('user_id', user.id)
      .single()
    
    if (fileError || !file) {
      return ApiResponse.notFound('File')
    }
    
    // Get chunk count before deletion
    const existingChunks = await getDocumentChunks(fileId, user.id)
    const chunkCount = existingChunks.length
    
    // Delete chunks
    await deleteDocumentChunks(fileId, user.id)
    
    // Update file metadata
    await supabase
      .from('file_metadata')
      .update({
        processed: false,
        processing_status: 'pending',
        metadata: {
          chunk_count: 0,
          deleted_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', fileId)
      .eq('user_id', user.id)
    
    // Log usage
    logApiUsage(user.id, '/api/chunks/[fileId]', 'delete_file_chunks', {
      file_id: fileId,
      file_name: file.name,
      deleted_chunk_count: chunkCount,
    })
    
    return ApiResponse.success(
      {
        deleted_chunk_count: chunkCount,
        file_id: fileId,
      },
      `Deleted ${chunkCount} chunks for file`
    )
    
  } catch (error) {
    console.error('Delete file chunks handler error:', error)
    return ApiResponse.internalError('Failed to delete file chunks')
  }
}

// Export handlers with middleware
export const POST = createProtectedApiHandler(createFileChunksHandler, {
  rateLimit: {
    ...rateLimitConfigs.general,
    maxRequests: 30, // More restrictive for processing operations
  },
  logging: {
    enabled: true,
    includeBody: true,
  },
})

export const GET = createProtectedApiHandler(getFileChunksHandler, {
  rateLimit: rateLimitConfigs.general,
  logging: {
    enabled: true,
    includeBody: false,
  },
})

export const DELETE = createProtectedApiHandler(deleteFileChunksHandler, {
  rateLimit: {
    ...rateLimitConfigs.general,
    maxRequests: 50, // More restrictive for deletion operations
  },
  logging: {
    enabled: true,
    includeBody: false,
  },
})