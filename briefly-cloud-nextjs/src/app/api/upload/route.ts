export const runtime = 'nodejs'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse, validateFileUpload, formatFileSize } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { supabaseApp } from '@/app/lib/supabase-clients'
import { logApiUsage } from '@/app/lib/logger'
import { filesRepo, fileIngestRepo, usersRepo } from '@/app/lib/repos'
import { createError } from '@/app/lib/api-errors'
import { cacheManager, CACHE_KEYS } from '@/app/lib/cache'
import { withPerformanceMonitoring, withApiPerformanceMonitoring } from '@/app/lib/stubs/performance'
import { logReq, logErr } from '@/app/lib/server/log'
import { handleSchemaError, logSchemaError, extractSchemaContext, withSchemaErrorHandling } from '@/app/lib/errors/schema-errors'

// Supported file types and their MIME types
const SUPPORTED_FILE_TYPES = {
  // Documents
  'application/pdf': { ext: 'pdf', category: 'document' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', category: 'document' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: 'pptx', category: 'document' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', category: 'document' },
  
  // Text files
  'text/plain': { ext: 'txt', category: 'text' },
  'text/markdown': { ext: 'md', category: 'text' },
  'text/csv': { ext: 'csv', category: 'data' },
  'application/csv': { ext: 'csv', category: 'data' },
  
  // Legacy Office formats
  'application/msword': { ext: 'doc', category: 'document' },
  'application/vnd.ms-excel': { ext: 'xls', category: 'document' },
  'application/vnd.ms-powerpoint': { ext: 'ppt', category: 'document' },
}

// Tier-based file size limits (in bytes)
const TIER_LIMITS = {
  free: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 25,
    totalStorage: 100 * 1024 * 1024, // 100MB
  },
  pro: {
    maxFileSize: 50 * 1024 * 1024, // 50MB
    maxFiles: 500,
    totalStorage: 1024 * 1024 * 1024, // 1GB
  },
  pro_byok: {
    maxFileSize: 100 * 1024 * 1024, // 100MB
    maxFiles: 5000,
    totalStorage: 10 * 1024 * 1024 * 1024, // 10GB
  },
}

