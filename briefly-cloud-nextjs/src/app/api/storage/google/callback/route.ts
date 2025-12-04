export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/app/lib/auth/supabase-auth'
import { oauthTokensRepo } from '@/app/lib/repos/oauth-tokens-repo'
import { OAuthStateManager } from '@/app/lib/oauth/state-manager'
import { OAuthLogger } from '@/app/lib/oauth/logger'
import { handleSchemaError, logSchemaError } from '@/app/lib/errors/schema-errors'
import { OAuthErrorCodes, OAuthErrorHandler } from '@/app/lib/oauth/error-codes'
import { logReq, logErr } from '@/app/lib/server/log'

export async function GET(req: NextRequest) {
  const rid = logReq({ route: '/api/storage/google/callback', method: 'GET' })
  
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
      
      OAuthLogger.logCallback('google', undefined, false, mappedError, {
        providerError: error,
        providerErrorDescription: errorDescription,
        userAgent: req.headers.get('user-agent')
      })
      
      return NextResponse.redirect(
        new URL(`/briefly/app/dashboard?tab=storage&error=${encodeURIComponent(mappedError)}`, req.url)
      )
    }
    
    if (!code) {
      OAuthLogger.logCallback('google', undefined, false, OAuthErrorCodes.MISSING_CODE, {
        userAgent: req.headers.get('user-agent'),
        referer: req.headers.get('referer')
      })
      
      return NextResponse.redirect(
        new URL(`/briefly/app/dashboard?tab=storage&error=${OAuthErrorCodes.MISSING_CODE}`, req.url)
      )
    }

    // Get authenticated user
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      OAuthLogger.logCallback('google', undefined, false, OAuthErrorCodes.AUTH_FAILED, {
        authError: authError?.message,
        userAgent: req.headers.get('user-agent')
      })
      
      return NextResponse.redirect(new URL('/auth/signin', req.url))
    }
    
    // Critical: Verify OAuth state to prevent token binding to wrong account
    if (!OAuthStateManager.verifyState(returnedState || '', user.id)) {
      // Log state verification failure with HIGH severity
      OAuthLogger.logSecurityEvent('google', 'state_mismatch', {
        expected: user.id,
        received: returnedState,
        userId: user.id,
        userAgent: req.headers.get('user-agent'),
        referer: req.headers.get('referer')
      })
      
      // Log state verification failure
      OAuthStateManager.logStateVerification(
        'google',
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
      'google',
      true,
      user.id,
      returnedState || '',
      undefined
    )

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.GOOGLE_DRIVE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET!,
        redirect_uri: `${new URL(req.url).origin}/api/storage/google/callback`
      })
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      
      OAuthLogger.logCallback('google', user.id, false, OAuthErrorCodes.TOKEN_EXCHANGE_FAILED, {
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
      // Read existing token to preserve refresh_token if Google doesn't send a new one
      const existingToken = await oauthTokensRepo.getToken(user.id, 'google')
      const refreshToken = tokens.refresh_token ?? existingToken?.refreshToken ?? null

      // Store tokens securely with merged refresh token using RPC functions
      console.log(`[${rid}] Saving Google token for user ${user.id} via RPC`)
      await oauthTokensRepo.saveToken(user.id, 'google', {
        accessToken: tokens.access_token,
        refreshToken: refreshToken || undefined,
        expiresAt: typeof tokens.expires_in === 'number'
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : undefined,
        scope: tokens.scope ?? undefined,
      })
      console.log(`[${rid}] Google token saved successfully via RPC`)

      // Log successful token storage
      OAuthLogger.logTokenOperation('google', 'store', user.id, true, {
        scope: tokens.scope,
        hasRefreshToken: !!refreshToken,
        preservedRefreshToken: !tokens.refresh_token && !!existingToken?.refreshToken
      })

      // Log successful callback completion
      OAuthLogger.logCallback('google', user.id, true, undefined, {
        operation: 'complete_flow',
        scope: tokens.scope
      })

      // Redirect with success indicator for UI feedback
      return NextResponse.redirect(
        new URL('/briefly/app/dashboard?tab=storage&connected=google', req.url)
      )
    } catch (storageError) {
      // Handle schema-specific errors for OAuth token storage
      if (storageError.name === 'SchemaError') {
        logSchemaError(storageError)
        logErr(rid, 'token-storage-schema-error', storageError, { 
          userId: user.id, 
          provider: 'google',
          schemaContext: {
            schema: storageError.schema,
            operation: storageError.operation,
            code: storageError.code,
            isRetryable: storageError.isRetryable
          }
        })
      } else {
        // Handle non-schema errors and wrap them with schema context
        const schemaError = handleSchemaError(storageError, {
          schema: 'private',
          operation: 'oauth_token_storage',
          userId: user.id,
          correlationId: rid,
          originalError: storageError
        })
        logSchemaError(schemaError)
        logErr(rid, 'token-storage-rpc', schemaError, { userId: user.id, provider: 'google' })
      }
      
      // Log token storage failure with RPC context
      OAuthLogger.logTokenOperation('google', 'store', user.id, false, {
        error: storageError instanceof Error ? storageError.message : String(storageError),
        method: 'rpc_function',
        schemaError: storageError.name === 'SchemaError'
      })
      
      OAuthLogger.logCallback('google', user.id, false, OAuthErrorCodes.TOKEN_STORAGE_FAILED, {
        operation: 'token_storage_rpc',
        error: storageError instanceof Error ? storageError.message : String(storageError),
        schemaError: storageError.name === 'SchemaError'
      })
      
      return NextResponse.redirect(
        new URL(`/briefly/app/dashboard?tab=storage&error=${OAuthErrorCodes.TOKEN_STORAGE_FAILED}`, req.url)
      )
    }

  } catch (error) {
    // Log unexpected errors with full context
    OAuthLogger.logError('google', 'callback', error instanceof Error ? error : new Error(String(error)), {
      operation: 'oauth_callback',
      userAgent: req.headers.get('user-agent'),
      referer: req.headers.get('referer')
    })
    
    OAuthLogger.logCallback('google', undefined, false, OAuthErrorCodes.UNEXPECTED_ERROR, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })
    
    return NextResponse.redirect(
      new URL(`/briefly/app/dashboard?tab=storage&error=${OAuthErrorCodes.UNEXPECTED_ERROR}`, req.url)
    )
  }
}
