/**
 * Google Drive Disconnect API
 * 
 * POST /api/storage/google/disconnect - Disconnect from Google Drive
 */

import { NextRequest } from 'next/server'
import { createProtectedApiHandler } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-response'
import { ConnectionManager } from '@/app/lib/cloud-storage/connection-manager'
import { logger } from '@/app/lib/logger'

interface DisconnectRequestBody {
  revokeAtProvider?: boolean
  cancelRunningJobs?: boolean
}

async function disconnectGoogle(request: NextRequest, context: any) {
  try {
    const userId = context.user.id
    
    // Parse request body for options
    let options: DisconnectRequestBody = {}
    try {
      const body = await request.json()
      options = {
        revokeAtProvider: body.revokeAtProvider ?? true, // Default to true
        cancelRunningJobs: body.cancelRunningJobs ?? true // Default to true
      }
    } catch {
      // Use defaults if no body or invalid JSON
      options = {
        revokeAtProvider: true,
        cancelRunningJobs: true
      }
    }

    logger.info('Google Drive disconnect requested', { userId, options })

    // Disconnect using ConnectionManager
    await ConnectionManager.disconnectGoogle(userId, options)

    logger.info('Google Drive disconnected successfully', { userId })

    return ApiResponse.ok(
      { 
        provider: 'google_drive',
        disconnected: true,
        revokedAtProvider: options.revokeAtProvider,
        cancelledJobs: options.cancelRunningJobs
      },
      'Google Drive disconnected successfully'
    )

  } catch (error) {
    logger.error('Error disconnecting Google Drive', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    
    return ApiResponse.serverError(
      'Failed to disconnect Google Drive',
      'GOOGLE_DISCONNECT_ERROR'
    )
  }
}

export const POST = createProtectedApiHandler(disconnectGoogle, {
  requireAuth: true
})