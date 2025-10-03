/**
 * API endpoint for client-side audit logging of signout events
 */

import { createProtectedApiHandler } from '@/app/lib/api-middleware'
import { auditUserAction } from '@/app/lib/audit/comprehensive-audit-logger'
import { ApiResponse, ApiErrorCode } from '@/app/lib/api-response'

export const POST = createProtectedApiHandler(async (request, context) => {
  try {
    const body = await request.json()
    const { action, userId, success, correlationId, metadata, severity } = body

    // Validate required fields
    if (!action || !userId || typeof success !== 'boolean' || !correlationId) {
      return ApiResponse.badRequest('Missing required fields', ApiErrorCode.VALIDATION_ERROR, context.correlationId)
    }

    // Verify the userId matches the authenticated user
    if (context.user?.id !== userId) {
      return ApiResponse.forbidden('Cannot audit events for other users', ApiErrorCode.FORBIDDEN, context.correlationId)
    }

    // Call the server-side audit function
    await auditUserAction(
      action,
      userId,
      success,
      correlationId,
      metadata,
      severity || 'low'
    )

    return ApiResponse.success({ success: true }, context.correlationId)
  } catch (error) {
    return ApiResponse.serverError(
      'Failed to process audit event',
      ApiErrorCode.INTERNAL_ERROR,
      undefined,
      context.correlationId
    )
  }
})