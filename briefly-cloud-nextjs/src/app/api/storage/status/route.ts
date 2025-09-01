/**
 * Storage Connection Status API
 * 
 * GET /api/storage/status - Get connection status for all providers
 */

import { NextRequest } from 'next/server'
import { createProtectedApiHandler } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-response'
import { TokenStore } from '@/app/lib/oauth/token-store'
import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { logger } from '@/app/lib/logger'

export interface ConnectionStatus {
  provider: 'google_drive' | 'microsoft'
  connected: boolean
  lastSync?: string
  errorMessage?: string
}

export interface StorageStatusResponse {
  google_drive: ConnectionStatus
  microsoft: ConnectionStatus
}

async function getStorageStatus(request: NextRequest, context: any) {
  try {
    const userId = context.user.id

    // Get connection status from database
    const { data: statusData, error: statusError } = await supabaseAdmin.rpc('get_connection_status', {
      p_user_id: userId
    })

    if (statusError) {
      logger.error('Failed to get connection status from database', {
        userId,
        error: statusError.message
      })
    }

    // Create status map from database results
    const dbStatus = new Map<string, any>()
    if (statusData && Array.isArray(statusData)) {
      statusData.forEach((status: any) => {
        dbStatus.set(status.provider, status)
      })
    }

    // Check actual token validity for each provider
    const providers: ('google_drive' | 'microsoft')[] = ['google_drive', 'microsoft']
    const status: StorageStatusResponse = {} as StorageStatusResponse

    for (const provider of providers) {
      let connected = false
      let lastSync: string | undefined
      let errorMessage: string | undefined

      try {
        // Check if we have a valid token
        const token = await TokenStore.getToken(userId, provider)
        
        if (token) {
          // Check if token is expired
          if (token.expiresAt) {
            const expiresAt = new Date(token.expiresAt)
            const now = new Date()
            connected = expiresAt > now
            
            if (!connected) {
              errorMessage = 'Token expired'
            }
          } else {
            connected = true
          }
        } else {
          connected = false
          errorMessage = 'No token found'
        }

        // Get last sync time from database status
        const dbStatusEntry = dbStatus.get(provider)
        if (dbStatusEntry) {
          lastSync = dbStatusEntry.last_sync
          if (!connected && dbStatusEntry.error_message) {
            errorMessage = dbStatusEntry.error_message
          }
        }

        // Update database with current status
        await supabaseAdmin.rpc('update_connection_status', {
          p_user_id: userId,
          p_provider: provider,
          p_connected: connected,
          p_error_message: errorMessage || null
        })

      } catch (error) {
        logger.error(`Error checking ${provider} connection status`, {
          userId,
          provider,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        
        connected = false
        errorMessage = error instanceof Error ? error.message : 'Unknown error'
        
        // Update database with error status
        await supabaseAdmin.rpc('update_connection_status', {
          p_user_id: userId,
          p_provider: provider,
          p_connected: false,
          p_error_message: errorMessage
        })
      }

      status[provider] = {
        provider,
        connected,
        lastSync,
        errorMessage
      }
    }

    logger.info('Storage connection status retrieved', {
      userId,
      googleConnected: status.google_drive.connected,
      microsoftConnected: status.microsoft.connected
    })

    return ApiResponse.ok(status, 'Connection status retrieved successfully')

  } catch (error) {
    logger.error('Error getting storage connection status', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    
    return ApiResponse.serverError(
      'Failed to get connection status',
      'CONNECTION_STATUS_ERROR'
    )
  }
}

export const GET = createProtectedApiHandler(getStorageStatus, {
  requireAuth: true
})