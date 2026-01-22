/**
 * Unified Auth Guard Helper
 * 
 * Provides a single, consistent way to check user authentication across all API routes.
 * This eliminates code duplication and ensures consistent error handling.
 */

import { NextResponse } from 'next/server'
import { ApiResponse } from '@/app/lib/api-response'
import type { ApiContext } from '@/app/lib/api-middleware'

/**
 * Require authenticated user in API route handler
 * 
 * Usage:
 * ```ts
 * async function myHandler(request: Request, context: ApiContext): Promise<NextResponse> {
 *   const user = requireUser(context)
 *   if (user instanceof NextResponse) return user // Auth failed, return error response
 *   
 *   // user is guaranteed to be defined here
 *   console.log('Authenticated user:', user.id)
 * }
 * ```
 * 
 * @param context - API context from createProtectedApiHandler
 * @param customMessage - Optional custom error message
 * @returns User object if authenticated, or NextResponse with 401 error
 */
export function requireUser(
  context: ApiContext,
  customMessage?: string
): { id: string; email?: string } | NextResponse {
  const { user } = context
  
  if (!user) {
    return ApiResponse.unauthorized(customMessage || 'User not authenticated')
  }
  
  return user
}

/**
 * Type guard to check if requireUser returned an error response
 * 
 * Usage:
 * ```ts
 * const userOrError = requireUser(context)
 * if (isErrorResponse(userOrError)) return userOrError
 * 
 * // userOrError is now typed as user object
 * const user = userOrError
 * ```
 */
export function isErrorResponse(value: any): value is NextResponse {
  return value instanceof NextResponse
}

/**
 * Alternative pattern: Extract user or throw
 * 
 * Usage:
 * ```ts
 * try {
 *   const user = extractUser(context)
 *   // user is guaranteed to be defined
 * } catch (error) {
 *   return error as NextResponse
 * }
 * ```
 */
export function extractUser(
  context: ApiContext,
  customMessage?: string
): { id: string; email?: string } {
  const { user } = context
  
  if (!user) {
    throw ApiResponse.unauthorized(customMessage || 'User not authenticated')
  }
  
  return user
}
