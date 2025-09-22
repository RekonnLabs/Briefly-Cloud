/**
 * Google Picker File Registration Service
 * 
 * Handles registration of files selected through Google Picker with:
 * - MIME type validation against supported formats
 * - Batch file processing with error handling
 * - Database record creation for selected files
 * - Processing queue integration for content extraction
 */

import 'server-only'
import { filesRepo, fileIngestRepo } from '@/app/lib/repos'
import { ImportJobManager } from '@/app/lib/jobs/import-job-manager'
import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'
import { 
  validateFileRegistrationPermissions,
  type PermissionValidationResult 
} from './permission-validator'
import type { AppFile } from '@/app/types/rag'

// Supported MIME types for Google Picker file selection
export const SUPPORTED_MIME_TYPES = [
  // PDF documents
  'application/pdf',
  
  // Microsoft Office documents
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'application/msword', // .doc
  'application/vnd.ms-excel', // .xls
  'application/vnd.ms-powerpoint', // .ppt
  
  // Text documents
  'text/plain', // .txt
  'text/markdown', // .md
  'text/csv', // .csv
  
  // Google Workspace documents
  'application/vnd.google-apps.document', // Google Docs
  'application/vnd.google-apps.spreadsheet', // Google Sheets
  'application/vnd.google-apps.presentation', // Google Slides
] as const

export type SupportedMimeType = typeof SUPPORTED_MIME_TYPES[number]

// Interface for selected files from Google Picker
export interface SelectedFile {
  id: string              // Google Drive file ID
  name: string           // File name with extension
  mimeType: string       // MIME type for processing
  size: number           // File size in bytes
  downloadUrl?: string   // Optional download URL from picker
}

// Interface for file registration request
export interface FileRegistrationRequest {
  files: SelectedFile[]
}

// Interface for file registration result
export interface FileRegistrationResult {
  success: boolean
  registeredFiles: RegisteredFileInfo[]
  errors: FileRegistrationError[]
  permissionValidation?: PermissionValidationResult
  summary: {
    total: number
    registered: number
    supported: number
    unsupported: number
    failed: number
  }
}

export interface RegisteredFileInfo {
  fileId: string
  providerId: string
  name: string
  mimeType: string
  size: number
  status: 'pending' | 'unsupported'
  appFileId: string
  queuedForProcessing: boolean
}

export interface FileRegistrationError {
  fileId: string
  fileName: string
  error: string
  reason: string
}

/**
 * Register selected files from Google Picker
 * Validates file types, creates database records, and queues for processing
 */
