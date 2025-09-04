import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { generatePickerToken, PickerTokenError, getPickerErrorGuidance } from '@/app/lib/google-picker/token-service'
import { logTokenSecurityEvent } from '@/app/lib/google-picker/audit-service'
import { logger } from '@/app/lib/logger'

// Force Node.js runtime for token operations
export const runtime = 'nodejs'
export const revalidate = 0

async function getPickerTokenHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  if (!user) {
    return ApiResponse.unauthorized('User not authenticated')
  }

  try {
    logger.info('Picker token requested', { userId: user.id })

    const tokenResponse = await generatePickerToken(user.id)

    logger.info('Picker token generated successfully', { 
      userId: user.id,
      expiresIn: tokenResponse.expiresIn,
      scope: tokenResponse.scope,
      tokenId: tokenResponse.tokenId
    })

    // Log security event for token generation
    if (tokenResponse.tokenId) {
      logTokenSecurityEvent(
        'token_generated',
        user.id,
        tokenResponse.tokenId,
        {
          tokenScope: tokenResponse.scope,
          tokenLifetime: tokenResponse.expiresIn,
          riskLevel: 'low'
        }
      )
    }

    // Return token with cache prevention headers
    const response = ApiResponse.success({
      accessToken: tokenResponse.accessToken,
      expiresIn: tokenResponse.expiresIn,
      scope: tokenResponse.scope,
      tokenId: tokenResponse.tokenId,
      generatedAt: new Date().toISOString(),
      securityMetadata: tokenResponse.securityMetadata
    }, 'Picker token generated successfully')

    // Add cache prevention headers
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')

    return response

  } catch (error) {
    // Handle structured picker token errors
    if (error instanceof Error && 'type' in error) {
      const pickerError = error as Error & PickerTokenError

      const guidance = getPickerErrorGuidance(pickerError)
      
      logger.warn('Picker token generation failed', {
        userId: user.id,
        errorType: pickerError.type,
        requiresReauth: pickerError.requiresReauth,
        message: pickerError.message,
        userMessage: guidance.userMessage,
        actionRequired: guidance.actionRequired,
        canRetry: guidance.canRetry
      })

      // Return structured error response with user guidance
      const errorDetails = {
        errorType: pickerError.type,
        requiresReauth: pickerError.requiresReauth,
        userMessage: guidance.userMessage,
        actionRequired: guidance.actionRequired,
        canRetry: guidance.canRetry,
        timestamp: new Date().toISOString()
      }

      switch (pickerError.type) {
        case 'TOKEN_NOT_FOUND':
        case 'REFRESH_TOKEN_EXPIRED':
          return ApiResponse.unauthorized(guidance.userMessage, errorDetails)

        case 'TOKEN_REFRESH_FAILED':
          return pickerError.requiresReauth 
            ? ApiResponse.unauthorized(guidance.userMessage, errorDetails)
            : ApiResponse.serverError(guidance.userMessage, pickerError.type)

        case 'INVALID_CREDENTIALS':
          return ApiResponse.serverError(guidance.userMessage, 'INVALID_CREDENTIALS')

        case 'NETWORK_ERROR':
          return ApiResponse.serverError(guidance.userMessage, 'NETWORK_ERROR')

        default:
          return ApiResponse.serverError(guidance.userMessage, 'PICKER_TOKEN_ERROR')
      }
    }

    // Handle generic errors
    logger.error('Unexpected error generating picker token', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })

    return ApiResponse.serverError('Failed to generate picker token. Please try again.')
  }
}

export const GET = createProtectedApiHandler(getPickerTokenHandler, {
  rateLimit: rateLimitConfigs.general,
  logging: { enabled: true, includeBody: false },
})