// POST /api/upload - Handle file upload
async function uploadHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user, correlationId } = context
  const rid = logReq({ route: '/api/upload', method: 'POST', userId: user.id })
  
  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }
  
  try {
    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('file') as File
    const metadata = formData.get('metadata') ? JSON.parse(formData.get('metadata') as string) : {}
    
    if (!file) {
      return ApiResponse.badRequest('No file provided')
    }
    
    // Get user's current tier and usage with caching
    const userProfileKey = CACHE_KEYS.USER_PROFILE(user.id)
    let userProfile = cacheManager.get(userProfileKey)
    
    if (!userProfile) {
      const profileData = await withSchemaErrorHandling(
        () => withApiPerformanceMonitoring(() => usersRepo.getUsageStats(user.id)),
        {
          schema: 'app',
          operation: 'get_user_profile',
          table: 'users',
          userId: user.id,
          correlationId,
          ...extractSchemaContext(request, 'get_user_profile', 'app', 'users')
        }
      )
      
      if (!profileData) {
        console.error('Profile fetch error: User not found', { correlationId, userId: user.id })
        return ApiResponse.serverError('Failed to fetch user profile', 'PROFILE_FETCH_ERROR', correlationId)
      }
      
      userProfile = {
        subscription_tier: profileData.subscription_tier,
        documents_uploaded: profileData.documents_uploaded,
        documents_limit: profileData.documents_limit,
        storage_used_bytes: profileData.storage_used_bytes,
        storage_limit_bytes: profileData.storage_limit_bytes
      }
      // Cache user profile for 5 minutes
      cacheManager.set(userProfileKey, userProfile, 1000 * 60 * 5)
    }
    
    const tier = userProfile.subscription_tier || 'free'
    const tierLimits = TIER_LIMITS[tier as keyof typeof TIER_LIMITS] || TIER_LIMITS.free
    
    // Check file count limits
    const currentFileCount = userProfile.documents_uploaded || 0
    if (currentFileCount >= tierLimits.maxFiles) {
      throw createError.usageLimitExceeded(
        'documents',
        tier,
        currentFileCount,
        tierLimits.maxFiles
      )
    }
    
    // Check storage limits
    const currentStorage = userProfile.storage_used_bytes || 0
    if (currentStorage + file.size > tierLimits.totalStorage) {
      throw createError.usageLimitExceeded(
        'storage',
        tier,
        currentStorage,
        tierLimits.totalStorage
      )
    }
    
    // Validate file
    const validation = validateFileUpload(file, {
      maxSize: tierLimits.maxFileSize,
      allowedTypes: Object.keys(SUPPORTED_FILE_TYPES),
    })
    
    if (!validation.success) {
      return ApiResponse.badRequest(validation.error!)
    }
    
    // Check if file type is supported
    if (!SUPPORTED_FILE_TYPES[file.type as keyof typeof SUPPORTED_FILE_TYPES]) {
      return ApiResponse.badRequest(
        `File type ${file.type} is not supported. Supported types: ${Object.keys(SUPPORTED_FILE_TYPES).join(', ')}`
      )
    }
    
    // Generate unique file path
    const fileExtension = SUPPORTED_FILE_TYPES[file.type as keyof typeof SUPPORTED_FILE_TYPES].ext
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substring(2, 15)
    const fileName = `${user.id}/${timestamp}_${randomId}.${fileExtension}`
    
    // Convert File to ArrayBuffer for Supabase Storage
    const fileBuffer = await file.arrayBuffer()
    
    // Upload to Supabase Storage using app schema client
    const { data: uploadData, error: uploadError } = await supabaseApp.storage
      .from('documents')
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        metadata: {
          originalName: file.name,
          uploadedBy: user.id,
          uploadedAt: new Date().toISOString(),
          ...metadata,
        },
      })
    
    if (uploadError) {
      console.error('File upload error:', uploadError, { correlationId, userId: user.id, fileName: file.name })
      return ApiResponse.serverError('Failed to upload file to storage', 'STORAGE_UPLOAD_ERROR', correlationId)
    }
    
    // Get the public URL
    const { data: urlData } = supabaseApp.storage
      .from('documents')
      .getPublicUrl(fileName)

    let ingestStatus: 'pending' | 'processing' | 'ready' | 'error' = 'pending'

    let createdFile
    try {
      createdFile = await withSchemaErrorHandling(
        () => filesRepo.create({
          ownerId: user.id,
          name: file.name,
          path: fileName,
          sizeBytes: file.size,
          mimeType: file.type,
          createdAt: new Date().toISOString(),
        }),
        {
          schema: 'app',
          operation: 'create_file_record',
          table: 'files',
          userId: user.id,
          correlationId,
          ...extractSchemaContext(request, 'create_file_record', 'app', 'files')
        }
      )
    } catch (metadataError) {
      const schemaError = handleSchemaError(metadataError, {
        schema: 'app',
        operation: 'create_file_record',
        table: 'files',
        userId: user.id,
        correlationId,
        originalError: metadataError
      })
      logSchemaError(schemaError)
      console.error('Metadata insert error:', metadataError, { correlationId, userId: user.id, fileName: file.name })
      await supabaseApp.storage.from('documents').remove([fileName])
      return ApiResponse.serverError('Failed to save file metadata', 'METADATA_INSERT_ERROR', correlationId)
    }

    const ingestRecord = await fileIngestRepo.upsert({
      file_id: createdFile.id,
      owner_id: user.id,
      status: 'pending',
      source: 'upload',
      meta: {
        storageBucket: 'documents',
        storagePath: fileName,
        storageFileId: uploadData.id,
        publicUrl: urlData.publicUrl,
        category: SUPPORTED_FILE_TYPES[file.type as keyof typeof SUPPORTED_FILE_TYPES].category,
        extension: fileExtension,
        uploadedAt: new Date().toISOString(),
        originalName: file.name,
        clientMetadata: metadata,
      },
    })

    const fileId = createdFile.id
    
    try {
      ingestStatus = 'processing'
      await fileIngestRepo.updateStatus(user.id, fileId, 'processing', null)

      // 1) Extract text from the uploaded buffer
      const { extractTextFromBuffer } = await import('@/app/lib/document-extractor')
      const extraction = await extractTextFromBuffer(Buffer.from(fileBuffer), file.type, file.name)
      
      // 2) Process document with new vector pipeline
      const { processDocument } = await import('@/app/lib/vector/document-processor')
      await processDocument(user.id, fileId, file.name, extraction.text, {
        fileType: file.type,
        fileSize: file.size,
        uploadedAt: new Date().toISOString(),
        source: 'upload'
      })
      ingestStatus = 'ready'
      await fileIngestRepo.updateStatus(user.id, fileId, 'ready', null)

    } catch (processingError) {
      console.error('File processing error:', processingError, { correlationId, userId: user.id, fileId, fileName: file.name })
      
      ingestStatus = 'error'
      await fileIngestRepo.updateStatus(
        user.id,
        fileId,
        'error',
        processingError instanceof Error ? processingError.message : 'Unknown error'
      )

      // Log the processing error but continue with upload success
      logApiUsage(user.id, '/api/upload', 'processing_failed', {
        file_name: file.name,
        correlation_id: correlationId,
        error: processingError instanceof Error ? processingError.message : 'Unknown error'
      })
    }
    
    // Update user usage statistics using app schema repository
    try {
      await withSchemaErrorHandling(
        () => withApiPerformanceMonitoring(() =>
          usersRepo.updateUsage(user.id, {
            documents_uploaded: currentFileCount + 1,
            storage_used_bytes: currentStorage + file.size
          })
        ),
        {
          schema: 'app',
          operation: 'update_user_usage',
          table: 'users',
          userId: user.id,
          correlationId,
          ...extractSchemaContext(request, 'update_user_usage', 'app', 'users')
        }
      )
    } catch (usageError) {
      const schemaError = handleSchemaError(usageError, {
        schema: 'app',
        operation: 'update_user_usage',
        table: 'users',
        userId: user.id,
        correlationId,
        originalError: usageError
      })
      logSchemaError(schemaError)
      console.error('Usage update error:', usageError, { correlationId, userId: user.id })
      // Don't fail the upload for this, just log it
    }
    
    // Invalidate user profile cache after update
    cacheManager.delete(userProfileKey)
    
    // Log usage for analytics
    logApiUsage(user.id, '/api/upload', 'file_upload', {
      file_name: file.name,
      file_size: file.size,
      file_type: file.type,
      tier,
      correlation_id: correlationId,
    })
    
    // Return success response
    return ApiResponse.created({
      file: {
        id: createdFile.id,
        name: createdFile.name,
        size: file.size,
        type: file.type,
        url: urlData.publicUrl,
        external_url: urlData.publicUrl,
        uploaded_at: createdFile.created_at,
        processing_status: ingestStatus,
        source: ingestRecord.source,
      },
      usage: {
        files_used: currentFileCount + 1,
        files_limit: tierLimits.maxFiles,
        storage_used: currentStorage + file.size,
        storage_limit: tierLimits.totalStorage,
        storage_used_formatted: formatFileSize(currentStorage + file.size),
        storage_limit_formatted: formatFileSize(tierLimits.totalStorage),
      },
    }, 'File uploaded successfully')
    
  } catch (error) {
    logErr(rid, 'upload-handler', error, { correlationId, userId: user?.id })
    console.error('Upload handler error:', error, { correlationId, userId: user?.id })
    
    // Re-throw known errors
    if (error instanceof Error && error.name === 'AppError') {
      throw error
    }
    
    return ApiResponse.serverError('Failed to process file upload', 'UPLOAD_PROCESSING_ERROR', correlationId)
  }
}

