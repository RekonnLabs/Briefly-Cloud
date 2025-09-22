/**
 * pgvector Vector Store Implementation
 * 
 * This implementation uses Supabase with pgvector extension for vector storage
 * with built-in RLS (Row Level Security) for user isolation.
 */

import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'
import type {
  IVectorStore,
  VectorDocument,
  VectorSearchResult,
  VectorSearchOptions,
  VectorStoreStats,
  VectorStoreConfig
} from './vector-store.interface'
import type { AppFile } from '@/app/types/rag'

const CHUNKS_TABLE = 'app.document_chunks'
const FILES_TABLE = 'app.files'


/**
 * pgvector Vector Store Implementation
 */
export class PgVectorStore implements IVectorStore {
  private config: VectorStoreConfig
  private isInitialized: boolean = false
  private connectionError: Error | null = null

  constructor(config: Partial<VectorStoreConfig> = {}) {
    this.config = {
      backend: 'pgvector',
      maxConnections: 10,
      timeout: 30000,
      ...config
    }
    
    this.initialize()
  }

  /**
   * Initialize the pgvector store
   */
  private async initialize(): Promise<void> {
    try {
      // Test connection by checking if pgvector extension is available
      const { data, error } = await supabaseAdmin
        .rpc('test_pgvector_extension')
        .single()

      if (error) {
        // If the test function doesn't exist, create it
        await this.createTestFunction()
      }

      this.isInitialized = true
      this.connectionError = null
      
      logger.info('pgvector store initialized successfully')
    } catch (error) {
      this.connectionError = error as Error
      this.isInitialized = false
      
      logger.error('Failed to initialize pgvector store', error as Error)
    }
  }

  /**
   * Create test function for pgvector extension
   */
  private async createTestFunction(): Promise<void> {
    const { error } = await supabaseAdmin.rpc('exec_sql', {
      sql_query: `
        CREATE OR REPLACE FUNCTION test_pgvector_extension()
        RETURNS BOOLEAN AS $$
        BEGIN
          -- Test if vector type exists
          RETURN EXISTS (
            SELECT 1 FROM pg_type WHERE typname = 'vector'
          );
        END;
        $$ LANGUAGE plpgsql;
      `
    })

    if (error) {
      throw new Error(`Failed to create pgvector test function: ${error.message}`)
    }
  }

  /**
   * Add documents to the vector store
   */
  async addDocuments(userId: string, documents: VectorDocument[]): Promise<void> {
    if (!this.isInitialized) {
      throw createError.serviceUnavailable('pgvector store not initialized')
    }

    if (!documents || documents.length === 0) {
      return
    }

    try {
      // Validate user access
      await this.validateUserAccess(userId)

      // Prepare document chunks for insertion
      const now = new Date().toISOString()
      const chunks = documents.map((doc, index) => ({
        owner_id: userId,
        file_id: doc.metadata.fileId,
        chunk_index: doc.metadata.chunkIndex ?? index,
        content: doc.content,
        embedding: doc.embedding ?? null,
        token_count: doc.metadata.tokenCount ?? doc.metadata.tokens ?? null,
        created_at: doc.metadata.createdAt ?? now
      }))

      // Insert chunks into app.document_chunks
      const { error } = await supabaseAdmin
        .from(CHUNKS_TABLE)
        .insert(chunks)

      if (error) {
        throw error
      }

      // Log the operation
      await supabaseAdmin
        .from('private.audit_logs')
        .insert({
          user_id: userId,
          action: 'VECTORS_STORED',
          resource_type: 'vector_store',
          new_values: {
            document_count: documents.length,
            file_ids: [...new Set(documents.map(d => d.metadata.fileId))],
            backend: 'pgvector'
          },
          severity: 'info'
        })

      logger.info('Successfully stored vectors in pgvector', {
        userId,
        documentCount: documents.length,
        fileIds: [...new Set(documents.map(d => d.metadata.fileId))]
      })

    } catch (error) {
      logger.error('Failed to store vectors in pgvector', {
        userId,
        documentCount: documents.length
      }, error as Error)
      
      throw createError.databaseError('Failed to store vectors', error as Error)
    }
  }

