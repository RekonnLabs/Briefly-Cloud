import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { supabaseAdmin } from '@/app/lib/supabase'
import { logApiUsage } from '@/app/lib/logger'

// GET /api/upload/files/[fileId] - Get specific file details
async function getFileHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  
  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }
  
  try {
    const url = new URL(request.url)
    const fileId = url.pathname.split('/').pop()
    
    if (!fileId) {
      return ApiResponse.badRequest('File ID is required')
    }
    
    const supabase = supabaseAdmin
    
    // Get file metadata
    const { data: file, error } = await supabase
      .from('file_metadata')
      .select('*')
      .eq('id', fileId)
      .eq('user_id', user.id) // Ensure user owns the file
      .single()
    
    if (error || !file) {
      return ApiResponse.notFound('File')
    }
    
    // Get processing status if available
    let processingInfo = null
    if (!file.processed) {
      // Check for any processing jobs
      const { data: jobs } = await supabase
        .from('job_logs')
        .select('*')
        .eq('user_id', user.id)
        .contains('input_data', { file_ids: [fileId] })
        .order('created_at', { ascending: false })
        .limit(1)
      
      if (jobs && jobs.length > 0) {
        processingInfo = {
          job_id: jobs[0].id,
          status: jobs[0].status,
          progress: jobs[0].output_data?.progress || 0,
          message: jobs[0].output_data?.message || '',
        }
      }
    }
    
    // Log usage
    logApiUsage(user.id, '/api/upload/files/[fileId]', 'file_view', {
      file_id: fileId,
      file_name: file.name,
    })
    
    return ApiResponse.success({
      file: {
        id: file.id,
        name: file.name,
        size: file.size,
        mime_type: file.mime_type,
        source: file.source,
        processed: file.processed,
        processing_status: file.processing_status,
        external_url: file.external_url,
        created_at: file.created_at,
        updated_at: file.updated_at,
        metadata: file.metadata,
        processing_info: processingInfo,
      },
    })
    
  } catch (error) {
    console.error('Get file handler error:', error)
    return ApiResponse.internalError('Failed to get file details')
  }
}

// DELETE /api/upload/files/[fileId] - Delete specific file
async function deleteFileHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  
  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }
  
  try {
    const url = new URL(request.url)
    const fileId = url.pathname.split('/').pop()
    
    if (!fileId) {
      return ApiResponse.badRequest('File ID is required')
    }
    
    const supabase = supabaseAdmin
    
    // Get file metadata first
    const { data: file, error: fetchError } = await supabase
      .from('file_metadata')
      .select('*')
      .eq('id', fileId)
      .eq('user_id', user.id) // Ensure user owns the file
      .single()
    
    if (fetchError || !file) {
      return ApiResponse.notFound('File')
    }
    
    // Delete from storage if it's an uploaded file
    if (file.source === 'upload' && file.path) {
      const { error: storageError } = await supabase.storage
        .from('documents')
        .remove([file.path])
      
      if (storageError) {
        console.error('Storage deletion error:', storageError)
        // Continue with metadata deletion even if storage deletion fails
      }
    }
    
    // Delete related document chunks
    const { error: chunksError } = await supabase
      .from('document_chunks')
      .delete()
      .eq('file_id', fileId)
    
    if (chunksError) {
      console.error('Chunks deletion error:', chunksError)
      // Continue with file deletion
    }
    
    // Delete file metadata
    const { error: deleteError } = await supabase
      .from('file_metadata')
      .delete()
      .eq('id', fileId)
      .eq('user_id', user.id)
    
    if (deleteError) {
      console.error('File metadata deletion error:', deleteError)
      return ApiResponse.internalError('Failed to delete file')
    }
    
    // Update user usage statistics
    const { data: userProfile } = await supabase
      .from('users')
      .select('documents_uploaded, storage_used_bytes')
      .eq('id', user.id)
      .single()
    
    if (userProfile) {
      await supabase
        .from('users')
        .update({
          documents_uploaded: Math.max(0, (userProfile.documents_uploaded || 0) - 1),
          storage_used_bytes: Math.max(0, (userProfile.storage_used_bytes || 0) - file.size),
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
    }
    
    // Log usage
    logApiUsage(user.id, '/api/upload/files/[fileId]', 'file_delete', {
      file_id: fileId,
      file_name: file.name,
      file_size: file.size,
    })
    
    return ApiResponse.success(
      null,
      'File deleted successfully'
    )
    
  } catch (error) {
    console.error('Delete file handler error:', error)
    return ApiResponse.internalError('Failed to delete file')
  }
}

// PUT /api/upload/files/[fileId] - Update file metadata
async function updateFileHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  
  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }
  
  try {
    const url = new URL(request.url)
    const fileId = url.pathname.split('/').pop()
    
    if (!fileId) {
      return ApiResponse.badRequest('File ID is required')
    }
    
    const body = await request.json()
    const { name, metadata } = body
    
    if (!name && !metadata) {
      return ApiResponse.badRequest('Name or metadata is required for update')
    }
    
    const supabase = supabaseAdmin
    
    // Check if file exists and user owns it
    const { data: existingFile, error: fetchError } = await supabase
      .from('file_metadata')
      .select('*')
      .eq('id', fileId)
      .eq('user_id', user.id)
      .single()
    
    if (fetchError || !existingFile) {
      return ApiResponse.notFound('File')
    }
    
    // Prepare update data
    const updateData: any = {
      updated_at: new Date().toISOString(),
    }
    
    if (name) {
      updateData.name = name
    }
    
    if (metadata) {
      updateData.metadata = {
        ...existingFile.metadata,
        ...metadata,
      }
    }
    
    // Update file metadata
    const { data: updatedFile, error: updateError } = await supabase
      .from('file_metadata')
      .update(updateData)
      .eq('id', fileId)
      .eq('user_id', user.id)
      .select()
      .single()
    
    if (updateError) {
      console.error('File update error:', updateError)
      return ApiResponse.internalError('Failed to update file')
    }
    
    // Log usage
    logApiUsage(user.id, '/api/upload/files/[fileId]', 'file_update', {
      file_id: fileId,
      file_name: updatedFile.name,
      updated_fields: Object.keys(updateData),
    })
    
    return ApiResponse.success({
      file: {
        id: updatedFile.id,
        name: updatedFile.name,
        size: updatedFile.size,
        mime_type: updatedFile.mime_type,
        source: updatedFile.source,
        processed: updatedFile.processed,
        processing_status: updatedFile.processing_status,
        external_url: updatedFile.external_url,
        created_at: updatedFile.created_at,
        updated_at: updatedFile.updated_at,
        metadata: updatedFile.metadata,
      },
    }, 'File updated successfully')
    
  } catch (error) {
    console.error('Update file handler error:', error)
    return ApiResponse.internalError('Failed to update file')
  }
}

// Export handlers with middleware
export const GET = createProtectedApiHandler(getFileHandler, {
  rateLimit: rateLimitConfigs.general,
  logging: {
    enabled: true,
    includeBody: false,
  },
})

export const DELETE = createProtectedApiHandler(deleteFileHandler, {
  rateLimit: {
    ...rateLimitConfigs.general,
    maxRequests: 50, // More restrictive for deletions
  },
  logging: {
    enabled: true,
    includeBody: false,
  },
})

export const PUT = createProtectedApiHandler(updateFileHandler, {
  rateLimit: rateLimitConfigs.general,
  logging: {
    enabled: true,
    includeBody: true,
  },
})