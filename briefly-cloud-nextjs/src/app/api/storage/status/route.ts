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
  
  const [google, microsoft] = await Promise.all([
    TokenStore.getToken(user.id, 'google'),
    TokenStore.getToken(user.id, 'microsoft'),
  ])

  const now = Date.now()
  const isConnected = (token: { expiresAt?: string | null } | null) => {
    if (!token) return false
    if (!token.expiresAt) return true

    const parsed = Date.parse(token.expiresAt)
    if (Number.isNaN(parsed)) return true

    return parsed > now - 60_000
  }

  return ApiResponse.ok({
    google: {
      connected: isConnected(google),
      expiresAt: google?.expiresAt ?? null,
    },
    microsoft: {
      connected: isConnected(microsoft),
      expiresAt: microsoft?.expiresAt ?? null,
    },
  })
}

export const GET = createProtectedApiHandler(getStorageStatus)