import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { logApiUsage } from '@/app/lib/logger'
import { 
  EmbeddingsService,
  createEmbeddingsService,
  createUserEmbeddingsService,
  EMBEDDING_MODELS,
  DEFAULT_EMBEDDING_MODEL,
  EmbeddingModel,
  estimateEmbeddingCost,
  getEmbeddingModelInfo
} from '@/app/lib/embeddings'
import { z } from 'zod'
import { supabaseAdmin } from '@/app/lib/supabase-admin'

// Validation schemas
const embeddingRequestSchema = z.object({
  text: z.string().min(1).max(100000), // Max ~100k characters
  model: z.enum(['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002']).optional(),
  dimensions: z.number().min(256).max(3072).optional(),
})

const batchEmbeddingRequestSchema = z.object({
  texts: z.array(z.string().min(1)).min(1).max(100), // Max 100 texts at once
  model: z.enum(['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002']).optional(),
  dimensions: z.number().min(256).max(3072).optional(),
})

// POST /api/embeddings - Generate embedding for single text
async function generateEmbeddingHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  
  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }
  
  try {
    const body = await request.json()
    const validation = embeddingRequestSchema.safeParse(body)
    
    if (!validation.success) {
      return ApiResponse.badRequest('Invalid request data')
    }
    
    const { text, model = DEFAULT_EMBEDDING_MODEL, dimensions } = validation.data
    
    // Check if user has BYOK tier and their own API key
    let embeddingsService: EmbeddingsService
    let isUserKey = false
    
    if (user.subscription_tier === 'pro_byok') {
      // Try to get user's API key from settings
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
    
    // Generate embedding
    const result = await embeddingsService.generateEmbedding(text, model)
    
    // Calculate cost estimate
    const modelInfo = getEmbeddingModelInfo(model)
    const estimatedCost = estimateEmbeddingCost(text.length, model)
    
    // Log usage
    logApiUsage(user.id, '/api/embeddings', 'embedding_generation', {
      model,
      text_length: text.length,
      tokens: result.tokens,
      dimensions: result.dimensions,
      estimated_cost: estimatedCost,
      is_user_key: isUserKey,
    })
    
    return ApiResponse.success({
      embedding: result.embedding,
      metadata: {
        model: result.model,
        dimensions: result.dimensions,
        tokens: result.tokens,
        estimated_cost: estimatedCost,
        model_info: modelInfo,
        is_user_key: isUserKey,
      },
      text_info: {
        length: text.length,
        preview: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
      },
    }, 'Embedding generated successfully')
    
  } catch (error) {
    console.error('Generate embedding handler error:', error)
    
    if (error instanceof Error && error.name === 'AppError') {
      throw error
    }
    
    return ApiResponse.internalError('Failed to generate embedding')
  }
}

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
    
    const { texts, model = DEFAULT_EMBEDDING_MODEL, dimensions } = validation.data
    
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
    
    // Log usage
    logApiUsage(user.id, '/api/embeddings/batch', 'batch_embedding_generation', {
      model,
      text_count: texts.length,
      total_tokens: result.totalTokens,
      total_cost: result.totalCost,
      processing_time: result.processingTime,
      is_user_key: isUserKey,
    })
    
    return ApiResponse.success({
      embeddings: result.embeddings.map(emb => emb.embedding),
      metadata: {
        model: result.model,
        total_texts: texts.length,
        total_tokens: result.totalTokens,
        total_cost: result.totalCost,
        processing_time: result.processingTime,
        average_tokens_per_text: Math.round(result.totalTokens / texts.length),
        model_info: getEmbeddingModelInfo(model),
        is_user_key: isUserKey,
      },
      texts_info: {
        count: texts.length,
        total_length: texts.reduce((sum, text) => sum + text.length, 0),
        average_length: Math.round(texts.reduce((sum, text) => sum + text.length, 0) / texts.length),
      },
    }, 'Batch embeddings generated successfully')
    
  } catch (error) {
    console.error('Generate batch embeddings handler error:', error)
    
    if (error instanceof Error && error.name === 'AppError') {
      throw error
    }
    
    return ApiResponse.internalError('Failed to generate batch embeddings')
  }
}

// GET /api/embeddings - Get embedding capabilities and model information
async function getEmbeddingInfoHandler(_request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  
  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }
  
  try {
    const capabilities = {
      models: Object.entries(EMBEDDING_MODELS).map(([name, config]) => ({
        name,
        ...config,
        available: true,
        recommended_for: name === 'text-embedding-3-small' 
          ? ['general_use', 'cost_effective', 'fast_processing']
          : name === 'text-embedding-3-large'
          ? ['high_accuracy', 'advanced_search', 'complex_documents']
          : ['legacy_compatibility'],
      })),
      
      default_model: DEFAULT_EMBEDDING_MODEL,
      
      features: {
        single_embedding: {
          description: 'Generate embedding for a single text',
          max_text_length: 100000,
          endpoint: 'POST /api/embeddings',
        },
        batch_embedding: {
          description: 'Generate embeddings for multiple texts',
          max_texts_per_batch: 100,
          max_text_length: 100000,
          endpoint: 'POST /api/embeddings/batch',
        },
        chunk_embedding: {
          description: 'Generate embeddings for document chunks',
          supports_storage: true,
          endpoint: 'POST /api/embeddings/chunks/{fileId}',
        },
        byok_support: {
          description: 'Bring Your Own Key for Pro BYOK users',
          supported: true,
          models: ['text-embedding-3-small', 'text-embedding-3-large'],
        },
      },
      
      pricing: {
        note: 'Pricing applies when using system API key. BYOK users use their own OpenAI credits.',
        models: Object.entries(EMBEDDING_MODELS).map(([name, config]) => ({
          model: name,
          cost_per_1k_tokens: config.costPer1kTokens,
          estimated_cost_per_page: config.costPer1kTokens * 0.75, // ~750 tokens per page
        })),
      },
      
      limitations: {
        rate_limits: {
          single_embedding: '100 requests per 15 minutes',
          batch_embedding: '20 requests per 15 minutes',
          chunk_embedding: '10 requests per hour',
        },
        text_limits: {
          max_text_length: 100000,
          max_batch_size: 100,
          max_tokens_per_request: 8191,
        },
        subscription_tiers: {
          free: 'System API key only, basic rate limits',
          pro: 'System API key, higher rate limits',
          pro_byok: 'User API key support, highest rate limits',
        },
      },
      
      user_info: {
        subscription_tier: user.subscription_tier,
        has_byok: user.subscription_tier === 'pro_byok',
        can_use_advanced_models: user.subscription_tier !== 'free',
      },
      
      version: '1.0.0',
      last_updated: new Date().toISOString(),
    }
    
    return ApiResponse.success(capabilities)
    
  } catch (error) {
    console.error('Get embedding info handler error:', error)
    return ApiResponse.internalError('Failed to get embedding information')
  }
}

// Export handlers with middleware
export const POST = createProtectedApiHandler(generateEmbeddingHandler, {
  rateLimit: {
    ...rateLimitConfigs.general,
    maxRequests: 100, // More generous for embeddings
  },
  logging: {
    enabled: true,
    includeBody: false, // Don't log text content for privacy
  },
})

export const GET = createProtectedApiHandler(getEmbeddingInfoHandler, {
  rateLimit: rateLimitConfigs.general,
  logging: {
    enabled: true,
    includeBody: false,
  },
})