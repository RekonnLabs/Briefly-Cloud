/**
 * Quest 0: Modular Auto-Indexing Pipeline
 * 
 * This module provides a standalone, testable indexing pipeline that works
 * independently of Apideck or OAuth integrations.
 * 
 * Pipeline stages:
 * 1. Extraction - Download and extract text from file
 * 2. Chunking - Split text into semantic chunks
 * 3. Embedding - Generate vector embeddings for each chunk
 * 4. Vector Write - Store embeddings in vector database
 * 
 * Design principles (per Quest 0 brief):
 * - No optimization, no generalization
 * - Boring and correct
 * - Clear structured logging at each stage
 * - Simple input/output contract
 */

import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'
import { extractTextFromBuffer } from '@/app/lib/document-extractor'
import { createTextChunks, DocumentChunk } from '@/app/lib/document-chunker'
import { generateEmbeddings } from '@/app/lib/embeddings'
import { getVectorStore } from '@/app/lib/vector/vector-store-factory'
import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { filesRepo } from '@/app/lib/repos'

/**
 * File reference input format
 * This is the contract for what the pipeline needs to index a file
 */
export interface FileReference {
  user_id: string
  file_id: string
  source: string // 'google', 'onedrive', 'upload', 'test'
  external_id: string // External provider's file ID
  filename: string
  mime_type: string
  download_url?: string // Optional: URL to download file content
  content?: string // Optional: Pre-extracted text content
  last_modified?: string
}

/**
 * Indexing result with detailed stage information
 */
export interface IndexingResult {
  success: boolean
  file_id: string
  stages: {
    extraction: { success: boolean; text_length?: number; error?: string }
    chunking: { success: boolean; chunk_count?: number; error?: string }
    embedding: { success: boolean; embedding_count?: number; model?: string; error?: string }
    vector_write: { success: boolean; documents_stored?: number; error?: string }
  }
  total_processing_time_ms: number
  error?: string
}

/**
 * Main indexing pipeline function
 * 
 * Takes a file reference and processes it through all stages:
 * extraction → chunking → embedding → vector write
 */
