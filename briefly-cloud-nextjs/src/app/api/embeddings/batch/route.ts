import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { logApiUsage } from '@/app/lib/logger'
import { 
  EmbeddingsService,
  createEmbeddingsService,
  createUserEmbeddingsService,
  DEFAULT_EMBEDDING_MODEL,
  getEmbeddingModelInfo
} from '@/app/lib/embeddings'
import { z } from 'zod'
import { supabaseAdmin } from '@/app/lib/supabase'

// Validation schema
const batchEmbeddingRequestSchema = z.object({
  texts: z.array(z.string().min(1)).min(1).max(100), // Max 100 texts at once
  model: z.enum(['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002']).optional(),
  dimensions: z.number().min(256).max(3072).optional(),
  include_metadata: z.boolean().optional().default(true),
  include_similarities: z.boolean().optional().default(false),
})

// POST /api/embeddings/batch - Generate embeddings for multiple texts
async function generateBatchEmbeddingsHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  
  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }
  
  try {
    const body = await request.json()
    const validation = batchEmbeddingRequestSchema.safeParse(body)
    
    if (!validation.success) {
      return ApiResponse.badRequest('Invalid request data')
    }
    
    const { 
      texts, 
      model = DEFAULT_EMBEDDING_MODEL, 
      dimensions,
      include_metadata,
      include_similarities
    } = validation.data
    
    // Check if user has BYOK tier and their own API key
    let embeddingsService: EmbeddingsService
    let isUserKey = false
    
    if (user.subscription_tier === 'pro_byok') {
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = supabaseAdmin
      
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
    
    // Generate batch embeddings
    const result = await embeddingsService.generateBatchEmbeddings(texts, model)
    
    // Calculate similarities if requested
    let similarities: number[][] | undefined
    if (include_similarities && texts.length > 1) {
      similarities = []
      const { calculateSimilarity } = await import('@/app/lib/embeddings')
      
      for (let i = 0; i < result.embeddings.length; i++) {
        const row: number[] = []
        for (let j = 0; j < result.embeddings.length; j++) {
          if (i === j) {
            row.push(1.0) // Self-similarity is 1.0
          } else {
            const similarity = calculateSimilarity(
              result.embeddings[i].embedding,
              result.embeddings[j].embedding
            )
            row.push(similarity)
          }
        }
        similarities.push(row)
      }
    }
    
    // Prepare response data
    const responseData: any = {
      embeddings: result.embeddings.map((emb, index) => ({
        index,
        embedding: emb.embedding,
        dimensions: emb.dimensions,
        tokens: emb.tokens,
        text_preview: texts[index].substring(0, 100) + (texts[index].length > 100 ? '...' : ''),
      })),
    }
    
    if (include_metadata) {
      responseData.metadata = {
        model: result.model,
        total_texts: texts.length,
        total_tokens: result.totalTokens,
        total_cost: result.totalCost,
        processing_time: result.processingTime,
        average_tokens_per_text: Math.round(result.totalTokens / texts.length),
        model_info: getEmbeddingModelInfo(model),
        is_user_key: isUserKey,
      }
      
      responseData.texts_info = {
        count: texts.length,
        total_length: texts.reduce((sum, text) => sum + text.length, 0),
        average_length: Math.round(texts.reduce((sum, text) => sum + text.length, 0) / texts.length),
        length_distribution: {
          min: Math.min(...texts.map(t => t.length)),
          max: Math.max(...texts.map(t => t.length)),
          median: texts.map(t => t.length).sort((a, b) => a - b)[Math.floor(texts.length / 2)],
        },
      }
    }
    
    if (include_similarities && similarities) {
      responseData.similarities = {
        matrix: similarities,
        description: 'Cosine similarity matrix between all text pairs',
        interpretation: 'Values range from -1 to 1, where 1 means identical, 0 means orthogonal, -1 means opposite',
      }
    }
    
    // Log usage
    logApiUsage(user.id, '/api/embeddings/batch', 'batch_embedding_generation', {
      model,
      text_count: texts.length,
      total_tokens: result.totalTokens,
      total_cost: result.totalCost,
      processing_time: result.processingTime,
      include_similarities,
      is_user_key: isUserKey,
    })
    
    return ApiResponse.success(responseData, 'Batch embeddings generated successfully')
    
  } catch (error) {
    console.error('Generate batch embeddings handler error:', error)
    
    if (error instanceof Error && error.name === 'AppError') {
      throw error
    }
    
    return ApiResponse.internalError('Failed to generate batch embeddings')
  }
}

// Export handler with middleware
export const POST = createProtectedApiHandler(generateBatchEmbeddingsHandler, {
  rateLimit: {
    ...rateLimitConfigs.embedding,
    maxRequests: 20, // More restrictive for batch operations
  },
  logging: {
    enabled: true,
    includeBody: false, // Don't log text content for privacy
  },
})