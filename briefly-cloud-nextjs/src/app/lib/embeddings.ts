/**
 * OpenAI Embeddings Integration
 * Handles document chunk embeddings with support for ChatGPT 5 and BYOK
 */

import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { createError } from './api-errors'
import { logger } from './logger'
import { DocumentChunk, StoredDocumentChunk } from './document-chunker'

// OpenAI Configuration
export const EMBEDDING_MODELS = {
  'text-embedding-3-small': {
    dimensions: 1536,
    maxTokens: 8191,
    costPer1kTokens: 0.00002, // $0.00002 per 1k tokens
    description: 'Most efficient embedding model for most use cases',
  },
  'text-embedding-3-large': {
    dimensions: 3072,
    maxTokens: 8191,
    costPer1kTokens: 0.00013, // $0.00013 per 1k tokens
    description: 'Higher performance embedding model for advanced use cases',
  },
  'text-embedding-ada-002': {
    dimensions: 1536,
    maxTokens: 8191,
    costPer1kTokens: 0.0001, // $0.0001 per 1k tokens
    description: 'Legacy embedding model (deprecated)',
  },
} as const

export type EmbeddingModel = keyof typeof EMBEDDING_MODELS

// Default configuration
export const DEFAULT_EMBEDDING_MODEL: EmbeddingModel = 'text-embedding-3-small'
export const DEFAULT_DIMENSIONS = EMBEDDING_MODELS[DEFAULT_EMBEDDING_MODEL].dimensions

// Chat models with ChatGPT 5 support
export const CHAT_MODELS = {
  free: 'gpt-3.5-turbo',
  pro: 'gpt-4o', // Updated to latest GPT-4 Omni
  pro_byok: 'gpt-5', // ChatGPT 5 for BYOK users
} as const

export type SubscriptionTier = keyof typeof CHAT_MODELS

// Embedding configuration
export interface EmbeddingConfig {
  model: EmbeddingModel
  dimensions?: number
  batchSize: number
  maxRetries: number
  retryDelay: number
}

// Default embedding configuration
export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  model: DEFAULT_EMBEDDING_MODEL,
  dimensions: DEFAULT_DIMENSIONS,
  batchSize: 100, // Process up to 100 chunks at once
  maxRetries: 3,
  retryDelay: 1000, // 1 second
}

// Embedding result interface
export interface EmbeddingResult {
  embedding: number[]
  tokens: number
  model: string
  dimensions: number
}

// Batch embedding result
export interface BatchEmbeddingResult {
  embeddings: EmbeddingResult[]
  totalTokens: number
  totalCost: number
  processingTime: number
  model: string
}

/**
 * OpenAI Embeddings Service
 */
export class EmbeddingsService {
  private openai: OpenAI
  private config: EmbeddingConfig
  private isUserKey: boolean

