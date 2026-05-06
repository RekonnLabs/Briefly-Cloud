/**
 * Gemini Embedding 2 Integration
 * Handles document chunk embeddings using gemini-embedding-2-preview.
 *
 * SPEC 4 migration: replaced OpenAI text-embedding-3-small with Gemini Embedding 2.
 * - Document chunks use task prefix: "task: search result | text: <chunk>"
 * - Query vectors use task prefix:   "task: question answering | query: <query>"
 * - Output dimensionality fixed at 1536 — matches existing vector(1536) column, no schema change needed.
 * - BYOK path removed for embeddings (Gemini key is system-only via GEMINI_API_KEY env var).
 */

import { GoogleGenAI } from '@google/genai'
import { createClient } from '@supabase/supabase-js'
import { createError } from './api-errors'
import { logger } from './logger'
import { DocumentChunk, StoredDocumentChunk } from './document-chunker'

// ─── Model configuration ─────────────────────────────────────────────────────

export const EMBED_MODEL = 'gemini-embedding-2-preview'
export const EMBED_DIMS  = 1536  // matches current vector column — no schema change needed

// Kept for backward-compatibility with callers that reference EMBEDDING_MODELS
export const EMBEDDING_MODELS = {
  'gemini-embedding-2-preview': {
    dimensions: EMBED_DIMS,
    maxTokens: 8192,
    costPer1kTokens: 0, // Gemini embedding pricing TBD — set to 0 until confirmed
    description: 'Gemini Embedding 2 — 1536-dim, task-prefixed retrieval model',
  },
  // Legacy entries kept so any code that reads EMBEDDING_MODELS doesn't break
  'text-embedding-3-small': {
    dimensions: 1536,
    maxTokens: 8191,
    costPer1kTokens: 0.00002,
    description: 'Legacy OpenAI model (no longer used)',
  },
  'text-embedding-3-large': {
    dimensions: 3072,
    maxTokens: 8191,
    costPer1kTokens: 0.00013,
    description: 'Legacy OpenAI model (no longer used)',
  },
  'text-embedding-ada-002': {
    dimensions: 1536,
    maxTokens: 8191,
    costPer1kTokens: 0.0001,
    description: 'Legacy OpenAI model (no longer used)',
  },
} as const

export type EmbeddingModel = keyof typeof EMBEDDING_MODELS

export const DEFAULT_EMBEDDING_MODEL: EmbeddingModel = 'gemini-embedding-2-preview'
export const DEFAULT_DIMENSIONS = EMBED_DIMS

// Chat models (unchanged — kept here for backward-compat imports)
export const CHAT_MODELS = {
  free: 'gpt-3.5-turbo',
  pro: 'gpt-4o',
  pro_byok: 'gpt-5',
} as const

export type SubscriptionTier = keyof typeof CHAT_MODELS

// ─── Config interfaces ────────────────────────────────────────────────────────

export interface EmbeddingConfig {
  model: EmbeddingModel
  dimensions?: number
  batchSize: number
  maxRetries: number
  retryDelay: number
}

export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  model: DEFAULT_EMBEDDING_MODEL,
  dimensions: DEFAULT_DIMENSIONS,
  batchSize: 100,
  maxRetries: 3,
  retryDelay: 1000,
}

export interface EmbeddingResult {
  embedding: number[]
  tokens: number
  model: string
  dimensions: number
}

export interface BatchEmbeddingResult {
  embeddings: EmbeddingResult[]
  totalTokens: number
  totalCost: number
  processingTime: number
  model: string
}

// ─── Gemini client (lazy) ─────────────────────────────────────────────────────

let _genai: GoogleGenAI | null = null

function getGenAI(): GoogleGenAI {
  if (!_genai) {
    _genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
  }
  return _genai
}

// ─── Low-level embed helpers ──────────────────────────────────────────────────

/**
 * Embed a document chunk (uses "search result" task prefix for best retrieval quality).
 */
async function embedChunk(text: string): Promise<number[]> {
  const res = await getGenAI().models.embedContent({
    model: EMBED_MODEL,
    contents: `task: search result | text: ${text}`,
    config: { outputDimensionality: EMBED_DIMS },
  })
  return res.embeddings![0].values!
}

