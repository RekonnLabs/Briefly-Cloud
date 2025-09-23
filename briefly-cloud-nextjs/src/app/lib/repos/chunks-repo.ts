/**
 * Document Chunks Repository for App Schema
 * 
 * This repository handles document chunks stored in the app.document_chunks table
 * with proper user isolation and vector similarity search functionality.
 */

import { BaseRepository } from './base-repo'
import type { AppChunk } from '@/app/types/rag'

// Input types for repository operations
export interface InsertChunkInput {
  fileId: string
  ownerId: string
  chunkIndex: number
  content: string
  embedding?: number[] | null
  tokenCount?: number | null
  createdAt?: string
}

export interface SearchChunksInput {
  userId: string
  query: string
  embedding?: number[]
  limit?: number
  similarityThreshold?: number
  fileIds?: string[]
}

export interface ChunkSearchResult extends AppChunk {
  similarity?: number
  relevanceScore?: number
}

/**
 * Repository for managing document chunks in the app schema
 */
export class DocumentChunksRepository extends BaseRepository {
  private readonly tableName = 'document_chunks'

  /**
   * Insert multiple document chunks in a single operation
   * @param chunks - Array of chunks to insert
   */
  async bulkInsert(chunks: InsertChunkInput[]): Promise<void> {
    if (chunks.length === 0) return

    this.validateRequiredFields(
      { chunks },
      ['chunks'],
      'bulkInsert chunks array'
    )

    // Validate each chunk has required fields
    chunks.forEach((chunk, index) => {
      this.validateRequiredFields(
        chunk,
        ['fileId', 'ownerId', 'chunkIndex', 'content'],
        `chunk at index ${index}`
      )
    })

    const rows = chunks.map(chunk => ({
      file_id: chunk.fileId,
      owner_id: chunk.ownerId,
      chunk_index: chunk.chunkIndex,
      content: chunk.content,
      embedding: chunk.embedding ?? null,
      token_count: chunk.tokenCount ?? null,
      created_at: chunk.createdAt ?? new Date().toISOString(),
    }))

    try {
      const { error } = await this.appClient
        .from(this.tableName)
        .insert(rows)

      if (error) {
        this.handleDatabaseError(error, 'bulkInsert document chunks')
      }
    } catch (error) {
      this.handleDatabaseError(error, 'bulkInsert document chunks')
    }
  }

  /**
   * Delete all chunks for a specific file
   * @param ownerId - The owner of the file
   * @param fileId - The file ID to delete chunks for
   */
  async deleteByFile(ownerId: string, fileId: string): Promise<void> {
    this.validateRequiredFields(
      { ownerId, fileId },
      ['ownerId', 'fileId'],
      'deleteByFile parameters'
    )

    try {
      const { error } = await this.appClient
        .from(this.tableName)
        .delete()
        .eq('file_id', fileId)
        .eq('owner_id', ownerId)

      if (error) {
        this.handleDatabaseError(error, `deleteByFile for file ${fileId}`)
      }
    } catch (error) {
      this.handleDatabaseError(error, `deleteByFile for file ${fileId}`)
    }
  }

  /**
   * Get all chunks for a specific file with proper user isolation
   * @param ownerId - The owner of the file
   * @param fileId - The file ID to get chunks for
   * @returns Array of document chunks ordered by chunk index
   */
  async getByFile(ownerId: string, fileId: string): Promise<AppChunk[]> {
    this.validateRequiredFields(
      { ownerId, fileId },
      ['ownerId', 'fileId'],
      'getByFile parameters'
    )

    try {
      const { data, error } = await this.appClient
        .from(this.tableName)
        .select('*')
        .eq('file_id', fileId)
        .eq('owner_id', ownerId)
        .order('chunk_index', { ascending: true })

      if (error) {
        this.handleDatabaseError(error, `getByFile for file ${fileId}`)
      }

      return (data ?? []).map(this.mapRecord)
    } catch (error) {
      this.handleDatabaseError(error, `getByFile for file ${fileId}`)
    }
  }

