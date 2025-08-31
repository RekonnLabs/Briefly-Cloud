import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { getDecryptedToken } from '@/app/lib/oauth/token-store'

async function getStorageStatusHandler(_request: Request, context: ApiContext) {
  const { user } = context
  if (!user) return ApiResponse.unauthorized('User not authenticated')

  // Check connection status for each provider
  const googleToken = await getDecryptedToken(user.id, 'google')
  const microsoftToken = await getDecryptedToken(user.id, 'microsoft')

  return ApiResponse.success({
    google: !!(googleToken?.accessToken),
    microsoft: !!(microsoftToken?.accessToken),
  })
}

export const GET = createProtectedApiHandler(getStorageStatusHandler, {
  rateLimit: rateLimitConfigs.general,
  logging: { enabled: true, includeBody: false },
})