import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { deleteToken, getDecryptedToken } from '@/app/lib/oauth/token-store'

async function disconnectMicrosoftHandler(_request: Request, context: ApiContext) {
  const { user } = context
  if (!user) return ApiResponse.unauthorized('User not authenticated')

  try {
    // Get token for revocation
    const token = await getDecryptedToken(user.id, 'microsoft')
    
    // Attempt to revoke token with Microsoft (optional but responsible)
    if (token?.accessToken) {
      try {
        const tenant = process.env.MS_DRIVE_TENANT_ID || 'common'
        await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/logout`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Bearer ${token.accessToken}`,
          },
        })
      } catch (error) {
        console.warn('Failed to revoke Microsoft token:', error)
        // Continue with local deletion even if revocation fails
      }
    }

    // Delete local token
    await deleteToken(user.id, 'microsoft')

    return ApiResponse.success({ message: 'Microsoft Drive disconnected successfully' })
  } catch (error) {
    console.error('Error disconnecting Microsoft Drive:', error)
    return ApiResponse.internalError('Failed to disconnect Microsoft Drive')
  }
}

export const POST = createProtectedApiHandler(disconnectMicrosoftHandler, {
  rateLimit: rateLimitConfigs.general,
  logging: { enabled: true, includeBody: false },
})