  /**
   * Search for similar vectors
   */
  async searchSimilar(
    userId: string,
    queryEmbedding: number[],
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    if (!this.isInitialized) {
      throw createError.serviceUnavailable('pgvector store not initialized')
    }

    const {
      limit = 10,
      threshold = 0.7,
      fileIds,
      includeMetadata = true
    } = options

    try {
      // Validate user access
      await this.validateUserAccess(userId)

      // Use pgvector similarity search over app.document_chunks
      const { data: results, error } = await supabaseAdmin
        .rpc('match_document_chunks', {
          query_embedding: queryEmbedding,
          match_owner_id: userId,
          match_count: limit,
          match_threshold: threshold
        })

      if (error) {
        throw error
      }

      if (!results || results.length === 0) {
        return []
      }

      let filteredResults = results
      if (fileIds && fileIds.length > 0) {
        filteredResults = results.filter(result => fileIds.includes(result.file_id))
      }

      const uniqueFileIds = Array.from(new Set(filteredResults.map(result => result.file_id).filter(Boolean)))
      const fileNameMap = new Map<string, string>()

      if (uniqueFileIds.length > 0) {
        const { data: filesData, error: filesError } = await supabaseAdmin
          .from<AppFile>(FILES_TABLE)
          .select('id, name')
          .in('id', uniqueFileIds as string[])

        if (filesError) {
          throw filesError
        }

        filesData?.forEach((file) => {
          fileNameMap.set(file.id, file.name)
        })
      }

      const searchResults: VectorSearchResult[] = filteredResults.map(result => ({
        id: result.id?.toString() ?? `${result.file_id}:${result.chunk_index}`,
        content: result.content,
        metadata: includeMetadata
          ? {
              file_id: result.file_id,
              chunk_index: result.chunk_index,
              token_count: result.token_count ?? null
            }
          : {},
        similarity: typeof result.similarity === 'number' ? result.similarity : 0,
        distance: typeof result.similarity === 'number' ? 1 - result.similarity : 1,
        fileId: result.file_id,
        fileName: fileNameMap.get(result.file_id) ?? 'Unknown',
        chunkIndex: result.chunk_index ?? 0
      }))

      // Log the search operation
      await supabaseAdmin
        .from('usage_logs')
        .insert({
          user_id: userId,
          action: 'vector_search',
          resource_type: 'vector_store',
          metadata: {
            query_dimensions: queryEmbedding.length,
            results_count: searchResults.length,
            threshold,
            limit,
            backend: 'pgvector'
          }
        })

      logger.info('Vector search completed', {
        userId,
        queryDimensions: queryEmbedding.length,
        resultsFound: searchResults.length,
        threshold,
        limit
      })

      return searchResults

    } catch (error) {
      logger.error('Failed to search vectors in pgvector', {
        userId,
        queryDimensions: queryEmbedding.length,
        limit,
        threshold
      }, error as Error)

      throw createError.databaseError('Failed to search vectors', error as Error)
    }
  }

  /**
   * Delete user documents
   */
  async deleteUserDocuments(userId: string, fileId?: string): Promise<void> {
    if (!this.isInitialized) {
      throw createError.serviceUnavailable('pgvector store not initialized')
    }

    try {
      // Validate user access
      await this.validateUserAccess(userId, fileId)

      let deletedCount = 0

      if (fileId) {
        const { error, count } = await supabaseAdmin
          .from(CHUNKS_TABLE)
          .delete({ count: 'exact' })
          .eq('owner_id', userId)
          .eq('file_id', fileId)

        if (error) {
          throw error
        }

        deletedCount = count ?? 0

      } else {
        const { error, count } = await supabaseAdmin
          .from(CHUNKS_TABLE)
          .delete({ count: 'exact' })
          .eq('owner_id', userId)

        if (error) {
          throw error
        }

        deletedCount = count ?? 0
      }

      // Log the deletion
      await supabaseAdmin
        .from('private.audit_logs')
        .insert({
          user_id: userId,
          action: fileId ? 'FILE_VECTORS_DELETED' : 'ALL_VECTORS_DELETED',
          resource_type: 'vector_store',
          resource_id: fileId,
          old_values: {
            deleted_count: deletedCount,
            backend: 'pgvector'
          },
          severity: 'info'
        })

      logger.info('Successfully deleted vectors from pgvector', {
        userId,
        fileId,
        deletedCount
      })

    } catch (error) {
      logger.error('Failed to delete vectors from pgvector', {
        userId,
        fileId
      }, error as Error)

      throw createError.databaseError('Failed to delete vectors', error as Error)
    }
  }

