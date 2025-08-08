/**
 * Document text extraction utilities
 * Handles text extraction from various document formats
 */

import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import { createError } from './api-errors'
import { logger } from './logger'

// Supported file types and their extractors
export const SUPPORTED_EXTRACTORS = {
  // PDF files
  'application/pdf': 'pdf',
  
  // Word documents
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  
  // Excel files
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  
  // PowerPoint files (limited support)
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.ms-powerpoint': 'ppt',
  
  // Text files
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
  'application/csv': 'csv',
  
  // JSON files
  'application/json': 'json',
} as const

export type SupportedMimeType = keyof typeof SUPPORTED_EXTRACTORS
export type ExtractorType = typeof SUPPORTED_EXTRACTORS[SupportedMimeType]

export interface ExtractionResult {
  text: string
  metadata: {
    pageCount?: number
    wordCount: number
    characterCount: number
    extractedAt: string
    extractorUsed: ExtractorType
    processingTime: number
  }
  warnings: string[]
}

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
  }
}

/**
 * Extract text from a file buffer based on MIME type
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ExtractionResult> {
  const startTime = Date.now()
  const warnings: string[] = []
  
  try {
    if (!isSupportedMimeType(mimeType)) {
      throw createError.validation(`Unsupported file type: ${mimeType}`)
    }
    
    const extractorType = SUPPORTED_EXTRACTORS[mimeType as SupportedMimeType]
    let text = ''
    let pageCount: number | undefined
    
    // Extract text based on file type
    switch (extractorType) {
      case 'pdf':
        const pdfResult = await extractPdfText(buffer)
        text = pdfResult.text
        pageCount = pdfResult.pageCount
        warnings.push(...pdfResult.warnings)
        break
        
      case 'docx':
      case 'doc':
        const docxResult = await extractDocxText(buffer)
        text = docxResult.text
        warnings.push(...docxResult.warnings)
        break
        
      case 'xlsx':
      case 'xls':
        const xlsxResult = await extractXlsxText(buffer)
        text = xlsxResult.text
        warnings.push(...xlsxResult.warnings)
        break
        
      case 'pptx':
      case 'ppt':
        // PowerPoint extraction is limited - we'll extract what we can
        const pptxResult = await extractPptxText(buffer)
        text = pptxResult.text
        warnings.push(...pptxResult.warnings)
        warnings.push('PowerPoint text extraction is limited and may not capture all content')
        break
        
      case 'txt':
      case 'md':
        text = buffer.toString('utf-8')
        break
        
      case 'csv':
        const csvResult = await extractCsvText(buffer)
        text = csvResult.text
        warnings.push(...csvResult.warnings)
        break
        
      case 'json':
        try {
          const jsonData = JSON.parse(buffer.toString('utf-8'))
          text = JSON.stringify(jsonData, null, 2)
        } catch {
          throw createError.validation('Invalid JSON file format')
        }
        break
        
      default:
        throw createError.validation(`No extractor available for type: ${extractorType}`)
    }
    
    // Clean up extracted text
    text = cleanExtractedText(text)
    
    if (!text.trim()) {
      warnings.push('No text content was extracted from the document')
    }
    
    const processingTime = Date.now() - startTime
    
    // Log extraction performance
    logger.logPerformance('document_text_extraction', processingTime, {
      fileName,
      mimeType,
      extractorType,
      textLength: text.length,
      warnings: warnings.length,
    })
    
    return {
      text,
      metadata: {
        pageCount,
        wordCount: countWords(text),
        characterCount: text.length,
        extractedAt: new Date().toISOString(),
        extractorUsed: extractorType,
        processingTime,
      },
      warnings,
    }
    
  } catch (error) {
    const processingTime = Date.now() - startTime
    
    logger.error('Document text extraction failed', {
      fileName,
      mimeType,
      processingTime,
      error: error instanceof Error ? error.message : String(error),
    })
    
    throw error
  }
}

/**
 * Extract text from PDF buffer
 */
