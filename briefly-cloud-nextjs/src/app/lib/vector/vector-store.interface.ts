/**
 * Vector Store Interface
 * 
 * This interface abstracts vector storage operations to support multiple backends
 * (pgvector, ChromaDB, etc.) while maintaining consistent API and user isolation.
 */

export interface VectorDocument {
  id: string
  content: string
  embedding?: number[]
  metadata: {
    fileId: string
    fileName: string
    chunkIndex: number
    userId: string
    createdAt: string
    [key: string]: any
  }
}

export interface VectorSearchResult {
  id: string
  content: string
  metadata: Record<string, any>
  similarity: number
  distance: number
  fileId: string
  fileName: string
  chunkIndex: number
}

export interface VectorSearchOptions {
  limit?: number
  threshold?: number
  fileIds?: string[]
  includeMetadata?: boolean
}

export interface VectorStoreStats {
  documentCount: number
  userCollectionName: string
  isConnected: boolean
  backend: string
}

/**
 * Abstract Vector Store Interface
 * 
 * All vector storage implementations must implement this interface
 * to ensure consistent behavior and user isolation.
 */
export interface IVectorStore {
  /**
   * Store vector documents for a specific user
   * @param userId - User ID for tenant isolation
   * @param documents - Array of vector documents to store
   */
  addDocuments(userId: string, documents: VectorDocument[]): Promise<void>

  /**
   * Search for similar vectors within a user's collection
   * @param userId - User ID for tenant isolation
   * @param queryEmbedding - Query vector to search for
   * @param options - Search options (limit, threshold, etc.)
   */
  searchSimilar(
    userId: string, 
    queryEmbedding: number[], 
    options?: VectorSearchOptions
  ): Promise<VectorSearchResult[]>

  /**
   * Delete vectors for a specific file or all user vectors
   * @param userId - User ID for tenant isolation
   * @param fileId - Optional file ID to delete specific file vectors
   */
  deleteUserDocuments(userId: string, fileId?: string): Promise<void>

  /**
   * Get statistics about user's vector collection
   * @param userId - User ID for tenant isolation
   */
  getCollectionStats(userId: string): Promise<VectorStoreStats>

  /**
   * Check if the vector store is connected and operational
   */
  isConnected(): boolean

  /**
   * Get connection status and configuration info
   */
  getConnectionStatus(): {
    connected: boolean
    error: string | null
    backend: string
    config?: Record<string, any>
  }

  /**
   * Validate user access to prevent cross-user data access
   * @param userId - User ID to validate
   * @param resourceId - Optional resource ID to validate access to
   */
  validateUserAccess(userId: string, resourceId?: string): Promise<boolean>
}

/**
 * Vector Store Configuration
 */
export interface VectorStoreConfig {
  backend: 'pgvector' | 'chromadb'
  connectionString?: string
  apiKey?: string
  tenantId?: string
  dbName?: string
  host?: string
  port?: number
  ssl?: boolean
  maxConnections?: number
  timeout?: number
}

/**
 * Vector Store Factory Interface
 */
export interface IVectorStoreFactory {
  /**
   * Create a vector store instance with the specified configuration
   * @param config - Vector store configuration
   */
  createVectorStore(config: VectorStoreConfig): IVectorStore

  /**
   * Get the default vector store instance
   */
  getDefaultVectorStore(): IVectorStore

  /**
   * Create a user-specific vector store (for BYOK scenarios)
   * @param userId - User ID
   * @param userConfig - User-specific configuration
   */
  createUserVectorStore(userId: string, userConfig: Partial<VectorStoreConfig>): IVectorStore
}

/**
 * Embedding Service Interface
 */
export interface IEmbeddingService {
  /**
   * Generate embeddings for text content
   * @param text - Text to generate embeddings for
   * @param model - Optional model to use for embeddings
   */
  generateEmbedding(text: string, model?: string): Promise<{
    embedding: number[]
    model: string
    dimensions: number
  }>

  /**
   * Generate embeddings for multiple texts in batch
   * @param texts - Array of texts to generate embeddings for
   * @param model - Optional model to use for embeddings
   */
  generateEmbeddings(texts: string[], model?: string): Promise<{
    embeddings: number[][]
    model: string
    dimensions: number
  }>
}

/**
 * Document Processing Pipeline Interface
 */
export interface IDocumentProcessor {
  /**
   * Process a document and store its vectors
   * @param userId - User ID for tenant isolation
   * @param fileId - File ID
   * @param fileName - File name
   * @param content - Document content
   * @param metadata - Additional metadata
   */
  processDocument(
    userId: string,
    fileId: string,
    fileName: string,
    content: string,
    metadata?: Record<string, any>
  ): Promise<void>

  /**
   * Search for relevant document context
   * @param userId - User ID for tenant isolation
   * @param query - Search query
   * @param options - Search options
   */
  searchDocuments(
    userId: string,
    query: string,
    options?: VectorSearchOptions
  ): Promise<VectorSearchResult[]>

  /**
   * Delete document and its vectors
   * @param userId - User ID for tenant isolation
   * @param fileId - File ID to delete
   */
  deleteDocument(userId: string, fileId: string): Promise<void>
}
