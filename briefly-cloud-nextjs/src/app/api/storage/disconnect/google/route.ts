/**
 * API endpoint for disconnecting Google Drive storage
 */

import { createProtectedApiHandler } from '@/app/lib/api-middleware'
import { ConnectionManager } from '@/app/lib/cloud-storage/connection-manager'
import { ApiResponse, ApiErrorCode } from '@/app/lib/api-response'

export const POST = createProtectedApiHandler(async (request, context) => {
  try {
    const body = await request.json()
    const { userId, options } = body

    // Validate required fields
    if (!userId) {
      return ApiResponse.badRequest('Missing userId', ApiErrorCode.VALIDATION_ERROR, context.correlationId)
    }

    // Verify the userId matches the authenticated user
    if (context.user?.id !== userId) {
      return ApiResponse.forbidden('Cannot disconnect storage for other users', ApiErrorCode.FORBIDDEN, context.correlationId)
    }

    // Call the server-side ConnectionManager
    await ConnectionManager.disconnectGoogle(userId, options || {})

    return ApiResponse.success({ success: true }, context.correlationId)
  } catch (error) {
    return ApiResponse.serverError(
      'Failed to disconnect Google Drive',
      ApiErrorCode.INTERNAL_ERROR,
      undefined,
      context.correlationId
    )
  }
})