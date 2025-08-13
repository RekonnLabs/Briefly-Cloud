import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { supabaseAdmin } from '@/app/lib/supabase'
import { logApiUsage } from '@/app/lib/logger'
import { 
  EmbeddingsService,
  createEmbeddingsService,
  createUserEmbeddingsService,
  DEFAULT_EMBEDDING_MODEL,
  EmbeddingModel,
  getEmbeddingModelInfo
} from '@/app/lib/embeddings'
import { getDocumentChunks } from '@/app/lib/document-chunker'
import { z } from 'zod'

// Validation schema
const chunkEmbeddingRequestSchema = z.object({
  model: z.enum(['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002']).optional(),
  dimensions: z.number().min(256).max(3072).optional(),
  force_regenerate: z.boolean().optional().default(false),
  save_to_database: z.boolean().optional().default(true),
})

// POST /api/embeddings/chunks/[fileId] - Generate embeddings for document chunks
async function generateChunkEmbeddingsHandler(request: Request, context: ApiContext): Promise<NextResponse> {
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
    const validation = chunkEmbeddingRequestSchema.safeParse(body)
    
    if (!validation.success) {
      return ApiResponse.badRequest('Invalid request data')
    }
    
    const { 
      model = DEFAULT_EMBEDDING_MODEL, 
      dimensions,
      force_regenerate,
      save_to_database
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
    
    // Get existing chunks
    const chunks = await getDocumentChunks(fileId, user.id)
    
    if (chunks.length === 0) {
      return ApiResponse.badRequest('No chunks found for this file. Please chunk the document first.')
    }
    
    // Check if embeddings already exist and not forcing regeneration
    const hasExistingEmbeddings = chunks.some(chunk => chunk.embedding && chunk.embedding.length > 0)
    
    if (hasExistingEmbeddings && !force_regenerate) {
      // Return existing embeddings
      const embeddingStats = {
        total_chunks: chunks.length,
        chunks_with_embeddings: chunks.filter(c => c.embedding && c.embedding.length > 0).length,
        embedding_model: chunks[0]?.metadata?.embedding_model || 'unknown',
        embedding_dimensions: chunks[0]?.embedding?.length || 0,
      }
      
      return ApiResponse.success({
        embeddings: chunks.map(chunk => ({
          chunk_index: chunk.chunkIndex,
          embedding: chunk.embedding,
          dimensions: chunk.embedding?.length || 0,
          content_preview: chunk.content.substring(0, 100) + (chunk.content.length > 100 ? '...' : ''),
        })),
        metadata: {
          file_id: fileId,
          file_name: file.name,
          from_cache: true,
          ...embeddingStats,
        },
      }, 'Embeddings retrieved from existing data')
    }
    
    // Check if user has BYOK tier and their own API key
    let embeddingsService: EmbeddingsService
    let isUserKey = false
    
    if (user.subscription_tier === 'pro_byok') {
      const { data: apiKeyData } = await supabase
        .from('user_settings')
        .select('value')
        .eq('user_id', user.id)
        .eq('key', 'openai_api_key')
        .single()
      
      if (apiKeyData?.value) {
        embeddingsService = createUserEmbeddingsService(apiKeyData.value, { dimensions })
        isUserKey = true
      } else {
        embeddingsService = createEmbeddingsService({ dimensions })
      }
    } else {
      embeddingsService = createEmbeddingsService({ dimensions })
    }
    
    // Generate embeddings for chunks
    const storedChunks = await embeddingsService.generateAndStoreChunkEmbeddings(
      chunks,
      user.id,
      fileId,
      model
    )
    
    // Get updated file metadata
    const { data: updatedFile } = await supabase
      .from('file_metadata')
      .select('metadata')
      .eq('id', fileId)
      .single()
    
    const embeddingMetadata = updatedFile?.metadata || {}
    
    // Prepare response
    const responseData = {
      embeddings: storedChunks.map(chunk => ({
        chunk_index: chunk.chunkIndex,
        embedding: chunk.embedding,
        dimensions: chunk.embedding?.length || 0,
        content_preview: chunk.content.substring(0, 100) + (chunk.content.length > 100 ? '...' : ''),
        tokens: chunk.metadata?.tokens || 0,
      })),
      metadata: {
        file_id: fileId,
        file_name: file.name,
        from_cache: false,
        model: model,
        total_chunks: storedChunks.length,
        total_tokens: embeddingMetadata.total_tokens || 0,
        total_cost: embeddingMetadata.embedding_cost || 0,
        embedding_dimensions: embeddingMetadata.embedding_dimensions || 0,
        model_info: getEmbeddingModelInfo(model),
        is_user_key: isUserKey,
        embedded_at: embeddingMetadata.embedded_at,
      },
      file_info: {
        id: file.id,
        name: file.name,
        size: file.size,
        type: file.mime_type,
        processed: true,
        processing_status: 'completed',
      },
    }
    
    // Log usage
    logApiUsage(user.id, '/api/embeddings/chunks/[fileId]', 'chunk_embedding_generation', {
      file_id: fileId,
      file_name: file.name,
      model,
      chunk_count: storedChunks.length,
      total_tokens: embeddingMetadata.total_tokens || 0,
      total_cost: embeddingMetadata.embedding_cost || 0,
      force_regenerate,
      is_user_key: isUserKey,
    })
    
    return ApiResponse.success(responseData, 'Chunk embeddings generated successfully')
    
  } catch (error) {
    console.error('Generate chunk embeddings handler error:', error)
    
    if (error instanceof Error && error.name === 'AppError') {
      throw error
    }
    
    return ApiResponse.internalError('Failed to generate chunk embeddings')
  }
}

