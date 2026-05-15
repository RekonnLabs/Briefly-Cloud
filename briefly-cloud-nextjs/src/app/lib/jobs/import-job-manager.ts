/**
 * Import Job Manager
 * 
 * Handles server-side batch processing of cloud storage imports with:
 * - Job creation and progress tracking
 * - Duplicate detection using content hash and provider version
 * - Error handling and retry logic for failed files
 * - File processing with streaming downloads
 */

import 'server-only'
import { createHash } from 'crypto'
import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { fileIngestRepo, usersRepo } from '@/app/lib/repos'
import { GoogleDriveProvider } from '@/app/lib/cloud-storage/providers/google-drive'
import { OneDriveProvider } from '@/app/lib/cloud-storage/providers/onedrive'
import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'
import { extractTextFromBuffer } from '@/app/lib/document-extractor'
import { indexFile } from '@/app/lib/indexing/indexingPipeline'
import { createTextChunks } from '@/app/lib/document-chunker'
import { generateBatchEmbeddings } from '@/app/lib/embeddings'
import { getVectorStore } from '@/app/lib/vector/vector-store-factory'

import { Apideck, apideckHeaders } from '@/app/lib/integrations/apideck'
import type { CloudStorageFile, CloudStorageProvider } from '@/app/lib/cloud-storage/types'

// Helper function for database errors since createError.database might not exist
const createDatabaseError = (message: string, originalError?: any) => {
  return createError.internal(`Database error: ${message}`, originalError)
}

// Job interfaces
export interface ImportJob {
  id: string
  userId: string
  provider: 'google' | 'microsoft'
  folderId?: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  progress: {
    total: number
    processed: number
    failed: number
    skipped: number
    current_file?: string | null
    percentage: number
  }
  fileStatuses: ImportFileStatus[]
  inputData: Record<string, unknown>
  outputData?: Record<string, unknown>
  errorMessage?: string
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
  estimatedCompletion?: Date
}

export interface ImportFileStatus {
  fileId: string
  fileName: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped' | 'duplicate'
  error?: string
  reason?: string
  timestamp: Date
}

export interface FileProcessingResult {
  success: boolean
  status: 'completed' | 'failed' | 'skipped' | 'duplicate'
  error?: string
  reason?: string
  chunksCreated?: number
  appFileId?: string
}

export class ImportJobManager {
  private static providers: Record<string, CloudStorageProvider> = {
    google: new GoogleDriveProvider(),
    microsoft: new OneDriveProvider()
  }

