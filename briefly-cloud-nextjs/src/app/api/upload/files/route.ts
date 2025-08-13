import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse, parsePaginationParams, createPaginatedResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { supabaseAdmin } from '@/app/lib/supabase'
import { logApiUsage } from '@/app/lib/logger'

// GET /api/upload/files - List user's uploaded files
async function listFilesHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  
  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }
  
  try {
    const supabase = supabaseAdmin
    
    const url = new URL(request.url)
    const pagination = parsePaginationParams(url.searchParams)
    
    // Parse query parameters
    const source = url.searchParams.get('source') // 'upload', 'google', 'microsoft'
    const processed = url.searchParams.get('processed') // 'true', 'false'
    const search = url.searchParams.get('search') // Search in file names
    const sortBy = url.searchParams.get('sort_by') || 'created_at'
    const sortOrder = url.searchParams.get('sort_order') || 'desc'
    
    // Build query
    let query = supabase
      .from('file_metadata')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
    
    // Apply filters
    if (source) {
      query = query.eq('source', source)
    }
    
    if (processed !== null) {
      query = query.eq('processed', processed === 'true')
    }
    
    if (search) {
      query = query.ilike('name', `%${search}%`)
    }
    
    // Apply sorting
    const ascending = sortOrder === 'asc'
    query = query.order(sortBy, { ascending })
    
    // Apply pagination
    query = query.range(
      pagination.offset!,
      pagination.offset! + pagination.limit! - 1
    )
    
    const { data: files, error, count } = await query
    
    if (error) {
      console.error('Files fetch error:', error)
      return ApiResponse.internalError('Failed to fetch files')
    }
    
    // Format file data
    const formattedFiles = files?.map(file => ({
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
    })) || []
    
    // Create paginated response
    const paginatedResponse = createPaginatedResponse(
      formattedFiles,
      count || 0,
      pagination
    )
    
    // Log usage
    logApiUsage(user.id, '/api/upload/files', 'files_list', {
      filters: { source, processed, search },
      pagination,
    })
    
    return ApiResponse.success(paginatedResponse)
    
  } catch (error) {
    console.error('List files handler error:', error)
    return ApiResponse.internalError('Failed to process files request')
  }
}

// Export handler with middleware
export const GET = createProtectedApiHandler(listFilesHandler, {
  rateLimit: rateLimitConfigs.general,
  logging: {
    enabled: true,
    includeBody: false,
  },
})