export async function indexFile(fileRef: FileReference): Promise<IndexingResult> {
  const startTime = Date.now()
  
  const result: IndexingResult = {
    success: false,
    file_id: fileRef.file_id,
    stages: {
      extraction: { success: false },
      chunking: { success: false },
      embedding: { success: false },
      vector_write: { success: false },
    },
    total_processing_time_ms: 0,
  }

  console.log(`[INDEX:START] file_id=${fileRef.file_id} user_id=${fileRef.user_id} source=${fileRef.source} filename=${fileRef.filename}`)

  try {
    // ========================================
    // STAGE 1: EXTRACTION
    // ========================================
    console.log(`[INDEX:EXTRACT_START] file_id=${fileRef.file_id}`)
    
    let extractedText: string
    
    if (fileRef.content) {
      // Content already provided (e.g., test scenario)
      extractedText = fileRef.content
      console.log(`[INDEX:EXTRACT_SUCCESS] file_id=${fileRef.file_id} text_length=${extractedText.length} source=pre_extracted`)
    } else if (fileRef.download_url) {
      // Download and extract
      const response = await fetch(fileRef.download_url)
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status} ${response.statusText}`)
      }
      
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      
      const extraction = await extractTextFromBuffer(buffer, fileRef.mime_type, fileRef.filename)
      extractedText = extraction.text
      
      console.log(`[INDEX:EXTRACT_SUCCESS] file_id=${fileRef.file_id} text_length=${extractedText.length} extractor=${extraction.metadata.extractorUsed}`)
    } else {
      throw new Error('FileReference must provide either content or download_url')
    }
    
    result.stages.extraction = {
      success: true,
      text_length: extractedText.length,
    }

    // ========================================
    // STAGE 2: CHUNKING
    // ========================================
    console.log(`[INDEX:CHUNK_START] file_id=${fileRef.file_id} text_length=${extractedText.length}`)
    
    const chunks = createTextChunks(
      extractedText,
      fileRef.file_id,
      fileRef.filename,
      fileRef.mime_type,
      fileRef.user_id,
      1000 // maxChunkSize
    )
    
    if (chunks.length === 0) {
      throw new Error('No chunks created from extracted text')
    }
    
    console.log(`[INDEX:CHUNK_SUCCESS] file_id=${fileRef.file_id} chunk_count=${chunks.length}`)
    
    result.stages.chunking = {
      success: true,
      chunk_count: chunks.length,
    }

    // ========================================
    // STAGE 3: EMBEDDING
    // ========================================
    console.log(`[INDEX:EMBEDDING_START] file_id=${fileRef.file_id} chunk_count=${chunks.length}`)
    
    const chunkTexts = chunks.map(chunk => chunk.content)
    const embeddingResult = await generateEmbeddings(chunkTexts)
    
    if (embeddingResult.embeddings.length !== chunks.length) {
      throw new Error(`Embedding count mismatch: expected ${chunks.length}, got ${embeddingResult.embeddings.length}`)
    }
    
    console.log(`[INDEX:EMBEDDING_SUCCESS] file_id=${fileRef.file_id} embedding_count=${embeddingResult.embeddings.length} model=${embeddingResult.model}`)
    
    result.stages.embedding = {
      success: true,
      embedding_count: embeddingResult.embeddings.length,
      model: embeddingResult.model,
    }

    // ========================================
    // STAGE 4: VECTOR WRITE
    // ========================================
    console.log(`[INDEX:VECTOR_WRITE_START] file_id=${fileRef.file_id} document_count=${chunks.length}`)
    
    const vectorStore = getVectorStore()
    
    // Create vector documents
    const vectorDocuments = chunks.map((chunk, index) => ({
      id: `${fileRef.file_id}_${chunk.chunkIndex}`,
      content: chunk.content,
      embedding: embeddingResult.embeddings[index],
      metadata: {
        fileId: fileRef.file_id,
        fileName: fileRef.filename,
        chunkIndex: chunk.chunkIndex,
        userId: fileRef.user_id,
        source: fileRef.source,
        externalId: fileRef.external_id,
        createdAt: new Date().toISOString(),
        embeddingModel: embeddingResult.model,
        embeddingDimensions: embeddingResult.dimensions,
        mimeType: fileRef.mime_type,
        ...chunk.metadata,
      },
    }))
    
    // Store in vector database
    await vectorStore.addDocuments(fileRef.user_id, vectorDocuments)
    
    console.log(`[INDEX:VECTOR_WRITE_SUCCESS] file_id=${fileRef.file_id} documents_stored=${vectorDocuments.length}`)
    
    result.stages.vector_write = {
      success: true,
      documents_stored: vectorDocuments.length,
    }

    // ========================================
    // FINALIZATION
    // ========================================
    
    // Update file processing status
    try {
      await filesRepo.updateProcessingStatus(fileRef.user_id, fileRef.file_id, 'completed')
    } catch (statusError) {
      // Don't fail the entire pipeline if status update fails
      console.warn(`[INDEX:WARNING] Failed to update file status: ${statusError}`)
    }
    
    // Log usage
    try {
      await supabaseAdmin
        .from('usage_logs')
        .insert({
          user_id: fileRef.user_id,
          action: 'document_indexed',
          resource_type: 'document',
          resource_id: fileRef.file_id,
          quantity: chunks.length,
          metadata: {
            file_name: fileRef.filename,
            source: fileRef.source,
            external_id: fileRef.external_id,
            content_length: extractedText.length,
            chunks_created: chunks.length,
            embedding_model: embeddingResult.model,
            processing_time_ms: Date.now() - startTime,
          },
        })
    } catch (logError) {
      // Don't fail the entire pipeline if logging fails
      console.warn(`[INDEX:WARNING] Failed to log usage: ${logError}`)
    }
    
    result.success = true
    result.total_processing_time_ms = Date.now() - startTime
    
    console.log(`[INDEX:SUCCESS] file_id=${fileRef.file_id} total_time_ms=${result.total_processing_time_ms}`)
    
    return result

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const processingTime = Date.now() - startTime
    
    console.error(`[INDEX:FAILURE] file_id=${fileRef.file_id} error="${errorMessage}" time_ms=${processingTime}`)
    
    // Mark which stage failed
    if (!result.stages.extraction.success) {
      result.stages.extraction.error = errorMessage
    } else if (!result.stages.chunking.success) {
      result.stages.chunking.error = errorMessage
    } else if (!result.stages.embedding.success) {
      result.stages.embedding.error = errorMessage
    } else if (!result.stages.vector_write.success) {
      result.stages.vector_write.error = errorMessage
    }
    
    result.success = false
    result.error = errorMessage
    result.total_processing_time_ms = processingTime
    
    // Update file status to failed
    try {
      await filesRepo.updateProcessingStatus(fileRef.user_id, fileRef.file_id, 'failed')
    } catch (statusError) {
      console.warn(`[INDEX:WARNING] Failed to update file status to failed: ${statusError}`)
    }
    
    return result
  }
}
