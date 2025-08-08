/**
 * ChromaDB Vector Storage Integration
 * Handles vector storage and retrieval with ChromaDB Cloud and local fallback
 */

import { ChromaClient, CloudClient, Collection } from 'chromadb'
import { createClient } from '@supabase/supabase-js'
import { createError } from './api-errors'
import { logger } from './logger'
import { DocumentChunk } from './document-chunker'

// ChromaDB Configuration
export interface ChromaConfig {
  apiKey?: string
  tenantId?: string
  dbName?: string
  host?: string
  port?: number
  ssl?: boolean
}

// Vector search result interface
export interface VectorSearchResult {
  id: string
  content: string
  metadata: Record<string, any>
  distance: number
  relevanceScore: number
  fileId: string
  fileName: string
  chunkIndex: number
}

// Vector storage interface
export interface VectorDocument {
  id: string
  content: string
  embedding: number[]
  metadata: {
    fileId: string
    fileName: string
    chunkIndex: number
    userId: string
    createdAt: string
    [key: string]: any
  }
}

// Default configuration
const DEFAULT_CHROMA_CONFIG: ChromaConfig = {
  host: 'api.trychroma.com',
  port: 443,
  ssl: true,
  dbName: process.env.CHROMA_DB_NAME || 'briefly-cloud',
}

/**
 * ChromaDB Vector Storage Service
 */
export class VectorStorageService {
  private client: ChromaClient | CloudClient | null = null
  private config: ChromaConfig
  private isConnected: boolean = false
  private connectionError: Error | null = null

  constructor(config: Partial<ChromaConfig> = {}) {
    this.config = { ...DEFAULT_CHROMA_CONFIG, ...config }
    this.initializeClient()
  }

  /**
   * Initialize ChromaDB client
   */
  private async initializeClient(): Promise<void> {
    try {
      const backend = (process.env.VECTOR_BACKEND || 'chroma').toLowerCase()

      // Try ChromaDB Cloud first if configured as primary (default) and API key is available
      if (backend === 'chroma' && this.config.apiKey && this.config.tenantId) {
        logger.info('Initializing ChromaDB Cloud client')
        
        this.client = new CloudClient({
          apiKey: this.config.apiKey,
          tenant: this.config.tenantId,
          database: this.config.dbName || 'default',
        })
        
        // Test connection
        await this.testConnection()
        this.isConnected = true
        this.connectionError = null
        
        logger.info('ChromaDB Cloud client initialized successfully')
        return
      }

      // Fallback to local/HTTP Chroma client; if VECTOR_BACKEND=pgvector we will mark as not connected
      if (backend === 'pgvector') {
        logger.info('VECTOR_BACKEND=pgvector, skipping Chroma client init (using Supabase fallback)')
        this.client = null
        this.isConnected = false
        this.connectionError = null
        return
      }

      logger.info('Initializing local ChromaDB client')
      
      this.client = new ChromaClient({
        path: `http${this.config.ssl ? 's' : ''}://${this.config.host}:${this.config.port}`,
      })
      
      // Test connection
      await this.testConnection()
      this.isConnected = true
      this.connectionError = null
      
      logger.info('Local ChromaDB client initialized successfully')

    } catch (error) {
      this.connectionError = error as Error
      this.isConnected = false
      
      logger.error('Failed to initialize ChromaDB client', {
        host: this.config.host,
        port: this.config.port,
        hasApiKey: !!this.config.apiKey,
      }, error as Error)
      
      // Don't throw here - allow graceful degradation
    }
  }

  /**
   * Test ChromaDB connection
   */
  private async testConnection(): Promise<void> {
    if (!this.client) {
      throw new Error('ChromaDB client not initialized')
    }

    try {
      // Try to list collections as a connection test
      await this.client.listCollections()
    } catch (error) {
      throw new Error(`ChromaDB connection test failed: ${(error as Error).message}`)
    }
  }

