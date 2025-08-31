import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { deleteToken, getDecryptedToken } from '@/app/lib/oauth/token-store'

async function disconnectGoogleHandler(_request: Request, context: ApiContext) {
  const { user } = context
  if (!user) return ApiResponse.unauthorized('User not authenticated')

  try {
    // Get token for revocation
    const token = await getDecryptedToken(user.id, 'google')
    
    // Attempt to revoke token with Google (optional but responsible)
    if (token?.accessToken) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${token.accessToken}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      } catch (error) {
        console.warn('Failed to revoke Google token:', error)
        // Continue with local deletion even if revocation fails
      }
    }

    // Delete local token
    await deleteToken(user.id, 'google')

    return ApiResponse.success({ message: 'Google Drive disconnected successfully' })
  } catch (error) {
    console.error('Error disconnecting Google Drive:', error)
    return ApiResponse.internalError('Failed to disconnect Google Drive')
  }
}

export const POST = createProtectedApiHandler(disconnectGoogleHandler, {
  rateLimit: rateLimitConfigs.general,
  logging: { enabled: true, includeBody: false },
})