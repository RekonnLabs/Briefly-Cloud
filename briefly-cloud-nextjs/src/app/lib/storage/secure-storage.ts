/**
 * Secure File Storage Service
 * 
 * This service provides secure file upload, download, and management
 * with proper tenant isolation and access controls using Supabase Storage.
 */

import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'
import { getAuditLogger } from '@/app/lib/stubs/audit/audit-logger'

export type StorageBucket = 'user-documents' | 'user-exports' | 'system-backups'
export type FileType = 'document' | 'export' | 'backup' | 'temp'

export interface SecureFileUpload {
  file: File | Buffer
  fileName: string
  contentType: string
  userId: string
  bucket: StorageBucket
  fileType?: FileType
  metadata?: Record<string, any>
}

export interface SecureFileInfo {
  id: string
  name: string
  bucket: string
  size: number
  contentType: string
  createdAt: string
  updatedAt: string
  userId: string
  metadata?: Record<string, any>
  signedUrl?: string
}

export interface StorageUsage {
  userId: string
  totalSizeBytes: number
  totalFiles: number
  bucketBreakdown: Record<string, {
    fileCount: number
    totalSize: number
    avgSize: number
  }>
  calculatedAt: string
}

export interface UploadResult {
  success: boolean
  fileInfo?: SecureFileInfo
  error?: string
  path?: string
}

/**
 * Secure Storage Service
 */
export class SecureStorage {
  private readonly auditLogger = getAuditLogger()

  /**
   * Upload a file securely with proper access controls
   */
  async uploadFile(
    upload: SecureFileUpload,
    ipAddress?: string,
    userAgent?: string
  ): Promise<UploadResult> {
    try {
      // Validate file
      const validation = await this.validateFile(upload)
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error
        }
      }

      // Generate secure file path
      const { data: securePathData, error: pathError } = await supabaseAdmin
        .rpc('generate_secure_file_path', {
          user_id: upload.userId,
          file_name: upload.fileName,
          file_type: upload.fileType || 'document'
        })

      if (pathError || !securePathData) {
        throw new Error('Failed to generate secure file path')
      }

      const filePath = securePathData as string

      // Prepare file data
      const fileData = upload.file instanceof File 
        ? await upload.file.arrayBuffer()
        : upload.file

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from(upload.bucket)
        .upload(filePath, fileData, {
          contentType: upload.contentType,
          metadata: {
            userId: upload.userId,
            originalName: upload.fileName,
            uploadedAt: new Date().toISOString(),
            ...upload.metadata
          },
          upsert: false // Don't overwrite existing files
        })

      if (uploadError) {
        throw uploadError
      }

      // Get file info
      const { data: fileInfo, error: infoError } = await supabaseAdmin.storage
        .from(upload.bucket)
        .list(filePath.substring(0, filePath.lastIndexOf('/')), {
          search: filePath.substring(filePath.lastIndexOf('/') + 1)
        })

      if (infoError || !fileInfo || fileInfo.length === 0) {
        throw new Error('Failed to retrieve uploaded file info')
      }

      const uploadedFile = fileInfo[0]

      // Create file record in database
      const { data: dbFile, error: dbError } = await supabaseAdmin
        .from('files')
        .insert({
          user_id: upload.userId,
          name: upload.fileName,
          file_path: filePath,
          file_size: uploadedFile.metadata?.size || 0,
          content_type: upload.contentType,
          bucket: upload.bucket,
          storage_metadata: uploadedFile.metadata,
          upload_metadata: upload.metadata
        })
        .select()
        .single()

      if (dbError) {
        // Clean up uploaded file if database insert fails
        await supabaseAdmin.storage
          .from(upload.bucket)
          .remove([filePath])
        
        throw dbError
      }

      // Log file upload
      await this.auditLogger.logAction({
        userId: upload.userId,
        action: 'DOCUMENT_UPLOADED',
        resourceType: 'document',
        resourceId: dbFile.id,
        metadata: {
          fileName: upload.fileName,
          fileSize: uploadedFile.metadata?.size || 0,
          contentType: upload.contentType,
          bucket: upload.bucket,
          filePath
        },
        severity: 'info',
        ipAddress,
        userAgent
      })

      const result: SecureFileInfo = {
        id: dbFile.id,
        name: upload.fileName,
        bucket: upload.bucket,
        size: uploadedFile.metadata?.size || 0,
        contentType: upload.contentType,
        createdAt: dbFile.created_at,
        updatedAt: dbFile.updated_at,
        userId: upload.userId,
        metadata: upload.metadata
      }