  /**
   * Get or create user collection
   */
  private async getUserCollection(userId: string): Promise<Collection> {
    if (!this.client) {
      throw createError.serviceUnavailable('ChromaDB client not available')
    }

    const collectionName = `user_${userId.replace(/-/g, '_')}`

    try {
      // Try to get existing collection
      const collection = await this.client.getCollection({
        name: collectionName,
      })
      
      return collection
    } catch (error) {
      // Collection doesn't exist, create it
      logger.info(`Creating new collection for user: ${userId}`)
      
      const collection = await this.client.createCollection({
        name: collectionName,
        metadata: {
          userId,
          createdAt: new Date().toISOString(),
          description: `Document vectors for user ${userId}`,
        },
      })
      
      return collection
    }
  }

  /**
   * Store vectors in ChromaDB
   */
  async storeVectors(
    documents: VectorDocument[],
    userId: string
  ): Promise<void> {
    if (!this.isConnected || !this.client) {
      // Fallback to Supabase storage
      return this.fallbackToSupabase(documents, userId)
    }

    try {
      const collection = await this.getUserCollection(userId)
      
      // Prepare data for ChromaDB
      const ids = documents.map(doc => doc.id)
      const embeddings = documents.map(doc => doc.embedding)
      const metadatas = documents.map(doc => doc.metadata)
      const documents_content = documents.map(doc => doc.content)

      // Add documents to collection
      await collection.add({
        ids,
        embeddings,
        metadatas,
        documents: documents_content,
      })

      logger.info(`Stored ${documents.length} vectors in ChromaDB`, {
        userId,
        collectionName: collection.name,
        documentCount: documents.length,
      })

    } catch (error) {
      logger.error('Failed to store vectors in ChromaDB', {
        userId,
        documentCount: documents.length,
      }, error as Error)

      // Fallback to Supabase
      return this.fallbackToSupabase(documents, userId)
    }
  }

  /**
   * Search vectors in ChromaDB
   */
  async searchVectors(
    queryEmbedding: number[],
    userId: string,
    options: {
      limit?: number
      threshold?: number
      fileIds?: string[]
    } = {}
  ): Promise<VectorSearchResult[]> {
    const { limit = 10, threshold = 0.7, fileIds } = options

    if (!this.isConnected || !this.client) {
      // Fallback to Supabase search or pgvector
      return this.fallbackSearchSupabase(queryEmbedding, userId, options)
    }

    try {
      const collection = await this.getUserCollection(userId)

      // Build where clause for filtering
      let whereClause: Record<string, any> | undefined
      if (fileIds && fileIds.length > 0) {
        whereClause = {
          fileId: { $in: fileIds }
        }
      }

      // Query ChromaDB
      const results = await collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: limit,
        where: whereClause,
        include: ['metadatas', 'documents', 'distances'],
      })

      // Process results
      const searchResults: VectorSearchResult[] = []
      
      if (results.ids && results.ids[0]) {
        for (let i = 0; i < results.ids[0].length; i++) {
          const distance = results.distances?.[0]?.[i] || 1.0
          const relevanceScore = Math.max(0, 1 - distance) // Convert distance to relevance score
          
          // Apply threshold filter
          if (relevanceScore < threshold) {
            continue
          }

          const metadata = results.metadatas?.[0]?.[i] || {}
          const content = results.documents?.[0]?.[i] || ''

          searchResults.push({
            id: results.ids[0][i],
            content,
            metadata,
            distance,
            relevanceScore,
            fileId: metadata.fileId || '',
            fileName: metadata.fileName || 'Unknown',
            chunkIndex: metadata.chunkIndex || 0,
          })
        }
      }

      // Sort by relevance score (highest first)
      searchResults.sort((a, b) => b.relevanceScore - a.relevanceScore)

      logger.info(`Vector search completed`, {
        userId,
        queryLength: queryEmbedding.length,
        resultsFound: searchResults.length,
        threshold,
        limit,
      })

