import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { z } from 'zod'
import { searchDocumentContext } from '@/app/lib/vector-storage'

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

  const results = await searchDocumentContext(query, user.id, {
    limit,
    threshold,
    fileIds,
  })

  return ApiResponse.success({
    query,
    results,
    count: results.length,
  })
}

export const POST = createProtectedApiHandler(searchHandler, {
  rateLimit: rateLimitConfigs.general,
  logging: { enabled: true, includeBody: true },
})



