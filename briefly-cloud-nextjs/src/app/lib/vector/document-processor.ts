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
import { supabaseApp } from '@/app/lib/supabase-clients'
import { filesRepo, fileIngestRepo } from '@/app/lib/repos'
import { chunksRepo } from '@/app/lib/repos/chunks-repo'
import { computeContentHash } from '@/app/lib/utils/content-hash'
import type { ExtractedContent } from '@/app/lib/document-router'

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
      // Compute content hash for deduplication
      const contentHash = computeContentHash(content)
      
      logger.info('Starting document processing', {
        userId,
        fileId,
        fileName,
        contentLength: content.length,
        contentHash
      })

      // Note: Checksum is already set by ensureFileRow() during upload
      // No need to update it here as it's immutable and part of unique constraint

      // Step 1: Create text chunks
      // Signature: createTextChunks(text, fileId, fileName, mimeType, userId, maxChunkSize?)
      const mimeTypeForChunker = (metadata?.fileType as string | undefined) ?? ''
      const chunks = createTextChunks(content, fileId, fileName, mimeTypeForChunker, userId, 1000)

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
        embedding: embeddingResult.embeddings[index].embedding,
        metadata: {
          // Spread incoming metadata first so canonical values can override
          ...metadata,
          ...chunk.metadata,

          // Force canonical values last so nothing overrides them
          fileId,
          fileName,
          userId,
          chunkIndex: chunk.chunkIndex,

          createdAt: new Date().toISOString(),
          embeddingModel: embeddingResult.model,
          embeddingDimensions: embeddingResult.dimensions
        }
      }))

      // Sanity check logging (temporary for debugging)
      const first = vectorDocuments[0]
      logger.info('[vector-sanity]', {
        fileId,
        embeddingType: typeof first?.embedding,
        embeddingIsArray: Array.isArray(first?.embedding),
        embeddingLen: Array.isArray(first?.embedding) ? first.embedding.length : null,
        embeddingPreview: Array.isArray(first?.embedding) ? first.embedding.slice(0, 3) : first?.embedding,
      })

      // Step 4: Delete old chunks if file is being re-indexed (for updates)
      // This ensures we don't accumulate stale chunks
      const existingChunks = await supabaseApp
        .schema('app')
        .from('document_chunks')
        .select('id')
        .eq('file_id', fileId)
        .eq('owner_id', userId)
      
      if (existingChunks.data && existingChunks.data.length > 0) {
        logger.info('Deleting old chunks for file update', {
          userId,
          fileId,
          oldChunkCount: existingChunks.data.length
        })
        
        const { error: deleteError } = await supabaseApp
          .schema('app')
          .from('document_chunks')
          .delete()
          .eq('file_id', fileId)
          .eq('owner_id', userId)
        
        if (deleteError) {
          logger.error('Failed to delete old chunks', {
            userId,
            fileId,
            error: deleteError
          })
          // Continue anyway - we'll insert new chunks
        }
      }
      
      // Step 5: Store new vectors in the vector store
      await this.vectorStore.addDocuments(userId, vectorDocuments)

      // Step 6: Update file processing status using repository
      await filesRepo.updateProcessingStatus(userId, fileId, 'completed')

      // Step 7: Log usage for analytics in app schema
      await supabaseApp
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
      const e = error as any

      // Comprehensive error logging to see actual error details in Vercel
      console.error('DOCUMENT_PROCESSING_FAILED', {
        message: e?.message,
        name: e?.name,
        code: e?.code,
        status: e?.status,
        stack: e?.stack,

        // OpenAI-style errors
        openai: {
          status: e?.response?.status,
          data: e?.response?.data,
        },

        // Supabase / Postgres-style errors
        supabase: {
          message: e?.message,
          details: e?.details,
          hint: e?.hint,
          code: e?.code,
        },

        // Context
        context: {
          userId,
          fileId,
          fileName,
        },

        raw: JSON.stringify(e, Object.getOwnPropertyNames(e)),
      })

      logger.error('Document processing failed', {
        userId,
        fileId,
        fileName
      }, error as Error)

      // Update file status to failed using repository
      try {
        await filesRepo.updateProcessingStatus(userId, fileId, 'failed')
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

      // Note: We do NOT check isConnected() here. The PgVectorStore.searchSimilar()
      // method awaits its own initPromise before proceeding. Checking isConnected()
      // synchronously here would race with async initialization and silently return
      // empty results. Let searchSimilar() handle connection state.

      // Step 1: Generate embedding for the query
      const embeddingResult = await generateEmbedding(query)

      // Step 2: Search for similar vectors
      const results = await this.vectorStore.searchSimilar(
        userId,
        embeddingResult.embedding,
        options
      )

      // Step 3: Log search usage in app schema
      try {
        await supabaseApp
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
      } catch (logError) {
        // Don't fail the search if logging fails
        logger.warn('Failed to log search usage', { userId }, logError as Error)
      }

      logger.info('Document search completed', {
        userId,
        queryLength: query.length,
        resultsFound: results.length,
        embeddingModel: embeddingResult.model
      })

      return results

    } catch (error) {
      logger.error('Document search failed, returning empty results', {
        userId,
        queryLength: query.length,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      // Graceful fallback - return empty results instead of throwing
      return []
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

      // Step 2: Delete file metadata using repository (this will cascade to chunks via foreign key)
      await filesRepo.delete(userId, fileId)

      // Step 3: Log deletion in app schema
      await supabaseApp
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
      // Get ingest statistics
      const ingestRecords = await fileIngestRepo.listByOwner(userId)

      const totalDocuments = ingestRecords.length
      const processedDocuments = ingestRecords.filter(record => record.status === 'ready').length
      const failedDocuments = ingestRecords.filter(record => record.status === 'error').length

      // Get chunk statistics using repository
      const chunkStats = await chunksRepo.getChunkStats(userId)
      const totalChunks = chunkStats.totalChunks

      const averageChunksPerDocument = processedDocuments > 0 
        ? Math.round(totalChunks / processedDocuments * 100) / 100
        : 0

      return {
        totalDocuments,
        processedDocuments,
        failedDocuments,
        totalChunks,
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
      const fileRecord = await filesRepo.getById(userId, fileId)
      if (!fileRecord) {
        throw new Error('File not found or access denied')
      }

      const ingestRecord = await fileIngestRepo.get(userId, fileId)

      if (ingestRecord?.status === 'ready' && !forceReprocess) {
        logger.info('File already processed, skipping reprocessing', {
          userId,
          fileId,
          fileName: fileRecord.name
        })
        return
      }

      await this.vectorStore.deleteUserDocuments(userId, fileId)

      const updatedMeta = {
        ...(ingestRecord?.meta ?? {}),
        reprocess_requested_at: new Date().toISOString()
      }

      await fileIngestRepo.upsert({
        file_id: fileId,
        owner_id: userId,
        status: 'processing',
        source: ingestRecord?.source ?? null,
        error_msg: null,
        page_count: ingestRecord?.page_count ?? null,
        lang: ingestRecord?.lang ?? null,
        meta: updatedMeta,
      })

      logger.info('Document marked for reprocessing', {
        userId,
        fileId,
        fileName: fileRecord.name
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
   * Process a document from pre-extracted ExtractedContent[] items (Spec 11 router path).
   *
   * Each ExtractedContent item is independently chunked and embedded. Enriched
   * metadata (extractionMethod, contentType, sourcePage, visionModel) is
   * propagated into every chunk's metadata for provenance and citation.
   *
   * This is a drop-in companion to processDocument() — it does not change the
   * existing interface and can be called alongside it without conflict.
   */
  async processDocumentFromContents(
    userId: string,
    fileId: string,
    fileName: string,
    contents: ExtractedContent[],
    metadata: Record<string, any> = {},
    options: { appendOnly?: boolean } = {}
  ): Promise<void> {
    try {
      logger.info('[document-processor:from-contents:start]', {
        userId,
        fileId,
        fileName,
        contentItems: contents.length,
        visionItems: contents.filter(c => c.extractionMethod === 'vision').length,
      })

      // Step 1: Chunk each ExtractedContent item independently
      const allChunks: Array<ReturnType<typeof createTextChunks>[number] & {
        _contentMeta: Pick<ExtractedContent, 'extractionMethod' | 'contentType' | 'sourcePage' | 'sourceSheet' | 'visionModel'>
      }> = []

      const mimeTypeForChunker = (metadata?.fileType as string | undefined) ?? ''

      for (const item of contents) {
        if (!item.text.trim()) continue
        const itemChunks = createTextChunks(item.text, fileId, fileName, mimeTypeForChunker, userId, 1000)
        for (const chunk of itemChunks) {
          allChunks.push({
            ...chunk,
            _contentMeta: {
              extractionMethod: item.extractionMethod,
              contentType: item.contentType,
              sourcePage: item.sourcePage,
              sourceSheet: item.sourceSheet,
              visionModel: item.visionModel,
            },
          })
        }
      }

      if (allChunks.length === 0) {
        logger.warn('[document-processor:from-contents:no-chunks]', { userId, fileId, fileName })
        return
      }

      // Step 2: Generate embeddings for all chunks
      const chunkTexts = allChunks.map(c => c.content)
      const embeddingResult = await generateEmbeddings(chunkTexts)

      if (embeddingResult.embeddings.length !== allChunks.length) {
        throw new Error('Mismatch between chunks and embeddings count')
      }

      // Step 3: Build VectorDocuments with enriched metadata
      const vectorDocuments: VectorDocument[] = allChunks.map((chunk, index) => ({
        id: `${fileId}_${chunk.chunkIndex}`,
        content: chunk.content,
        embedding: embeddingResult.embeddings[index].embedding,
        metadata: {
          ...metadata,
          ...chunk.metadata,
          // Spec 11 enriched fields
          extractionMethod: chunk._contentMeta.extractionMethod,
          contentType: chunk._contentMeta.contentType,
          sourcePage: chunk._contentMeta.sourcePage,
          sourceSheet: chunk._contentMeta.sourceSheet,
          visionModel: chunk._contentMeta.visionModel,
          // Canonical fields (override everything)
          fileId,
          fileName,
          userId,
          chunkIndex: chunk.chunkIndex,
          createdAt: new Date().toISOString(),
          embeddingModel: embeddingResult.model,
          embeddingDimensions: embeddingResult.dimensions,
        },
      }))

      // Step 4: Delete old chunks (re-index path) — skipped in appendOnly mode
      // appendOnly is used by the vision cron worker to ADD vision chunks
      // on top of existing text chunks without wiping them.
      if (!options.appendOnly) {
        const existingChunks = await supabaseApp
          .schema('app')
          .from('document_chunks')
          .select('id')
          .eq('file_id', fileId)
          .eq('owner_id', userId)

        if (existingChunks.data && existingChunks.data.length > 0) {
          await supabaseApp
            .schema('app')
            .from('document_chunks')
            .delete()
            .eq('file_id', fileId)
            .eq('owner_id', userId)
        }
      }

      // Step 5: Store vectors
      await this.vectorStore.addDocuments(userId, vectorDocuments)

      // Step 6: Update processing status
      await filesRepo.updateProcessingStatus(userId, fileId, 'completed')

      // Step 7: Log usage
      await supabaseApp
        .from('usage_logs')
        .insert({
          user_id: userId,
          action: 'document_processed',
          resource_type: 'document',
          resource_id: fileId,
          quantity: allChunks.length,
          metadata: {
            file_name: fileName,
            content_items: contents.length,
            chunks_created: allChunks.length,
            vision_items: contents.filter(c => c.extractionMethod === 'vision').length,
            embedding_model: embeddingResult.model,
            processing_time: Date.now(),
          },
        })

      logger.info('[document-processor:from-contents:done]', {
        userId,
        fileId,
        fileName,
        chunksCreated: allChunks.length,
        embeddingModel: embeddingResult.model,
      })
    } catch (error) {
      logger.error('[document-processor:from-contents:failed]', {
        userId,
        fileId,
        fileName,
        error: error instanceof Error ? error.message : String(error),
      })
      try {
        await filesRepo.updateProcessingStatus(userId, fileId, 'failed')
      } catch (_) { /* ignore */ }
      throw createError.processingError('Document processing failed', error as Error)
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
 * Process a document from pre-extracted ExtractedContent[] items (Spec 11 router path).
 */
export async function processDocumentFromContents(
  userId: string,
  fileId: string,
  fileName: string,
  contents: ExtractedContent[],
  metadata?: Record<string, any>,
  options?: { appendOnly?: boolean }
): Promise<void> {
  const processor = getDocumentProcessor()
  return processor.processDocumentFromContents(userId, fileId, fileName, contents, metadata ?? {}, options ?? {})
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
