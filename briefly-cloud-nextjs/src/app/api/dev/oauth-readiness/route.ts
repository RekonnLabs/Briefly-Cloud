/**
 * Development OAuth Readiness Check
 * 
 * Provides a simple endpoint to check if OAuth flows are ready for testing.
 * Only available in development mode.
 */

import { NextRequest } from 'next/server'
import { createOAuthReadinessCheck } from '@/app/lib/dev-utils/oauth-testing'

// Only enable in development
if (process.env.NODE_ENV !== 'development') {
  throw new Error('OAuth readiness check is only available in development mode')
}

const handler = createOAuthReadinessCheck()

export async function GET(req: NextRequest) {
  return handler(req)
}