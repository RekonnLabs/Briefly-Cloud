import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { supabaseAdmin } from '@/app/lib/supabase'
import { logApiUsage } from '@/app/lib/logger'
import { z } from 'zod'

// Validation schemas
const bulkDeleteSchema = z.object({
  file_ids: z.array(z.string()).min(1).max(50), // Limit to 50 files at once
})

const bulkUpdateSchema = z.object({
  file_ids: z.array(z.string()).min(1).max(50),
  updates: z.object({
    name: z.string().optional(),
    metadata: z.record(z.any()).optional(),
  }),
})

// DELETE /api/upload/bulk - Delete multiple files
async function bulkDeleteHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  
  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }
  
  try {
    const body = await request.json()
    const validation = bulkDeleteSchema.safeParse(body)
    
    if (!validation.success) {
      return ApiResponse.badRequest('Invalid request data')
    }
    
    const { file_ids } = validation.data
    
    const supabase = supabaseAdmin
    
    // Get files to delete (ensure user owns them)
    const { data: files, error: fetchError } = await supabase
      .from('file_metadata')
      .select('*')
      .eq('user_id', user.id)
      .in('id', file_ids)
    
    if (fetchError) {
      console.error('Files fetch error:', fetchError)
      return ApiResponse.internalError('Failed to fetch files')
    }
    
    if (!files || files.length === 0) {
      return ApiResponse.notFound('No files found to delete')
    }
    
    const results = {
      deleted: [] as string[],
      failed: [] as { id: string; error: string }[],
      total_size_freed: 0,
    }
    
    // Delete files one by one to handle errors gracefully
    for (const file of files) {
      try {
        // Delete from storage if it's an uploaded file
        if (file.source === 'upload' && file.path) {
          const { error: storageError } = await supabase.storage
            .from('documents')
            .remove([file.path])
          
          if (storageError) {
            console.error(`Storage deletion error for ${file.id}:`, storageError)
            // Continue with metadata deletion
          }
        }
        
        // Delete related document chunks
        await supabase
          .from('document_chunks')
          .delete()
          .eq('file_id', file.id)
        
        // Delete file metadata
        const { error: deleteError } = await supabase
          .from('file_metadata')
          .delete()
          .eq('id', file.id)
          .eq('user_id', user.id)
        
        if (deleteError) {
          results.failed.push({
            id: file.id,
            error: 'Failed to delete metadata',
          })
        } else {
          results.deleted.push(file.id)
          results.total_size_freed += file.size || 0
        }
        
      } catch (error) {
        console.error(`Error deleting file ${file.id}:`, error)
        results.failed.push({
          id: file.id,
          error: 'Unexpected error during deletion',
        })
      }
    }
    
    // Update user usage statistics
    if (results.deleted.length > 0) {
      const { data: userProfile } = await supabase
        .from('users')
        .select('documents_uploaded, storage_used_bytes')
        .eq('id', user.id)
        .single()
      
      if (userProfile) {
        await supabase
          .from('users')
          .update({
            documents_uploaded: Math.max(0, (userProfile.documents_uploaded || 0) - results.deleted.length),
            storage_used_bytes: Math.max(0, (userProfile.storage_used_bytes || 0) - results.total_size_freed),
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id)
      }
    }
    
    // Log usage
    logApiUsage(user.id, '/api/upload/bulk', 'bulk_delete', {
      requested_count: file_ids.length,
      deleted_count: results.deleted.length,
      failed_count: results.failed.length,
      size_freed: results.total_size_freed,
    })
    
    return ApiResponse.success(results, 
      `Bulk delete completed: ${results.deleted.length} deleted, ${results.failed.length} failed`
    )
    
  } catch (error) {
    console.error('Bulk delete handler error:', error)
    return ApiResponse.internalError('Failed to process bulk delete')
  }
}

