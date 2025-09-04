/**
 * Google Picker File Registration API Route
 * 
 * POST /api/storage/google/register-files
 * 
 * Handles registration of files selected through Google Picker with:
 * - Request validation for file metadata
 * - Authentication and authorization checks
 * - Batch file registration with proper error handling
 * - Structured error responses for client handling
 */

import { NextRequest, NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { 
  registerSelectedFiles, 
  type FileRegistrationRequest,
  type SelectedFile,
  logFileRegistrationEvent
} from '@/app/lib/google-picker/file-registration-service'
import { 
  logFileRegistration 
} from '@/app/lib/google-picker/audit-service'
import { logger } from '@/app/lib/logger'
import { createError } from '@/app/lib/api-errors'

// Force Node.js runtime for file operations
export const runtime = 'nodejs'
export const revalidate = 0

/**
 * Register files selected from Google Picker
 */
async function registerFilesHandler(request: NextRequest, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }

  try {
    // Parse and validate request body
    const body = await request.json()
    const validationResult = validateRegistrationRequest(body)
    
    if (!validationResult.valid) {
      logger.warn('Invalid file registration request', {
        userId: user.id,
        errors: validationResult.errors,
        receivedBody: body
      })
      
      return ApiResponse.badRequest(
        'Invalid request format',
        {
          errors: validationResult.errors,
          expectedFormat: {
            files: [
              {
                id: 'string (Google Drive file ID)',
                name: 'string (file name)',
                mimeType: 'string (MIME type)',
                size: 'number (file size in bytes)',
                downloadUrl: 'string (optional download URL)'
              }
            ]
          }
        }
      )
    }

    const { files } = validationResult.data
    
    // Generate session ID for audit tracking
    const sessionId = `registration_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Log registration start
    logFileRegistrationEvent(user.id, 'registration_started', {
      fileCount: files.length,
      files: files.map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size }))
    })

    logger.info('Processing file registration request', {
      userId: user.id,
      fileCount: files.length,
      totalSize: files.reduce((sum, f) => sum + f.size, 0)
    })

    // Get token information for permission validation
    const tokenScope = 'https://www.googleapis.com/auth/drive.file' // Default expected scope
    
    // Register files using the service with permission validation
    const result = await registerSelectedFiles(user.id, files, tokenScope)

    // Log registration completion
    logFileRegistrationEvent(user.id, 'registration_completed', {
      summary: result.summary,
      success: result.success,
      errorCount: result.errors.length
    })

    // Log audit trail for file registration
    logFileRegistration(
      user.id,
      sessionId,
      result.registeredFiles.map(file => ({
        fileId: file.fileId,
        fileName: file.name,
        mimeType: file.mimeType,
        status: file.status
      }))
    )

    // Prepare response data
    const responseData = {
      success: result.success,
      summary: result.summary,
      registeredFiles: result.registeredFiles.map(file => ({
        fileId: file.fileId,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        status: file.status,
        appFileId: file.appFileId,
        queuedForProcessing: file.queuedForProcessing
      })),
      ...(result.errors.length > 0 && {
        errors: result.errors.map(error => ({
          fileId: error.fileId,
          fileName: error.fileName,
          error: error.error,
          reason: error.reason
        }))
      })
    }

    // Return appropriate response based on success
    if (result.success) {
      logger.info('File registration completed successfully', {
        userId: user.id,
        summary: result.summary
      })

      return ApiResponse.success(
        responseData,
        `Successfully registered ${result.summary.registered} files. ${result.summary.supported} queued for processing.`
      )
    } else {
      logger.warn('File registration completed with errors', {
        userId: user.id,
        summary: result.summary,
        errorCount: result.errors.length
      })

      return ApiResponse.success(
        responseData,
        `Registered ${result.summary.registered} of ${result.summary.total} files. ${result.errors.length} files failed to register.`
      )
    }

  } catch (error) {
    logger.error('File registration failed', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('Database error')) {
        return ApiResponse.serverError('Database error occurred while registering files. Please try again.')
      }

      if (error.message.includes('validation')) {
        return ApiResponse.badRequest(`Validation error: ${error.message}`)
      }

      if (error.message.includes('quota') || error.message.includes('limit')) {
        return ApiResponse.badRequest(`Usage limit exceeded: ${error.message}`)
      }
    }

    return ApiResponse.serverError('Failed to register selected files. Please try again.')
  }
}

/**
 * Validate file registration request
 */
function validateRegistrationRequest(body: unknown): {
  valid: boolean
  data?: FileRegistrationRequest
  errors?: string[]
} {
  const errors: string[] = []

  // Check if body is an object
  if (!body || typeof body !== 'object') {
    return {
      valid: false,
      errors: ['Request body must be a JSON object']
    }
  }

  const requestBody = body as Record<string, unknown>

  // Check if files array exists
  if (!requestBody.files) {
    errors.push('Missing required field: files')
  } else if (!Array.isArray(requestBody.files)) {
    errors.push('Field "files" must be an array')
  } else {
    // Validate each file in the array
    const files = requestBody.files as unknown[]
    
    if (files.length === 0) {
      errors.push('Files array cannot be empty')
    } else if (files.length > 50) {
      errors.push('Cannot register more than 50 files at once')
    } else {
      files.forEach((file, index) => {
        const fileErrors = validateSelectedFile(file, index)
        errors.push(...fileErrors)
      })
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors }
  }

  return {
    valid: true,
    data: {
      files: requestBody.files as SelectedFile[]
    }
  }
}

/**
 * Validate individual selected file
 */
function validateSelectedFile(file: unknown, index: number): string[] {
  const errors: string[] = []
  const prefix = `files[${index}]`

  if (!file || typeof file !== 'object') {
    return [`${prefix}: Must be an object`]
  }

  const fileObj = file as Record<string, unknown>

  // Validate required fields
  if (!fileObj.id || typeof fileObj.id !== 'string') {
    errors.push(`${prefix}.id: Must be a non-empty string`)
  }

  if (!fileObj.name || typeof fileObj.name !== 'string') {
    errors.push(`${prefix}.name: Must be a non-empty string`)
  }

  if (!fileObj.mimeType || typeof fileObj.mimeType !== 'string') {
    errors.push(`${prefix}.mimeType: Must be a non-empty string`)
  }

  if (typeof fileObj.size !== 'number' || fileObj.size < 0) {
    errors.push(`${prefix}.size: Must be a non-negative number`)
  }

  // Validate optional fields
  if (fileObj.downloadUrl !== undefined && typeof fileObj.downloadUrl !== 'string') {
    errors.push(`${prefix}.downloadUrl: Must be a string if provided`)
  }

  // Additional validation
  if (typeof fileObj.size === 'number' && fileObj.size > 50 * 1024 * 1024) {
    errors.push(`${prefix}.size: File too large (max 50MB)`)
  }

  if (typeof fileObj.name === 'string' && fileObj.name.length > 255) {
    errors.push(`${prefix}.name: File name too long (max 255 characters)`)
  }

  return errors
}

// Export the POST handler with proper middleware
export const POST = createProtectedApiHandler(registerFilesHandler, {
  rateLimit: rateLimitConfigs.fileOperations,
  logging: { 
    enabled: true, 
    includeBody: false // Don't log file data for privacy
  },
})