// src/app/api/auth/signout/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { signoutService, SignoutOptions } from '@/app/lib/auth/signout-service'
import { logger } from '@/app/lib/logger'
import { createSupabaseServerClient } from '@/app/lib/auth/supabase-auth'

/**
 * Enhanced signout API route with proper error handling, audit logging, and timeout management
 */

// Timeout for signout operations (10 seconds)
const SIGNOUT_TIMEOUT = 10000

interface SignoutRequestBody {
  options?: SignoutOptions
  returnUrl?: string
}

export async function POST(request: NextRequest) {
  const correlationId = crypto.randomUUID()
  const startTime = Date.now()
  
  // Get request metadata for logging
  const headersList = await headers()
  const userAgent = headersList.get('user-agent') || 'Unknown'
  const forwardedFor = headersList.get('x-forwarded-for')
  const realIp = headersList.get('x-real-ip')
  const ipAddress = forwardedFor?.split(',')[0] || realIp || 'Unknown'
  
  logger.info('Signout API request received', {
    correlationId,
    userAgent,
    ipAddress,
    url: request.url
  })

  let userId: string | undefined
  let requestBody: SignoutRequestBody = {}

  try {
    // Parse request body if present
    try {
      const body = await request.text()
      if (body) {
        requestBody = JSON.parse(body)
      }
    } catch (parseError) {
      logger.warn('Failed to parse request body, using defaults', {
        correlationId,
        error: parseError instanceof Error ? parseError.message : 'Unknown parse error'
      })
    }

    // Get user info for logging
    try {
      const supabase = await createSupabaseServerClient()
      const { data: { user } } = await supabase.auth.getUser()
      userId = user?.id
    } catch (userError) {
      logger.warn('Could not get user info for signout', {
        correlationId,
        error: userError instanceof Error ? userError.message : 'Unknown user error'
      })
    }

    // Set up timeout for signout operation
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Signout operation timed out'))
      }, SIGNOUT_TIMEOUT)
    })

    // Perform signout with timeout
    const signoutPromise = signoutService.signOut({
      forceRedirect: true, // Always force redirect for API calls
      showLoading: false, // API doesn't need loading states
      ...requestBody.options
    })

    const result = await Promise.race([signoutPromise, timeoutPromise])

    const duration = Date.now() - startTime

    if (result.success) {
      logger.info('Signout API completed successfully', {
        correlationId,
        userId,
        duration,
        cleanup: result.cleanup
      })

      // Determine redirect URL
      const redirectUrl = getRedirectUrl(requestBody.returnUrl, result.success)

      // Return success response with redirect
      return NextResponse.redirect(redirectUrl, { 
        status: 302,
        headers: {
          'X-Signout-Status': 'success',
          'X-Correlation-Id': correlationId,
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      })
    } else {
      // Signout failed but we still redirect for security
      logger.warn('Signout API failed but redirecting for security', {
        correlationId,
        userId,
        duration,
        error: result.error,
        cleanup: result.cleanup
      })

      const redirectUrl = getRedirectUrl(requestBody.returnUrl, false, result.error)

      return NextResponse.redirect(redirectUrl, { 
        status: 302,
        headers: {
          'X-Signout-Status': 'error',
          'X-Signout-Error': result.error || 'Unknown error',
          'X-Correlation-Id': correlationId,
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      })
    }

  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    logger.error('Signout API encountered unexpected error', {
      correlationId,
      userId,
      duration,
      error: errorMessage,
      userAgent,
      ipAddress
    })

    // For security, always redirect even on unexpected errors
    const redirectUrl = getRedirectUrl(requestBody.returnUrl, false, errorMessage)

    return NextResponse.redirect(redirectUrl, { 
      status: 302,
      headers: {
        'X-Signout-Status': 'error',
        'X-Signout-Error': 'Internal server error',
        'X-Correlation-Id': correlationId,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    })
  }
}

/**
 * Handle GET requests by delegating to POST
 * This maintains backward compatibility with existing form submissions
 */
export async function GET(request: NextRequest) {
  logger.info('GET request to signout API, delegating to POST handler')
  return POST(request)
}

/**
 * Construct redirect URL with appropriate parameters
 */
function getRedirectUrl(returnUrl?: string, success?: boolean, error?: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  
  // Default to signin page
  let baseUrl = '/auth/signin'
  
  // Use custom return URL if provided and valid
  if (returnUrl && isValidReturnUrl(returnUrl)) {
    baseUrl = returnUrl
  }
  
  const url = new URL(baseUrl, siteUrl)
  
  // Add status parameters
  if (success === true) {
    url.searchParams.set('message', 'signout_success')
  } else if (success === false) {
    url.searchParams.set('message', 'signout_error')
    if (error) {
      // Only include safe error messages
      const safeError = sanitizeErrorMessage(error)
      if (safeError) {
        url.searchParams.set('error', safeError)
      }
    }
  }
  
  return url.toString()
}

/**
 * Validate return URL to prevent open redirects
 */
function isValidReturnUrl(url: string): boolean {
  try {
    // Only allow relative URLs or URLs to the same origin
    if (url.startsWith('/')) {
      return true
    }
    
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const parsedUrl = new URL(url)
    const siteOrigin = new URL(siteUrl).origin
    
    return parsedUrl.origin === siteOrigin
  } catch {
    return false
  }
}

/**
 * Sanitize error messages to prevent information disclosure
 */
function sanitizeErrorMessage(error: string): string | null {
  // Only allow specific safe error messages
  const safeErrors = [
    'network_error',
    'timeout_error',
    'service_unavailable',
    'cleanup_failed'
  ]
  
  // Map common error patterns to safe messages
  if (error.toLowerCase().includes('network') || error.toLowerCase().includes('fetch')) {
    return 'network_error'
  }
  
  if (error.toLowerCase().includes('timeout')) {
    return 'timeout_error'
  }
  
  if (error.toLowerCase().includes('cleanup')) {
    return 'cleanup_failed'
  }
  
  // Default to generic error for security
  return 'service_unavailable'
}