// GET /api/embeddings/chunks/[fileId] - Get existing chunk embeddings
async function getChunkEmbeddingsHandler(request: Request, context: ApiContext): Promise<NextResponse> {
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
    
    // Get existing chunks with embeddings
    const chunks = await getDocumentChunks(fileId, user.id)
    
    const embeddingStats = {
      total_chunks: chunks.length,
      chunks_with_embeddings: chunks.filter(c => c.embedding && c.embedding.length > 0).length,
      embedding_model: chunks[0]?.metadata?.embedding_model || null,
      embedding_dimensions: chunks[0]?.embedding?.length || 0,
      has_embeddings: chunks.some(c => c.embedding && c.embedding.length > 0),
    }
    
    const responseData = {
      embeddings: chunks.map(chunk => ({
        chunk_index: chunk.chunkIndex,
        has_embedding: !!(chunk.embedding && chunk.embedding.length > 0),
        embedding: chunk.embedding,
        dimensions: chunk.embedding?.length || 0,
        content_preview: chunk.content.substring(0, 100) + (chunk.content.length > 100 ? '...' : ''),
        tokens: chunk.metadata?.tokens || 0,
      })),
      metadata: {
        file_id: fileId,
        file_name: file.name,
        ...embeddingStats,
        embedded_at: file.metadata?.embedded_at,
      },
      file_info: {
        id: file.id,
        name: file.name,
        size: file.size,
        type: file.mime_type,
        processed: file.processed,
        processing_status: file.processing_status,
      },
    }
    
    // Log usage
    logApiUsage(user.id, '/api/embeddings/chunks/[fileId]', 'get_chunk_embeddings', {
      file_id: fileId,
      chunk_count: chunks.length,
      has_embeddings: embeddingStats.has_embeddings,
    })
    
    return ApiResponse.success(responseData)
    
  } catch (error) {
    console.error('Get chunk embeddings handler error:', error)
    return ApiResponse.internalError('Failed to get chunk embeddings')
  }
}

// Export handlers with middleware
export const POST = createProtectedApiHandler(generateChunkEmbeddingsHandler, {
  rateLimit: {
    ...rateLimitConfigs.embedding,
    maxRequests: 10, // Very restrictive for chunk embedding operations
  },
  logging: {
    enabled: true,
    includeBody: true,
  },
})

export const GET = createProtectedApiHandler(getChunkEmbeddingsHandler, {
  rateLimit: rateLimitConfigs.general,
  logging: {
    enabled: true,
    includeBody: false,
  },
})