export const runtime = 'nodejs'
export const revalidate = 0

import { createProtectedApiHandler, type ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse, generateCorrelationId } from '@/app/lib/api-response'
import { OAuthStateManager } from '@/app/lib/oauth/state-manager'
import { OAuthLogger } from '@/app/lib/oauth/logger'
import { OAuthErrorCodes, OAuthErrorHandler } from '@/app/lib/oauth/error-codes'
import { getOAuthScopes, getOAuthSettings } from '@/app/lib/oauth/security-config'
import { constructRedirectUri } from '@/app/lib/oauth/redirect-validation'

async function handler(req: Request, { user, supabase }: ApiContext) {
  // Check plan access using existing supabase client from context
  const { data: access } = await supabase
    .from('v_user_access')
    .select('trial_active, paid_active')
    .eq('user_id', user.id)
    .single()

  if (!(access?.trial_active || access?.paid_active)) {
    return ApiResponse.forbidden('Plan required', 'PLAN_REQUIRED')
  }
  const correlationId = generateCorrelationId()
  
  try {
    const origin = new URL(req.url).origin
    
    // Enhanced logging with structured format
    OAuthLogger.logStart('google', user.id, correlationId, {
      origin,
      userAgent: req.headers.get('user-agent')
    })
    
    // Validate and construct secure redirect URI (this will throw if invalid)
    const redirectUri = constructRedirectUri(origin, 'google', '/api/storage/google/callback')
    
    // Generate secure state parameter using OAuthStateManager
    const state = OAuthStateManager.generateState(user.id)
    
    // Log state generation for debugging
    OAuthStateManager.logStateGeneration('google', user.id, correlationId)
    
    const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    auth.searchParams.set('client_id', process.env.GOOGLE_DRIVE_CLIENT_ID!)
    auth.searchParams.set('response_type', 'code')
    auth.searchParams.set('redirect_uri', redirectUri)
    auth.searchParams.set('scope', [
      'openid', 'email', 'profile',
      'https://www.googleapis.com/auth/drive.file'
    ].join(' '))
    auth.searchParams.set('access_type', 'offline')
    auth.searchParams.set('include_granted_scopes', 'true')
    auth.searchParams.set('prompt', 'consent')  // Maximize chances of refresh_token
    auth.searchParams.set('state', state)
  
    const response = ApiResponse.oauthUrl(auth.toString(), correlationId)
    
    // Add explicit cache prevention headers
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    
    return response
  } catch (error) {
    // Log OAuth URL generation errors
    OAuthLogger.logError('google', 'start', error instanceof Error ? error : new Error(String(error)), {
      userId: user.id,
      correlationId,
      operation: 'oauth_url_generation'
    })
    
    // Return standardized error response
    const errorCode = OAuthErrorCodes.UNEXPECTED_ERROR
    return ApiResponse.serverError(
      OAuthErrorHandler.getMessage(errorCode),
      errorCode,
      correlationId
    )
  }
}

export const GET = createProtectedApiHandler(handler)
