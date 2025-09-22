/**
 * Advanced document chunking system
 * Provides intelligent text chunking with multiple strategies and database integration
 */

import { createClient } from '@supabase/supabase-js'
import { createError } from './api-errors'
import { logger } from './logger'

// Re-export the basic DocumentChunk interface from document-extractor
export interface DocumentChunk {
  content: string
  chunkIndex: number
  metadata: {
    fileName: string
    fileId: string
    mimeType: string
    chunkSize: number
    startPosition?: number
    endPosition?: number
    [key: string]: any
  }
}

// Enhanced chunk with database fields
export interface StoredDocumentChunk extends DocumentChunk {
  id?: string
  userId: string
  embedding?: number[]
  createdAt?: string
}

// Chunking strategy types
export type ChunkingStrategy = 
  | 'paragraph'      // Split by paragraphs (default)
  | 'sentence'       // Split by sentences
  | 'fixed'          // Fixed character length
  | 'semantic'       // Semantic boundaries (future)
  | 'sliding'        // Sliding window with overlap

// Chunking configuration
export interface ChunkingConfig {
  strategy: ChunkingStrategy
  maxChunkSize: number
  minChunkSize?: number
  overlap?: number           // For sliding window strategy
  preserveStructure?: boolean // Try to preserve document structure
  respectBoundaries?: boolean // Don't break words/sentences
  customDelimiters?: string[] // Custom split delimiters
}

// Default configurations for different strategies
export const DEFAULT_CHUNKING_CONFIGS: Record<ChunkingStrategy, ChunkingConfig> = {
  paragraph: {
    strategy: 'paragraph',
    maxChunkSize: 1000,
    minChunkSize: 100,
    preserveStructure: true,
    respectBoundaries: true,
  },
  sentence: {
    strategy: 'sentence',
    maxChunkSize: 800,
    minChunkSize: 50,
    preserveStructure: true,
    respectBoundaries: true,
  },
  fixed: {
    strategy: 'fixed',
    maxChunkSize: 1000,
    minChunkSize: 500,
    respectBoundaries: true,
  },
  semantic: {
    strategy: 'semantic',
    maxChunkSize: 1200,
    minChunkSize: 200,
    preserveStructure: true,
    respectBoundaries: true,
  },
  sliding: {
    strategy: 'sliding',
    maxChunkSize: 1000,
    minChunkSize: 800,
    overlap: 200,
    respectBoundaries: true,
  },
}

/**
 * Advanced document chunker class
 */
export class DocumentChunker {
  private config: ChunkingConfig
  
  constructor(config: Partial<ChunkingConfig> = {}) {
    const strategy = config.strategy || 'paragraph'
    this.config = {
      ...DEFAULT_CHUNKING_CONFIGS[strategy],
      ...config,
    }
  }
  
  /**
   * Create chunks from text using the configured strategy
   */
  public createChunks(
    text: string,
    fileId: string,
    fileName: string,
    mimeType: string,
    _userId: string
  ): DocumentChunk[] {
    if (!text.trim()) {
      return []
    }
    
    const startTime = Date.now()
    
    let chunks: DocumentChunk[]
    
    switch (this.config.strategy) {
      case 'paragraph':
        chunks = this.createParagraphChunks(text, fileId, fileName, mimeType)
        break
      case 'sentence':
        chunks = this.createSentenceChunks(text, fileId, fileName, mimeType)
        break
      case 'fixed':
        chunks = this.createFixedChunks(text, fileId, fileName, mimeType)
        break
      case 'sliding':
        chunks = this.createSlidingChunks(text, fileId, fileName, mimeType)
        break
      case 'semantic':
        // For now, fall back to paragraph chunking
        // TODO: Implement semantic chunking with NLP
        chunks = this.createParagraphChunks(text, fileId, fileName, mimeType)
        break
      default:
        throw createError.validation(`Unsupported chunking strategy: ${this.config.strategy}`)
    }
    
    const processingTime = Date.now() - startTime
    
    // Log chunking performance
    logger.logPerformance('document_chunking', processingTime, {
      strategy: this.config.strategy,
      textLength: text.length,
      chunkCount: chunks.length,
      avgChunkSize: chunks.length > 0 ? Math.round(text.length / chunks.length) : 0,
    })
    
    return chunks
  }
  