      return {
        success: true,
        fileInfo: result,
        path: filePath
      }

    } catch (error) {
      logger.error('Failed to upload file', {
        userId: upload.userId,
        fileName: upload.fileName,
        bucket: upload.bucket
      }, error as Error)

      return {
        success: false,
        error: (error as Error).message
      }
    }
  }

  /**
   * Generate a signed URL for secure file access
   */
  async getSignedUrl(
    fileId: string,
    userId: string,
    expiresIn: number = 3600, // 1 hour default
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ url?: string; error?: string }> {
    try {
      // Get file info and validate access
      const { data: file, error: fileError } = await supabaseAdmin
        .from('files')
        .select('*')
        .eq('id', fileId)
        .single()

      if (fileError || !file) {
        return { error: 'File not found' }
      }

      // Validate access permissions
      const { data: hasAccess, error: accessError } = await supabaseAdmin
        .rpc('validate_file_access', {
          file_path: file.file_path,
          user_id: userId,
          access_type: 'read'
        })

      if (accessError || !hasAccess) {
        await this.auditLogger.logSecurityEvent(
          'SECURITY_VIOLATION',
          'warning',
          'Unauthorized file access attempt',
          userId,
          {
            fileId,
            filePath: file.file_path,
            attemptedBy: userId
          },
          ipAddress,
          userAgent
        )

        return { error: 'Access denied' }
      }

      // Generate signed URL
      const { data: signedUrlData, error: urlError } = await supabaseAdmin.storage
        .from(file.bucket)
        .createSignedUrl(file.file_path, expiresIn)

      if (urlError || !signedUrlData) {
        throw new Error('Failed to generate signed URL')
      }

      // Log file access
      await this.auditLogger.logAction({
        userId,
        action: 'DOCUMENT_ACCESSED',
        resourceType: 'document',
        resourceId: fileId,
        metadata: {
          fileName: file.name,
          filePath: file.file_path,
          accessType: 'download',
          expiresIn
        },
        severity: 'info',
        ipAddress,
        userAgent
      })

      return { url: signedUrlData.signedUrl }

    } catch (error) {
      logger.error('Failed to generate signed URL', {
        fileId,
        userId
      }, error as Error)

      return { error: (error as Error).message }
    }
  }

  /**
   * Delete a file securely
   */
  async deleteFile(
    fileId: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get file info and validate access
      const { data: file, error: fileError } = await supabaseAdmin
        .from('files')
        .select('*')
        .eq('id', fileId)
        .single()

      if (fileError || !file) {
        return { success: false, error: 'File not found' }
      }

      // Validate delete permissions
      const { data: hasAccess, error: accessError } = await supabaseAdmin
        .rpc('validate_file_access', {
          file_path: file.file_path,
          user_id: userId,
          access_type: 'delete'
        })

      if (accessError || !hasAccess) {
        await this.auditLogger.logSecurityEvent(
          'SECURITY_VIOLATION',
          'warning',
          'Unauthorized file deletion attempt',
          userId,
          {
            fileId,
            filePath: file.file_path,
            attemptedBy: userId
          },
          ipAddress,
          userAgent
        )

        return { success: false, error: 'Access denied' }
      }

      // Delete from storage
      const { error: storageError } = await supabaseAdmin.storage
        .from(file.bucket)
        .remove([file.file_path])

      if (storageError) {
        throw storageError
      }

      // Mark as deleted in database (soft delete)
      const { error: dbError } = await supabaseAdmin
        .from('files')
        .update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', fileId)

      if (dbError) {
        throw dbError
      }

      // Log file deletion
      await this.auditLogger.logAction({
        userId,
        action: 'DOCUMENT_DELETED',
        resourceType: 'document',
        resourceId: fileId,
        metadata: {
          fileName: file.name,
          filePath: file.file_path,
          fileSize: file.file_size
        },
        severity: 'info',
        ipAddress,
        userAgent
      })

      return { success: true }

    } catch (error) {
      logger.error('Failed to delete file', {
        fileId,
        userId
      }, error as Error)

      return { success: false, error: (error as Error).message }
    }
  }

  /**
   * List user's files with pagination
   */
  async listUserFiles(
    userId: string,
    bucket?: StorageBucket,
    limit: number = 50,
    offset: number = 0
  ): Promise<{
    files: SecureFileInfo[]
    totalCount: number
    hasMore: boolean
  }> {
    try {
      let query = supabaseAdmin
        .from('files')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (bucket) {
        query = query.eq('bucket', bucket)
      }

      const { data: files, error, count } = await query
        .range(offset, offset + limit - 1)

      if (error) {
        throw error
      }

      const fileInfos: SecureFileInfo[] = (files || []).map(file => ({
        id: file.id,
        name: file.name,
        bucket: file.bucket,
        size: file.file_size,
        contentType: file.content_type,
        createdAt: file.created_at,
        updatedAt: file.updated_at,
        userId: file.user_id,
        metadata: file.upload_metadata
      }))

      return {
        files: fileInfos,
        totalCount: count || 0,
        hasMore: (offset + limit) < (count || 0)
      }

    } catch (error) {
      logger.error('Failed to list user files', { userId, bucket }, error as Error)
      throw createError.databaseError('Failed to list files', error as Error)
    }
  }

  /**
   * Get user's storage usage statistics
   */
  async getUserStorageUsage(userId: string): Promise<StorageUsage> {
    try {
      const { data: usage, error } = await supabaseAdmin
        .rpc('get_user_storage_usage', { p_user_id: userId })

      if (error) {
        throw error
      }

      return {
        userId,
        totalSizeBytes: usage?.total_size_bytes || 0,
        totalFiles: usage?.total_files || 0,
        bucketBreakdown: usage?.bucket_breakdown || {},
        calculatedAt: usage?.calculated_at || new Date().toISOString()
      }

    } catch (error) {
      logger.error('Failed to get user storage usage', { userId }, error as Error)
      throw createError.databaseError('Failed to get storage usage', error as Error)
    }
  }

  /**
   * Clean up expired files
   */
  async cleanupExpiredFiles(): Promise<number> {
    try {
      const { data: deletedCount, error } = await supabaseAdmin
        .rpc('cleanup_expired_files')

      if (error) {
        throw error
      }

      logger.info('Cleaned up expired files', { deletedCount })
      return deletedCount || 0

    } catch (error) {
      logger.error('Failed to cleanup expired files', error as Error)
      return 0
    }
  }

  /**
   * Validate file upload
   */
  private async validateFile(upload: SecureFileUpload): Promise<{
    valid: boolean
    error?: string
  }> {
    // Check file size limits
    const maxSizes: Record<StorageBucket, number> = {
      'user-documents': 100 * 1024 * 1024, // 100MB
      'user-exports': 50 * 1024 * 1024,    // 50MB
      'system-backups': 1024 * 1024 * 1024 // 1GB
    }

    const fileSize = upload.file instanceof File ? upload.file.size : upload.file.length
    const maxSize = maxSizes[upload.bucket]

    if (fileSize > maxSize) {
      return {
        valid: false,
        error: `File size exceeds limit of ${Math.round(maxSize / (1024 * 1024))}MB`
      }
    }

    // Check allowed MIME types
    const allowedTypes: Record<StorageBucket, string[]> = {
      'user-documents': [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'text/plain',
        'text/markdown',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      ],
      'user-exports': [
        'application/json',
        'text/csv',
        'application/zip'
      ],
      'system-backups': [
        'application/zip',
        'application/gzip',
        'application/x-tar'
      ]
    }

    const allowed = allowedTypes[upload.bucket]
    if (!allowed.includes(upload.contentType)) {
      return {
        valid: false,
        error: `File type ${upload.contentType} not allowed for ${upload.bucket} bucket`
      }
    }

    // Check filename
    if (!upload.fileName || upload.fileName.length > 255) {
      return {
        valid: false,
        error: 'Invalid filename'
      }
    }

    return { valid: true }
  }
}