// GET /api/upload - Get upload status and limits
async function getUploadInfoHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user, correlationId } = context
  
  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }
  
  try {
    // Get user's current usage from app schema
    const userProfile = await withSchemaErrorHandling(
      () => usersRepo.getUsageStats(user.id),
      {
        schema: 'app',
        operation: 'get_user_usage_stats',
        table: 'users',
        userId: user.id,
        correlationId,
        ...extractSchemaContext(request, 'get_user_usage_stats', 'app', 'users')
      }
    )
    
    if (!userProfile) {
      console.error('Profile fetch error: User not found', { correlationId, userId: user.id })
      return ApiResponse.serverError('Failed to fetch user profile', 'PROFILE_FETCH_ERROR', correlationId)
    }
    
    const tier = userProfile.subscription_tier || 'free'
    const tierLimits = TIER_LIMITS[tier as keyof typeof TIER_LIMITS] || TIER_LIMITS.free
    
    const uploadInfo = {
      supported_types: Object.keys(SUPPORTED_FILE_TYPES),
      supported_extensions: Object.values(SUPPORTED_FILE_TYPES).map(t => t.ext),
      limits: {
        max_file_size: tierLimits.maxFileSize,
        max_file_size_formatted: formatFileSize(tierLimits.maxFileSize),
        max_files: tierLimits.maxFiles,
        total_storage: tierLimits.totalStorage,
        total_storage_formatted: formatFileSize(tierLimits.totalStorage),
      },
      current_usage: {
        files_uploaded: userProfile.documents_uploaded || 0,
        files_remaining: Math.max(0, tierLimits.maxFiles - (userProfile.documents_uploaded || 0)),
        storage_used: userProfile.storage_used_bytes || 0,
        storage_used_formatted: formatFileSize(userProfile.storage_used_bytes || 0),
        storage_remaining: Math.max(0, tierLimits.totalStorage - (userProfile.storage_used_bytes || 0)),
        storage_remaining_formatted: formatFileSize(Math.max(0, tierLimits.totalStorage - (userProfile.storage_used_bytes || 0))),
      },
      tier,
    }
    
    return ApiResponse.success(uploadInfo)
    
  } catch (error) {
    console.error('Upload info handler error:', error, { correlationId, userId: user?.id })
    return ApiResponse.serverError('Failed to get upload information', 'UPLOAD_INFO_ERROR', correlationId)
  }
}

// Export handlers with middleware and performance monitoring
export const POST = withPerformanceMonitoring(
  createProtectedApiHandler(uploadHandler, {
    rateLimit: rateLimitConfigs.upload,
    logging: {
      enabled: true,
      includeBody: false, // Don't log file content
    },
  })
)

export const GET = withPerformanceMonitoring(
  createProtectedApiHandler(getUploadInfoHandler, {
    rateLimit: rateLimitConfigs.general,
    logging: {
      enabled: true,
      includeBody: false,
    },
  })
)
