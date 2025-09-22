/**
 * Secure File Upload API Route
 * 
 * This endpoint handles secure file uploads with comprehensive validation,
 * virus scanning, and audit logging.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/app/lib/auth/auth-middleware'
import { withUploadControls } from '@/app/lib/usage/usage-middleware'
import { getSecureStorage, type SecureFileUpload, type StorageBucket } from '@/app/lib/storage/secure-storage'
import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'

/**
 * POST /api/files/upload
 * 
 * Upload files securely with validation and audit logging
 */
export const POST = withAuth(
  withUploadControls(async (request: NextRequest, context) => {
    try {
      const { user } = context
      
      // Parse multipart form data
      const formData = await request.formData()
      const file = formData.get('file') as File
      const bucket = (formData.get('bucket') as StorageBucket) || 'user-documents'
      const fileType = (formData.get('fileType') as string) || 'document'
      const description = formData.get('description') as string
      
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

      // Validate bucket access
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

      // Additional file validation
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

      // Prepare upload
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
          clientInfo: {
            userAgent: request.headers.get('user-agent'),
            ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
          }
        }
      }

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

      // Get updated storage usage
      const storageUsage = await secureStorage.getUserStorageUsage(user.id)

      return NextResponse.json({
        success: true,
        message: 'File uploaded successfully',
        data: {
          file: result.fileInfo,
          path: result.path,
          storageUsage: {
            totalFiles: storageUsage.totalFiles,
            totalSizeBytes: storageUsage.totalSizeBytes,
            totalSizeMB: Math.round(storageUsage.totalSizeBytes / (1024 * 1024) * 100) / 100
          }
        }
      })

    } catch (error) {
      logger.error('Failed to upload file', {
        userId: context.user.id,
        error: (error as Error).message
      })

      if (error instanceof Error) {
        if (error.message.includes('limit exceeded')) {
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
)

/**
 * GET /api/files/upload/signed-url
 * 
 * Generate signed URLs for direct client uploads (for large files)
 */
export const GET = withAuth(
  withUploadControls(async (request: NextRequest, context) => {
    try {
      const { user } = context
      const { searchParams } = new URL(request.url)
      
      const fileName = searchParams.get('fileName')
      const contentType = searchParams.get('contentType')
      const bucket = (searchParams.get('bucket') as StorageBucket) || 'user-documents'
      const fileType = searchParams.get('fileType') || 'document'

      if (!fileName || !contentType) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Missing parameters',
            message: 'fileName and contentType are required'
          },
          { status: 400 }
        )
      }

      // Validate bucket access
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

      // Generate secure file path
      const { data: securePathData, error: pathError } = await supabaseAdmin
        .rpc('generate_secure_file_path', {
          user_id: user.id,
          file_name: fileName,
          file_type: fileType
        })

      if (pathError || !securePathData) {
        throw new Error('Failed to generate secure file path')
      }

      const filePath = securePathData as string

      // Generate signed upload URL
      const { data: signedUrlData, error: urlError } = await supabaseAdmin.storage
        .from(bucket)
        .createSignedUploadUrl(filePath, {
          upsert: false
        })

      if (urlError || !signedUrlData) {
        throw new Error('Failed to generate signed upload URL')
      }

      // Log signed URL generation
      await getAuditLogger().logAction({
        userId: user.id,
        action: 'API_CALL',
        resourceType: 'api',
        metadata: {
          endpoint: '/api/files/upload/signed-url',
          fileName,
          contentType,
          bucket,
          filePath
        },
        severity: 'info',
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown'
      })

      return NextResponse.json({
        success: true,
        data: {
          uploadUrl: signedUrlData.signedUrl,
          token: signedUrlData.token,
          path: filePath,
          expiresIn: 3600, // 1 hour
          instructions: {
            method: 'PUT',
            headers: {
              'Content-Type': contentType,
              'Authorization': `Bearer ${signedUrlData.token}`
            }
          }
        }
      })

    } catch (error) {
      logger.error('Failed to generate signed upload URL', {
        userId: context.user.id,
        error: (error as Error).message
      })

      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to generate upload URL',
          message: 'Please try again later'
        },
        { status: 500 }
      )
    }
  })
)

/**
 * Validate file content for security
 */
async function validateFileContent(file: File): Promise<{
  valid: boolean
  error?: string
}> {
  try {
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