  constructor(apiKey?: string, config: Partial<EmbeddingConfig> = {}) {
    this.openai = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY!,
    })
    this.config = { ...DEFAULT_EMBEDDING_CONFIG, ...config }
    this.isUserKey = !!apiKey
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(
    text: string,
    model: EmbeddingModel = this.config.model
  ): Promise<EmbeddingResult> {
    if (!text.trim()) {
      throw createError.validation('Text cannot be empty')
    }

    const startTime = Date.now()

    try {
      const response = await this.openai.embeddings.create({
        model,
        input: text,
        dimensions: this.config.dimensions,
      })

      const embedding = response.data[0]
      const processingTime = Date.now() - startTime

      // Log performance
      logger.logPerformance('embedding_generation', processingTime, {
        model,
        textLength: text.length,
        tokens: response.usage?.total_tokens || 0,
        dimensions: embedding.embedding.length,
        isUserKey: this.isUserKey,
      })

      return {
        embedding: embedding.embedding,
        tokens: response.usage?.total_tokens || 0,
        model,
        dimensions: embedding.embedding.length,
      }
    } catch (error) {
      logger.error('Embedding generation failed', {
        model,
        textLength: text.length,
        isUserKey: this.isUserKey,
      }, error as Error)

      if (error instanceof OpenAI.APIError) {
        if (error.status === 401) {
          throw createError.openaiError('Invalid API key')
        } else if (error.status === 429) {
          throw createError.openaiError('Rate limit exceeded')
        } else if (error.status === 400) {
          throw createError.openaiError('Invalid request: ' + error.message)
        }
      }

      throw createError.openaiError('Failed to generate embedding', error)
    }
  }

  /**
   * Generate embeddings for multiple texts in batches
   */
  async generateBatchEmbeddings(
    texts: string[],
    model: EmbeddingModel = this.config.model
  ): Promise<BatchEmbeddingResult> {
    if (texts.length === 0) {
      throw createError.validation('No texts provided')
    }

    const startTime = Date.now()
    const embeddings: EmbeddingResult[] = []
    let totalTokens = 0
    const modelConfig = EMBEDDING_MODELS[model]

    // Process in batches to avoid rate limits
    const batches = this.createBatches(texts, this.config.batchSize)

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]

      try {
        const response = await this.openai.embeddings.create({
          model,
          input: batch,
          dimensions: this.config.dimensions,
        })

        // Process batch results
        response.data.forEach((item, index) => {
          embeddings.push({
            embedding: item.embedding,
            tokens: Math.ceil(batch[index].length / 4), // Rough token estimate
            model,
            dimensions: item.embedding.length,
          })
        })

        totalTokens += response.usage?.total_tokens || 0

        // Add delay between batches to respect rate limits
        if (i < batches.length - 1) {
          await this.delay(this.config.retryDelay)
        }

      } catch (error) {
        logger.error(`Batch embedding failed for batch ${i + 1}/${batches.length}`, {
          batchSize: batch.length,
          model,
          isUserKey: this.isUserKey,
        }, error as Error)

        // Retry logic for failed batches
        let retryCount = 0
        while (retryCount < this.config.maxRetries) {
          try {
            await this.delay(this.config.retryDelay * (retryCount + 1))
            
            const retryResponse = await this.openai.embeddings.create({
              model,
              input: batch,
              dimensions: this.config.dimensions,
            })

            // Process retry results
            retryResponse.data.forEach((item, index) => {
              embeddings.push({
                embedding: item.embedding,
                tokens: Math.ceil(batch[index].length / 4),
                model,
                dimensions: item.embedding.length,
              })
            })

            totalTokens += retryResponse.usage?.total_tokens || 0
            break

          } catch (retryError) {
            retryCount++
            if (retryCount >= this.config.maxRetries) {
              throw createError.openaiError(`Failed to generate embeddings after ${this.config.maxRetries} retries`, retryError)
            }
          }
        }
      }
    }

    const processingTime = Date.now() - startTime
    const totalCost = (totalTokens / 1000) * modelConfig.costPer1kTokens

    // Log batch performance
    logger.logPerformance('batch_embedding_generation', processingTime, {
      model,
      totalTexts: texts.length,
      totalTokens,
      totalCost,
      batchCount: batches.length,
      isUserKey: this.isUserKey,
    })

    return {
      embeddings,
      totalTokens,
      totalCost,
      processingTime,
      model,
    }
  }

  /**
   * Generate embeddings for document chunks and store in database
   */
  async generateAndStoreChunkEmbeddings(
    chunks: DocumentChunk[],
    userId: string,
    fileId: string,
    model: EmbeddingModel = this.config.model
  ): Promise<StoredDocumentChunk[]> {
    if (chunks.length === 0) {
      return []
    }

    try {
      // Extract text content from chunks
      const texts = chunks.map(chunk => chunk.content)

      // Generate embeddings
      const batchResult = await this.generateBatchEmbeddings(texts, model)

      // Prepare chunks with embeddings for database storage
      const chunksWithEmbeddings = chunks.map((chunk, index) => ({
        ...chunk,
        userId,
        embedding: batchResult.embeddings[index].embedding,
      }))

      // Store in database
      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY!
      )

      // Delete existing chunks for this file
      await supabase
        .from('document_chunks')
        .delete()
        .eq('file_id', fileId)
        .eq('user_id', userId)

      // Insert chunks with embeddings in batches
      const batchSize = 100
      const storedChunks: StoredDocumentChunk[] = []

      for (let i = 0; i < chunksWithEmbeddings.length; i += batchSize) {
        const batch = chunksWithEmbeddings.slice(i, i + batchSize)

        const chunkData = batch.map(chunk => ({
          file_id: fileId,
          user_id: userId,
          chunk_index: chunk.chunkIndex,
          content: chunk.content,
          embedding: chunk.embedding,
          metadata: {
            ...chunk.metadata,
            embedding_model: model,
            embedding_dimensions: chunk.embedding?.length || 0,
            tokens: batchResult.embeddings[chunk.chunkIndex]?.tokens || 0,
          },
        }))

        const { data, error } = await supabase
          .from('document_chunks')
          .insert(chunkData)
          .select()

        if (error) {
          throw createError.supabaseError('Failed to store chunks with embeddings', error)
        }

        if (data) {
          const batchStoredChunks = data.map((row, index) => ({
            ...batch[i + index],
            id: row.id,
            createdAt: row.created_at,
          }))
          storedChunks.push(...batchStoredChunks)
        }
      }

      // Update file metadata with embedding information
      await supabase
        .from('file_metadata')
        .update({
          processed: true,
          processing_status: 'completed',
          metadata: {
            embedding_model: model,
            embedding_dimensions: batchResult.embeddings[0]?.dimensions || 0,
            total_tokens: batchResult.totalTokens,
            embedding_cost: batchResult.totalCost,
            embedded_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', fileId)
        .eq('user_id', userId)

      logger.info(`Generated and stored embeddings for ${chunks.length} chunks`, {
        fileId,
        userId,
        model,
        totalTokens: batchResult.totalTokens,
        totalCost: batchResult.totalCost,
        processingTime: batchResult.processingTime,
      })

      return storedChunks

    } catch (error) {
      logger.error('Failed to generate and store chunk embeddings', {
        fileId,
        userId,
        chunkCount: chunks.length,
        model,
      }, error as Error)
      throw error
    }
  }

  /**
   * Create batches from array of texts
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = []
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize))
    }
    return batches
  }

  /**
   * Delay utility for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/**
 * Convenience functions using default configuration
 */

// Create embeddings service with system API key
export function createEmbeddingsService(config?: Partial<EmbeddingConfig>): EmbeddingsService {
  return new EmbeddingsService(undefined, config)
}

// Create embeddings service with user API key (BYOK)
export function createUserEmbeddingsService(
  userApiKey: string,
  config?: Partial<EmbeddingConfig>
): EmbeddingsService {
  return new EmbeddingsService(userApiKey, config)
}

// Generate single embedding with default service
export async function generateEmbedding(
  text: string,
  model?: EmbeddingModel
): Promise<EmbeddingResult> {
  const service = createEmbeddingsService()
  return service.generateEmbedding(text, model)
}

// Generate batch embeddings with default service
export async function generateBatchEmbeddings(
  texts: string[],
  model?: EmbeddingModel
): Promise<BatchEmbeddingResult> {
  const service = createEmbeddingsService()
  return service.generateBatchEmbeddings(texts, model)
}

// Calculate embedding similarity (cosine similarity)
export function calculateSimilarity(embedding1: number[], embedding2: number[]): number {
  if (embedding1.length !== embedding2.length) {
    throw new Error('Embeddings must have the same dimensions')
  }

  let dotProduct = 0
  let norm1 = 0
  let norm2 = 0

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i]
    norm1 += embedding1[i] * embedding1[i]
    norm2 += embedding2[i] * embedding2[i]
  }

  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2))
}

// Get embedding model information
export function getEmbeddingModelInfo(model: EmbeddingModel) {
  return EMBEDDING_MODELS[model]
}

// Estimate embedding cost
export function estimateEmbeddingCost(
  textLength: number,
  model: EmbeddingModel = DEFAULT_EMBEDDING_MODEL
): number {
  const modelConfig = EMBEDDING_MODELS[model]
  const estimatedTokens = Math.ceil(textLength / 4) // Rough estimate: 4 chars per token
  return (estimatedTokens / 1000) * modelConfig.costPer1kTokens
}