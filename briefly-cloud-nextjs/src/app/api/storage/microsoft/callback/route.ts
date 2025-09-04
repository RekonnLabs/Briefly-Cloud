export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/app/lib/auth/supabase-auth'
import { TokenStore } from '@/app/lib/oauth/token-store'
import { OAuthStateManager } from '@/app/lib/oauth/state-manager'
import { OAuthLogger } from '@/app/lib/oauth/logger'
import { OAuthErrorCodes, OAuthErrorHandler } from '@/app/lib/oauth/error-codes'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')
    const returnedState = searchParams.get('state')
    
    // Enhanced error logging with structured format
    if (error) {
      const errorMsg = errorDescription || error
      const mappedError = OAuthErrorHandler.mapProviderError(error)
      
      OAuthLogger.logCallback('microsoft', undefined, false, mappedError, {
        providerError: error,
        providerErrorDescription: errorDescription,
        userAgent: req.headers.get('user-agent')
      })
      
      return NextResponse.redirect(
        new URL(`/briefly/app/dashboard?tab=storage&error=${encodeURIComponent(mappedError)}`, req.url)
      )
    }
    
    if (!code) {
      OAuthLogger.logCallback('microsoft', undefined, false, OAuthErrorCodes.MISSING_CODE, {
        userAgent: req.headers.get('user-agent'),
        referer: req.headers.get('referer')
      })
      
      return NextResponse.redirect(
        new URL(`/briefly/app/dashboard?tab=storage&error=${OAuthErrorCodes.MISSING_CODE}`, req.url)
      )
    }

    // Get authenticated user
    const user = await getAuthenticatedUser()
    
    if (!user) {
      OAuthLogger.logCallback('microsoft', undefined, false, OAuthErrorCodes.AUTH_FAILED, {
        userAgent: req.headers.get('user-agent')
      })
      
      return NextResponse.redirect(new URL('/auth/signin', req.url))
    }
    
    // Critical: Verify OAuth state to prevent token binding to wrong account
    if (!OAuthStateManager.verifyState(returnedState || '', user.id)) {
      // Log state verification failure with HIGH severity
      OAuthLogger.logSecurityEvent('microsoft', 'state_mismatch', {
        expected: user.id,
        received: returnedState,
        userId: user.id,
        userAgent: req.headers.get('user-agent'),
        referer: req.headers.get('referer')
      })
      
      // Log state verification failure
      OAuthStateManager.logStateVerification(
        'microsoft',
        false,
        user.id,
        returnedState || '',
        undefined
      )
      
      return NextResponse.redirect(
        new URL(`/briefly/app/dashboard?tab=storage&error=${OAuthErrorCodes.STATE_MISMATCH}`, req.url)
      )
    }

    // Log successful state verification
    OAuthStateManager.logStateVerification(
      'microsoft',
      true,
      user.id,
      returnedState || '',
      undefined
    )
    
    // Exchange code for tokens
    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.MS_DRIVE_CLIENT_ID!,
        client_secret: process.env.MS_DRIVE_CLIENT_SECRET!,
        redirect_uri: `${new URL(req.url).origin}/api/storage/microsoft/callback`
      })
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      
      OAuthLogger.logCallback('microsoft', user.id, false, OAuthErrorCodes.TOKEN_EXCHANGE_FAILED, {
        httpStatus: tokenResponse.status,
        httpStatusText: tokenResponse.statusText,
        responseBody: errorText,
        operation: 'token_exchange'
      })
      
      return NextResponse.redirect(
        new URL(`/briefly/app/dashboard?tab=storage&error=${OAuthErrorCodes.TOKEN_EXCHANGE_FAILED}`, req.url)
      )
    }

    const tokens = await tokenResponse.json()
    
    try {
      // Store tokens securely
      await TokenStore.saveToken(user.id, 'microsoft', {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        scope: tokens.scope
      })

      // Log successful token storage
      OAuthLogger.logTokenOperation('microsoft', 'store', user.id, true, {
        scope: tokens.scope,
        hasRefreshToken: !!tokens.refresh_token
      })

      // Log successful callback completion
      OAuthLogger.logCallback('microsoft', user.id, true, undefined, {
        operation: 'complete_flow',
        scope: tokens.scope
      })

      // Redirect with success indicator for UI feedback
      return NextResponse.redirect(
        new URL('/briefly/app/dashboard?tab=storage&connected=microsoft', req.url)
      )
    } catch (storageError) {
      // Log token storage failure
      OAuthLogger.logTokenOperation('microsoft', 'store', user.id, false, {
        error: storageError instanceof Error ? storageError.message : String(storageError)
      })
      
      OAuthLogger.logCallback('microsoft', user.id, false, OAuthErrorCodes.TOKEN_STORAGE_FAILED, {
        operation: 'token_storage',
        error: storageError instanceof Error ? storageError.message : String(storageError)
      })
      
      return NextResponse.redirect(
        new URL(`/briefly/app/dashboard?tab=storage&error=${OAuthErrorCodes.TOKEN_STORAGE_FAILED}`, req.url)
      )
    }

  } catch (error) {
    // Log unexpected errors with full context
    OAuthLogger.logError('microsoft', 'callback', error instanceof Error ? error : new Error(String(error)), {
      operation: 'oauth_callback',
      userAgent: req.headers.get('user-agent'),
      referer: req.headers.get('referer')
    })
    
    OAuthLogger.logCallback('microsoft', undefined, false, OAuthErrorCodes.UNEXPECTED_ERROR, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })
    
    return NextResponse.redirect(
      new URL(`/briefly/app/dashboard?tab=storage&error=${OAuthErrorCodes.UNEXPECTED_ERROR}`, req.url)
    )
  }
}