/**
 * API endpoint for cleaning up Google Picker tokens
 */

import { createProtectedApiHandler } from '@/app/lib/api-middleware'
import { cleanupUserPickerTokens } from '@/app/lib/google-picker/token-service'
import { ApiResponse, ApiErrorCode } from '@/app/lib/api-response'

export const POST = createProtectedApiHandler(async (request, context) => {
  try {
    const body = await request.json()
    const { userId } = body

    // Validate required fields
    if (!userId) {
      return ApiResponse.badRequest('Missing userId', ApiErrorCode.VALIDATION_ERROR, context.correlationId)
    }

    // Verify the userId matches the authenticated user
    if (context.user?.id !== userId) {
      return ApiResponse.forbidden('Cannot cleanup tokens for other users', ApiErrorCode.FORBIDDEN, context.correlationId)
    }

    // Call the server-side cleanup function
    await cleanupUserPickerTokens(userId)

    return ApiResponse.success({ success: true }, context.correlationId)
  } catch (error) {
    return ApiResponse.serverError(
      'Failed to cleanup Google Picker tokens',
      ApiErrorCode.INTERNAL_ERROR,
      undefined,
      context.correlationId
    )
  }
})