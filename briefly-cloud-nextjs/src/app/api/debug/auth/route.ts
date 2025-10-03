/**
 * Debug endpoint to help diagnose authentication issues
 * This should be removed in production
 */

import { createProtectedApiHandler } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-response'

export const GET = createProtectedApiHandler(async (request, context) => {
  const debugInfo = {
    hasUser: !!context.user,
    userId: context.user?.id,
    correlationId: context.correlationId,
    environment: {
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'NOT_SET',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'SET' : 'NOT_SET',
    },
    requestInfo: {
      method: request.method,
      url: request.url,
      userAgent: request.headers.get('user-agent'),
      origin: request.headers.get('origin'),
      referer: request.headers.get('referer'),
    },
    cookies: {
      // Don't log actual cookie values for security
      hasCookies: !!request.headers.get('cookie'),
      cookieCount: request.headers.get('cookie')?.split(';').length || 0
    }
  }

  return ApiResponse.success(debugInfo, context.correlationId)
}, { requireAuth: false }) // Allow this endpoint to work without auth for debugging