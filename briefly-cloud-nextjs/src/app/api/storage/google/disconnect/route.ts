/**
 * Google Drive Disconnect Route
 * Handles disconnection of Google Drive integration
 */

import { NextRequest } from 'next/server'
import { createProtectedApiHandler } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-response'
import { TokenStore } from '@/app/lib/oauth/token-store'
import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { logger } from '@/app/lib/logger'

export const POST = createProtectedApiHandler(async (request: NextRequest, context) => {
  try {
    const { user, correlationId } = context

    logger.info('Disconnecting Google Drive', {
      userId: user.id,
      correlationId
    })

    // Get current token for revocation
    const token = await TokenStore.getToken(user.id, 'google')
    
    // Revoke token with Google if available
    if (token?.accessToken) {
      try {
        const revokeResponse = await fetch(`https://oauth2.googleapis.com/revoke?token=${token.accessToken}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        })

        if (revokeResponse.ok) {
          logger.info('Google token revoked successfully', {
            userId: user.id,
            correlationId
          })
        } else {
          logger.warn('Failed to revoke Google token', {
            userId: user.id,
            status: revokeResponse.status,
            correlationId
          })
        }
      } catch (revokeError) {
        logger.warn('Error revoking Google token', {
          userId: user.id,
          error: revokeError instanceof Error ? revokeError.message : 'Unknown error',
          correlationId
        })
        // Continue with local deletion even if revocation fails
      }
    }

    // 1. Try legacy token deletion — ignore if no row exists (Apideck users won't have one)
    try {
      await TokenStore.deleteToken(user.id, 'google')
    } catch (tokenError) {
      // No legacy token — this is expected for Apideck users, not an error
      logger.info('No legacy OAuth token to delete (Apideck user)', { userId: user.id })
    }

    // 2. Always clean up apideck_connections row regardless of path
    const { error: apideckError } = await supabaseAdmin
      .from('apideck_connections')
      .delete()
      .eq('user_id', user.id)
      .eq('provider', 'google')

    if (apideckError) {
      logger.warn('Failed to delete apideck_connections row', {
        userId: user.id,
        error: apideckError.message
      })
      // Don't throw — partial cleanup is better than a failed disconnect
    }

    logger.info('Google Drive disconnected successfully', {
      userId: user.id,
      correlationId
    })

    return ApiResponse.ok({
      message: 'Google Drive disconnected successfully',
      provider: 'google'
    }, 'Google Drive has been disconnected from your account', correlationId)

  } catch (error) {
    logger.error('Failed to disconnect Google Drive', {
      userId: context.user?.id,
      error: error instanceof Error ? error.message : 'Unknown error',
      correlationId: context.correlationId
    })

    if (error instanceof Error && error.message.includes('token')) {
      return ApiResponse.badRequest(
        'Failed to disconnect Google Drive',
        'DISCONNECT_ERROR',
        { provider: 'google' },
        context.correlationId
      )
    }

    return ApiResponse.serverError(
      'Internal server error during disconnect',
      'INTERNAL_ERROR',
      { provider: 'google' },
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
