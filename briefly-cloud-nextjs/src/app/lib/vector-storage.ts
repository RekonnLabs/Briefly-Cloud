/**
 * Vector Storage - pgvector Implementation
 * 
 * This file provides backward compatibility exports while using the new
 * pgvector-based vector storage system.
 */

// Re-export from new vector system for backward compatibility
export {
  getVectorStore,
  getUserVectorStore,
  createVectorStore,
  isVectorStoreAvailable,
  getVectorStoreHealth
} from './vector/vector-store-factory'

export {
  processDocument as storeDocumentVectors,
  searchDocuments as searchDocumentContext,
  deleteDocument as deleteDocumentVectors
} from './vector/document-processor'

export type {
  VectorDocument,
  VectorSearchResult,
  VectorSearchOptions,
  VectorStoreStats
} from './vector/vector-store.interface'

import { getVectorStore } from './vector/vector-store-factory'
import { DocumentChunk } from './document-chunker'

// Legacy compatibility types
export interface ChromaConfig {
  apiKey?: string
  tenantId?: string
  dbName?: string
  host?: string
  port?: number
  ssl?: boolean
}

// Legacy VectorStorageService interface for backward compatibility
export interface VectorStorageService {
  storeVectors: (documents: any[], userId: string) => Promise<void>
  searchVectors: (queryEmbedding: number[], userId: string, options?: any) => Promise<any[]>
  deleteFileVectors: (fileId: string, userId: string) => Promise<void>
  getCollectionStats: (userId: string) => Promise<any>
  isChromaConnected: () => boolean
  getConnectionStatus: () => any
}

/**
 * Legacy VectorStorageService class for backward compatibility
 */
export class VectorStorageService {
  private vectorStore = getVectorStore()

  async storeVectors(documents: any[], userId: string): Promise<void> {
    return this.vectorStore.addDocuments(userId, documents)
  }

  async searchVectors(
    queryEmbedding: number[], 
    userId: string, 
    options: any = {}
  ): Promise<any[]> {
    const results = await this.vectorStore.searchSimilar(userId, queryEmbedding, options)
    
    // Convert to legacy format
    return results.map(result => ({
      ...result,
      relevanceScore: result.similarity,
      distance: result.distance
    }))
  }

  async deleteFileVectors(fileId: string, userId: string): Promise<void> {
    return this.vectorStore.deleteUserDocuments(userId, fileId)
  }

  async getCollectionStats(userId: string): Promise<any> {
    const stats = await this.vectorStore.getCollectionStats(userId)
    return {
      documentCount: stats.documentCount,
      collectionName: stats.userCollectionName,
      isConnected: stats.isConnected
    }
  }

  isChromaConnected(): boolean {
    return this.vectorStore.isConnected()
  }

  getConnectionStatus(): any {
    const status = this.vectorStore.getConnectionStatus()
    return {
      connected: status.connected,
      error: status.error,
      config: {
        backend: status.backend,
        ...status.config
      }
    }
  }
}

/**
 * Legacy function exports for compatibility
 */
export function createVectorStorageService(config?: Partial<ChromaConfig>): VectorStorageService {
  return new VectorStorageService()
}

export function createUserVectorStorageService(
  userConfig: Partial<ChromaConfig>,
  systemConfig?: Partial<ChromaConfig>
): VectorStorageService {
  return new VectorStorageService()
}

export function chunksToVectorDocuments(
  chunks: DocumentChunk[],
  embeddings: number[][],
  userId: string,
  fileName: string
): any[] {
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

// searchDocumentContext is already exported above as an alias for searchDocuments

// storeDocumentVectors is already exported above as an alias for processDocument

// deleteDocumentVectors is already exported above as an alias for deleteDocument

// Legacy stats function
export async function getUserVectorStats(userId: string): Promise<{
  documentCount: number
  collectionName: string
  isConnected: boolean
}> {
  const vectorStore = getVectorStore()
  const stats = await vectorStore.getCollectionStats(userId)
  return {
    documentCount: stats.documentCount,
    collectionName: stats.userCollectionName,
    isConnected: stats.isConnected
  }
}