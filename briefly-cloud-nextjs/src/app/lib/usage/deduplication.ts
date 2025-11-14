/**
 * File Deduplication Utility
 * 
 * Calculates checksums and detects duplicate files to avoid redundant
 * vectorization costs. Uses SHA-256 hashing for content-based deduplication.
 */

import { createHash } from 'crypto'
import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { logger } from '@/app/lib/logger'

export interface DuplicateCheckResult {
  isDuplicate: boolean
  existingFileId?: string
  existingFileName?: string
  checksum: string
}

/**
 * Calculate SHA-256 checksum from file buffer
 */
export function calculateChecksum(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

/**
 * Calculate SHA-256 checksum from File object (browser)
 */
export async function calculateChecksumFromFile(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  return calculateChecksum(buffer)
}

/**
 * Calculate SHA-256 checksum from ReadableStream
 */
export async function calculateChecksumFromStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const hash = createHash('sha256')
  
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      hash.update(value)
    }
    return hash.digest('hex')
  } finally {
    reader.releaseLock()
  }
}

/**
 * Check if a file with the same checksum already exists for this user
 */
export async function checkDuplicateFile(
  userId: string,
  checksum: string
): Promise<DuplicateCheckResult> {
  try {
    const { data, error } = await supabaseAdmin
      .from('files')
      .select('id, name, checksum')
      .eq('owner_id', userId)
      .eq('checksum', checksum)
      .limit(1)
      .single()

    if (error) {
      // PGRST116 means no rows found (not a duplicate)
      if (error.code === 'PGRST116') {
        return {
          isDuplicate: false,
          checksum
        }
      }
      
      logger.error('Error checking for duplicate file', { userId, checksum, error })
      // On error, assume not duplicate to allow upload
      return {
        isDuplicate: false,
        checksum
      }
    }

    return {
      isDuplicate: true,
      existingFileId: data.id,
      existingFileName: data.name,
      checksum
    }
  } catch (error) {
    logger.error('Error checking for duplicate file', { userId, checksum }, error as Error)
    // On error, assume not duplicate to allow upload
    return {
      isDuplicate: false,
      checksum
    }
  }
}

/**
 * Check if a file with the same checksum exists and return it
 * (useful for batch imports where we want to skip duplicates)
 */
export async function findDuplicateFile(
  userId: string,
  checksum: string
): Promise<{ id: string; name: string; path: string } | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('files')
      .select('id, name, path, size_bytes, mime_type, created_at')
      .eq('owner_id', userId)
      .eq('checksum', checksum)
      .limit(1)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // No duplicate found
      }
      logger.error('Error finding duplicate file', { userId, checksum, error })
      return null
    }

    return data
  } catch (error) {
    logger.error('Error finding duplicate file', { userId, checksum }, error as Error)
    return null
  }
}

/**
 * Get all files with the same checksum (for deduplication analysis)
 */
export async function findAllDuplicates(
  userId: string
): Promise<Array<{ checksum: string; count: number; files: Array<{ id: string; name: string }> }>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('files')
      .select('id, name, checksum')
      .eq('owner_id', userId)
      .not('checksum', 'is', null)

    if (error) {
      logger.error('Error finding all duplicates', { userId, error })
      return []
    }

    // Group by checksum
    const checksumMap = new Map<string, Array<{ id: string; name: string }>>()
    
    for (const file of data) {
      if (!file.checksum) continue
      
      if (!checksumMap.has(file.checksum)) {
        checksumMap.set(file.checksum, [])
      }
      checksumMap.get(file.checksum)!.push({
        id: file.id,
        name: file.name
      })
    }

    // Return only checksums with multiple files
    const duplicates = []
    for (const [checksum, files] of checksumMap.entries()) {
      if (files.length > 1) {
        duplicates.push({
          checksum,
          count: files.length,
          files
        })
      }
    }

    return duplicates
  } catch (error) {
    logger.error('Error finding all duplicates', { userId }, error as Error)
    return []
  }
}

/**
 * Calculate estimated cost savings from deduplication
 * Assumes $0.02 per 1M tokens, ~5000 tokens per document
 */
export function calculateDeduplicationSavings(duplicateCount: number): {
  tokensSaved: number
  costSavedUSD: number
} {
  const tokensPerDocument = 5000
  const costPer1MTokens = 0.02
  
  const tokensSaved = duplicateCount * tokensPerDocument
  const costSavedUSD = (tokensSaved / 1_000_000) * costPer1MTokens
  
  return {
    tokensSaved,
    costSavedUSD
  }
}

/**
 * Update file checksum (for files uploaded before checksum feature)
 */
export async function updateFileChecksum(
  fileId: string,
  checksum: string
): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from('files')
      .update({ checksum })
      .eq('id', fileId)

    if (error) {
      logger.error('Error updating file checksum', { fileId, checksum, error })
      return false
    }

    return true
  } catch (error) {
    logger.error('Error updating file checksum', { fileId, checksum }, error as Error)
    return false
  }
}

/**
 * Backfill checksums for existing files (run as maintenance job)
 */
export async function backfillChecksums(
  userId: string,
  getFileBuffer: (fileId: string, path: string) => Promise<Buffer>
): Promise<{ processed: number; updated: number; errors: number }> {
  try {
    // Get files without checksums
    const { data: files, error } = await supabaseAdmin
      .from('files')
      .select('id, path')
      .eq('owner_id', userId)
      .is('checksum', null)
      .limit(100) // Process in batches

    if (error) {
      logger.error('Error fetching files for checksum backfill', { userId, error })
      return { processed: 0, updated: 0, errors: 0 }
    }

    let processed = 0
    let updated = 0
    let errors = 0

    for (const file of files) {
      try {
        const buffer = await getFileBuffer(file.id, file.path)
        const checksum = calculateChecksum(buffer)
        const success = await updateFileChecksum(file.id, checksum)
        
        processed++
        if (success) {
          updated++
        } else {
          errors++
        }
      } catch (error) {
        logger.error('Error processing file for checksum', { fileId: file.id }, error as Error)
        processed++
        errors++
      }
    }

    logger.info('Checksum backfill completed', {
      userId,
      processed,
      updated,
      errors
    })

    return { processed, updated, errors }
  } catch (error) {
    logger.error('Error in checksum backfill', { userId }, error as Error)
    return { processed: 0, updated: 0, errors: 0 }
  }
}

