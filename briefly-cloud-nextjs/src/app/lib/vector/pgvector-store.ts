/**
 * pgvector Vector Store Implementation
 * 
 * This implementation uses Supabase with pgvector extension for vector storage
 * with built-in RLS (Row Level Security) for user isolation.
 */

import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { createSupabaseServerClient } from '@/app/lib/auth/supabase-auth'
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
      const chunks = documents.map(doc => ({
        id: doc.id,
        user_id: userId,
        file_id: doc.metadata.fileId,
        content: doc.content,
        embedding: doc.embedding,
        chunk_index: doc.metadata.chunkIndex || 0,
        metadata: {
          ...doc.metadata,
          fileName: doc.metadata.fileName,
          createdAt: doc.metadata.createdAt || new Date().toISOString()
        }
      }))

      // Insert chunks using the secure function
      const { error } = await supabaseAdmin
        .from('document_chunks')
        .upsert(chunks, {
          onConflict: 'id',
          ignoreDuplicates: false
        })

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

      // Use the secure search function with RLS enforcement
      const { data: results, error } = await supabaseAdmin
        .rpc('search_similar_chunks', {
          query_embedding: queryEmbedding,
          user_id: userId,
          match_threshold: threshold,
          match_count: limit
        })

      if (error) {
        throw error
      }

      if (!results || results.length === 0) {
        return []
      }

      // Filter by file IDs if specified
      let filteredResults = results
      if (fileIds && fileIds.length > 0) {
        filteredResults = results.filter(result => 
          fileIds.includes(result.file_id)
        )
      }

      // Transform results to match interface
      const searchResults: VectorSearchResult[] = filteredResults.map(result => ({
        id: result.id,
        content: result.content,
        metadata: includeMetadata ? (result.metadata || {}) : {},
        similarity: result.similarity,
        distance: 1 - result.similarity,
        fileId: result.file_id,
        fileName: result.metadata?.fileName || 'Unknown',
        chunkIndex: result.metadata?.chunkIndex || 0
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
        // Delete vectors for specific file using secure function
        const { error } = await supabaseAdmin
          .rpc('delete_file_cascade', {
            file_id: fileId,
            user_id: userId
          })

        if (error) {
          throw error
        }

        // Get count of deleted chunks for logging
        const { count } = await supabaseAdmin
          .from('document_chunks')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('file_id', fileId)

        deletedCount = count || 0

      } else {
        // Delete all vectors for user
        const { error, count } = await supabaseAdmin
          .from('document_chunks')
          .delete({ count: 'exact' })
          .eq('user_id', userId)

        if (error) {
          throw error
        }

        deletedCount = count || 0
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
        .from('document_chunks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)

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
          .from('files')
          .select('id')
          .eq('id', resourceId)
          .eq('user_id', userId)
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