export async function registerSelectedFiles(
  userId: string,
  files: SelectedFile[],
  tokenScope?: string,
  tokenId?: string
): Promise<FileRegistrationResult> {
  logger.info('Starting file registration', {
    userId,
    fileCount: files.length,
    files: files.map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size }))
  })

  // Validate permissions for file registration
  let permissionValidation: PermissionValidationResult | undefined
  
  if (tokenScope) {
    permissionValidation = validateFileRegistrationPermissions(
      userId,
      files.map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType })),
      tokenScope,
      tokenId
    )

    // Block registration if high-severity violations found
    if (!permissionValidation.isValid) {
      logger.error('File registration blocked due to permission violations', {
        userId,
        tokenId,
        violations: permissionValidation.violations,
        riskLevel: permissionValidation.riskLevel
      })

      return {
        success: false,
        registeredFiles: [],
        errors: [{
          fileId: 'all',
          fileName: 'Permission validation failed',
          error: 'Permission denied',
          reason: 'Token does not have required permissions for file registration'
        }],
        permissionValidation,
        summary: {
          total: files.length,
          registered: 0,
          supported: 0,
          unsupported: 0,
          failed: files.length
        }
      }
    }

    // Log permission warnings for medium-risk violations
    if (permissionValidation.riskLevel === 'medium') {
      logger.warn('File registration proceeding with permission warnings', {
        userId,
        tokenId,
        violations: permissionValidation.violations,
        actionRequired: permissionValidation.actionRequired
      })
    }
  }

  const registeredFiles: RegisteredFileInfo[] = []
  const errors: FileRegistrationError[] = []

  for (const file of files) {
    try {
      // Validate file metadata
      const validationError = validateFileMetadata(file)
      if (validationError) {
        errors.push({
          fileId: file.id,
          fileName: file.name,
          error: 'Validation failed',
          reason: validationError
        })
        continue
      }

      // Check if file type is supported
      const isSupported = isSupportedMimeType(file.mimeType)
      const status = isSupported ? 'pending' : 'unsupported'

      // Create file record in database
      const fileRecord = await createFileRecord(userId, file, status)

      const registeredFile: RegisteredFileInfo = {
        fileId: file.id,
        providerId: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        status,
        appFileId: fileRecord.id,
        queuedForProcessing: false
      }

      // Queue for processing if supported
      if (isSupported) {
        try {
          await queueFileForProcessing(userId, fileRecord, file)
          registeredFile.queuedForProcessing = true
          
          logger.info('File queued for processing', {
            userId,
            fileId: file.id,
            fileName: file.name,
            appFileId: fileRecord.id
          })
        } catch (queueError) {
          logger.warn('Failed to queue file for processing', {
            userId,
            fileId: file.id,
            fileName: file.name,
            appFileId: fileRecord.id,
            error: queueError instanceof Error ? queueError.message : 'Unknown error'
          })
          // Don't fail registration if queueing fails
        }
      } else {
        // Log skipped file event for unsupported types
        logFileRegistrationEvent(userId, 'file_skipped', {
          fileId: file.id,
          fileName: file.name,
          mimeType: file.mimeType,
          size: file.size,
          reason: 'unsupported_mime_type',
          appFileId: fileRecord.id
        })

        logger.info('File registered but not queued (unsupported type)', {
          userId,
          fileId: file.id,
          fileName: file.name,
          mimeType: file.mimeType,
          supportedTypes: SUPPORTED_MIME_TYPES.slice(0, 5) // Log first 5 supported types as example
        })
      }

      registeredFiles.push(registeredFile)

    } catch (error) {
      logger.error('Failed to register file', {
        userId,
        fileId: file.id,
        fileName: file.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      errors.push({
        fileId: file.id,
        fileName: file.name,
        error: 'Registration failed',
        reason: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  // Calculate summary
  const summary = {
    total: files.length,
    registered: registeredFiles.length,
    supported: registeredFiles.filter(f => f.status === 'pending').length,
    unsupported: registeredFiles.filter(f => f.status === 'unsupported').length,
    failed: errors.length
  }

  // Log registration completion
  logger.info('File registration completed', {
    userId,
    summary,
    queuedForProcessing: registeredFiles.filter(f => f.queuedForProcessing).length
  })

  return {
    success: errors.length === 0,
    registeredFiles,
    errors,
    permissionValidation,
    summary
  }
}

/**
 * Validate file metadata from picker selection
 */
function validateFileMetadata(file: SelectedFile): string | null {
  if (!file.id || typeof file.id !== 'string') {
    return 'Invalid file ID'
  }

  if (!file.name || typeof file.name !== 'string' || file.name.trim().length === 0) {
    return 'Invalid file name'
  }

  if (!file.mimeType || typeof file.mimeType !== 'string') {
    return 'Invalid MIME type'
  }

  if (typeof file.size !== 'number' || file.size < 0) {
    return 'Invalid file size'
  }

  // Check file size limits (50MB max for picker files)
  const maxFileSize = 50 * 1024 * 1024 // 50MB
  if (file.size > maxFileSize) {
    return `File too large: ${Math.round(file.size / 1024 / 1024)}MB (max: 50MB)`
  }

  return null
}

/**
 * Check if MIME type is supported for processing
 */
export function isSupportedMimeType(mimeType: string): boolean {
  return SUPPORTED_MIME_TYPES.includes(mimeType as SupportedMimeType)
}

/**
 * Create file record in database
 */
async function createFileRecord(
  userId: string,
  file: SelectedFile,
  status: 'pending' | 'unsupported'
): Promise<AppFile> {
  try {
    const createdFile = await filesRepo.create({
      ownerId: userId,
      name: file.name,
      path: file.name,
      sizeBytes: file.size,
      mimeType: file.mimeType,
    })

    const now = new Date().toISOString()

    await fileIngestRepo.upsert({
      file_id: createdFile.id,
      owner_id: userId,
      status,
      source: 'google',
      error_msg: status === 'unsupported' ? 'Unsupported MIME type selected via Google Picker' : null,
      meta: {
        picker_selected: true,
        selected_at: now,
        original_size: file.size,
        download_url: file.downloadUrl,
        external_id: file.id,
        external_url: file.downloadUrl,
        provider: 'google_picker',
        file_name: file.name,
        mime_type: file.mimeType,
      },
    })

    logger.info('File record created', {
      userId,
      fileId: file.id,
      fileName: file.name,
      appFileId: createdFile.id,
      status,
    })

    return createdFile
  } catch (error) {
    logger.error('Failed to create file record', {
      userId,
      fileId: file.id,
      fileName: file.name,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    throw createError.internal(
      `Failed to create file record: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

/**
 * Queue file for processing using the existing job system
 */
async function queueFileForProcessing(
  userId: string,
  fileRecord: AppFile,
  originalFile: SelectedFile
): Promise<void> {
  try {
    // Log file queuing event
    logFileRegistrationEvent(userId, 'file_queued', {
      fileId: originalFile.id,
      fileName: originalFile.name,
      mimeType: originalFile.mimeType,
      size: originalFile.size,
      appFileId: fileRecord.id
    })

    // Create a single-file processing job using the existing ImportJobManager
    // This leverages the existing infrastructure for file processing
    const job = await ImportJobManager.createJob(userId, 'google', undefined, {
      batchSize: 1,
      maxRetries: 3
    })

    logger.info('Processing job created for picker file', {
      userId,
      jobId: job.id,
      fileId: originalFile.id,
      fileName: originalFile.name,
      appFileId: fileRecord.id,
      priority: 'normal',
      source: 'google_picker'
    })

    // Start processing in background with enhanced error handling
    ImportJobManager.processJob(job.id).catch(error => {
      logger.error('Background processing failed for picker file', {
        userId,
        jobId: job.id,
        fileId: originalFile.id,
        fileName: originalFile.name,
        appFileId: fileRecord.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'google_picker'
      })

      // Log processing failure event
      logFileRegistrationEvent(userId, 'processing_failed', {
        fileId: originalFile.id,
        fileName: originalFile.name,
        appFileId: fileRecord.id,
        jobId: job.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    })

  } catch (error) {
    logger.error('Failed to queue file for processing', {
      userId,
      fileId: originalFile.id,
      fileName: originalFile.name,
      appFileId: fileRecord.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    // Log queueing failure event
    logFileRegistrationEvent(userId, 'queue_failed', {
      fileId: originalFile.id,
      fileName: originalFile.name,
      appFileId: fileRecord.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    throw error
  }
}

/**
 * Get supported file types for display to users
 */
export function getSupportedFileTypes(): {
  mimeTypes: readonly string[]
  extensions: readonly string[]
  categories: {
    documents: readonly string[]
    spreadsheets: readonly string[]
    presentations: readonly string[]
    text: readonly string[]
  }
} {
  return {
    mimeTypes: SUPPORTED_MIME_TYPES,
    extensions: [
      '.pdf',
      '.docx', '.doc',
      '.xlsx', '.xls',
      '.pptx', '.ppt',
      '.txt', '.md', '.csv'
    ] as const,
    categories: {
      documents: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'application/vnd.google-apps.document'
      ] as const,
      spreadsheets: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'application/vnd.google-apps.spreadsheet'
      ] as const,
      presentations: [
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.ms-powerpoint',
        'application/vnd.google-apps.presentation'
      ] as const,
      text: [
        'text/plain',
        'text/markdown',
        'text/csv'
      ] as const
    }
  }
}

/**
 * Get processing queue status for a user
 */
export async function getProcessingQueueStatus(userId: string): Promise<{
  pendingJobs: number
  processingJobs: number
  recentCompletedJobs: number
  recentFailedJobs: number
}> {
  try {
    // Get recent jobs for the user from the last 24 hours
    const jobs = await ImportJobManager.getUserJobs(userId, undefined, 100)
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000)
    
    const recentJobs = jobs.filter(job => new Date(job.createdAt) > last24Hours)
    
    return {
      pendingJobs: recentJobs.filter(job => job.status === 'pending').length,
      processingJobs: recentJobs.filter(job => job.status === 'processing').length,
      recentCompletedJobs: recentJobs.filter(job => job.status === 'completed').length,
      recentFailedJobs: recentJobs.filter(job => job.status === 'failed').length
    }
  } catch (error) {
    logger.error('Failed to get processing queue status', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    
    // Return default values on error
    return {
      pendingJobs: 0,
      processingJobs: 0,
      recentCompletedJobs: 0,
      recentFailedJobs: 0
    }
  }
}

/**
 * Log file registration events for monitoring
 */
export function logFileRegistrationEvent(
  userId: string,
  event: 'registration_started' | 'registration_completed' | 'file_queued' | 'file_skipped' | 'processing_failed' | 'queue_failed',
  data: Record<string, unknown>
): void {
  const logData = {
    event: `picker_file_${event}`,
    userId,
    timestamp: new Date().toISOString(),
    source: 'google_picker',
    ...data
  }

  // Use appropriate log level based on event type
  if (event.includes('failed')) {
    logger.error(`Picker file ${event}`, logData)
  } else if (event === 'file_skipped') {
    logger.warn(`Picker file ${event}`, logData)
  } else {
    logger.info(`Picker file ${event}`, logData)
  }
}