  /**
   * Create paragraph-based chunks
   */
  private createParagraphChunks(
    text: string,
    fileId: string,
    fileName: string,
    mimeType: string
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = []
    const paragraphs = text.split('\n\n').filter(p => p.trim())
    
    let currentChunk = ''
    let chunkIndex = 0
    let startPosition = 0
    
    for (const paragraph of paragraphs) {
      const trimmedParagraph = paragraph.trim()
      
      // Check if adding this paragraph would exceed the chunk size
      const wouldExceed = currentChunk && 
        (currentChunk.length + trimmedParagraph.length + 2) > this.config.maxChunkSize
      
      if (wouldExceed) {
        // Save current chunk if it meets minimum size
        if (currentChunk.length >= (this.config.minChunkSize || 0)) {
          chunks.push(this.createChunkObject(
            currentChunk.trim(),
            chunkIndex,
            fileId,
            fileName,
            mimeType,
            startPosition,
            startPosition + currentChunk.length
          ))
          chunkIndex++
          startPosition += currentChunk.length
        }
        
        // Start new chunk
        currentChunk = trimmedParagraph
      } else {
        // Add to current chunk
        currentChunk += (currentChunk ? '\n\n' : '') + trimmedParagraph
      }
    }
    
    // Add final chunk
    if (currentChunk.trim() && currentChunk.length >= (this.config.minChunkSize || 0)) {
      chunks.push(this.createChunkObject(
        currentChunk.trim(),
        chunkIndex,
        fileId,
        fileName,
        mimeType,
        startPosition,
        startPosition + currentChunk.length
      ))
    }
    
    return chunks
  }
  
  /**
   * Create sentence-based chunks
   */
  private createSentenceChunks(
    text: string,
    fileId: string,
    fileName: string,
    mimeType: string
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = []
    
    // Split by sentence boundaries (simplified regex)
    const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim())
    
    let currentChunk = ''
    let chunkIndex = 0
    let startPosition = 0
    
    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim()
      
      // Check if adding this sentence would exceed the chunk size
      const wouldExceed = currentChunk && 
        (currentChunk.length + trimmedSentence.length + 1) > this.config.maxChunkSize
      
      if (wouldExceed) {
        // Save current chunk if it meets minimum size
        if (currentChunk.length >= (this.config.minChunkSize || 0)) {
          chunks.push(this.createChunkObject(
            currentChunk.trim(),
            chunkIndex,
            fileId,
            fileName,
            mimeType,
            startPosition,
            startPosition + currentChunk.length
          ))
          chunkIndex++
          startPosition += currentChunk.length
        }
        
        // Start new chunk
        currentChunk = trimmedSentence
      } else {
        // Add to current chunk
        currentChunk += (currentChunk ? ' ' : '') + trimmedSentence
      }
    }
    
    // Add final chunk
    if (currentChunk.trim() && currentChunk.length >= (this.config.minChunkSize || 0)) {
      chunks.push(this.createChunkObject(
        currentChunk.trim(),
        chunkIndex,
        fileId,
        fileName,
        mimeType,
        startPosition,
        startPosition + currentChunk.length
      ))
    }
    
    return chunks
  }
  
  /**
   * Create fixed-size chunks
   */
  private createFixedChunks(
    text: string,
    fileId: string,
    fileName: string,
    mimeType: string
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = []
    const chunkSize = this.config.maxChunkSize
    
    let chunkIndex = 0
    let position = 0
    
    while (position < text.length) {
      let endPosition = Math.min(position + chunkSize, text.length)
      
      // If respecting boundaries, adjust end position to avoid breaking words
      if (this.config.respectBoundaries && endPosition < text.length) {
        const nextSpace = text.indexOf(' ', endPosition)
        const prevSpace = text.lastIndexOf(' ', endPosition)
        
        // Choose the closer boundary
        if (nextSpace !== -1 && prevSpace !== -1) {
          endPosition = (nextSpace - endPosition) < (endPosition - prevSpace) 
            ? nextSpace 
            : prevSpace
        } else if (prevSpace !== -1) {
          endPosition = prevSpace
        }
      }
      
      const chunkContent = text.slice(position, endPosition).trim()
      
      if (chunkContent.length >= (this.config.minChunkSize || 0)) {
        chunks.push(this.createChunkObject(
          chunkContent,
          chunkIndex,
          fileId,
          fileName,
          mimeType,
          position,
          endPosition
        ))
        chunkIndex++
      }
      
      position = endPosition + 1
    }
    
    return chunks
  }
  
  /**
   * Create sliding window chunks with overlap
   */
  private createSlidingChunks(
    text: string,
    fileId: string,
    fileName: string,
    mimeType: string
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = []
    const chunkSize = this.config.maxChunkSize
    const overlap = this.config.overlap || 0
    const step = chunkSize - overlap
    
    let chunkIndex = 0
    let position = 0
    
    while (position < text.length) {
      let endPosition = Math.min(position + chunkSize, text.length)
      
      // Respect word boundaries
      if (this.config.respectBoundaries && endPosition < text.length) {
        const prevSpace = text.lastIndexOf(' ', endPosition)
        if (prevSpace > position) {
          endPosition = prevSpace
        }
      }
      
      const chunkContent = text.slice(position, endPosition).trim()
      
      if (chunkContent.length >= (this.config.minChunkSize || 0)) {
        chunks.push(this.createChunkObject(
          chunkContent,
          chunkIndex,
          fileId,
          fileName,
          mimeType,
          position,
          endPosition
        ))
        chunkIndex++
      }
      
      // Move by step size (chunk size - overlap)
      position += step
      
      // Avoid infinite loop
      if (step <= 0) break
    }
    
    return chunks
  }
  
  /**
   * Create a chunk object with metadata
   */
  private createChunkObject(
    content: string,
    chunkIndex: number,
    fileId: string,
    fileName: string,
    mimeType: string,
    startPosition: number,
    endPosition: number
  ): DocumentChunk {
    return {
      content,
      chunkIndex,
      metadata: {
        fileName,
        fileId,
        mimeType,
        chunkSize: content.length,
        startPosition,
        endPosition,
        strategy: this.config.strategy,
        wordCount: this.countWords(content),
        characterCount: content.length,
      },
    }
  }
  
  /**
   * Count words in text
   */
  private countWords(text: string): number {
    if (!text.trim()) return 0
    return text.trim().split(/\s+/).length
  }
}

