/**
 * Microsoft OneDrive Disconnect Route
 * Handles disconnection of Microsoft OneDrive integration
 */

import { NextRequest } from 'next/server'
import { createProtectedApiHandler } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-response'
import { TokenStore } from '@/app/lib/oauth/token-store'
import { logger } from '@/app/lib/logger'

export const POST = createProtectedApiHandler(async (request: NextRequest, context) => {
  try {
    const { user, correlationId } = context

    logger.info('Disconnecting Microsoft OneDrive', {
      userId: user.id,
      correlationId
    })

    // Get current token for revocation
    const token = await TokenStore.getToken(user.id, 'microsoft')
    
    // Revoke token with Microsoft if available
    if (token?.accessToken) {
      try {
        const tenantId = process.env.MS_DRIVE_TENANT_ID || 'common'
        const revokeResponse = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            token: token.accessToken,
            token_type_hint: 'access_token'
          })
        })

        if (revokeResponse.ok) {
          logger.info('Microsoft token revoked successfully', {
            userId: user.id,
            correlationId
          })
        } else {
          logger.warn('Failed to revoke Microsoft token', {
            userId: user.id,
            status: revokeResponse.status,
            correlationId
          })
        }
      } catch (revokeError) {
        logger.warn('Error revoking Microsoft token', {
          userId: user.id,
          error: revokeError instanceof Error ? revokeError.message : 'Unknown error',
          correlationId
        })
        // Continue with local deletion even if revocation fails
      }
    }

    // Delete token from our database
    await TokenStore.deleteToken(user.id, 'microsoft')

    logger.info('Microsoft OneDrive disconnected successfully', {
      userId: user.id,
      correlationId
    })

    return ApiResponse.ok({
      message: 'Microsoft OneDrive disconnected successfully',
      provider: 'microsoft'
    }, 'Microsoft OneDrive has been disconnected from your account', correlationId)

  } catch (error) {
    logger.error('Failed to disconnect Microsoft OneDrive', {
      userId: context.user?.id,
      error: error instanceof Error ? error.message : 'Unknown error',
      correlationId: context.correlationId
    })

    if (error instanceof Error && error.message.includes('token')) {
      return ApiResponse.badRequest(
        'Failed to disconnect Microsoft OneDrive',
        'DISCONNECT_ERROR',
        { provider: 'microsoft' },
        context.correlationId
      )
    }

    return ApiResponse.serverError(
      'Internal server error during disconnect',
      'INTERNAL_ERROR',
      { provider: 'microsoft' },
      context.correlationId
    )
  }
})

export const OPTIONS = createProtectedApiHandler(async (request: NextRequest, context) => {
  return new Response(null, {
    status: 200,
    headers: {
      'Allow': 'POST, OPTIONS',
      'X-Correlation-ID': context.correlationId
    }
  })
})