      return searchResults

    } catch (error) {
      logger.error('Failed to search vectors in ChromaDB', {
        userId,
        queryLength: queryEmbedding.length,
        limit,
        threshold,
      }, error as Error)

      // Fallback to Supabase search
      return this.fallbackSearchSupabase(queryEmbedding, userId, options)
    }
  }

  /**
   * Delete vectors for a specific file
   */
  async deleteFileVectors(fileId: string, userId: string): Promise<void> {
    if (!this.isConnected || !this.client) {
      return this.fallbackDeleteSupabase(fileId, userId)
    }

    try {
      const collection = await this.getUserCollection(userId)

      // Delete vectors with matching fileId
      await this.client.delete({
        collectionName: collection.name!,
        where: { fileId },
      })

      logger.info(`Deleted vectors for file`, {
        userId,
        fileId,
        collectionName: collection.name,
      })

    } catch (error) {
      logger.error('Failed to delete file vectors from ChromaDB', {
        userId,
        fileId,
      }, error as Error)

      // Fallback to Supabase
      return this.fallbackDeleteSupabase(fileId, userId)
    }
  }

  /**
   * Get collection statistics
   */
  async getCollectionStats(userId: string): Promise<{
    documentCount: number
    collectionName: string
    isConnected: boolean
  }> {
    if (!this.isConnected || !this.client) {
      return {
        documentCount: 0,
        collectionName: `user_${userId.replace(/-/g, '_')}`,
        isConnected: false,
      }
    }

    try {
      const collection = await this.getUserCollection(userId)
      
      const count = await this.client.count({
        collectionName: collection.name!,
      })

      return {
        documentCount: count,
        collectionName: collection.name!,
        isConnected: true,
      }

    } catch (error) {
      logger.error('Failed to get collection stats', { userId }, error as Error)
      
      return {
        documentCount: 0,
        collectionName: `user_${userId.replace(/-/g, '_')}`,
        isConnected: false,
      }
    }
  }

  /**
   * Fallback to Supabase for vector storage
   */
  private async fallbackToSupabase(
    documents: VectorDocument[],
    userId: string
  ): Promise<void> {
    logger.info('Using Supabase fallback for vector storage', {
      userId,
      documentCount: documents.length,
    })

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    )

    // Store vectors in document_chunks table with embeddings
    const chunkData = documents.map(doc => ({
      id: doc.id,
      file_id: doc.metadata.fileId,
      user_id: userId,
      chunk_index: doc.metadata.chunkIndex,
      content: doc.content,
      embedding: doc.embedding,
      metadata: doc.metadata,
    }))

    const { error } = await supabase
      .from('document_chunks')
      .upsert(chunkData)

    if (error) {
      throw createError.supabaseError('Failed to store vectors in Supabase fallback', error)
    }
  }

  /**
   * Fallback to Supabase for vector search
   */
  private async fallbackSearchSupabase(
    queryEmbedding: number[],
    userId: string,
    options: {
      limit?: number
      threshold?: number
      fileIds?: string[]
    } = {}
  ): Promise<VectorSearchResult[]> {
    const { limit = 10, threshold = 0.7, fileIds } = options

    logger.info('Using Supabase fallback for vector search', {
      userId,
      queryLength: queryEmbedding.length,
      limit,
      threshold,
    })

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    )

    // Build query
    let query = supabase
      .from('document_chunks')
      .select(`
        id,
        content,
        embedding,
        metadata,
        file_id,
        chunk_index,
        file_metadata!inner(name)
      `)
      .eq('user_id', userId)
      .not('embedding', 'is', null)

    // Add file filter if specified
    if (fileIds && fileIds.length > 0) {
      query = query.in('file_id', fileIds)
    }

    const { data: chunks, error } = await query.limit(limit * 2) // Get more for filtering

    if (error) {
      throw createError.supabaseError('Failed to search vectors in Supabase fallback', error)
    }

    if (!chunks || chunks.length === 0) {
      return []
    }

    // Calculate similarities
    const results: VectorSearchResult[] = []
    
    for (const chunk of chunks) {
      if (!chunk.embedding || chunk.embedding.length === 0) {
        continue
      }

      const similarity = this.calculateCosineSimilarity(queryEmbedding, chunk.embedding)
      
      if (similarity < threshold) {
        continue
      }

      results.push({
        id: chunk.id,
        content: chunk.content,
        metadata: chunk.metadata || {},
        distance: 1 - similarity,
        relevanceScore: similarity,
        fileId: chunk.file_id,
        fileName: (chunk.file_metadata as any)?.name || 'Unknown',
        chunkIndex: chunk.chunk_index,
      })
    }

    // Sort by relevance and limit results
    results.sort((a, b) => b.relevanceScore - a.relevanceScore)
    return results.slice(0, limit)
  }

  /**
   * Fallback to Supabase for vector deletion
   */
  private async fallbackDeleteSupabase(fileId: string, userId: string): Promise<void> {
    logger.info('Using Supabase fallback for vector deletion', {
      userId,
      fileId,
    })

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    )

    const { error } = await supabase
      .from('document_chunks')
      .delete()
      .eq('file_id', fileId)
      .eq('user_id', userId)

    if (error) {
      throw createError.supabaseError('Failed to delete vectors in Supabase fallback', error)
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private calculateCosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same dimensions')
    }

    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
  }

  /**
   * Check if ChromaDB is connected
   */
  isChromaConnected(): boolean {
    return this.isConnected
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): {
    connected: boolean
    error: string | null
    config: Partial<ChromaConfig>
  } {
    return {
      connected: this.isConnected,
      error: this.connectionError?.message || null,
      config: {
        host: this.config.host,
        port: this.config.port,
        ssl: this.config.ssl,
        hasApiKey: !!this.config.apiKey,
        hasTenantId: !!this.config.tenantId,
      },
    }
  }
}

