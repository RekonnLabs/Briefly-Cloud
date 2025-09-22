import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse, parsePaginationParams, createPaginatedResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { logApiUsage } from '@/app/lib/logger'
import { filesRepo, fileIngestRepo } from '@/app/lib/repos'
import type { FileIngestStatus } from '@/app/lib/repos/file-ingest-repo'

// GET /api/upload/files - List user's uploaded files
async function listFilesHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  
  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }
  
  try {
    const url = new URL(request.url)
    const pagination = parsePaginationParams(url.searchParams)
    
    const source = url.searchParams.get('source')
    const status = url.searchParams.get('status')
    const search = url.searchParams.get('search')
    const sortBy = (url.searchParams.get('sort_by') as 'created_at' | 'name' | 'size') || 'created_at'
    const sortOrder = (url.searchParams.get('sort_order') as 'asc' | 'desc') || 'desc'
    
    const ingestFilters: { source?: string; status?: FileIngestStatus } = {}
    if (source) ingestFilters.source = source
    if (status && ['pending', 'processing', 'ready', 'error', 'unsupported'].includes(status)) {
      ingestFilters.status = status as FileIngestStatus
    }

    const filteredIds = await fileIngestRepo.filterFileIds(user.id, ingestFilters)

    const searchResult = await filesRepo.search(user.id, {
      search: search || undefined,
      sortBy,
      sortOrder,
      offset: pagination.offset ?? 0,
      limit: pagination.limit ?? 20,
      filterIds: filteredIds.length ? filteredIds : undefined,
    })

    const ingestMap = await fileIngestRepo.getByFileIds(user.id, searchResult.items.map(file => file.id))

    const formattedFiles = searchResult.items.map(file => {
      const ingest = ingestMap[file.id]
      return {
        id: file.id,
        name: file.name,
        size: file.size_bytes,
        mime_type: file.mime_type,
        source: ingest?.source ?? null,
        processing_status: ingest?.status ?? 'pending',
        error_message: ingest?.error_msg ?? null,
        created_at: file.created_at,
        metadata: ingest?.meta,
      }
    })

    const paginatedResponse = createPaginatedResponse(
      formattedFiles,
      searchResult.count,
      pagination
    )

    logApiUsage(user.id, '/api/upload/files', 'files_list', {
      filters: { source, status, search },
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
