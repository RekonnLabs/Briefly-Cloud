/**
 * Storage Connection Status API
 * 
 * GET /api/storage/status - Get connection status for all providers
 */

import { NextRequest } from 'next/server'
import { createProtectedApiHandler, type ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-response'
import { TokenStore } from '@/app/lib/oauth/token-store'

async function getStorageStatus(request: NextRequest, context: ApiContext) {
  const { user } = context
  
  // Simple parallel token checks - no drama, no complex DB operations
  const [googleToken, microsoftToken] = await Promise.all([
    TokenStore.getToken(user.id, 'google_drive'),
    TokenStore.getToken(user.id, 'microsoft')
  ])

  return ApiResponse.ok({
    google: !!(googleToken?.accessToken),
    microsoft: !!(microsoftToken?.accessToken)
  })
}

export const GET = createProtectedApiHandler(getStorageStatus)