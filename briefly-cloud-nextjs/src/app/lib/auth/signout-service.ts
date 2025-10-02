/**
 * Centralized Signout Service
 * 
 * Provides a unified signout experience with proper cleanup, error handling,
 * and user feedback across all components in the application.
 */

import { getSupabaseBrowserClient } from '@/app/lib/auth/supabase-browser'
import { createSupabaseServerClient } from '@/app/lib/auth/supabase-auth'
import { cleanupUserPickerTokens } from '@/app/lib/google-picker/token-service'
import { ConnectionManager } from '@/app/lib/cloud-storage/connection-manager'
import { auditUserAction } from '@/app/lib/audit/comprehensive-audit-logger'
import { logger } from '@/app/lib/logger'
import { recordSignoutEvent } from './signout-monitoring'

export interface SignoutOptions {
  /** Show loading state during signout process */
  showLoading?: boolean
  /** Skip cleanup tasks (for emergency signout) */
  skipCleanup?: boolean
  /** Force redirect even if signout fails */
  forceRedirect?: boolean
  /** Revoke tokens at OAuth providers */
  revokeProviderTokens?: boolean
  /** Cancel running import jobs */
  cancelRunningJobs?: boolean
}

export interface SignoutResult {
  /** Whether the signout was successful */
  success: boolean
  /** Error message if signout failed */
  error?: string
  /** URL to redirect to after signout */
  redirectUrl: string
  /** Details about cleanup tasks performed */
  cleanup: {
    /** Whether Google Picker tokens were cleaned up */
    pickerTokens: boolean
    /** Whether storage credentials were cleaned up */
    storageCredentials: boolean
    /** Whether session data was cleared */
    sessionData: boolean
    /** Any cleanup errors that occurred */
    errors: string[]
  }
}

export interface SignoutEvent {
  userId: string
  timestamp: Date
  success: boolean
  error?: string
  cleanupTasks: {
    pickerTokens: boolean
    storageCredentials: boolean
    sessionData: boolean
  }
  userAgent?: string
  ipAddress?: string
  correlationId: string
}

/**
 * Centralized Signout Service
 * 
 * Handles all aspects of user signout including:
 * - Supabase auth signout
 * - Google Picker token cleanup
 * - Storage credential cleanup
 * - Audit logging
 * - Error handling and recovery
 */
export class SignoutService {
  private static instance: SignoutService
  
  private constructor() {}
  
  static getInstance(): SignoutService {
    if (!SignoutService.instance) {
      SignoutService.instance = new SignoutService()
    }
    return SignoutService.instance
  }

  /**
   * Perform complete user signout with cleanup and logging
   */
  async signOut(options: SignoutOptions = {}): Promise<SignoutResult> {
    const correlationId = crypto.randomUUID()
    const startTime = Date.now()
    
    logger.info('Starting signout process', {
      correlationId,
      options: {
        showLoading: options.showLoading,
        skipCleanup: options.skipCleanup,
        forceRedirect: options.forceRedirect,
        revokeProviderTokens: options.revokeProviderTokens,
        cancelRunningJobs: options.cancelRunningJobs
      }
    })

    // Initialize result
    const result: SignoutResult = {
      success: false,
      redirectUrl: this.getSigninUrl(),
      cleanup: {
        pickerTokens: false,
        storageCredentials: false,
        sessionData: false,
        errors: []
      }
    }

    let userId: string | undefined
    let userAgent: string | undefined
    let ipAddress: string | undefined
    let sessionId: string | undefined
    let signoutError: Error | undefined

    try {
      // Get user info before signout for logging
      const userInfo = await this.getUserInfo()
      userId = userInfo.userId
      userAgent = userInfo.userAgent
      ipAddress = userInfo.ipAddress
      sessionId = userInfo.sessionId

      // Perform cleanup tasks if not skipped
      if (!options.skipCleanup && userId) {
        await this.performCleanupTasks(userId, options, result, correlationId)
      }

      // Perform the actual signout
      await this.performSignout()
      result.cleanup.sessionData = true
      result.success = true

      logger.info('Signout completed successfully', {
        correlationId,
        userId,
        duration: Date.now() - startTime,
        cleanup: result.cleanup
      })

      // Log successful signout event
      if (userId) {
        await this.logSignoutEvent({
          userId,
          timestamp: new Date(),
          success: true,
          cleanupTasks: {
            pickerTokens: result.cleanup.pickerTokens,
            storageCredentials: result.cleanup.storageCredentials,
            sessionData: result.cleanup.sessionData
          },
          userAgent,
          ipAddress,
          correlationId
        })
      }

    } catch (error) {
      signoutError = error instanceof Error ? error : new Error('Unknown error during signout')
      const errorMessage = signoutError.message
      result.error = errorMessage
      
      logger.error('Signout failed', {
        correlationId,
        userId,
        error: errorMessage,
        duration: Date.now() - startTime,
        cleanup: result.cleanup
      })

      // Log failed signout event
      if (userId) {
        await this.logSignoutEvent({
          userId,
          timestamp: new Date(),
          success: false,
          error: errorMessage,
          cleanupTasks: {
            pickerTokens: result.cleanup.pickerTokens,
            storageCredentials: result.cleanup.storageCredentials,
            sessionData: result.cleanup.sessionData
          },
          userAgent,
          ipAddress,
          correlationId
        })
      }

      // Handle error based on options
      if (options.forceRedirect) {
        // Force redirect even on error
        logger.warn('Forcing redirect despite signout error', {
          correlationId,
          userId,
          error: errorMessage
        })
        result.success = true // Set to true to allow redirect
      } else {
        // Return error for handling by caller
        result.success = false
      }
    } finally {
      // Record monitoring event regardless of success/failure
      const duration = Date.now() - startTime
      const component = this.getComponentFromStack()
      
      recordSignoutEvent(
        userId,
        sessionId,
        correlationId,
        options,
        result,
        duration,
        userAgent,
        component,
        signoutError
      )
    }

    return result
  }