async function extractPdfText(buffer: Buffer): Promise<{
  text: string
  pageCount: number
  warnings: string[]
}> {
  try {
    const data = await pdfParse(buffer)
    
    return {
      text: data.text,
      pageCount: data.numpages,
      warnings: data.text.length === 0 ? ['PDF appears to contain no extractable text'] : [],
    }
  } catch (error) {
    throw createError.internal(`PDF extraction failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Extract text from DOCX buffer
 */
async function extractDocxText(buffer: Buffer): Promise<{
  text: string
  warnings: string[]
}> {
  try {
    const result = await mammoth.extractRawText({ buffer })
    
    return {
      text: result.value,
      warnings: result.messages.map(msg => `DOCX: ${msg.message}`),
    }
  } catch (error) {
    throw createError.internal(`DOCX extraction failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Extract text from Excel buffer
 */
async function extractXlsxText(buffer: Buffer): Promise<{
  text: string
  warnings: string[]
}> {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const warnings: string[] = []
    let text = ''
    
    // Process each worksheet
    workbook.SheetNames.forEach((sheetName, index) => {
      const worksheet = workbook.Sheets[sheetName]
      
      if (index > 0) {
        text += `\n\n--- Sheet: ${sheetName} ---\n\n`
      }
      
      // Convert sheet to CSV format for text extraction
      const csvText = XLSX.utils.sheet_to_csv(worksheet, {
        blankrows: false,
        skipHidden: true,
      })
      
      text += csvText
    })
    
    if (workbook.SheetNames.length > 1) {
      warnings.push(`Processed ${workbook.SheetNames.length} worksheets`)
    }
    
    return {
      text: text.trim(),
      warnings,
    }
  } catch (error) {
    throw createError.internal(`Excel extraction failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Extract text from PowerPoint buffer (limited support)
 */
async function extractPptxText(buffer: Buffer): Promise<{
  text: string
  warnings: string[]
}> {
  // PowerPoint extraction is complex and requires specialized libraries
  // For now, we'll provide a basic implementation that extracts what it can
  const warnings = [
    'PowerPoint text extraction is limited',
    'Some content like images, charts, and complex layouts may not be extracted',
  ]
  
  try {
    // Try to extract any readable text using basic methods
    const text = buffer.toString('utf-8', 0, Math.min(buffer.length, 10000))
    const extractedText = text.replace(/[^\x20-\x7E\n\r\t]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    
    return {
      text: extractedText || 'Unable to extract text from PowerPoint file',
      warnings,
    }
  } catch (error) {
    return {
      text: 'PowerPoint text extraction failed',
      warnings: [...warnings, `Extraction error: ${error instanceof Error ? error.message : String(error)}`],
    }
  }
}

/**
 * Extract text from CSV buffer
 */
async function extractCsvText(buffer: Buffer): Promise<{
  text: string
  warnings: string[]
}> {
  try {
    const csvText = buffer.toString('utf-8')
    const warnings: string[] = []
    
    // Basic CSV validation
    const lines = csvText.split('\n')
    if (lines.length < 2) {
      warnings.push('CSV file appears to have no data rows')
    }
    
    return {
      text: csvText,
      warnings,
    }
  } catch (error) {
    throw createError.internal(`CSV extraction failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Clean up extracted text
 */
function cleanExtractedText(text: string): string {
  return text
    // Normalize line breaks
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Remove excessive whitespace
    .replace(/[ \t]+/g, ' ')
    // Remove excessive line breaks (more than 2 consecutive)
    .replace(/\n{3,}/g, '\n\n')
    // Trim whitespace from each line
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    // Final trim
    .trim()
}

/**
 * Count words in text
 */
function countWords(text: string): number {
  if (!text.trim()) return 0
  return text.trim().split(/\s+/).length
}

/**
 * Check if MIME type is supported
 */
export function isSupportedMimeType(mimeType: string): mimeType is SupportedMimeType {
  return mimeType in SUPPORTED_EXTRACTORS
}

/**
 * Get extractor type for MIME type
 */
export function getExtractorType(mimeType: string): ExtractorType | null {
  return isSupportedMimeType(mimeType) ? SUPPORTED_EXTRACTORS[mimeType] : null
}

/**
 * Create text chunks from extracted text
 */
export function createTextChunks(
  text: string,
  fileId: string,
  fileName: string,
  mimeType: string,
  maxChunkSize: number = 1000
): DocumentChunk[] {
  if (!text.trim()) {
    return []
  }
  
  const chunks: DocumentChunk[] = []
  const paragraphs = text.split('\n\n').filter(p => p.trim())
  
  let currentChunk = ''
  let chunkIndex = 0
  let startPosition = 0
  
  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim()
    
    // If adding this paragraph would exceed the chunk size and we have content
    if (currentChunk && (currentChunk.length + trimmedParagraph.length + 2) > maxChunkSize) {
      // Save current chunk
      chunks.push({
        content: currentChunk.trim(),
        chunkIndex,
        metadata: {
          fileName,
          fileId,
          mimeType,
          chunkSize: currentChunk.length,
          startPosition,
          endPosition: startPosition + currentChunk.length,
        },
      })
      
      // Start new chunk
      chunkIndex++
      startPosition += currentChunk.length
      currentChunk = trimmedParagraph
    } else {
      // Add to current chunk
      currentChunk += (currentChunk ? '\n\n' : '') + trimmedParagraph
    }
  }
  
  // Add final chunk if it has content
  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      chunkIndex,
      metadata: {
        fileName,
        fileId,
        mimeType,
        chunkSize: currentChunk.length,
        startPosition,
        endPosition: startPosition + currentChunk.length,
      },
    })
  }
  
  return chunks
}

/**
 * Extract text from uploaded file
 */
export async function extractTextFromFile(
  file: File
): Promise<ExtractionResult> {
  const buffer = Buffer.from(await file.arrayBuffer())
  return extractTextFromBuffer(buffer, file.type, file.name)
}

/**
 * Get extraction statistics
 */
export function getExtractionStats(result: ExtractionResult) {
  const { text, metadata, warnings } = result
  
  return {
    success: text.length > 0,
    textLength: text.length,
    wordCount: metadata.wordCount,
    characterCount: metadata.characterCount,
    pageCount: metadata.pageCount,
    processingTime: metadata.processingTime,
    warningCount: warnings.length,
    extractorUsed: metadata.extractorUsed,
    extractedAt: metadata.extractedAt,
  }
}