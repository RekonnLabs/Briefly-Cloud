/**
 * Microsoft OneDrive Disconnect API
 * 
 * POST /api/storage/microsoft/disconnect - Disconnect from Microsoft OneDrive
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

async function disconnectMicrosoft(request: NextRequest, context: any) {
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

    logger.info('Microsoft OneDrive disconnect requested', { userId, options })

    // Disconnect using ConnectionManager
    await ConnectionManager.disconnectMicrosoft(userId, options)

    logger.info('Microsoft OneDrive disconnected successfully', { userId })

    return ApiResponse.ok(
      { 
        provider: 'microsoft',
        disconnected: true,
        revokedAtProvider: options.revokeAtProvider,
        cancelledJobs: options.cancelRunningJobs
      },
      'Microsoft OneDrive disconnected successfully'
    )

  } catch (error) {
    logger.error('Error disconnecting Microsoft OneDrive', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    
    return ApiResponse.serverError(
      'Failed to disconnect Microsoft OneDrive',
      'MICROSOFT_DISCONNECT_ERROR'
    )
  }
}

export const POST = createProtectedApiHandler(disconnectMicrosoft, {
  requireAuth: true
})