  /**
   * Get user information before signout for logging
   */
  private async getUserInfo(): Promise<{
    userId?: string
    userAgent?: string
    ipAddress?: string
    sessionId?: string
  }> {
    try {
      // Try to get user from browser client first
      if (typeof window !== 'undefined') {
        const supabase = getSupabaseBrowserClient()
        const { data: { user, session } } = await supabase.auth.getUser()
        
        return {
          userId: user?.id,
          userAgent: navigator.userAgent,
          ipAddress: undefined, // Cannot get IP on client side
          sessionId: session?.access_token ? session.access_token.substring(0, 8) : undefined
        }
      } else {
        // Server-side - try to get user from server client
        const supabase = createSupabaseServerClient()
        const { data: { user, session } } = await supabase.auth.getUser()
        
        return {
          userId: user?.id,
          userAgent: undefined,
          ipAddress: undefined,
          sessionId: session?.access_token ? session.access_token.substring(0, 8) : undefined
        }
      }
    } catch (error) {
      logger.warn('Could not get user info before signout', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return {}
    }
  }

  /**
   * Get component name from call stack for monitoring
   */
  private getComponentFromStack(): string | undefined {
    try {
      const stack = new Error().stack
      if (!stack) return undefined

      // Look for component names in the stack trace
      const lines = stack.split('\n')
      for (const line of lines) {
        // Look for React component patterns
        if (line.includes('Sidebar') || line.includes('Dashboard') || 
            line.includes('useSignout') || line.includes('SignoutButton')) {
          const match = line.match(/at\s+(\w+)/)
          if (match) return match[1]
        }
      }
      
      return 'unknown'
    } catch (error) {
      return 'unknown'
    }
  }

  /**
   * Perform cleanup tasks before signout
   */
  private async performCleanupTasks(
    userId: string,
    options: SignoutOptions,
    result: SignoutResult,
    correlationId: string
  ): Promise<void> {
    logger.info('Starting cleanup tasks', { correlationId, userId })

    // Cleanup Google Picker tokens
    try {
      await cleanupUserPickerTokens(userId)
      result.cleanup.pickerTokens = true
      logger.info('Google Picker tokens cleaned up successfully', { correlationId, userId })
    } catch (error) {
      const errorMessage = `Failed to cleanup picker tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
      result.cleanup.errors.push(errorMessage)
      logger.warn('Failed to cleanup Google Picker tokens', {
        correlationId,
        userId,
        error: errorMessage
      })
    }

    // Cleanup storage credentials
    try {
      await this.cleanupStorageCredentials(userId, options)
      result.cleanup.storageCredentials = true
      logger.info('Storage credentials cleaned up successfully', { correlationId, userId })
    } catch (error) {
      const errorMessage = `Failed to cleanup storage credentials: ${error instanceof Error ? error.message : 'Unknown error'}`
      result.cleanup.errors.push(errorMessage)
      logger.warn('Failed to cleanup storage credentials', {
        correlationId,
        userId,
        error: errorMessage
      })
    }

    logger.info('Cleanup tasks completed', {
      correlationId,
      userId,
      cleanup: result.cleanup
    })
  }

  /**
   * Cleanup storage credentials (Google Drive, OneDrive)
   */
  private async cleanupStorageCredentials(
    userId: string,
    options: SignoutOptions
  ): Promise<void> {
    const cleanupOptions = {
      revokeAtProvider: options.revokeProviderTokens || false,
      cancelRunningJobs: options.cancelRunningJobs || false
    }

    // Cleanup Google Drive connection
    try {
      await ConnectionManager.disconnectGoogle(userId, cleanupOptions)
    } catch (error) {
      // Log but don't throw - continue with other cleanup
      logger.warn('Failed to cleanup Google Drive connection', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }

    // Cleanup Microsoft OneDrive connection
    try {
      await ConnectionManager.disconnectMicrosoft(userId, cleanupOptions)
    } catch (error) {
      // Log but don't throw - continue with other cleanup
      logger.warn('Failed to cleanup Microsoft OneDrive connection', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Perform the actual Supabase signout
   */
  private async performSignout(): Promise<void> {
    if (typeof window !== 'undefined') {
      // Client-side signout
      const supabase = getSupabaseBrowserClient()
      const { error } = await supabase.auth.signOut()
      
      if (error) {
        throw new Error(`Client-side signout failed: ${error.message}`)
      }
    } else {
      // Server-side signout
      const supabase = createSupabaseServerClient()
      await supabase.auth.signOut()
    }
  }

  /**
   * Handle signout errors with appropriate recovery strategies
   */
  private handleSignoutError(error: Error, options: SignoutOptions): SignoutResult {
    logger.error('Signout error occurred', {
      error: error.message,
      options
    })

    // Determine if we should force redirect
    const shouldForceRedirect = options.forceRedirect || 
      error.message.includes('network') ||
      error.message.includes('timeout') ||
      error.message.includes('fetch')

    return {
      success: shouldForceRedirect,
      error: error.message,
      redirectUrl: this.getSigninUrl(),
      cleanup: {
        pickerTokens: false,
        storageCredentials: false,
        sessionData: shouldForceRedirect, // Assume cleared if forcing redirect
        errors: [error.message]
      }
    }
  }

  /**
   * Get the signin URL for redirect
   */
  private getSigninUrl(): string {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/auth/signin`
    }
    
    // For server-side, we'll use a default that should be overridden by the caller
    // The actual redirect will be handled by the API route or component
    return '/auth/signin'
  }

  /**
   * Log signout event for audit purposes
   */
  private async logSignoutEvent(event: SignoutEvent): Promise<void> {
    try {
      await auditUserAction(
        'user.logout',
        event.userId,
        event.success,
        event.correlationId,
        {
          timestamp: event.timestamp.toISOString(),
          cleanupTasks: event.cleanupTasks,
          error: event.error,
          userAgent: event.userAgent,
          ipAddress: event.ipAddress
        },
        event.success ? 'low' : 'medium'
      )
    } catch (error) {
      logger.error('Failed to log signout event', {
        correlationId: event.correlationId,
        userId: event.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
}

// Export singleton instance
export const signoutService = SignoutService.getInstance()

// Utility functions for common signout scenarios

/**
 * Quick signout with default options
 */
export async function quickSignout(): Promise<SignoutResult> {
  return signoutService.signOut({
    showLoading: true,
    forceRedirect: true
  })
}

/**
 * Emergency signout (skip cleanup, force redirect)
 */
export async function emergencySignout(): Promise<SignoutResult> {
  return signoutService.signOut({
    skipCleanup: true,
    forceRedirect: true,
    showLoading: false
  })
}

/**
 * Complete signout with full cleanup
 */
export async function completeSignout(): Promise<SignoutResult> {
  return signoutService.signOut({
    showLoading: true,
    revokeProviderTokens: true,
    cancelRunningJobs: true,
    forceRedirect: false
  })
}