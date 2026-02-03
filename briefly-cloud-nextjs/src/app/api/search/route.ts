import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { z } from 'zod'
import { searchDocuments } from '@/app/lib/vector/document-processor'
import { cacheManager, CACHE_KEYS, withCache } from '@/app/lib/cache'
import { withPerformanceMonitoring, withApiPerformanceMonitoring } from '@/app/lib/stubs/performance'

const searchSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().min(1).max(50).optional().default(10),
  threshold: z.number().min(0).max(1).optional().default(0.7),
  fileIds: z.array(z.string()).optional(),
})

async function searchHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  if (!user) return ApiResponse.unauthorized('User not authenticated')

  const body = await request.json().catch(() => ({}))
  const parsed = searchSchema.safeParse(body)
  if (!parsed.success) return ApiResponse.badRequest('Invalid request data')

  const { query, limit, threshold, fileIds } = parsed.data

  // Create cache key for this search
  const cacheKey = CACHE_KEYS.SEARCH_RESULTS(query, user.id)
  
  // Try to get cached results first
  const cachedResults = cacheManager.get(cacheKey)
  if (cachedResults) {
    return ApiResponse.success({
      query,
      results: cachedResults,
      count: cachedResults.length,
      cached: true,
    })
  }

  // Perform search with performance monitoring
  const results = await withApiPerformanceMonitoring(() =>
    searchDocuments(user.id, query, {
      limit,
      threshold,
      fileIds,
    })
  )()

  // Cache results for 5 minutes
  cacheManager.set(cacheKey, results, 1000 * 60 * 5)

  return ApiResponse.success({
    query,
    results,
    count: results.length,
    cached: false,
  })
}

export const POST = withPerformanceMonitoring(
  createProtectedApiHandler(searchHandler, {
    rateLimit: rateLimitConfigs.general,
    logging: { enabled: true, includeBody: true },
  })
)



