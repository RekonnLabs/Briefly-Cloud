/**
 * Development OAuth Readiness Check
 * 
 * Provides a simple endpoint to check if OAuth flows are ready for testing.
 * Only available in development mode.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createOAuthReadinessCheck } from '@/app/lib/dev-utils/oauth-testing'

export async function GET(req: NextRequest) {
  // Only enable in development
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'OAuth readiness check is only available in development mode' },
      { status: 404 }
    )
  }

  const handler = createOAuthReadinessCheck()
  return handler(req)
}