// Singleton instance
let secureStorage: SecureStorage | null = null

/**
 * Get the secure storage instance
 */
export function getSecureStorage(): SecureStorage {
  if (!secureStorage) {
    secureStorage = new SecureStorage()
  }
  return secureStorage
}

/**
 * Convenience functions
 */

export async function uploadSecureFile(
  upload: SecureFileUpload,
  ipAddress?: string,
  userAgent?: string
): Promise<UploadResult> {
  const storage = getSecureStorage()
  return storage.uploadFile(upload, ipAddress, userAgent)
}

export async function getSecureFileUrl(
  fileId: string,
  userId: string,
  expiresIn?: number,
  ipAddress?: string,
  userAgent?: string
): Promise<{ url?: string; error?: string }> {
  const storage = getSecureStorage()
  return storage.getSignedUrl(fileId, userId, expiresIn, ipAddress, userAgent)
}

export async function deleteSecureFile(
  fileId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ success: boolean; error?: string }> {
  const storage = getSecureStorage()
  return storage.deleteFile(fileId, userId, ipAddress, userAgent)
}

export async function listUserFiles(
  userId: string,
  bucket?: StorageBucket,
  limit?: number,
  offset?: number
): Promise<{
  files: SecureFileInfo[]
  totalCount: number
  hasMore: boolean
}> {
  const storage = getSecureStorage()
  return storage.listUserFiles(userId, bucket, limit, offset)
}

export async function getUserStorageUsage(userId: string): Promise<StorageUsage> {
  const storage = getSecureStorage()
  return storage.getUserStorageUsage(userId)
}