/**
 * Store chunks in the database
 */
export async function storeDocumentChunks(
  chunks: DocumentChunk[],
  userId: string,
  fileId: string
): Promise<StoredDocumentChunk[]> {
  if (chunks.length === 0) {
    return []
  }
  
  try {
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
    
    // Prepare chunk data for insertion
    const chunkData = chunks.map(chunk => ({
      file_id: fileId,
      user_id: userId,
      chunk_index: chunk.chunkIndex,
      content: chunk.content,
      metadata: chunk.metadata,
    }))
    
    // Insert chunks in batches to avoid payload limits
    const batchSize = 100
    const storedChunks: StoredDocumentChunk[] = []
    
    for (let i = 0; i < chunkData.length; i += batchSize) {
      const batch = chunkData.slice(i, i + batchSize)
      
      const { data, error } = await supabase
        .from('document_chunks')
        .insert(batch)
        .select()
      
      if (error) {
        throw createError.supabaseError('Failed to store document chunks', error)
      }
      
      if (data) {
        const batchStoredChunks = data.map((row, index) => ({
          ...chunks[i + index],
          id: row.id,
          userId,
          createdAt: row.created_at,
        }))
        storedChunks.push(...batchStoredChunks)
      }
    }
    
    logger.info(`Stored ${storedChunks.length} chunks for file ${fileId}`)
    
    return storedChunks
    
  } catch (error) {
    logger.error('Failed to store document chunks', { fileId, userId, chunkCount: chunks.length }, error as Error)
    throw error
  }
}

/**
 * Retrieve chunks from the database
 */
export async function getDocumentChunks(
  fileId: string,
  userId: string
): Promise<StoredDocumentChunk[]> {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    )
    
    const { data, error } = await supabase
      .from('document_chunks')
      .select('*')
      .eq('file_id', fileId)
      .eq('user_id', userId)
      .order('chunk_index', { ascending: true })
    
    if (error) {
      throw createError.supabaseError('Failed to retrieve document chunks', error)
    }
    
    return (data || []).map(row => ({
      content: row.content,
      chunkIndex: row.chunk_index,
      metadata: row.metadata,
      id: row.id,
      userId: row.user_id,
      embedding: row.embedding,
      createdAt: row.created_at,
    }))
    
  } catch (error) {
    logger.error('Failed to retrieve document chunks', { fileId, userId }, error as Error)
    throw error
  }
}

/**
 * Delete chunks from the database
 */
export async function deleteDocumentChunks(
  fileId: string,
  userId: string
): Promise<void> {
  try {
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
      throw createError.supabaseError('Failed to delete document chunks', error)
    }
    
    logger.info(`Deleted chunks for file ${fileId}`)
    
  } catch (error) {
    logger.error('Failed to delete document chunks', { fileId, userId }, error as Error)
    throw error
  }
}

/**
 * Get chunking statistics
 */
export function getChunkingStats(chunks: DocumentChunk[]) {
  if (chunks.length === 0) {
    return {
      totalChunks: 0,
      totalCharacters: 0,
      totalWords: 0,
      averageChunkSize: 0,
      minChunkSize: 0,
      maxChunkSize: 0,
    }
  }
  
  const chunkSizes = chunks.map(chunk => chunk.content.length)
  const totalCharacters = chunkSizes.reduce((sum, size) => sum + size, 0)
  const totalWords = chunks.reduce((sum, chunk) => 
    sum + (chunk.metadata.wordCount || 0), 0
  )
  
  return {
    totalChunks: chunks.length,
    totalCharacters,
    totalWords,
    averageChunkSize: Math.round(totalCharacters / chunks.length),
    minChunkSize: Math.min(...chunkSizes),
    maxChunkSize: Math.max(...chunkSizes),
  }
}

/**
 * Convenience function to create chunks with default paragraph strategy
 */
export function createTextChunks(
  text: string,
  fileId: string,
  fileName: string,
  mimeType: string,
  userId: string,
  maxChunkSize: number = 1000
): DocumentChunk[] {
  const chunker = new DocumentChunker({
    strategy: 'paragraph',
    maxChunkSize,
  })
  
  return chunker.createChunks(text, fileId, fileName, mimeType, userId)
}