  /**
   * Get all chunks for a specific user
   * @param userId - The user ID to get chunks for
   * @param limit - Maximum number of chunks to return
   * @param offset - Number of chunks to skip
   * @returns Array of document chunks
   */
  async getByUser(userId: string, limit = 100, offset = 0): Promise<AppChunk[]> {
    this.validateRequiredFields(
      { userId },
      ['userId'],
      'getByUser parameters'
    )

    try {
      const { data, error } = await this.appClient
        .from(this.tableName)
        .select('*')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) {
        this.handleDatabaseError(error, `getByUser for user ${userId}`)
      }

      return (data ?? []).map(this.mapRecord)
    } catch (error) {
      this.handleDatabaseError(error, `getByUser for user ${userId}`)
    }
  }

  /**
   * Search document chunks using text search with proper user filtering
   * @param searchInput - Search parameters including user ID and query
   * @returns Array of matching chunks with relevance scores
   */
  async searchByText(searchInput: SearchChunksInput): Promise<ChunkSearchResult[]> {
    this.validateRequiredFields(
      searchInput,
      ['userId', 'query'],
      'searchByText parameters'
    )

    const { userId, query, limit = 10, fileIds } = searchInput

    try {
      let queryBuilder = this.appClient
        .from(this.tableName)
        .select('*')
        .eq('owner_id', userId)
        .textSearch('content', query, { type: 'websearch' })
        .order('created_at', { ascending: false })
        .limit(limit)

      // Filter by specific files if provided
      if (fileIds && fileIds.length > 0) {
        queryBuilder = queryBuilder.in('file_id', fileIds)
      }

      const { data, error } = await queryBuilder

      if (error) {
        this.handleDatabaseError(error, `searchByText for user ${userId}`)
      }

      return (data ?? []).map(record => ({
        ...this.mapRecord(record),
        relevanceScore: 1.0 // Text search doesn't provide similarity scores
      }))
    } catch (error) {
      this.handleDatabaseError(error, `searchByText for user ${userId}`)
    }
  }

  /**
   * Search document chunks using vector similarity with proper user filtering
   * @param searchInput - Search parameters including user ID and embedding
   * @returns Array of matching chunks with similarity scores
   */
  async searchByVector(searchInput: SearchChunksInput): Promise<ChunkSearchResult[]> {
    this.validateRequiredFields(
      searchInput,
      ['userId', 'embedding'],
      'searchByVector parameters'
    )

    const { 
      userId, 
      embedding, 
      limit = 10, 
      similarityThreshold = 0.7,
      fileIds 
    } = searchInput

    if (!embedding || embedding.length === 0) {
      throw new Error('Embedding vector is required for vector similarity search')
    }

    try {
      // Use RPC function for vector similarity search if available
      // This would need to be implemented as a database function
      const rpcParams = {
        query_embedding: embedding,
        user_id: userId,
        similarity_threshold: similarityThreshold,
        match_count: limit,
        file_ids: fileIds || null
      }

      const { data, error } = await this.appClient
        .rpc('search_document_chunks_by_similarity', rpcParams)

      if (error) {
        // Fallback to basic search if RPC function doesn't exist
        console.warn('Vector similarity RPC function not available, falling back to text search')
        return this.searchByText({ ...searchInput, query: searchInput.query || '' })
      }

      return (data ?? []).map((record: any) => ({
        ...this.mapRecord(record),
        similarity: record.similarity || 0,
        relevanceScore: record.similarity || 0
      }))
    } catch (error) {
      this.handleDatabaseError(error, `searchByVector for user ${userId}`)
    }
  }

  /**
   * Get relevant context chunks for chat functionality
   * This combines text and vector search for optimal results
   * @param searchInput - Search parameters
   * @returns Array of relevant chunks for chat context
   */
  async getRelevantContext(searchInput: SearchChunksInput): Promise<ChunkSearchResult[]> {
    this.validateRequiredFields(
      searchInput,
      ['userId', 'query'],
      'getRelevantContext parameters'
    )

    const { userId, query, limit = 5 } = searchInput

    try {
      // If embedding is provided, use vector search
      if (searchInput.embedding && searchInput.embedding.length > 0) {
        return this.searchByVector({
          ...searchInput,
          limit
        })
      }

      // Otherwise, use text search
      return this.searchByText({
        ...searchInput,
        limit
      })
    } catch (error) {
      this.handleDatabaseError(error, `getRelevantContext for user ${userId}`)
    }
  }

  /**
   * Get chunk statistics for a user
   * @param userId - The user ID to get statistics for
   * @returns Object containing chunk statistics
   */
  async getChunkStats(userId: string): Promise<{
    totalChunks: number
    totalFiles: number
    avgChunksPerFile: number
  }> {
    this.validateRequiredFields(
      { userId },
      ['userId'],
      'getChunkStats parameters'
    )

    try {
      const { data, error } = await this.appClient
        .from(this.tableName)
        .select('file_id')
        .eq('owner_id', userId)

      if (error) {
        this.handleDatabaseError(error, `getChunkStats for user ${userId}`)
      }

      const chunks = data ?? []
      const uniqueFiles = new Set(chunks.map(chunk => chunk.file_id))
      
      return {
        totalChunks: chunks.length,
        totalFiles: uniqueFiles.size,
        avgChunksPerFile: uniqueFiles.size > 0 ? chunks.length / uniqueFiles.size : 0
      }
    } catch (error) {
      this.handleDatabaseError(error, `getChunkStats for user ${userId}`)
    }
  }

  /**
   * Map database record to AppChunk interface
   * @param record - Raw database record
   * @returns Mapped AppChunk object
   */
  private mapRecord(record: Record<string, any>): AppChunk {
    return {
      id: Number(record.id),
      file_id: record.file_id,
      owner_id: record.owner_id,
      chunk_index: record.chunk_index,
      content: record.content,
      embedding: record.embedding ?? null,
      token_count: record.token_count ?? null,
      created_at: record.created_at ?? new Date().toISOString(),
    }
  }
}

// Export singleton instance
export const chunksRepo = new DocumentChunksRepository()