/**
 * Embed a user query (uses "question answering" task prefix — intentionally different from embedChunk).
 * Using the same prefix for both document chunks and queries degrades retrieval quality.
 */
export async function embedQuery(query: string): Promise<number[]> {
  const res = await getGenAI().models.embedContent({
    model: EMBED_MODEL,
    contents: `task: question answering | query: ${query}`,
    config: { outputDimensionality: EMBED_DIMS },
  })
  return res.embeddings![0].values!
}

// ─── EmbeddingsService class ──────────────────────────────────────────────────

/**
 * Gemini Embeddings Service
 * Drop-in replacement for the previous OpenAI-based service.
 * All public method signatures are preserved for backward compatibility.
 */
export class EmbeddingsService {
  private config: EmbeddingConfig

  // apiKey param kept for signature compatibility; Gemini uses system key only
  constructor(_apiKey?: string, config: Partial<EmbeddingConfig> = {}) {
    this.config = { ...DEFAULT_EMBEDDING_CONFIG, ...config }
  }

  /**
   * Generate embedding for a single text.
   * Uses embedQuery task prefix when called from query paths,
   * and embedChunk prefix when called from document paths.
   * Since callers don't distinguish, we default to the document (chunk) prefix here
   * and expose embedQuery separately for query-side callers.
   */
  async generateEmbedding(
    text: string,
    _model: EmbeddingModel = this.config.model
  ): Promise<EmbeddingResult> {
    if (!text.trim()) {
      throw createError.validation('Text cannot be empty')
    }

    const startTime = Date.now()

    try {
      const embedding = await embedChunk(text)
      const processingTime = Date.now() - startTime

      logger.logPerformance('embedding_generation', processingTime, {
        model: EMBED_MODEL,
        textLength: text.length,
        dimensions: embedding.length,
      })

      return {
        embedding,
        tokens: 0, // Gemini embedding API does not return token counts
        model: EMBED_MODEL,
        dimensions: embedding.length,
      }
    } catch (error) {
      logger.error('Embedding generation failed', {
        model: EMBED_MODEL,
        textLength: text.length,
      }, error as Error)
      throw createError.internal('Failed to generate embedding', error)
    }
  }

  /**
   * Generate embedding for a query string (uses question-answering task prefix).
   */
  async generateQueryEmbedding(query: string): Promise<EmbeddingResult> {
    if (!query.trim()) {
      throw createError.validation('Query cannot be empty')
    }

    const startTime = Date.now()

    try {
      const embedding = await embedQuery(query)
      const processingTime = Date.now() - startTime

      logger.logPerformance('query_embedding_generation', processingTime, {
        model: EMBED_MODEL,
        queryLength: query.length,
        dimensions: embedding.length,
      })

      return {
        embedding,
        tokens: 0,
        model: EMBED_MODEL,
        dimensions: embedding.length,
      }
    } catch (error) {
      logger.error('Query embedding generation failed', {
        model: EMBED_MODEL,
        queryLength: query.length,
      }, error as Error)
      throw createError.internal('Failed to generate query embedding', error)
    }
  }

  /**
   * Generate embeddings for multiple texts in batches.
   * Gemini embedding API is called one text at a time (no batch endpoint in v1).
   */
  async generateBatchEmbeddings(
    texts: string[],
    _model: EmbeddingModel = this.config.model
  ): Promise<BatchEmbeddingResult> {
    if (texts.length === 0) {
      throw createError.validation('No texts provided')
    }

    const startTime = Date.now()
    const embeddings: EmbeddingResult[] = []

    // Process in batches with retry logic
    const batches = this.createBatches(texts, this.config.batchSize)

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]

      for (let j = 0; j < batch.length; j++) {
        let retryCount = 0
        let success = false

        while (!success && retryCount <= this.config.maxRetries) {
          try {
            const embedding = await embedChunk(batch[j])
            embeddings.push({
              embedding,
              tokens: 0,
              model: EMBED_MODEL,
              dimensions: embedding.length,
            })
            success = true
          } catch (error) {
            retryCount++
            if (retryCount > this.config.maxRetries) {
              logger.error(`Batch embedding failed after ${this.config.maxRetries} retries`, {
                batchIndex: i,
                itemIndex: j,
                model: EMBED_MODEL,
              }, error as Error)
              throw createError.internal(`Failed to generate embeddings after ${this.config.maxRetries} retries`, error)
            }
            await this.delay(this.config.retryDelay * retryCount)
          }
        }
      }

