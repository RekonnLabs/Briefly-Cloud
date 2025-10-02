'use client'

/**
 * useSignout Hook
 * 
 * Provides a React hook interface for the centralized signout service.
 * Handles loading states, error management, and provides consistent
 * signout behavior across all components.
 */

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { signoutService, type SignoutOptions, type SignoutResult } from './signout-service'
import { logger } from '@/app/lib/logger'

export interface UseSignoutReturn {
  /** Function to trigger signout with optional configuration */
  signOut: (options?: SignoutOptions) => Promise<void>
  /** Whether a signout operation is currently in progress */
  isSigningOut: boolean
  /** Current error message, if any */
  error: string | null
  /** Function to clear the current error */
  clearError: () => void
  /** Function to retry the last failed signout attempt */
  retry: () => Promise<void>
  /** The last signout result for debugging/logging */
  lastResult: SignoutResult | null
}

/**
 * React hook for managing user signout
 * 
 * Features:
 * - Loading state management
 * - Error handling with retry capability
 * - Automatic redirect on success
 * - Consistent interface across components
 * - Integration with Next.js router
 * 
 * @returns UseSignoutReturn object with signout controls
 */
export function useSignout(): UseSignoutReturn {
  const router = useRouter()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastOptions, setLastOptions] = useState<SignoutOptions | undefined>()
  const [lastResult, setLastResult] = useState<SignoutResult | null>(null)

  /**
   * Clear any existing error state
   */
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  /**
   * Perform signout with the given options
   */
  const signOut = useCallback(async (options: SignoutOptions = {}) => {
    // Prevent multiple concurrent signout attempts
    if (isSigningOut) {
      logger.warn('Signout already in progress, ignoring duplicate request')
      return
    }

    const correlationId = crypto.randomUUID()
    
    try {
      setIsSigningOut(true)
      setError(null)
      setLastOptions(options)

      logger.info('Starting signout via useSignout hook', {
        correlationId,
        options
      })

      // Call the signout service
      const result = await signoutService.signOut(options)
      setLastResult(result)

      if (result.success) {
        logger.info('Signout successful, redirecting', {
          correlationId,
          redirectUrl: result.redirectUrl,
          cleanup: result.cleanup
        })

        // Add success message to redirect URL
        const redirectUrl = new URL(result.redirectUrl, window.location.origin)
        redirectUrl.searchParams.set('message', 'signout_success')
        
        // Redirect to signin page with success message
        router.push(redirectUrl.toString())
      } else {
        // Handle signout failure
        const errorMessage = result.error || 'Signout failed for unknown reason'
        setError(errorMessage)
        
        logger.error('Signout failed via useSignout hook', {
          correlationId,
          error: errorMessage,
          cleanup: result.cleanup
        })

        // If forceRedirect is enabled, redirect anyway with error message
        if (options.forceRedirect) {
          const redirectUrl = new URL(result.redirectUrl, window.location.origin)
          redirectUrl.searchParams.set('message', 'signout_error')
          redirectUrl.searchParams.set('error', errorMessage)
          
          router.push(redirectUrl.toString())
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during signout'
      setError(errorMessage)
      setLastResult({
        success: false,
        error: errorMessage,
        redirectUrl: '/auth/signin',
        cleanup: {
          pickerTokens: false,
          storageCredentials: false,
          sessionData: false,
          errors: [errorMessage]
        }
      })

      logger.error('Unexpected error in useSignout hook', {
        correlationId,
        error: errorMessage
      })

      // If forceRedirect is enabled, redirect anyway
      if (options.forceRedirect) {
        const redirectUrl = new URL('/auth/signin', window.location.origin)
        redirectUrl.searchParams.set('message', 'signout_error')
        redirectUrl.searchParams.set('error', errorMessage)
        
        router.push(redirectUrl.toString())
      }
    } finally {
      setIsSigningOut(false)
    }
  }, [isSigningOut, router])

  /**
   * Retry the last signout attempt with the same options
   */
  const retry = useCallback(async () => {
    if (!lastOptions) {
      logger.warn('No previous signout options to retry')
      return
    }

    logger.info('Retrying signout with previous options', {
      options: lastOptions
    })

    await signOut(lastOptions)
  }, [lastOptions, signOut])

  return {
    signOut,
    isSigningOut,
    error,
    clearError,
    retry,
    lastResult
  }
}

/**
 * Convenience hooks for common signout scenarios
 */

/**
 * Hook for quick signout with loading state and force redirect
 */
export function useQuickSignout() {
  const { signOut, isSigningOut, error, clearError } = useSignout()
  
  const quickSignOut = useCallback(() => {
    return signOut({
      showLoading: true,
      forceRedirect: true
    })
  }, [signOut])

  return {
    signOut: quickSignOut,
    isSigningOut,
    error,
    clearError
  }
}

/**
 * Hook for emergency signout (skip cleanup, force redirect)
 */
export function useEmergencySignout() {
  const { signOut, isSigningOut, error, clearError } = useSignout()
  
  const emergencySignOut = useCallback(() => {
    return signOut({
      skipCleanup: true,
      forceRedirect: true,
      showLoading: false
    })
  }, [signOut])

  return {
    signOut: emergencySignOut,
    isSigningOut,
    error,
    clearError
  }
}

/**
 * Hook for complete signout with full cleanup
 */
export function useCompleteSignout() {
  const { signOut, isSigningOut, error, clearError, retry } = useSignout()
  
  const completeSignOut = useCallback(() => {
    return signOut({
      showLoading: true,
      revokeProviderTokens: true,
      cancelRunningJobs: true,
      forceRedirect: false
    })
  }, [signOut])

  return {
    signOut: completeSignOut,
    isSigningOut,
    error,
    clearError,
    retry
  }
}