/**
 * Debug whoami endpoint for authentication debugging
 * Returns user ID, email, and correlation ID for troubleshooting
 */

export const runtime = 'nodejs'

import { createProtectedApiHandler, type ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-response'

async function handler(req: Request, { user, correlationId }: ApiContext) {
  return ApiResponse.ok({
    userId: user.id,
    email: user.email,
    correlationId,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  }, 'User authentication details retrieved')
}

export const GET = createProtectedApiHandler(handler)