  private static readonly SUPPORTED_MIME_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain', 'text/markdown', 'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
    'application/vnd.google-apps.document',
    'application/vnd.google-apps.spreadsheet',
    'application/vnd.google-apps.presentation'
  ]

  /**
   * Create a new import job
   */
  static async createJob(
    userId: string,
    provider: 'google' | 'microsoft',
    folderId?: string,
    options: {
      batchSize?: number
      maxRetries?: number
      source?: string
    } = {}
  ): Promise<ImportJob> {
    try {
      // Generate unique job ID
      const { data: jobIdData, error: jobIdError } = await supabaseAdmin
        .rpc('generate_job_id', { job_type: 'import' })

      if (jobIdError || !jobIdData) {
        throw createDatabaseError('Failed to generate job ID', jobIdError)
      }

      const jobId = jobIdData as string

      const inputData = {
        provider,
        folderId: folderId || 'root',
        batchSize: options.batchSize || 5,
        maxRetries: options.maxRetries || 3,
        ...(options.source ? { source: options.source } : {})
      }

      // Create job record
      const { data: jobData, error: jobError } = await supabaseAdmin
        .from('job_logs')
        .insert({
          id: jobId,
          user_id: userId,
          job_type: 'import',
          status: 'pending',
          input_data: inputData,
          progress: {
            total: 0,
            processed: 0,
            failed: 0,
            skipped: 0,
            current_file: null,
            percentage: 0
          },
          file_statuses: []
        })
        .select()
        .single()

      if (jobError || !jobData) {
        throw createDatabaseError('Failed to create job', jobError)
      }

      logger.info('Import job created', {
        jobId,
        userId,
        provider,
        folderId
      })

      return this.mapJobFromDatabase(jobData)
    } catch (error) {
      logger.error('Error creating import job', {
        userId,
        provider,
        folderId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Get job by ID
   */
  static async getJob(jobId: string): Promise<ImportJob | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('job_logs')
        .select('*')
        .eq('id', jobId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') return null // No rows returned
        throw createDatabaseError('Failed to get job', error)
      }

      return this.mapJobFromDatabase(data)
    } catch (error) {
      logger.error('Error getting job', {
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Get jobs for a user
   */
  static async getUserJobs(
    userId: string,
    status?: string,
    limit: number = 50
  ): Promise<ImportJob[]> {
    try {
      let query = supabaseAdmin
        .from('job_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('job_type', 'import')

      if (status) {
        query = query.eq('status', status)
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) {
        throw createDatabaseError('Failed to get user jobs', error)
      }

      return (data || []).map(job => this.mapJobFromDatabase(job))
    } catch (error) {
      logger.error('Error getting user jobs', {
        userId,
        status,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Process a job - main entry point for job execution
   */
  static async processJob(jobId: string): Promise<void> {
    const job = await this.getJob(jobId)
    if (!job) {
      throw createError.notFound('Job not found')
    }

    if (job.status !== 'pending') {
      throw createError.badRequest(`Job is not in pending status: ${job.status}`)
    }

    try {
      // Update job status to processing
      await this.updateJobStatus(jobId, 'processing', { started_at: new Date() })

      // Get all files to import
      const files = await this.getAllFilesToImport(job)
      
      // Update total count
      await this.updateJobProgress(jobId, { total: files.length })

      logger.info('Starting job processing', {
        jobId,
        userId: job.userId,
        provider: job.provider,
        totalFiles: files.length
      })

      // Use enhanced batch processing for large batches
      await this.processBatchWithMemoryManagement(job, files)

      // Calculate final results
      const finalProgress = await this.calculateProgress(jobId)
      const outputData = {
        totalFiles: finalProgress.total,
        processedFiles: finalProgress.processed,
        failedFiles: finalProgress.failed,
        skippedFiles: finalProgress.skipped,
        duplicateFiles: await this.countFilesByStatus(jobId, 'duplicate')
      }

      // Flush final counts to the progress column so the UI reads accurate numbers
      // on the last poll. Without this, progress retains the last intermediate batch
      // update and the 4-box stats show stale mid-run counts after completion.
      await this.updateJobProgress(jobId, {
        ...finalProgress,
        current_file: null  // clear the "currently processing" label on completion
      })

      // Mark job as completed
      await this.updateJobStatus(jobId, 'completed', {
        completed_at: new Date(),
        output_data: outputData
      })

      logger.info('Job processing completed', {
        jobId,
        userId: job.userId,
        ...outputData
      })

    } catch (error) {
      logger.error('Job processing failed', {
        jobId,
        userId: job.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      await this.updateJobStatus(jobId, 'failed', {
        completed_at: new Date(),
        error_message: error instanceof Error ? error.message : 'Unknown error'
      })

      throw error
    }
  }

  /**
   * Process batch with memory management for large imports
   */
  private static async processBatchWithMemoryManagement(
    job: ImportJob,
    files: CloudStorageFile[]
  ): Promise<void> {
    const batchSize = (job.inputData.batchSize as number) || 5
    const maxRetries = (job.inputData.maxRetries as number) || 3
    const maxConcurrentBatches = 2 // Limit concurrent batches to prevent memory issues

    // Process files in smaller batches with memory management
    for (let i = 0; i < files.length; i += batchSize * maxConcurrentBatches) {
      const superBatch = files.slice(i, i + (batchSize * maxConcurrentBatches))
      
      // Split super batch into smaller batches
      const batches: CloudStorageFile[][] = []
      for (let j = 0; j < superBatch.length; j += batchSize) {
        batches.push(superBatch.slice(j, j + batchSize))
      }

      // Process batches with controlled concurrency
      await Promise.allSettled(
        batches.map(batch => this.processSingleBatch(job, batch, maxRetries))
      )

      // Update progress after super batch
      const progress = await this.calculateProgress(job.id)
      await this.updateJobProgress(job.id, progress)

      // Force garbage collection hint for large batches
      if (global.gc && files.length > 100) {
        global.gc()
      }

      // Log super batch completion
      logger.debug('Super batch processed', {
        jobId: job.id,
        superBatchStart: i,
        superBatchSize: superBatch.length,
        progress: progress.percentage,
        memoryUsage: process.memoryUsage()
      })

      // Add small delay between super batches to prevent overwhelming the system
      if (i + (batchSize * maxConcurrentBatches) < files.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
  }

  /**
   * Process a single batch of files
   */
  private static async processSingleBatch(
    job: ImportJob,
    batch: CloudStorageFile[],
    maxRetries: number
  ): Promise<void> {
    // Process batch in parallel with full error isolation.
    // Promise.allSettled ensures a single file rejection never kills the batch.
    const results = await Promise.allSettled(
      batch.map(file => this.processFile(job, file, maxRetries))
    )

    // Log any unexpected rejections (processFile should never reject — it always
    // returns a FileProcessingResult. If it does reject, it's a programming error.)
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        logger.error('File processing unexpectedly rejected in batch', {
          jobId: job.id,
          fileId: batch[index].id,
          fileName: batch[index].name,
          error: result.reason
        })
      }
    })

    // Update job progress after batch completion.
    // Swallow DB errors here — a failed progress update must NOT kill the job.
    try {
      const currentProgress = await this.calculateProgress(job.id)
      await this.updateJobProgress(job.id, currentProgress)
      logger.debug('Batch processed', {
        jobId: job.id,
        batchSize: batch.length,
        successful: results.filter(r => r.status === 'fulfilled').length,
        failed: results.filter(r => r.status === 'rejected').length,
        totalProgress: `${currentProgress.processed + currentProgress.failed + currentProgress.skipped}/${currentProgress.total}`
      })
    } catch (progressError) {
      logger.warn('Failed to update progress after batch — continuing job', {
        jobId: job.id,
        error: progressError instanceof Error ? progressError.message : 'Unknown error'
      })
    }
  }

  /**
   * Get all files to import from the specified folder
   */
  private static async getAllFilesToImport(job: ImportJob): Promise<CloudStorageFile[]> {
    const folderId = (job.inputData.folderId as string) || 'root'
    return await this.listFilesRecursive(job, folderId)
  }

  /**
   * Recursively list files from a folder and all subfolders.
   * Apideck path recurses into subfolders in parallel.
   * Legacy provider path stays flat (no recursion — different API pattern).
   */
  private static async listFilesRecursive(
    job: ImportJob,
    folderId: string,
    depth: number = 0
  ): Promise<CloudStorageFile[]> {
    if (depth > 10) return []

    const { data: conn } = await supabaseAdmin
      .from('apideck_connections')
      .select('connection_id, consumer_id')
      .eq('user_id', job.userId)
      .eq('provider', job.provider)
      .maybeSingle()

    // The Microsoft OAuth callback writes a placeholder apideck_connections row
    // (connection_id: 'microsoft-<userId>') so the status UI shows connected.
    // It is NOT a real Apideck connection — attempting to use it with the Apideck
    // API would fail. Detect and skip it, falling through to the legacy provider.
    const isRealApideck = conn?.connection_id &&
      !conn.connection_id.startsWith('microsoft-')

    if (!isRealApideck) {
      // Legacy fallback — flat listing only
      const provider = this.providers[job.provider]
      if (!provider) throw createError.badRequest(`Unsupported provider: ${job.provider}`)
      const response = await provider.listFiles(job.userId, folderId, undefined, 100)
      return response.files.filter(f => ImportJobManager.SUPPORTED_MIME_TYPES.includes(f.mimeType || ''))
    }

    // Apideck path — single paginated call returns BOTH files and folders
    let allItems: any[] = []
    let cursor: string | undefined
    do {
      const resp = await Apideck.listFiles(
        conn.consumer_id || job.userId,
        conn.connection_id,
        { folder_id: folderId, cursor, limit: 100 }
      )
      allItems.push(...(resp?.data ?? []))
      cursor = resp?.meta?.cursors?.next || undefined
    } while (cursor)

    const files: CloudStorageFile[] = []
    const subfolderPromises: Promise<CloudStorageFile[]>[] = []

    for (const item of allItems) {
      if (item.type === 'folder') {
        subfolderPromises.push(this.listFilesRecursive(job, item.id, depth + 1))
      } else {
        const mimeType = item.mime_type || ''

        // Include files that either match a supported mime_type, OR have no mime_type
        // at all from the Apideck response. Google native files (Docs/Sheets/Slides)
        // commonly return null mime_type from the list endpoint — we resolve the real
        // type during download via getFileMetadata rather than silently dropping here.
        const isKnownSupported = ImportJobManager.SUPPORTED_MIME_TYPES.includes(mimeType)
        const isMimeUnknown = mimeType === ''

        if (isKnownSupported || isMimeUnknown) {
          files.push({
            id: item.id,
            name: item.name,
            mimeType,  // may be '' — download phase will resolve via getFileMetadata
            size: item.size,
            modifiedTime: item.updated_at,
            webViewLink: item.web_url
          })
        }
      }
    }

    const subfolderResults = await Promise.all(subfolderPromises)
    for (const subFiles of subfolderResults) {
      files.push(...subFiles)
    }

    return files
  }

  /**
   * Process a single file
   */
  private static async processFile(
    job: ImportJob,
    file: CloudStorageFile,
    maxRetries: number
  ): Promise<FileProcessingResult> {
    let attempts = 0
    let lastError: Error | null = null

    // Update current file in progress
    await this.updateJobProgress(job.id, { current_file: file.name })

    // Add file status as pending
    await this.addFileStatus(job.id, {
      fileId: file.id,
      fileName: file.name,
      status: 'pending',
      timestamp: new Date()
    })

    // Per-file timeout: 30 seconds covers download + extraction + embedding.
    // Any single operation that hangs longer than this is treated as a failure
    // and the next file is attempted immediately.
    const FILE_TIMEOUT_MS = 30_000

    while (attempts < maxRetries) {
      attempts++

      try {
        // Check for duplicates first (no timeout needed — fast DB read)
        const isDuplicate = await this.checkForDuplicate(job.userId, job.provider, file)
        if (isDuplicate) {
          await this.updateFileStatus(job.id, file.id, {
            status: 'duplicate',
            reason: 'File already processed with same content hash'
          })
          return {
            success: true,
            status: 'duplicate',
            reason: 'File already processed with same content hash'
          }
        }

        // Update status to processing
        await this.updateFileStatus(job.id, file.id, { status: 'processing' })

        // Download and process file — race against a 30s hard timeout.
        // If the timeout fires first, the AbortError propagates to the catch block
        // below, which marks the file as failed and continues to the next file.
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Processing timeout (30s)')), FILE_TIMEOUT_MS)
        )
        const result = await Promise.race([
          this.downloadAndProcessFile(job, file),
          timeoutPromise
        ])

        // Update status to completed
        await this.updateFileStatus(job.id, file.id, {
          status: 'completed'
        })

        // Recalculate and push progress after each completed file so the UI
        // reflects accurate counts without waiting for the end of the batch
        const updatedProgress = await this.calculateProgress(job.id)
        await this.updateJobProgress(job.id, updatedProgress)

        return result

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error')

        // Produce a human-readable reason for the UI
        const rawMessage = lastError.message
        const friendlyReason = rawMessage.includes('timeout')
          ? 'Processing timeout'
          : rawMessage.includes('too large') || rawMessage.includes('File too large')
            ? 'File too large'
            : rawMessage.includes('mime_type') || rawMessage.includes('Unsupported')
              ? 'Unsupported file type'
              : rawMessage.includes('extract') || rawMessage.includes('Extraction')
                ? 'Extraction error'
                : rawMessage.includes('empty')
                  ? 'Downloaded file is empty'
                  : rawMessage
        
        logger.warn('File processing attempt failed', {
          jobId: job.id,
          fileId: file.id,
          fileName: file.name,
          attempt: attempts,
          maxRetries,
          error: rawMessage,
          friendlyReason
        })

        if (attempts >= maxRetries) {
          // Final failure — mark with human-readable reason and continue
          await this.updateFileStatus(job.id, file.id, {
            status: 'failed',
            error: friendlyReason
          })

          // Recalculate progress so the failed count is reflected in the UI
          const updatedProgress = await this.calculateProgress(job.id)
          await this.updateJobProgress(job.id, updatedProgress)

          return {
            success: false,
            status: 'failed',
            error: friendlyReason
          }
        }

        // Wait before retry (exponential backoff), but don't retry timeouts —
        // if a file timed out once it will almost certainly time out again.
        if (rawMessage.includes('timeout')) {
          await this.updateFileStatus(job.id, file.id, {
            status: 'failed',
            error: friendlyReason
          })
          const updatedProgress = await this.calculateProgress(job.id)
          await this.updateJobProgress(job.id, updatedProgress)
          return { success: false, status: 'failed', error: friendlyReason }
        }

        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000))
      }
    }

    // Should not reach here, but handle just in case
    return {
      success: false,
      status: 'failed',
      error: lastError?.message || 'Max retries exceeded'
    }
  }

  /**
   * Check if file is a duplicate based on content hash and provider version
   */
  private static async checkForDuplicate(
    userId: string,
    provider: string,
    file: CloudStorageFile
  ): Promise<boolean> {
    try {
      // For now, check by external_id and provider
      // In a full implementation, we would also check content hash
      const { data, error } = await supabaseAdmin
        .from('file_processing_history')
        .select('id')
        .eq('user_id', userId)
        .eq('provider', provider)
        .eq('external_id', file.id)
        .eq('status', 'completed')
        .limit(1)

      if (error) {
        logger.warn('Error checking for duplicates', { error: error.message })
        return false // Assume not duplicate if we can't check
      }

      return (data && data.length > 0)
    } catch (error) {
      logger.warn('Error checking for duplicates', {
        userId,
        provider,
        fileId: file.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return false // Assume not duplicate if we can't check
    }
  }

  /**
   * Download and process a file with streaming support for large files
   */
  private static async downloadAndProcessFile(
    job: ImportJob,
    file: CloudStorageFile
  ): Promise<FileProcessingResult> {
    let createdFileId: string | null = null

    try {
      const provider = this.providers[job.provider]
      if (!provider) {
        throw new Error(`Unsupported provider: ${job.provider}`)
      }

      // Check file size limits before downloading
      const maxFileSize = 50 * 1024 * 1024 // 50MB limit for batch processing
      if (file.size && file.size > maxFileSize) {
        return {
          success: false,
          status: 'skipped',
          reason: `File too large: ${Math.round(file.size / 1024 / 1024)}MB (max: 50MB)`
        }
      }

      // Download file content with streaming support
      const fileBuffer = await this.downloadFileWithStreaming(provider, job.userId, file, job.provider)
      
      // Calculate content hash for deduplication
      const contentHash = createHash('sha256').update(fileBuffer).digest('hex')

      // Check for existing file with same content hash
      const hasExistingIngest = await fileIngestRepo.existsWithContentHash(job.userId, contentHash)

      if (hasExistingIngest) {
        return {
          success: true,
          status: 'duplicate',
          reason: 'File with identical content already exists'
        }
      }

      // Check if a previous (failed) attempt already created a files row for this
      // external_id. If so, reuse it and reset its status rather than inserting a
      // new row, which would collide on the UNIQUE(owner_id, path) constraint.
      const { data: existingFile } = await supabaseAdmin
        .from('files')
        .select('id')
        .eq('owner_id', job.userId)
        .eq('external_id', file.id)
        .maybeSingle()

      let fileMetadata: { id: string } | null = null

      if (existingFile?.id) {
        // Reset the stale row so the pipeline can overwrite it cleanly
        const { data: updatedFile, error: updateError } = await supabaseAdmin
          .from('files')
          .update({
            name: file.name,
            size_bytes: fileBuffer.length,
            mime_type: file.mimeType,
            processed: false,
            processing_status: 'pending',
            metadata: {
              original_size: file.size,
              modified_time: file.modifiedTime,
              content_hash: contentHash,
              provider_version: file.modifiedTime,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingFile.id)
          .select('id')
          .single()

        if (updateError || !updatedFile) {
          throw new Error(`Failed to reset existing file record: ${updateError?.message}`)
        }
        fileMetadata = updatedFile
      } else {
        // Fresh insert — no previous attempt for this external_id
        const { data: insertedFile, error: fileError } = await supabaseAdmin
          .from('files')
          .insert({
            owner_id: job.userId,
            name: file.name,
            path: file.name,
            size_bytes: fileBuffer.length,
            mime_type: file.mimeType,
            source: job.provider === 'google' ? 'google' : 'microsoft',
            external_id: file.id,
            external_url: file.webViewLink,
            processed: false,
            processing_status: 'pending',
            metadata: {
              original_size: file.size,
              modified_time: file.modifiedTime,
              content_hash: contentHash,
              provider_version: file.modifiedTime,
            },
          })
          .select('id')
          .single()

        if (fileError || !insertedFile) {
          throw new Error(`Failed to create file metadata: ${fileError?.message}`)
        }
        fileMetadata = insertedFile
      }

      createdFileId = fileMetadata!.id

      const ingestMeta = {
        original_size: file.size,
        modified_time: file.modifiedTime,
        content_hash: contentHash,
        provider_version: file.modifiedTime || new Date().toISOString(),
        external_id: file.id,
        external_url: file.webViewLink,
        provider: job.provider,
        file_name: file.name,
        mime_type: file.mimeType,
      }

      await fileIngestRepo.upsert({
        file_id: fileMetadata.id,
        owner_id: job.userId,
        status: 'processing',
        source: job.provider,
        meta: ingestMeta,
      })

       // Extract text from the downloaded buffer
      const extraction = await extractTextFromBuffer(
        fileBuffer,
        file.mimeType || 'application/octet-stream',
        file.name
      )

      // Run full indexing pipeline: chunk → embed → vector write
      const indexingResult = await indexFile({
        user_id: job.userId,
        file_id: fileMetadata.id,
        source: job.provider,
        external_id: file.id,
        filename: file.name,
        mime_type: file.mimeType || 'application/octet-stream',
        content: extraction.text,
        last_modified: file.modifiedTime,
      })

      if (!indexingResult.success) {
        throw new Error(`Indexing pipeline failed: ${indexingResult.error}`)
      }

      const chunksCreated = indexingResult.stages.chunking.chunk_count ?? 0

      // Record processing history with actual chunk count
      await supabaseAdmin
        .from('file_processing_history')
        .insert({
          user_id: job.userId,
          job_id: job.id,
          external_id: file.id,
          provider: job.provider,
          file_name: file.name,
          content_hash: contentHash,
          provider_version: file.modifiedTime || new Date().toISOString(),
          file_size: fileBuffer.length,
          mime_type: file.mimeType,
          status: 'completed',
          chunks_created: chunksCreated,
          app_file_id: fileMetadata.id,
          processed_at: new Date()
        })

      // Mark ingest record as ready
      await fileIngestRepo.upsert({
        file_id: fileMetadata.id,
        owner_id: job.userId,
        status: 'ready',
        source: job.provider,
        meta: {
          ...ingestMeta,
          processed_at: new Date().toISOString(),
          chunks_created: chunksCreated,
        },
      })

      // Increment profile usage counters — fire-and-forget, don't block on failure
      console.log('[usage-counter] calling increment_document_usage', job.userId, fileBuffer.length)
      supabaseAdmin.rpc('increment_document_usage', {
        p_user_id: job.userId,
        p_bytes: fileBuffer.length
      }).then(({ error: usageErr }) => {
        if (usageErr) console.error('[job-manager:usage-sync-failed]', { userId: job.userId, error: usageErr.message })
      })

      logger.info('File indexed successfully via ImportJobManager', {
        jobId: job.id,
        fileId: file.id,
        appFileId: fileMetadata.id,
        fileName: file.name,
        size: fileBuffer.length,
        contentHash,
        chunksCreated,
      })

      return {
        success: true,
        status: 'completed',
        chunksCreated,
        appFileId: fileMetadata.id
      }

    } catch (error) {
      logger.error('Error processing file', {
        jobId: job.id,
        fileId: file.id,
        fileName: file.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      if (createdFileId) {
        try {
          await fileIngestRepo.updateStatus(
            job.userId,
            createdFileId,
            'error',
            error instanceof Error ? error.message : 'Unknown error'
          )
        } catch (statusError) {
          logger.error('Failed to update ingest status after job error', {
            userId: job.userId,
            fileId: createdFileId,
            error: statusError instanceof Error ? statusError.message : 'Unknown status update error',
          })
        }
      }

      throw error
    }
  }

  /**
   * Download file with streaming support to prevent memory exhaustion
   */
  private static async downloadFileWithStreaming(
    provider: CloudStorageProvider,
    userId: string,
    file: CloudStorageFile,
    jobProvider: 'google' | 'microsoft'
  ): Promise<Buffer> {
    // Hard download timeout — 25s, fires 5s before the outer 30s Promise.race.
    // This ensures the fetch is cancelled at the network level so the Vercel
    // function doesn't stay alive waiting for a hung TCP stream.
    const downloadAbort = new AbortController()
    const downloadTimeoutId = setTimeout(() => downloadAbort.abort(), 25_000)
    const abortSignal = downloadAbort.signal

    try {
            // Check for Apideck connection
      const { data: conn, error: connError } = await supabaseAdmin
        .from('apideck_connections')
        .select('connection_id, consumer_id')
        .eq('user_id', userId)
        .eq('provider', jobProvider === 'google' ? 'google' : 'microsoft')
        .maybeSingle()

      if (connError) {
        console.error('[job-manager:apideck-download-lookup-failed]', { userId, provider: jobProvider, error: connError.message })
      }

      // Same sentinel check as listFilesRecursive — the Microsoft callback writes a
      // placeholder row (connection_id: 'microsoft-<userId>') that is not a real
      // Apideck connection. Skip it and fall through to the legacy provider download.
      const isRealApideck = conn?.connection_id &&
        !conn.connection_id.startsWith('microsoft-')

      if (isRealApideck) {
        const consumerId = conn!.consumer_id || userId

        const GOOGLE_NATIVE_EXPORT_MAP: Record<string, string> = {
          'application/vnd.google-apps.document':     'text/plain',
          'application/vnd.google-apps.spreadsheet':  'text/csv',
          'application/vnd.google-apps.presentation': 'text/plain',
        }

        // When mime_type is empty (common for Google native files from Apideck list),
        // fetch the file's metadata to get the real mime_type before deciding how to
        // download. This avoids a 403 from trying to binary-download a native file.
        if (!file.mimeType && jobProvider === 'google') {
          const meta = await Apideck.getFileMetadata(consumerId, conn.connection_id, file.id)
          const resolvedMime: string = meta?.mime_type ?? ''
          if (resolvedMime) {
            console.log(`[job-manager:mime-resolved] file=${file.id} resolved=${resolvedMime}`)
            file.mimeType = resolvedMime
          } else {
            // Apideck metadata still didn't return a type. Skip this file — we cannot
            // safely extract text from an unknown binary without knowing its format.
            throw new Error(`Cannot determine mime_type for file "${file.name}" — skipping`)
          }
        }

        const exportMime = file.mimeType ? GOOGLE_NATIVE_EXPORT_MAP[file.mimeType] : undefined

        if (exportMime) {
          const res = await fetch(
            `${process.env.APIDECK_API_BASE_URL}/file-storage/files/${encodeURIComponent(file.id)}/export?format=${encodeURIComponent(exportMime)}`,
            { headers: { ...apideckHeaders(consumerId), 'x-apideck-connection-id': conn.connection_id }, signal: abortSignal }
          )
          if (!res.ok) throw new Error(`Apideck export failed: ${res.status} ${await res.text()}`)
          // Update mimeType so the downstream extractor handles the exported format correctly
          file.mimeType = exportMime
          clearTimeout(downloadTimeoutId)
          return Buffer.from(await res.arrayBuffer())
        }

        const apideckBuffer = await Apideck.downloadFile(consumerId, conn.connection_id, file.id, abortSignal)
        clearTimeout(downloadTimeoutId)
        return apideckBuffer
      }

      // Legacy provider fallback
      const buffer = await provider.downloadFile(userId, file.id, abortSignal)
      if (buffer.length === 0) throw new Error('Downloaded file is empty')
      clearTimeout(downloadTimeoutId)
      return buffer
    } catch (error) {
      clearTimeout(downloadTimeoutId)
      // Translate AbortError into a timeout message so the friendly-reason
      // mapper in processFile shows 'Processing timeout' instead of 'AbortError'
      const isAbort = error instanceof Error && (
        error.name === 'AbortError' || error.message.includes('aborted')
      )
      const wrappedError = isAbort
        ? new Error('Processing timeout (download aborted after 25s)')
        : error
      logger.error('Error downloading file with streaming', {
        userId,
        fileId: file.id,
        fileName: file.name,
        error: wrappedError instanceof Error ? wrappedError.message : 'Unknown error'
      })
      throw wrappedError
    }
  }

  /**
   * Update job status
   */
  private static async updateJobStatus(
    jobId: string,
    status: ImportJob['status'],
    additionalData: Record<string, unknown> = {}
  ): Promise<void> {
    try {
      const updateData = {
        status,
        updated_at: new Date(),
        ...additionalData
      }

      const { error } = await supabaseAdmin
        .from('job_logs')
        .update(updateData)
        .eq('id', jobId)

      if (error) {
        throw createDatabaseError('Failed to update job status', error)
      }
    } catch (error) {
      logger.error('Error updating job status', {
        jobId,
        status,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Update job progress and bump last_heartbeat so the frontend staleness
   * detector knows the job is still alive.
   */
  private static async updateJobProgress(
    jobId: string,
    progress: Partial<ImportJob['progress']>
  ): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .rpc('update_job_progress', {
          p_job_id: jobId,
          // Use ?? null not || null — progress counts can legitimately be 0 (falsy),
          // and || null would send null causing the RPC to preserve the old value.
          p_total: progress.total ?? null,
          p_processed: progress.processed ?? null,
          p_failed: progress.failed ?? null,
          p_skipped: progress.skipped ?? null,
          p_current_file: progress.current_file ?? null
        })

      if (error) {
        throw createDatabaseError('Failed to update job progress', error)
      }

      // Bump heartbeat — fire-and-forget, never block progress update on this
      supabaseAdmin
        .from('job_logs')
        .update({ last_heartbeat: new Date().toISOString() })
        .eq('id', jobId)
        .then(({ error: hbErr }) => {
          if (hbErr) logger.warn('Failed to update heartbeat', { jobId, error: hbErr.message })
        })
    } catch (error) {
      logger.error('Error updating job progress', {
        jobId,
        progress,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Process a specific slice of files for a job (offset + limit).
   * Called by the client-driven chunked batch endpoint — each invocation
   * processes exactly `limit` files starting at `offset`, then returns.
   * This keeps every Vercel function call well under the execution limit.
   */
  static async processChunk(
    jobId: string,
    offset: number,
    limit: number
  ): Promise<{ processed: number; failed: number; skipped: number; done: boolean }> {
    const job = await this.getJob(jobId)
    if (!job) throw createError.notFound('Job not found')

    if (!['pending', 'processing'].includes(job.status)) {
      throw createError.badRequest(`Job cannot be processed in status: ${job.status}`)
    }

    // Mark as processing on first chunk
    if (job.status === 'pending') {
      await this.updateJobStatus(jobId, 'processing', { started_at: new Date() })
    }

    // Retrieve the full file list stored in input_data (set during job creation)
    const allFiles = (job.inputData.fileList as import('@/app/lib/cloud-storage/types').CloudStorageFile[]) || []
    const chunk = allFiles.slice(offset, offset + limit)
    const maxRetries = (job.inputData.maxRetries as number) || 3

    // Process each file in the chunk with full per-file isolation
    for (const file of chunk) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Processing timeout (30s)')), 30_000)
        )
        const result = await Promise.race([
          this.processFile(job, file, maxRetries),
          timeoutPromise
        ])
        void result // result is already written to DB inside processFile
      } catch (err) {
        // processFile should never throw — this is a safety net
        logger.error('Unexpected throw from processFile in processChunk', {
          jobId,
          fileId: file.id,
          error: err instanceof Error ? err.message : 'Unknown error'
        })
      }
    }

    // Recalculate progress after the chunk
    const progress = await this.calculateProgress(jobId)
    await this.updateJobProgress(jobId, progress)

    const totalAttempted = progress.processed + progress.failed + progress.skipped
    const done = progress.total > 0 && totalAttempted >= progress.total

    if (done) {
      const outputData = {
        totalFiles: progress.total,
        processedFiles: progress.processed,
        failedFiles: progress.failed,
        skippedFiles: progress.skipped,
        duplicateFiles: await this.countFilesByStatus(jobId, 'duplicate')
      }
      await this.updateJobProgress(jobId, { ...progress, current_file: null })
      await this.updateJobStatus(jobId, 'completed', {
        completed_at: new Date(),
        output_data: outputData
      })
    }

    return {
      processed: progress.processed,
      failed: progress.failed,
      skipped: progress.skipped,
      done
    }
  }

  /**
   * Parallel version of processChunk.
   *
   * Phase 1 — Download + extract all files in the chunk simultaneously
   *            (Promise.allSettled, 30s AbortController per file)
   * Phase 2 — Chunk all successfully extracted files
   * Phase 3 — ONE generateBatchEmbeddings call for ALL chunks across ALL files
   * Phase 4 — vectorStore.addDocuments + DB finalization per file
   *
   * Cuts embedding API calls from N (one per file) to 1 per chunk-of-files.
   * Cuts download wall-clock time from N×avg_download to max(download_times).
   */
  static async processChunkParallel(
    jobId: string,
    offset: number,
    limit: number
  ): Promise<{ processed: number; failed: number; skipped: number; done: boolean }> {
    const job = await this.getJob(jobId)
    if (!job) throw createError.notFound('Job not found')

    if (!['pending', 'processing'].includes(job.status)) {
      throw createError.badRequest(`Job cannot be processed in status: ${job.status}`)
    }
    if (job.status === 'pending') {
      await this.updateJobStatus(jobId, 'processing', { started_at: new Date() })
    }

    const allFiles = (job.inputData.fileList as CloudStorageFile[]) || []
    const chunk = allFiles.slice(offset, offset + limit)

    // ── Terminal-state guard ───────────────────────────────────────────────
    // If offset is at or past the end of fileList, no further work
    // is possible from this entry point. Force done:true so the
    // client stops polling, and reconcile any stuck file_status
    // rows so progress numbers reflect reality.
    if (chunk.length === 0) {
      logger.info('Chunk request past end of fileList — terminating', {
        jobId, offset, fileListLength: allFiles.length
      })
      // Reconcile any files left in pending/processing — they will not
      // be retried by the chunk loop, so mark them as failed with a clear
      // reason. This makes the file_status table accurate and lets
      // calculateProgress return a totalAttempted that matches total.
      await this.reconcileStuckFileStatuses(jobId,
        'Job terminated before processing — chunk loop reached end of file list'
      )
      const progress = await this.calculateProgress(jobId)
      await this.updateJobProgress(jobId, { ...progress, current_file: null })
      await this.updateJobStatus(jobId, 'completed', {
        completed_at: new Date(),
        output_data: {
          totalFiles: progress.total,
          processedFiles: progress.processed,
          failedFiles: progress.failed,
          skippedFiles: progress.skipped,
          duplicateFiles: await this.countFilesByStatus(jobId, 'duplicate')
        }
      })
      return {
        processed: 0,
        failed: 0,
        skipped: 0,
        done: true
      }
    }

    // ── Phase 1: parallel download + extract ──────────────────────────────────
    type DownloadOk = { ok: true; file: CloudStorageFile; buffer: Buffer; text: string; mimeType: string }
    type DownloadFail = { ok: false; file: CloudStorageFile; reason: string }
    type DownloadOutcome = DownloadOk | DownloadFail

    const downloadOutcomes: DownloadOutcome[] = await Promise.allSettled(
      chunk.map(async (file): Promise<DownloadOutcome> => {
        await this.addFileStatus(job.id, { fileId: file.id, fileName: file.name, status: 'pending', timestamp: new Date() })
        await this.updateFileStatus(job.id, file.id, { status: 'processing' })
        await this.updateJobProgress(job.id, { current_file: file.name })

        // Duplicate check
        const isDuplicate = await this.checkForDuplicate(job.userId, job.provider, file)
        if (isDuplicate) {
          await this.updateFileStatus(job.id, file.id, { status: 'duplicate', reason: 'File already processed with same content hash' })
          return { ok: false, file, reason: 'duplicate' }
        }

        // File size guard (100 MB)
        const MAX_BYTES = 100 * 1024 * 1024
        if (file.size && file.size > MAX_BYTES) {
          const reason = `File too large: ${Math.round(file.size / 1024 / 1024)}MB (max 100MB)`
          await this.updateFileStatus(job.id, file.id, { status: 'skipped', reason })
          return { ok: false, file, reason }
        }

        // Download with 30s hard abort
        const abort = new AbortController()
        const tid = setTimeout(() => abort.abort(), 30_000)
        try {
          const provider = this.providers[job.provider]
          logger.info('[import:download-start]', { jobId: job.id, fileId: file.id, fileName: file.name, mimeType: file.mimeType, provider: job.provider })
          const buffer = await this.downloadFileWithStreaming(provider, job.userId, file, job.provider)
          clearTimeout(tid)
          logger.info('[import:download-ok]', { jobId: job.id, fileId: file.id, fileName: file.name, bytes: buffer.length })

          let extraction = await extractTextFromBuffer(
            buffer,
            file.mimeType || 'application/octet-stream',
            file.name
          )

          // Image-based PDF: pdfjs-dist returns empty string for scanned/image PDFs.
          // SPEC 4 Step 3: Use Gemini native PDF embedding instead of GPT-4o-mini vision.
          // embedPdfPages uploads the raw buffer to the Gemini Files API and embeds it
          // directly — no OCR/text-extraction step needed.
          if (
            (file.mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) &&
            !extraction.text.trim()
          ) {
            const hbInterval = setInterval(() => {
              this.updateJobProgress(job.id, { current_file: `${file.name} (native PDF embed)` })
                .catch(() => {})
            }, 10_000)
            try {
              const { embedPdfPages } = await import('@/app/lib/indexing/pdf-vision-extractor')
              const pdfEmbedResult = await embedPdfPages(buffer, file.name)
              clearInterval(hbInterval)
              logger.info('[import:native-pdf-embed-success]', {
                fileName: file.name,
                embeddingCount: pdfEmbedResult.embeddings.length,
                costUsd: pdfEmbedResult.costUsd,
              })
              // Signal to Phase 2 that this file has pre-built embeddings
              // (no text chunks to generate — embeddings are stored directly).
              return { ok: true as const, file, buffer, text: '', mimeType: file.mimeType || 'application/pdf', nativePdfEmbeddings: pdfEmbedResult.embeddings }
            } catch (embedErr) {
              clearInterval(hbInterval)
              const reason = embedErr instanceof Error
                ? `Native PDF embed failed: ${embedErr.message}`
                : 'Native PDF embed failed'
              logger.warn('[import:native-pdf-embed-failed]', { fileName: file.name, error: reason })
              await this.updateFileStatus(job.id, file.id, { status: 'failed', error: reason })
              return { ok: false, file, reason }
            }
          }

          return { ok: true, file, buffer, text: extraction.text, mimeType: file.mimeType || 'application/octet-stream' }
        } catch (err) {
          clearTimeout(tid)
          const raw = err instanceof Error ? err.message : 'Unknown error'
          const stack = err instanceof Error ? err.stack : undefined
          logger.error('[import:download-failed]', {
            jobId: job.id, fileId: file.id, fileName: file.name,
            provider: job.provider, mimeType: file.mimeType,
            error: raw, stack
          })
          const friendly = raw.includes('timeout') || raw.includes('aborted') ? 'Processing timeout'
            : raw.includes('too large') ? 'File too large'
            : raw.includes('Unsupported') || raw.includes('mime_type') ? 'Unsupported file type'
            : raw.includes('extract') || raw.includes('Extraction') ? 'Extraction error'
            : raw.includes('empty') ? 'Downloaded file is empty'
            : raw
          await this.updateFileStatus(job.id, file.id, { status: 'failed', error: friendly })
          return { ok: false, file, reason: friendly }
        }
      })
    ).then(settled => settled.map((r, i) => {
      if (r.status === 'fulfilled') return r.value
      const friendly = r.reason instanceof Error ? r.reason.message : 'Unknown error'
      this.updateFileStatus(job.id, chunk[i].id, { status: 'failed', error: friendly }).catch(() => {})
      return { ok: false as const, file: chunk[i], reason: friendly }
    }))

    // ── Phase 2: chunk all successfully extracted files ───────────────────────
    type FileGroup = {
      file: CloudStorageFile
      buffer: Buffer
      mimeType: string
      appFileId: string
      contentHash: string
      chunks: ReturnType<typeof createTextChunks>
      chunkOffset: number
      /** Pre-built embeddings for image-based PDFs (Gemini native embed path). */
      nativePdfEmbeddings?: number[][]
    }
    const fileGroups: FileGroup[] = []
    const allChunkTexts: string[] = []

    for (const outcome of downloadOutcomes) {
      if (!outcome.ok) continue
      const { file, buffer, text, mimeType } = outcome
      const nativePdfEmbeddings = (outcome as any).nativePdfEmbeddings as number[][] | undefined

      const contentHash = createHash('sha256').update(buffer).digest('hex')

      // Upsert file row in app.files
      const { data: existingFile } = await supabaseAdmin
        .from('files')
        .select('id')
        .eq('owner_id', job.userId)
        .eq('external_id', file.id)
        .maybeSingle()

      let appFileId: string
      if (existingFile?.id) {
        await supabaseAdmin.from('files').update({
          name: file.name, size_bytes: buffer.length, mime_type: mimeType,
          processed: false, processing_status: 'pending',
          metadata: { content_hash: contentHash, provider_version: file.modifiedTime },
          updated_at: new Date().toISOString()
        }).eq('id', existingFile.id)
        appFileId = existingFile.id
      } else {
        const { data: inserted, error: insertErr } = await supabaseAdmin
          .from('files')
          .insert({
            owner_id: job.userId, name: file.name, path: file.name,
            size_bytes: buffer.length, mime_type: mimeType,
            source: job.provider === 'google' ? 'google' : 'microsoft',
            external_id: file.id, external_url: file.webViewLink,
            processed: false, processing_status: 'pending',
            metadata: { content_hash: contentHash, provider_version: file.modifiedTime }
          })
          .select('id').single()
        if (insertErr || !inserted) {
          await this.updateFileStatus(job.id, file.id, { status: 'failed', error: `DB insert failed: ${insertErr?.message}` })
          continue
        }
        appFileId = inserted.id
      }

      await fileIngestRepo.upsert({
        file_id: appFileId, owner_id: job.userId, status: 'processing', source: job.provider,
        meta: { content_hash: contentHash, provider_version: file.modifiedTime, external_id: file.id, file_name: file.name, mime_type: mimeType }
      })

      // Image-based PDFs arrive with pre-built embeddings from the Gemini native embed path.
      // Skip text chunking for these — store a single synthetic chunk with the whole-doc embedding.
      if (nativePdfEmbeddings && nativePdfEmbeddings.length > 0) {
        fileGroups.push({ file, buffer, mimeType, appFileId, contentHash, chunks: [], chunkOffset: allChunkTexts.length, nativePdfEmbeddings })
        continue
      }

      const chunks = createTextChunks(text, appFileId, file.name, mimeType, job.userId, 1000)
      if (chunks.length === 0) {
        await this.updateFileStatus(job.id, file.id, { status: 'failed', error: 'No text chunks extracted' })
        continue
      }

      fileGroups.push({ file, buffer, mimeType, appFileId, contentHash, chunks, chunkOffset: allChunkTexts.length })
      allChunkTexts.push(...chunks.map(c => c.content))
    }

    // ── Phase 3: single batch embedding call ──────────────────────────────────
    let embeddingResult: Awaited<ReturnType<typeof generateBatchEmbeddings>> | null = null
    if (allChunkTexts.length > 0) {
      try {
        embeddingResult = await generateBatchEmbeddings(allChunkTexts)
      } catch (embErr) {
        logger.error('Batch embedding failed for chunk', { jobId, error: embErr instanceof Error ? embErr.message : 'Unknown' })
        for (const g of fileGroups) {
          await this.updateFileStatus(job.id, g.file.id, { status: 'failed', error: 'Embedding API error' })
        }
        const progress = await this.calculateProgress(jobId)
        await this.updateJobProgress(jobId, progress)
        const totalAttempted = progress.processed + progress.failed + progress.skipped
        return { processed: progress.processed, failed: progress.failed, skipped: progress.skipped, done: totalAttempted >= progress.total }
      }
    }

    // ── Phase 4: vector write + per-file DB finalization ──────────────────────
    const vectorStore = getVectorStore()

    for (const group of fileGroups) {
      const { file, buffer, mimeType, appFileId, contentHash, chunks, chunkOffset, nativePdfEmbeddings } = group

      // ── Native PDF embed path (image-based PDFs) ──────────────────────────
      if (nativePdfEmbeddings && nativePdfEmbeddings.length > 0) {
        const EMBED_MODEL = 'gemini-embedding-2-preview'
        const nativeVectorDocs = nativePdfEmbeddings.map((embedding, i) => ({
          id: `${appFileId}_native_${i}`,
          content: `[image-based PDF: ${file.name}]`,
          embedding,
          metadata: {
            fileId: appFileId, fileName: file.name, chunkIndex: i,
            userId: job.userId, source: job.provider, externalId: file.id,
            createdAt: new Date().toISOString(),
            embeddingModel: EMBED_MODEL,
            embeddingDimensions: embedding.length,
            mimeType, isNativePdfEmbed: true
          }
        }))
        try {
          await vectorStore.addDocuments(job.userId, nativeVectorDocs)
          await supabaseAdmin.from('file_processing_history').insert({
            user_id: job.userId, job_id: job.id, external_id: file.id, provider: job.provider,
            file_name: file.name, content_hash: contentHash, provider_version: file.modifiedTime || new Date().toISOString(),
            file_size: buffer.length, mime_type: mimeType, status: 'completed',
            chunks_created: nativePdfEmbeddings.length, app_file_id: appFileId, processed_at: new Date()
          })
          await fileIngestRepo.upsert({
            file_id: appFileId, owner_id: job.userId, status: 'ready', source: job.provider,
            meta: { content_hash: contentHash, processed_at: new Date().toISOString(), chunks_created: nativePdfEmbeddings.length }
          })
          supabaseAdmin.rpc('increment_document_usage', { p_user_id: job.userId, p_bytes: buffer.length })
            .then(({ error: e }) => { if (e) logger.warn('increment_document_usage failed', { userId: job.userId, error: e.message }) })
          await this.updateFileStatus(job.id, file.id, { status: 'completed' })
        } catch (writeErr) {
          logger.error('Native PDF embed vector write failed', { jobId, fileId: file.id, error: writeErr instanceof Error ? writeErr.message : 'Unknown' })
          await this.updateFileStatus(job.id, file.id, { status: 'failed', error: 'Vector write failed' })
          await fileIngestRepo.updateStatus(job.userId, appFileId, 'error', writeErr instanceof Error ? writeErr.message : 'Unknown').catch(() => {})
        }
        continue
      }

      // ── Standard text-chunk embed path ────────────────────────────────────
      const embeddings = embeddingResult!.embeddings.slice(chunkOffset, chunkOffset + chunks.length)

      const vectorDocs = chunks.map((chunk, i) => ({
        id: `${appFileId}_${chunk.chunkIndex}`,
        content: chunk.content,
        embedding: embeddings[i].embedding,
        metadata: {
          fileId: appFileId, fileName: file.name, chunkIndex: chunk.chunkIndex,
          userId: job.userId, source: job.provider, externalId: file.id,
          createdAt: new Date().toISOString(),
          embeddingModel: embeddingResult!.model,
          embeddingDimensions: embeddings[i].embedding.length,
          mimeType, ...chunk.metadata
        }
      }))

      try {
        await vectorStore.addDocuments(job.userId, vectorDocs)
        await supabaseAdmin.from('file_processing_history').insert({
          user_id: job.userId, job_id: job.id, external_id: file.id, provider: job.provider,
          file_name: file.name, content_hash: contentHash, provider_version: file.modifiedTime || new Date().toISOString(),
          file_size: buffer.length, mime_type: mimeType, status: 'completed',
          chunks_created: chunks.length, app_file_id: appFileId, processed_at: new Date()
        })
        await fileIngestRepo.upsert({
          file_id: appFileId, owner_id: job.userId, status: 'ready', source: job.provider,
          meta: { content_hash: contentHash, processed_at: new Date().toISOString(), chunks_created: chunks.length }
        })
        supabaseAdmin.rpc('increment_document_usage', { p_user_id: job.userId, p_bytes: buffer.length })
          .then(({ error: e }) => { if (e) logger.warn('increment_document_usage failed', { userId: job.userId, error: e.message }) })
        await this.updateFileStatus(job.id, file.id, { status: 'completed' })
      } catch (writeErr) {
        logger.error('Vector write or DB finalization failed', { jobId, fileId: file.id, error: writeErr instanceof Error ? writeErr.message : 'Unknown' })
        await this.updateFileStatus(job.id, file.id, { status: 'failed', error: 'Vector write failed' })
        await fileIngestRepo.updateStatus(job.userId, appFileId, 'error', writeErr instanceof Error ? writeErr.message : 'Unknown').catch(() => {})
      }
    }

    // ── Finalize progress ─────────────────────────────────────────────────────
    const progress = await this.calculateProgress(jobId)
    await this.updateJobProgress(jobId, progress)

    const totalAttempted = progress.processed + progress.failed + progress.skipped
    // Guard: never mark done if total is 0 (job has no files, or total hasn't been
    // written yet). A 0-total job should stay in 'processing' until the client
    // explicitly marks it done or it times out.
    const done = progress.total > 0 && totalAttempted >= progress.total

    if (done) {
      const outputData = {
        totalFiles: progress.total, processedFiles: progress.processed,
        failedFiles: progress.failed, skippedFiles: progress.skipped,
        duplicateFiles: await this.countFilesByStatus(jobId, 'duplicate')
      }
      await this.updateJobProgress(jobId, { ...progress, current_file: null })
      await this.updateJobStatus(jobId, 'completed', { completed_at: new Date(), output_data: outputData })
    }

    return { processed: progress.processed, failed: progress.failed, skipped: progress.skipped, done }
  }

  /**
   * Prepare a job for chunked client-driven processing.
   * Lists all files from the provider, stores the list in input_data.fileList,
   * sets total count, and returns the job without starting any file processing.
   */
  static async prepareJobForChunkedProcessing(
    userId: string,
    provider: 'google' | 'microsoft',
    folderId?: string,
    options: { maxRetries?: number; files?: CloudStorageFile[]; source?: string } = {}
  ): Promise<ImportJob> {
    // Auto-recover any stale job for this user before creating a new one
    const existingJobs = await this.getUserJobs(userId, 'processing', 5)
    for (const staleJob of existingJobs) {
      if (this.isJobStale(staleJob)) {
        logger.warn('Auto-recovering stale job before new import', { staleJobId: staleJob.id, userId })
        await this.updateJobStatus(staleJob.id, 'failed', {
          completed_at: new Date(),
          error_message: 'Superseded by new import'
        })
      }
    }

    const job = await this.createJob(userId, provider, folderId, {
      maxRetries: options.maxRetries || 3,
      source: options.source
    })

    // List all files upfront and store in input_data.
    // If a pre-built file list is provided (e.g. single-file import), use it directly
    // instead of enumerating from the provider.
    await this.updateJobStatus(job.id, 'processing', { started_at: new Date() })
    const files: CloudStorageFile[] = options.files ?? await this.getAllFilesToImport(job)

    // Persist the file list and total count into input_data so each chunk
    // invocation can slice it without re-listing from the provider
    await supabaseAdmin
      .from('job_logs')
      .update({
        input_data: { ...job.inputData, fileList: files, maxRetries: options.maxRetries || 3 },
        progress: { total: files.length, processed: 0, failed: 0, skipped: 0, current_file: null, percentage: 0 }
      })
      .eq('id', job.id)

    logger.info('Job prepared for chunked processing', {
      jobId: job.id,
      userId,
      provider,
      totalFiles: files.length
    })

    return { ...job, progress: { ...job.progress, total: files.length } }
  }

  /**
   * Check if a job is stale (processing but no heartbeat for > 60s)
   */
  static isJobStale(job: ImportJob & { lastHeartbeat?: string }): boolean {
    if (job.status !== 'processing') return false
    const heartbeat = (job as any).lastHeartbeat
    if (!heartbeat) return false
    return Date.now() - new Date(heartbeat).getTime() > 60_000
  }

  /**
   * Add file status to job
   */
  private static async addFileStatus(
    jobId: string,
    fileStatus: ImportFileStatus
  ): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .rpc('add_file_status_to_job', {
          p_job_id: jobId,
          p_file_id: fileStatus.fileId,
          p_file_name: fileStatus.fileName,
          p_status: fileStatus.status,
          p_error: fileStatus.error || null,
          p_reason: fileStatus.reason || null
        })

      if (error) {
        throw createDatabaseError('Failed to add file status', error)
      }
    } catch (error) {
      logger.error('Error adding file status', {
        jobId,
        fileStatus,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Update file status in job
   */
  private static async updateFileStatus(
    jobId: string,
    fileId: string,
    updates: Partial<ImportFileStatus>
  ): Promise<void> {
    const { error } = await supabaseAdmin.rpc('update_file_status_in_job', {
      p_job_id:   jobId,
      p_file_id:  fileId,
      p_status:   updates.status   ?? null,
      p_reason:   updates.reason   ?? null,
      p_error:    updates.error    ?? null,
      p_filename: updates.fileName ?? null,
    })
    if (error) {
      logger.error('update_file_status_in_job RPC failed', {
        jobId,
        fileId,
        status: updates.status,
        error: error.message,
        code: (error as any).code,
      })
      throw error
    }
  }

  /**
   * Calculate current progress from file statuses
   */
  private static async calculateProgress(jobId: string): Promise<ImportJob['progress']> {
    try {
      const { data: job, error } = await supabaseAdmin
        .from('job_logs')
        .select('file_statuses, progress')
        .eq('id', jobId)
        .single()

      if (error || !job) {
        throw createDatabaseError('Failed to get job for progress calculation', error)
      }

      const rawStatuses = (job.file_statuses as ImportFileStatus[]) || []
      const currentProgress = job.progress as ImportJob['progress']

      // Dedup by fileId — take the latest entry per file (entries are appended
      // chronologically, so the last entry for a given fileId is the current state).
      // Without dedup, a file that starts as 'pending' then moves to 'duplicate'
      // leaves two entries in the array; the stale 'pending' entry inflates
      // totalAttempted below total and prevents the done-check from ever firing.
      const latestByFileId = new Map<string, ImportFileStatus>()
      for (const fs of rawStatuses) {
        latestByFileId.set(fs.fileId, fs)
      }
      const fileStatuses = Array.from(latestByFileId.values())

      const processed = fileStatuses.filter(f => f.status === 'completed').length
      const failed = fileStatuses.filter(f => f.status === 'failed').length
      const skipped = fileStatuses.filter(f => f.status === 'skipped' || f.status === 'duplicate').length

      // IMPORTANT: use the authoritative total stored in progress.total (written by
      // prepareJobForChunkedProcessing before any chunk runs). Do NOT fall back to
      // fileStatuses.length — file_statuses only contains files that have been
      // *started*, so early in the job it under-counts the total and causes the
      // done-check (totalAttempted >= total) to fire prematurely, marking the job
      // completed before all chunks have been processed.
      const total = currentProgress.total ?? fileStatuses.length

      const percentage = total > 0 ? Math.round(((processed + failed + skipped) / total) * 100) : 0

      return {
        total,
        processed,
        failed,
        skipped,
        current_file: currentProgress.current_file,
        percentage
      }
    } catch (error) {
      logger.error('Error calculating progress', {
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Reconcile stuck file_status rows to 'failed'.
   * Called by the terminal-state guard when offset reaches the end of fileList.
   * Any file still in 'pending' or 'processing' will never be retried by the
   * chunk loop, so we mark them failed with a clear reason so calculateProgress
   * returns a totalAttempted that matches total.
   */
  private static async reconcileStuckFileStatuses(
    jobId: string,
    reason: string
  ): Promise<void> {
    try {
      const { data: job, error } = await supabaseAdmin
        .from('job_logs')
        .select('file_statuses')
        .eq('id', jobId)
        .single()
      if (error || !job) return
      const fileStatuses = (job.file_statuses as ImportFileStatus[]) || []
      // Dedup by fileId (same logic as calculateProgress)
      const latestByFileId = new Map<string, ImportFileStatus>()
      for (const fs of fileStatuses) {
        latestByFileId.set(fs.fileId, fs)
      }
      const stuck = Array.from(latestByFileId.values()).filter(
        f => f.status === 'pending' || f.status === 'processing'
      )
      if (stuck.length === 0) return
      for (const fs of stuck) {
        await this.updateFileStatus(jobId, fs.fileId, {
          status: 'failed',
          reason
        })
      }
      logger.warn('Reconciled stuck file_status rows', {
        jobId, count: stuck.length, reason
      })
    } catch (err) {
      logger.error('reconcileStuckFileStatuses failed', {
        jobId, error: err instanceof Error ? err.message : 'Unknown'
      })
    }
  }

  /**
   * Count files by status
   */
  private static async countFilesByStatus(
    jobId: string,
    status: ImportFileStatus['status']
  ): Promise<number> {
    try {
      const { data: job, error } = await supabaseAdmin
        .from('job_logs')
        .select('file_statuses')
        .eq('id', jobId)
        .single()

      if (error || !job) {
        return 0
      }

      const fileStatuses = (job.file_statuses as ImportFileStatus[]) || []
      return fileStatuses.filter(f => f.status === status).length
    } catch (error) {
      logger.error('Error counting files by status', {
        jobId,
        status,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return 0
    }
  }

  /**
   * Create and process a server-side batch import job
   */
  static async createAndProcessBatchImport(
    userId: string,
    provider: 'google' | 'microsoft',
    folderId?: string,
    options: {
      batchSize?: number
      maxRetries?: number
      processImmediately?: boolean
    } = {}
  ): Promise<ImportJob> {
    try {
      // Create the job
      const job = await this.createJob(userId, provider, folderId, {
        batchSize: options.batchSize || 10, // Larger batch size for server-side processing
        maxRetries: options.maxRetries || 3
      })

      // Process immediately if requested (default for server-side batch imports)
      if (options.processImmediately !== false) {
        // Process in background without blocking the response
        this.processJob(job.id).catch(error => {
          logger.error('Background job processing failed', {
            jobId: job.id,
            userId,
            provider,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        })
      }

      return job
    } catch (error) {
      logger.error('Error creating batch import job', {
        userId,
        provider,
        folderId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Get batch import status with comprehensive progress information
   */
  static async getBatchImportStatus(jobId: string): Promise<{
    job: ImportJob
    summary: {
      totalFiles: number
      processedFiles: number
      failedFiles: number
      skippedFiles: number
      duplicateFiles: number
      percentage: number
      estimatedTimeRemaining?: number
    }
    recentFiles: ImportFileStatus[]
  }> {
    try {
      const job = await this.getJob(jobId)
      if (!job) {
        throw createError.notFound('Job not found')
      }

      // Calculate summary statistics
      const duplicateFiles = await this.countFilesByStatus(jobId, 'duplicate')
      
      // Get recent file statuses (last 10)
      const recentFiles = job.fileStatuses
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 10)

      // Estimate time remaining
      let estimatedTimeRemaining: number | undefined
      if (job.status === 'processing' && job.startedAt) {
        const elapsed = Date.now() - job.startedAt.getTime()
        const processedCount = job.progress.processed + job.progress.failed + job.progress.skipped
        if (processedCount > 0 && job.progress.total > processedCount) {
          const avgTimePerFile = elapsed / processedCount
          const remainingFiles = job.progress.total - processedCount
          estimatedTimeRemaining = Math.round(avgTimePerFile * remainingFiles / 1000) // in seconds
        }
      }

      return {
        job,
        summary: {
          totalFiles: job.progress.total,
          processedFiles: job.progress.processed,
          failedFiles: job.progress.failed,
          skippedFiles: job.progress.skipped,
          duplicateFiles,
          percentage: job.progress.percentage,
          estimatedTimeRemaining
        },
        recentFiles
      }
    } catch (error) {
      logger.error('Error getting batch import status', {
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Cancel a job
   */
  static async cancelJob(jobId: string): Promise<void> {
    try {
      await this.updateJobStatus(jobId, 'cancelled', {
        completed_at: new Date()
      })

      logger.info('Job cancelled', { jobId })
    } catch (error) {
      logger.error('Error cancelling job', {
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Map database record to ImportJob interface
   */
  private static mapJobFromDatabase(data: any): ImportJob {
    return {
      id: data.id,
      userId: data.user_id,
      provider: data.input_data?.provider || 'google',
      folderId: data.input_data?.folderId,
      status: data.status,
      progress: data.progress || {
        total: 0,
        processed: 0,
        failed: 0,
        skipped: 0,
        current_file: null,
        percentage: 0
      },
      fileStatuses: data.file_statuses || [],
      inputData: data.input_data || {},
      outputData: data.output_data,
      errorMessage: data.error_message,
      createdAt: new Date(data.created_at),
      startedAt: data.started_at ? new Date(data.started_at) : undefined,
      completedAt: data.completed_at ? new Date(data.completed_at) : undefined,
      estimatedCompletion: data.estimated_completion ? new Date(data.estimated_completion) : undefined
    }
  }
}
