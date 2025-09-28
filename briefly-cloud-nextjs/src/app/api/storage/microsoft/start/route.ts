export const runtime = 'nodejs'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { ApiResponse, generateCorrelationId } from '@/app/lib/api-response'
import { OAuthStateManager } from '@/app/lib/oauth/state-manager'
import { OAuthLogger } from '@/app/lib/oauth/logger'
import { OAuthErrorCodes, OAuthErrorHandler } from '@/app/lib/oauth/error-codes'
import { getOAuthScopes, getOAuthSettings } from '@/app/lib/oauth/security-config'
import { constructRedirectUri } from '@/app/lib/oauth/redirect-validation'
import { FlowSeparationMonitor } from '@/app/lib/oauth/flow-separation-monitor'

function getCookieFromReq(req: Request, name: string) {
  const raw = req.headers.get('cookie') || ''
  const hit = raw.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : undefined
}

async function handler(req: NextRequest) {
  // Create Supabase client that can read cookies from request
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => getCookieFromReq(req, name),
        set: () => {},    // no-ops; start endpoints must not mutate cookies
        remove: () => {},
      },
    }
  )

  // Check authentication first and redirect to login if not authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    // Log OAuth flow separation violation for monitoring
    FlowSeparationMonitor.logStorageAuthFailure(
      'microsoft',
      '/api/storage/microsoft/start',
      undefined,
      req.headers.get('user-agent') || undefined,
      req.headers.get('referer') || undefined,
      authError?.message
    )
    
    // Log authentication failure for OAuth flow separation monitoring
    OAuthLogger.logError('microsoft', 'start', new Error('Authentication required for storage OAuth'), {
      operation: 'authentication_check',
      userAgent: req.headers.get('user-agent'),
      referer: req.headers.get('referer'),
      authError: authError?.message
    })
    
    // Redirect unauthenticated users to login as per requirement 3.5
    const loginUrl = new URL('/auth/signin', req.url)
    loginUrl.searchParams.set('message', FlowSeparationMonitor.getAuthFailureMessage('microsoft'))
    loginUrl.searchParams.set('returnTo', '/briefly/app/dashboard?tab=storage')
    return NextResponse.redirect(loginUrl)
  }
  // Check plan access using supabase client
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
    OAuthLogger.logStart('microsoft', user.id, correlationId, {
      origin,
      userAgent: req.headers.get('user-agent')
    })
    
    // Validate and construct secure redirect URI (this will throw if invalid)
    const redirectUri = constructRedirectUri(origin, 'microsoft', '/api/storage/microsoft/callback')
    
    // Generate secure state parameter using OAuthStateManager
    const state = OAuthStateManager.generateState(user.id)
    
    // Log state generation for debugging
    OAuthStateManager.logStateGeneration('microsoft', user.id, correlationId)
    
    const auth = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')
    auth.searchParams.set('client_id', process.env.MS_DRIVE_CLIENT_ID!)
    auth.searchParams.set('response_type', 'code')
    auth.searchParams.set('redirect_uri', redirectUri)
    auth.searchParams.set('scope', [
      'User.Read',
      'Files.Read',
      'offline_access'
    ].join(' '))
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
    OAuthLogger.logError('microsoft', 'start', error instanceof Error ? error : new Error(String(error)), {
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

export const GET = handler
