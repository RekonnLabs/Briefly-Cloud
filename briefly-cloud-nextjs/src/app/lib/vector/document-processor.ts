/**
 * Document Processor with Vector Storage
 * 
 * This service handles the complete document processing pipeline:
 * text extraction -> chunking -> embedding generation -> vector storage
 */

import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'
import { getVectorStore } from './vector-store-factory'
import { generateEmbedding, generateEmbeddings } from '@/app/lib/embeddings'
import { createTextChunks } from '@/app/lib/document-chunker'
import { supabaseAdmin } from '@/app/lib/supabase-admin'
const FILES_TABLE = 'app.files'
const CHUNKS_TABLE = 'app.document_chunks'

import type {
  IDocumentProcessor,
  VectorDocument,
  VectorSearchResult,
  VectorSearchOptions
} from './vector-store.interface'

/**
 * Document Processor Implementation
 */
export class DocumentProcessor implements IDocumentProcessor {
  private vectorStore = getVectorStore()

  /**
   * Process a document and store its vectors
   */
  async processDocument(
    userId: string,
    fileId: string,
    fileName: string,
    content: string,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    try {
      logger.info('Starting document processing', {
        userId,
        fileId,
        fileName,
        contentLength: content.length
      })

      // Step 1: Create text chunks
      const chunks = createTextChunks(content, {
        chunkSize: 1000,
        chunkOverlap: 200,
        fileId,
        fileName
      })

      if (chunks.length === 0) {
        logger.warn('No chunks created from document', { userId, fileId, fileName })
        return
      }

      // Step 2: Generate embeddings for all chunks
      const chunkTexts = chunks.map(chunk => chunk.content)
      const embeddingResult = await generateEmbeddings(chunkTexts)

      if (embeddingResult.embeddings.length !== chunks.length) {
        throw new Error('Mismatch between chunks and embeddings count')
      }

      // Step 3: Create vector documents
      const vectorDocuments: VectorDocument[] = chunks.map((chunk, index) => ({
        id: `${fileId}_${chunk.chunkIndex}`,
        content: chunk.content,
        embedding: embeddingResult.embeddings[index],
        metadata: {
          fileId,
          fileName,
          chunkIndex: chunk.chunkIndex,
          userId,
          createdAt: new Date().toISOString(),
          embeddingModel: embeddingResult.model,
          embeddingDimensions: embeddingResult.dimensions,
          ...metadata,
          ...chunk.metadata
        }
      }))

      // Step 4: Store vectors in the vector store
      await this.vectorStore.addDocuments(userId, vectorDocuments)

      // Step 5: Update file processing status
      await supabaseAdmin
        .from(FILES_TABLE)
        .update({
          processed: true,
          processing_status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', fileId)
        .eq('owner_id', userId)

      // Step 6: Log usage for analytics
      await supabaseAdmin
        .from('usage_logs')
        .insert({
          user_id: userId,
          action: 'document_processed',
          resource_type: 'document',
          resource_id: fileId,
          quantity: chunks.length,
          metadata: {
            file_name: fileName,
            content_length: content.length,
            chunks_created: chunks.length,
            embedding_model: embeddingResult.model,
            processing_time: Date.now()
          }
        })

      logger.info('Document processing completed successfully', {
        userId,
        fileId,
        fileName,
        chunksCreated: chunks.length,
        embeddingModel: embeddingResult.model
      })

    } catch (error) {
      logger.error('Document processing failed', {
        userId,
        fileId,
        fileName
      }, error as Error)

      // Update file status to failed
      try {
        await supabaseAdmin
          .from(FILES_TABLE)
          .update({
            processed: false,
            processing_status: 'failed',
            updated_at: new Date().toISOString()
          })
          .eq('id', fileId)
          .eq('owner_id', userId)
      } catch (updateError) {
        logger.error('Failed to update file status after processing error', updateError as Error)
      }

      throw createError.processingError('Document processing failed', error as Error)
    }
  }

  /**
   * Search for relevant document context
   */
  async searchDocuments(
    userId: string,
    query: string,
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    try {
      logger.info('Starting document search', {
        userId,
        query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
        options
      })

      // Step 1: Generate embedding for the query
      const embeddingResult = await generateEmbedding(query)

      // Step 2: Search for similar vectors
      const results = await this.vectorStore.searchSimilar(
        userId,
        embeddingResult.embedding,
        options
      )

      // Step 3: Log search usage
      await supabaseAdmin
        .from('usage_logs')
        .insert({
          user_id: userId,
          action: 'document_search',
          resource_type: 'search',
          quantity: 1,
          metadata: {
            query_length: query.length,
            results_count: results.length,
            embedding_model: embeddingResult.model,
            search_options: options
          }
        })

      logger.info('Document search completed', {
        userId,
        queryLength: query.length,
        resultsFound: results.length,
        embeddingModel: embeddingResult.model
      })

      return results

    } catch (error) {
      logger.error('Document search failed', {
        userId,
        queryLength: query.length
      }, error as Error)

      throw createError.searchError('Document search failed', error as Error)
    }
  }

  /**
   * Delete document and its vectors
   */
  async deleteDocument(userId: string, fileId: string): Promise<void> {
    try {
      logger.info('Starting document deletion', { userId, fileId })

      // Step 1: Delete vectors from vector store
      await this.vectorStore.deleteUserDocuments(userId, fileId)

      // Step 2: Delete file metadata (this will cascade to chunks via foreign key)
      const { error } = await supabaseAdmin
        .from(FILES_TABLE)
        .delete()
        .eq('id', fileId)
        .eq('owner_id', userId)

      if (error) {
        throw error
      }

      // Step 3: Log deletion
      await supabaseAdmin
        .from('usage_logs')
        .insert({
          user_id: userId,
          action: 'document_deleted',
          resource_type: 'document',
          resource_id: fileId,
          quantity: 1,
          metadata: {
            deleted_at: new Date().toISOString()
          }
        })

      logger.info('Document deletion completed', { userId, fileId })

    } catch (error) {
      logger.error('Document deletion failed', { userId, fileId }, error as Error)
      throw createError.deletionError('Document deletion failed', error as Error)
    }
  }

  /**
   * Get document processing statistics
   */
  async getProcessingStats(userId: string): Promise<{
    totalDocuments: number
    processedDocuments: number
    failedDocuments: number
    totalChunks: number
    averageChunksPerDocument: number
  }> {
    try {
      // Get file statistics
      const { data: fileStats, error: fileError } = await supabaseAdmin
        .from(FILES_TABLE)
        .select('processed, processing_status')
        .eq('owner_id', userId)

      if (fileError) {
        throw fileError
      }

      const totalDocuments = fileStats?.length || 0
      const processedDocuments = fileStats?.filter(f => f.processed).length || 0
      const failedDocuments = fileStats?.filter(f => f.processing_status === 'failed').length || 0

      // Get chunk statistics
      const { count: totalChunks, error: chunkError } = await supabaseAdmin
        .from(CHUNKS_TABLE)
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', userId)

      if (chunkError) {
        throw chunkError
      }

      const averageChunksPerDocument = processedDocuments > 0 
        ? Math.round((totalChunks || 0) / processedDocuments * 100) / 100
        : 0

      return {
        totalDocuments,
        processedDocuments,
        failedDocuments,
        totalChunks: totalChunks || 0,
        averageChunksPerDocument
      }

    } catch (error) {
      logger.error('Failed to get processing stats', { userId }, error as Error)
      
      return {
        totalDocuments: 0,
        processedDocuments: 0,
        failedDocuments: 0,
        totalChunks: 0,
        averageChunksPerDocument: 0
      }
    }
  }

  /**
   * Reprocess a document (useful for updating embeddings with new models)
   */
  async reprocessDocument(
    userId: string,
    fileId: string,
    forceReprocess: boolean = false
  ): Promise<void> {
    try {
      // Get file information
      const { data: file, error } = await supabaseAdmin
        .from(FILES_TABLE)
        .select('name, processed, processing_status')
        .eq('id', fileId)
        .eq('owner_id', userId)
        .single()

      if (error || !file) {
        throw new Error('File not found or access denied')
      }

      // Check if reprocessing is needed
      if (file.processed && !forceReprocess) {
        logger.info('File already processed, skipping reprocessing', {
          userId,
          fileId,
          fileName: file.name
        })
        return
      }

      // Delete existing vectors
      await this.vectorStore.deleteUserDocuments(userId, fileId)

      // Mark file as not processed
      await supabaseAdmin
        .from(FILES_TABLE)
        .update({
          processed: false,
          processing_status: 'processing',
          updated_at: new Date().toISOString()
        })
        .eq('id', fileId)
        .eq('owner_id', userId)

      logger.info('Document marked for reprocessing', {
        userId,
        fileId,
        fileName: file.name
      })

      // Note: The actual reprocessing would be triggered by the document upload pipeline
      // This function just prepares the document for reprocessing

    } catch (error) {
      logger.error('Document reprocessing preparation failed', {
        userId,
        fileId
      }, error as Error)

      throw createError.processingError('Document reprocessing failed', error as Error)
    }
  }

  /**
   * Batch process multiple documents
   */
  async batchProcessDocuments(
    userId: string,
    documents: Array<{
      fileId: string
      fileName: string
      content: string
      metadata?: Record<string, any>
    }>
  ): Promise<{
    successful: string[]
    failed: Array<{ fileId: string; error: string }>
  }> {
    const successful: string[] = []
    const failed: Array<{ fileId: string; error: string }> = []

    logger.info('Starting batch document processing', {
      userId,
      documentCount: documents.length
    })

    // Process documents in parallel with concurrency limit
    const concurrencyLimit = 3
    const chunks = []
    
    for (let i = 0; i < documents.length; i += concurrencyLimit) {
      chunks.push(documents.slice(i, i + concurrencyLimit))
    }

    for (const chunk of chunks) {
      const promises = chunk.map(async (doc) => {
        try {
          await this.processDocument(
            userId,
            doc.fileId,
            doc.fileName,
            doc.content,
            doc.metadata
          )
          successful.push(doc.fileId)
        } catch (error) {
          failed.push({
            fileId: doc.fileId,
            error: (error as Error).message
          })
        }
      })

      await Promise.all(promises)
    }

    logger.info('Batch document processing completed', {
      userId,
      totalDocuments: documents.length,
      successful: successful.length,
      failed: failed.length
    })

    return { successful, failed }
  }
}

/**
 * Singleton instance
 */
let documentProcessor: DocumentProcessor | null = null

/**
 * Get the document processor instance
 */
export function getDocumentProcessor(): DocumentProcessor {
  if (!documentProcessor) {
    documentProcessor = new DocumentProcessor()
  }
  return documentProcessor
}

/**
 * Convenience functions
 */

/**
 * Process a single document
 */
export async function processDocument(
  userId: string,
  fileId: string,
  fileName: string,
  content: string,
  metadata?: Record<string, any>
): Promise<void> {
  const processor = getDocumentProcessor()
  return processor.processDocument(userId, fileId, fileName, content, metadata)
}

/**
 * Search documents
 */
export async function searchDocuments(
  userId: string,
  query: string,
  options?: VectorSearchOptions
): Promise<VectorSearchResult[]> {
  const processor = getDocumentProcessor()
  return processor.searchDocuments(userId, query, options)
}

/**
 * Delete a document
 */
export async function deleteDocument(userId: string, fileId: string): Promise<void> {
  const processor = getDocumentProcessor()
  return processor.deleteDocument(userId, fileId)
}