// PUT /api/upload/bulk - Update multiple files
async function bulkUpdateHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  
  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }
  
  try {
    const body = await request.json()
    const validation = bulkUpdateSchema.safeParse(body)
    
    if (!validation.success) {
      return ApiResponse.badRequest('Invalid request data')
    }
    
    const { file_ids, updates } = validation.data
    
    if (!updates.name && !updates.metadata) {
      return ApiResponse.badRequest('At least one update field is required')
    }
    
    const supabase = supabaseAdmin
    
    // Get files to update (ensure user owns them)
    const { data: files, error: fetchError } = await supabase
      .from('file_metadata')
      .select('*')
      .eq('user_id', user.id)
      .in('id', file_ids)
    
    if (fetchError) {
      console.error('Files fetch error:', fetchError)
      return ApiResponse.internalError('Failed to fetch files')
    }
    
    if (!files || files.length === 0) {
      return ApiResponse.notFound('No files found to update')
    }
    
    const results = {
      updated: [] as string[],
      failed: [] as { id: string; error: string }[],
    }
    
    // Update files one by one to handle errors gracefully
    for (const file of files) {
      try {
        // Prepare update data
        const updateData: any = {
          updated_at: new Date().toISOString(),
        }
        
        if (updates.name) {
          updateData.name = updates.name
        }
        
        if (updates.metadata) {
          updateData.metadata = {
            ...file.metadata,
            ...updates.metadata,
          }
        }
        
        // Update file metadata
        const { error: updateError } = await supabase
          .from('file_metadata')
          .update(updateData)
          .eq('id', file.id)
          .eq('user_id', user.id)
        
        if (updateError) {
          results.failed.push({
            id: file.id,
            error: 'Failed to update metadata',
          })
        } else {
          results.updated.push(file.id)
        }
        
      } catch (error) {
        console.error(`Error updating file ${file.id}:`, error)
        results.failed.push({
          id: file.id,
          error: 'Unexpected error during update',
        })
      }
    }
    
    // Log usage
    logApiUsage(user.id, '/api/upload/bulk', 'bulk_update', {
      requested_count: file_ids.length,
      updated_count: results.updated.length,
      failed_count: results.failed.length,
      update_fields: Object.keys(updates),
    })
    
    return ApiResponse.success(results,
      `Bulk update completed: ${results.updated.length} updated, ${results.failed.length} failed`
    )
    
  } catch (error) {
    console.error('Bulk update handler error:', error)
    return ApiResponse.internalError('Failed to process bulk update')
  }
}

// POST /api/upload/bulk - Get multiple files info
async function bulkInfoHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  
  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }
  
  try {
    const body = await request.json()
    const { file_ids } = body
    
    if (!Array.isArray(file_ids) || file_ids.length === 0 || file_ids.length > 100) {
      return ApiResponse.badRequest('file_ids must be an array with 1-100 items')
    }
    
    const supabase = supabaseAdmin
    
    // Get files info
    const { data: files, error } = await supabase
      .from('file_metadata')
      .select('*')
      .eq('user_id', user.id)
      .in('id', file_ids)
    
    if (error) {
      console.error('Files fetch error:', error)
      return ApiResponse.internalError('Failed to fetch files')
    }
    
    // Format response
    const filesMap = new Map(files?.map(file => [file.id, file]) || [])
    const results = file_ids.map(id => {
      const file = filesMap.get(id)
      if (!file) {
        return { id, found: false }
      }
      
      return {
        id: file.id,
        found: true,
        name: file.name,
        size: file.size,
        mime_type: file.mime_type,
        source: file.source,
        processed: file.processed,
        processing_status: file.processing_status,
        created_at: file.created_at,
        updated_at: file.updated_at,
      }
    })
    
    // Log usage
    logApiUsage(user.id, '/api/upload/bulk', 'bulk_info', {
      requested_count: file_ids.length,
      found_count: files?.length || 0,
    })
    
    return ApiResponse.success({
      files: results,
      summary: {
        requested: file_ids.length,
        found: files?.length || 0,
        not_found: file_ids.length - (files?.length || 0),
      },
    })
    
  } catch (error) {
    console.error('Bulk info handler error:', error)
    return ApiResponse.internalError('Failed to get files info')
  }
}

// Export handlers with middleware
export const DELETE = createProtectedApiHandler(bulkDeleteHandler, {
  rateLimit: {
    ...rateLimitConfigs.general,
    maxRequests: 10, // More restrictive for bulk operations
  },
  logging: {
    enabled: true,
    includeBody: true,
  },
})

export const PUT = createProtectedApiHandler(bulkUpdateHandler, {
  rateLimit: {
    ...rateLimitConfigs.general,
    maxRequests: 20,
  },
  logging: {
    enabled: true,
    includeBody: true,
  },
})

export const POST = createProtectedApiHandler(bulkInfoHandler, {
  rateLimit: rateLimitConfigs.general,
  logging: {
    enabled: true,
    includeBody: false,
  },
})