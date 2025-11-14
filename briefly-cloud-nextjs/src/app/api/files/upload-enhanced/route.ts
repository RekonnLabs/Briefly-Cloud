/**
 * Enhanced File Upload API Route with Profitability Guardrails
 * 
 * This endpoint handles secure file uploads with:
 * - Quota enforcement using database functions
 * - Checksum-based deduplication to avoid redundant vectorization
 * - Comprehensive validation and audit logging
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/app/lib/auth/auth-middleware'
import { checkUploadQuota, getUserLimits, getUpgradeMessage } from '@/app/lib/usage/quota-enforcement'
import { calculateChecksumFromFile, checkDuplicateFile } from '@/app/lib/usage/deduplication'
import { getSecureStorage, type SecureFileUpload, type StorageBucket } from '@/app/lib/storage/secure-storage'
import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'

/**
 * POST /api/files/upload-enhanced
 * 
 * Upload files with quota checking and deduplication
 */
export const POST = withAuth(async (request: NextRequest, context) => {
  try {
    const { user } = context
    
    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('file') as File
    const bucket = (formData.get('bucket') as StorageBucket) || 'user-documents'
    const fileType = (formData.get('fileType') as string) || 'document'
    const description = formData.get('description') as string
    const skipDeduplication = formData.get('skipDeduplication') === 'true'
    
    if (!file) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'No file provided',
          message: 'Please select a file to upload'
        },
        { status: 400 }
      )
    }

    // Step 1: Check quota BEFORE processing the file
    const quotaCheck = await checkUploadQuota(user.id, file.size)
    
    if (!quotaCheck.allowed) {
      const limits = await getUserLimits(user.id)
      const upgradeMessage = limits ? getUpgradeMessage(limits, 
        quotaCheck.reason?.includes('Storage') ? 'storage' : 'files'
      ) : 'Upgrade to Pro for higher limits'

      return NextResponse.json(
        { 
          success: false, 
          error: 'QUOTA_EXCEEDED',
          message: quotaCheck.reason,
          upgradeMessage,
          limits: quotaCheck.limits,
          upgradeRequired: true
        },
        { status: 402 } // Payment Required
      )
    }

    // Step 2: Calculate checksum for deduplication
    let checksum: string | undefined
    let duplicateInfo: { isDuplicate: boolean; existingFileId?: string; existingFileName?: string } | undefined

    if (!skipDeduplication) {
      try {
        checksum = await calculateChecksumFromFile(file)
        duplicateInfo = await checkDuplicateFile(user.id, checksum)

        if (duplicateInfo.isDuplicate) {
          logger.info('Duplicate file detected, skipping upload', {
            userId: user.id,
            fileName: file.name,
            checksum,
            existingFileId: duplicateInfo.existingFileId,
            existingFileName: duplicateInfo.existingFileName
          })

          return NextResponse.json({
            success: true,
            duplicate: true,
            message: `This file already exists as "${duplicateInfo.existingFileName}". No need to upload again.`,
            data: {
              existingFileId: duplicateInfo.existingFileId,
              existingFileName: duplicateInfo.existingFileName,
              checksum,
              savings: {
                storageBytes: file.size,
                embeddingTokens: Math.ceil(file.size / 4), // Rough estimate
                message: 'Deduplication saved vectorization costs'
              }
            }
          })
        }
      } catch (error) {
        logger.error('Error during deduplication check', { userId: user.id, fileName: file.name }, error as Error)
        // Continue with upload even if deduplication fails
      }
    }

    // Step 3: Validate bucket access
    if (bucket === 'system-backups') {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Access denied',
          message: 'Cannot upload to system bucket'
        },
        { status: 403 }
      )
    }

    // Step 4: Additional file validation
    const fileValidation = await validateFileContent(file)
    if (!fileValidation.valid) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'File validation failed',
          message: fileValidation.error
        },
        { status: 400 }
      )
    }

    // Step 5: Prepare upload with checksum
    const secureUpload: SecureFileUpload = {
      file,
      fileName: file.name,
      contentType: file.type,
      userId: user.id,
      bucket,
      fileType: fileType as any,
      metadata: {
        description,
        originalSize: file.size,
        uploadedBy: user.email,
        checksum, // Include checksum in metadata
        clientInfo: {
          userAgent: request.headers.get('user-agent'),
          ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
        }
      }
    }

    // Step 6: Upload file
    const secureStorage = getSecureStorage()
    const result = await secureStorage.uploadFile(
      secureUpload,
      request.headers.get('x-forwarded-for') || 'unknown',
      request.headers.get('user-agent') || 'unknown'
    )

    if (!result.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Upload failed',
          message: result.error
        },
        { status: 500 }
      )
    }

    // Step 7: Get updated limits and usage
    const updatedLimits = await getUserLimits(user.id)
    const storageUsage = await secureStorage.getUserStorageUsage(user.id)

    return NextResponse.json({
      success: true,
      message: 'File uploaded successfully',
      duplicate: false,
      data: {
        file: {
          ...result.fileInfo,
          checksum
        },
        path: result.path,
        storageUsage: {
          totalFiles: storageUsage.totalFiles,
          totalSizeBytes: storageUsage.totalSizeBytes,
          totalSizeMB: Math.round(storageUsage.totalSizeBytes / (1024 * 1024) * 100) / 100
        },
        limits: updatedLimits ? {
          files: {
            used: updatedLimits.files_used,
            limit: updatedLimits.files_limit,
            percentage: updatedLimits.files_used_percentage
          },
          storage: {
            used: updatedLimits.storage_used_mb,
            limit: updatedLimits.storage_limit_mb,
            percentage: updatedLimits.storage_used_percentage
          }
        } : null
      }
    })

  } catch (error) {
    logger.error('Failed to upload file', {
      userId: context.user.id,
      error: (error as Error).message
    })

    if (error instanceof Error) {
      if (error.message.includes('limit exceeded') || error.message.includes('QUOTA')) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Upload limit exceeded',
            message: error.message,
            upgradeRequired: true
          },
          { status: 402 }
        )
      }

      if (error.message.includes('storage')) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Storage limit exceeded',
            message: error.message,
            upgradeRequired: true
          },
          { status: 402 }
        )
      }
    }

    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to upload file',
        message: 'Please try again later'
      },
      { status: 500 }
    )
  }
})