      // Small pause between batches to respect rate limits
      if (i < batches.length - 1) {
        await this.delay(this.config.retryDelay)
      }
    }

    const processingTime = Date.now() - startTime

    logger.logPerformance('batch_embedding_generation', processingTime, {
      model: EMBED_MODEL,
      totalTexts: texts.length,
      batchCount: batches.length,
    })

    return {
      embeddings,
      totalTokens: 0,   // Gemini embedding API does not return token counts
      totalCost: 0,     // Cost tracking TBD once Gemini embedding pricing is published
      processingTime,
      model: EMBED_MODEL,
    }
  }

  /**
   * Generate embeddings for document chunks and store in database.
   */
  async generateAndStoreChunkEmbeddings(
    chunks: DocumentChunk[],
    userId: string,
    fileId: string,
    _model: EmbeddingModel = this.config.model
  ): Promise<StoredDocumentChunk[]> {
    if (chunks.length === 0) {
      return []
    }

    try {
      const texts = chunks.map(chunk => chunk.content)
      const batchResult = await this.generateBatchEmbeddings(texts)

      const chunksWithEmbeddings = chunks.map((chunk, index) => ({
        ...chunk,
        userId,
        embedding: batchResult.embeddings[index].embedding,
      }))

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
            embedding_model: EMBED_MODEL,  // SPEC 4 Step 2: updated model identifier
            embedding_dimensions: chunk.embedding?.length || 0,
            tokens: 0,
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
            ...batch[index],
            id: row.id,
            createdAt: row.created_at,
          }))
          storedChunks.push(...batchStoredChunks)
        }
      }

      // Update file metadata with embedding information
      await supabase
        .from('app.files')
        .update({
          processed: true,
          processing_status: 'completed',
          metadata: {
            embedding_model: EMBED_MODEL,  // SPEC 4 Step 2
            embedding_dimensions: EMBED_DIMS,
            total_tokens: 0,
            embedding_cost: 0,
            embedded_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', fileId)
        .eq('user_id', userId)

      logger.info(`Generated and stored embeddings for ${chunks.length} chunks`, {
        fileId,
        userId,
        model: EMBED_MODEL,
        processingTime: batchResult.processingTime,
      })

      return storedChunks
    } catch (error) {
      logger.error('Failed to generate and store chunk embeddings', {
        fileId,
        userId,
        chunkCount: chunks.length,
        model: EMBED_MODEL,
      }, error as Error)
      throw error
    }
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = []
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize))
    }
    return batches
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// ─── Convenience exports (backward-compatible) ────────────────────────────────

export function createEmbeddingsService(config?: Partial<EmbeddingConfig>): EmbeddingsService {
  return new EmbeddingsService(undefined, config)
}

export function createUserEmbeddingsService(
  userApiKey: string,
  config?: Partial<EmbeddingConfig>
): EmbeddingsService {
  // BYOK not supported for Gemini embedding; falls back to system key
  return new EmbeddingsService(undefined, config)
}

export async function generateEmbedding(
  text: string,
  model?: EmbeddingModel
): Promise<EmbeddingResult> {
  const service = createEmbeddingsService()
  return service.generateEmbedding(text, model)
}

export async function generateBatchEmbeddings(
  texts: string[],
  model?: EmbeddingModel
): Promise<BatchEmbeddingResult> {
  const service = createEmbeddingsService()
  return service.generateBatchEmbeddings(texts, model)
}

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

export function getEmbeddingModelInfo(model: EmbeddingModel) {
  return EMBEDDING_MODELS[model]
}

export function estimateEmbeddingCost(
  textLength: number,
  _model: EmbeddingModel = DEFAULT_EMBEDDING_MODEL
): number {
  // Gemini embedding pricing not yet published — return 0 until confirmed
  return 0
}

// Alias for backward compatibility
export const generateEmbeddings = generateBatchEmbeddings