/**
 * Convenience functions
 */

// Create vector storage service with system configuration
export function createVectorStorageService(config?: Partial<ChromaConfig>): VectorStorageService {
  const systemConfig: ChromaConfig = {
    apiKey: process.env.CHROMA_API_KEY,
    tenantId: process.env.CHROMA_TENANT_ID,
    dbName: process.env.CHROMA_DB_NAME,
    ...config,
  }

  return new VectorStorageService(systemConfig)
}

// Create vector storage service with user configuration (for BYOK)
export function createUserVectorStorageService(
  userConfig: Partial<ChromaConfig>,
  systemConfig?: Partial<ChromaConfig>
): VectorStorageService {
  const config = {
    ...systemConfig,
    ...userConfig,
  }

  return new VectorStorageService(config)
}

// Convert document chunks to vector documents
export function chunksToVectorDocuments(
  chunks: DocumentChunk[],
  embeddings: number[][],
  userId: string,
  fileName: string
): VectorDocument[] {
  if (chunks.length !== embeddings.length) {
    throw new Error('Chunks and embeddings arrays must have the same length')
  }

  return chunks.map((chunk, index) => ({
    id: `${chunk.fileId}_${chunk.chunkIndex}`,
    content: chunk.content,
    embedding: embeddings[index],
    metadata: {
      fileId: chunk.fileId,
      fileName,
      chunkIndex: chunk.chunkIndex,
      userId,
      createdAt: new Date().toISOString(),
      ...chunk.metadata,
    },
  }))
}

// Search for relevant document context
export async function searchDocumentContext(
  query: string,
  userId: string,
  options: {
    limit?: number
    threshold?: number
    fileIds?: string[]
    embeddingService?: any // EmbeddingsService instance
  } = {}
): Promise<VectorSearchResult[]> {
  const { limit = 5, threshold = 0.7, fileIds, embeddingService } = options

  // Generate query embedding
  let queryEmbedding: number[]
  
  if (embeddingService) {
    const result = await embeddingService.generateEmbedding(query)
    queryEmbedding = result.embedding
  } else {
    // Use default embeddings service
    const { generateEmbedding } = await import('./embeddings')
    const result = await generateEmbedding(query)
    queryEmbedding = result.embedding
  }

  // Search vectors
  const vectorStorage = createVectorStorageService()
  return vectorStorage.searchVectors(queryEmbedding, userId, {
    limit,
    threshold,
    fileIds,
  })
}

// Store document chunks with embeddings
export async function storeDocumentVectors(
  chunks: DocumentChunk[],
  embeddings: number[][],
  userId: string,
  fileName: string
): Promise<void> {
  const vectorDocuments = chunksToVectorDocuments(chunks, embeddings, userId, fileName)
  const vectorStorage = createVectorStorageService()
  
  return vectorStorage.storeVectors(vectorDocuments, userId)
}

// Delete document vectors
export async function deleteDocumentVectors(
  fileId: string,
  userId: string
): Promise<void> {
  const vectorStorage = createVectorStorageService()
  return vectorStorage.deleteFileVectors(fileId, userId)
}

// Get user's vector storage statistics
export async function getUserVectorStats(userId: string): Promise<{
  documentCount: number
  collectionName: string
  isConnected: boolean
}> {
  const vectorStorage = createVectorStorageService()
  return vectorStorage.getCollectionStats(userId)
}