  /**
   * Get collection statistics
   */
  async getCollectionStats(userId: string): Promise<VectorStoreStats> {
    try {
      // Validate user access
      await this.validateUserAccess(userId)

      // Get document count for user
      const { count, error } = await supabaseAdmin
        .from(CHUNKS_TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', userId)

      if (error) {
        throw error
      }

      return {
        documentCount: count || 0,
        userCollectionName: `user_${userId.replace(/-/g, '_')}_pgvector`,
        isConnected: this.isInitialized,
        backend: 'pgvector'
      }

    } catch (error) {
      logger.error('Failed to get collection stats from pgvector', {
        userId
      }, error as Error)

      return {
        documentCount: 0,
        userCollectionName: `user_${userId.replace(/-/g, '_')}_pgvector`,
        isConnected: false,
        backend: 'pgvector'
      }
    }
  }

  /**
   * Check if the vector store is connected
   */
  isConnected(): boolean {
    return this.isInitialized
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): {
    connected: boolean
    error: string | null
    backend: string
    config?: Record<string, any>
  } {
    return {
      connected: this.isInitialized,
      error: this.connectionError?.message || null,
      backend: 'pgvector',
      config: {
        maxConnections: this.config.maxConnections,
        timeout: this.config.timeout,
        hasSupabaseConnection: !!process.env.NEXT_PUBLIC_SUPABASE_URL
      }
    }
  }

  /**
   * Validate user access
   */
  async validateUserAccess(userId: string, resourceId?: string): Promise<boolean> {
    if (!userId) {
      throw createError.unauthorized('User ID is required for vector operations')
    }

    try {
      // Check if user exists in our system
      const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('id, subscription_status')
        .eq('id', userId)
        .single()

      if (error || !user) {
        throw createError.unauthorized('User not found or access denied')
      }

      // Check if user account is active
      if (user.subscription_status === 'canceled' || user.subscription_status === 'past_due') {
        throw createError.forbidden('Account access suspended')
      }

      // If resourceId is provided, validate access to that specific resource
      if (resourceId) {
        const { data: resource, error: resourceError } = await supabaseAdmin
          .from(FILES_TABLE)
          .select('id')
          .eq('id', resourceId)
          .eq('owner_id', userId)
          .single()

        if (resourceError || !resource) {
          throw createError.forbidden('Resource not found or access denied')
        }
      }

      return true

    } catch (error) {
      if (error instanceof Error && error.message.includes('UNAUTHORIZED')) {
        throw error
      }
      
      logger.error('Failed to validate user access', { userId, resourceId }, error as Error)
      throw createError.unauthorized('Access validation failed')
    }
  }

  /**
   * Get vector dimensions for the store
   */
  getVectorDimensions(): number {
    return 1536 // OpenAI embedding dimensions
  }

  /**
   * Test vector similarity search functionality
   */
  async testVectorSearch(userId: string): Promise<{
    success: boolean
    message: string
    dimensions?: number
  }> {
    try {
      // Create a test vector
      const testVector = new Array(this.getVectorDimensions()).fill(0).map(() => Math.random())
      
      // Perform a test search
      const results = await this.searchSimilar(userId, testVector, { limit: 1 })
      
      return {
        success: true,
        message: `Vector search test successful. Found ${results.length} results.`,
        dimensions: this.getVectorDimensions()
      }

    } catch (error) {
      return {
        success: false,
        message: `Vector search test failed: ${(error as Error).message}`
      }
    }
  }

  /**
   * Optimize vector indexes (maintenance operation)
   */
  async optimizeIndexes(): Promise<void> {
    try {
      // Reindex vector columns for better performance
      await supabaseAdmin.rpc('exec_sql', {
        sql_query: `
          REINDEX INDEX CONCURRENTLY idx_app_document_chunks_embedding;
          ANALYZE app.document_chunks;
        `
      })

      logger.info('pgvector indexes optimized successfully')

    } catch (error) {
      logger.error('Failed to optimize pgvector indexes', error as Error)
      throw createError.databaseError('Failed to optimize indexes', error as Error)
    }
  }
}