/**
 * Validate file content for security
 */
async function validateFileContent(file: File): Promise<{
  valid: boolean
  error?: string
}> {
  try {
    // Check file size (max 50MB for free, 100MB for pro)
    const maxSize = 50 * 1024 * 1024 // 50MB default
    if (file.size > maxSize) {
      return {
        valid: false,
        error: `File size exceeds maximum allowed (${Math.round(maxSize / (1024 * 1024))}MB)`
      }
    }

    // Check file signature/magic bytes
    const buffer = await file.slice(0, 512).arrayBuffer()
    const bytes = new Uint8Array(buffer)
    
    // Basic file type validation based on magic bytes
    const fileSignatures: Record<string, number[][]> = {
      'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
        [0x50, 0x4B, 0x03, 0x04], // ZIP signature (DOCX is ZIP-based)
        [0x50, 0x4B, 0x05, 0x06],
        [0x50, 0x4B, 0x07, 0x08]
      ],
      'text/plain': [], // Skip validation for text files
      'text/markdown': [], // Skip validation for markdown files
    }

    const expectedSignatures = fileSignatures[file.type]
    if (expectedSignatures && expectedSignatures.length > 0) {
      const hasValidSignature = expectedSignatures.some(signature => 
        signature.every((byte, index) => bytes[index] === byte)
      )

      if (!hasValidSignature) {
        return {
          valid: false,
          error: 'File content does not match declared type'
        }
      }
    }

    // Check for suspicious content patterns
    const suspiciousPatterns = [
      /javascript:/gi,
      /<script/gi,
      /eval\(/gi,
      /document\.write/gi,
      /window\.location/gi
    ]

    // Convert first 1KB to string for pattern checking
    const textContent = new TextDecoder('utf-8', { fatal: false })
      .decode(bytes.slice(0, 1024))

    const hasSuspiciousContent = suspiciousPatterns.some(pattern => 
      pattern.test(textContent)
    )

    if (hasSuspiciousContent) {
      return {
        valid: false,
        error: 'File contains suspicious content'
      }
    }

    return { valid: true }

  } catch (error) {
    logger.error('File validation error', { fileName: file.name }, error as Error)
    return {
      valid: false,
      error: 'File validation failed'
    }
  }
}

