/**
 * Tests for signout error recovery and retry mechanisms
 * 
 * Focuses on testing various error scenarios, recovery strategies,
 * and retry functionality across the signout system.
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { useSignout } from '../use-signout'
import { signoutService } from '../signout-service'
import type { SignoutResult } from '../signout-service'

// Mock dependencies
jest.mock('next/navigation', () => ({
  useRouter: jest.fn()
}))

jest.mock('../signout-service', () => ({
  signoutService: {
    signOut: jest.fn()
  }
}))

jest.mock('@/app/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}))

// Mock crypto.randomUUID
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => 'error-recovery-test-id'
  }
})

const mockPush = jest.fn()
const mockSignoutService = signoutService as jest.Mocked<typeof signoutService>
const mockUseRouter = require('next/navigation').useRouter as jest.MockedFunction<any>

describe('Signout Error Recovery and Retry Mechanisms', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseRouter.mockReturnValue({
      push: mockPush,
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn()
    })

    // Tests run in browser environment by default with jsdom
  })

  afterEach(() => {
    delete (global as any).window
  })

  describe('network error recovery', () => {
    it('should handle network timeouts with retry', async () => {
      const timeoutResult: SignoutResult = {
        success: false,
        error: 'Request timeout after 30 seconds',
        redirectUrl: '/auth/signin',
        cleanup: {
          pickerTokens: false,
          storageCredentials: false,
          sessionData: false,
          errors: ['Request timeout after 30 seconds']
        }
      }

      const successResult: SignoutResult = {
        success: true,
        redirectUrl: '/auth/signin',
        cleanup: {
          pickerTokens: true,
          storageCredentials: true,
          sessionData: true,
          errors: []
        }
      }

      mockSignoutService.signOut
        .mockResolvedValueOnce(timeoutResult)
        .mockResolvedValueOnce(successResult)

      const { result } = renderHook(() => useSignout())

      // First attempt fails with timeout
      await act(async () => {
        await result.current.signOut()
      })

      expect(result.current.error).toBe('Request timeout after 30 seconds')
      expect(result.current.isSigningOut).toBe(false)
      expect(mockPush).not.toHaveBeenCalled()

      // Retry should succeed
      await act(async () => {
        await result.current.retry()
      })

      expect(result.current.error).toBe(null)
      expect(mockPush).toHaveBeenCalledWith('http://localhost/auth/signin?message=signout_success')
      expect(mockSignoutService.signOut).toHaveBeenCalledTimes(2)
    })

    it('should handle connection errors with exponential backoff simulation', async () => {
      const connectionError: SignoutResult = {
        success: false,
        error: 'Network connection failed',
        redirectUrl: '/auth/signin',
        cleanup: {
          pickerTokens: false,
          storageCredentials: false,
          sessionData: false,
          errors: ['Network connection failed']
        }
      }

      mockSignoutService.signOut.mockResolvedValue(connectionError)

      const { result } = renderHook(() => useSignout())

      // Multiple retry attempts
      for (let attempt = 1; attempt <= 3; attempt++) {
        await act(async () => {
          if (attempt === 1) {
            await result.current.signOut()
          } else {
            await result.current.retry()
          }
        })

        expect(result.current.error).toBe('Network connection failed')
        expect(result.current.isSigningOut).toBe(false)
        expect(mockSignoutService.signOut).toHaveBeenCalledTimes(attempt)
      }

      // Should not redirect on repeated failures without forceRedirect
      expect(mockPush).not.toHaveBeenCalled()
    })

    it('should force redirect after multiple failures when requested', async () => {
      const persistentError: SignoutResult = {
        success: false,
        error: 'Service unavailable',
        redirectUrl: '/auth/signin',
        cleanup: {
          pickerTokens: false,
          storageCredentials: false,
          sessionData: false,
          errors: ['Service unavailable']
        }
      }

      mockSignoutService.signOut.mockResolvedValue(persistentError)

      const { result } = renderHook(() => useSignout())

      // Try normal signout first
      await act(async () => {
        await result.current.signOut()
      })

      expect(result.current.error).toBe('Service unavailable')
      expect(mockPush).not.toHaveBeenCalled()

      // Force redirect on retry
      await act(async () => {
        await result.current.signOut({ forceRedirect: true })
      })

      expect(mockPush).toHaveBeenCalledWith('http://localhost/auth/signin?message=signout_error&error=Service+unavailable')
    })
  })

  describe('partial cleanup failure recovery', () => {
    it('should handle Google Picker cleanup failures gracefully', async () => {
      const partialFailureResult: SignoutResult = {
        success: true, // Overall success despite cleanup issues
        redirectUrl: '/auth/signin',
        cleanup: {
          pickerTokens: false, // Failed
          storageCredentials: true, // Succeeded
          sessionData: true, // Succeeded
          errors: ['Failed to cleanup picker tokens: Google Picker API unavailable']
        }
      }

      mockSignoutService.signOut.mockResolvedValue(partialFailureResult)

      const { result } = renderHook(() => useSignout())

      await act(async () => {
        await result.current.signOut()
      })

      // Should still redirect on overall success
      expect(result.current.error).toBe(null)
      expect(result.current.lastResult?.cleanup.errors).toContain('Failed to cleanup picker tokens: Google Picker API unavailable')
      expect(mockPush).toHaveBeenCalledWith('http://localhost/auth/signin?message=signout_success')
    })

    it('should handle storage credential cleanup failures', async () => {
      const storageFailureResult: SignoutResult = {
        success: true,
        redirectUrl: '/auth/signin',
        cleanup: {
          pickerTokens: true,
          storageCredentials: false, // Failed
          sessionData: true,
          errors: [
            'Failed to cleanup storage credentials: Google Drive API rate limited',
            'Failed to cleanup storage credentials: Microsoft Graph API timeout'
          ]
        }
      }

      mockSignoutService.signOut.mockResolvedValue(storageFailureResult)

      const { result } = renderHook(() => useSignout())

      await act(async () => {
        await result.current.signOut()
      })

      expect(result.current.error).toBe(null)
      expect(result.current.lastResult?.cleanup.errors).toHaveLength(2)
      expect(mockPush).toHaveBeenCalledWith('http://localhost/auth/signin?message=signout_success')
    })

    it('should allow retry of failed cleanup tasks', async () => {
      const initialFailure: SignoutResult = {
        success: true,
        redirectUrl: '/auth/signin',
        cleanup: {
          pickerTokens: false,
          storageCredentials: false,
          sessionData: true,
          errors: ['Cleanup tasks failed due to network issues']
        }
      }

      const retrySuccess: SignoutResult = {
        success: true,
        redirectUrl: '/auth/signin',
        cleanup: {
          pickerTokens: true,
          storageCredentials: true,
          sessionData: true,
          errors: []
        }
      }

      mockSignoutService.signOut
        .mockResolvedValueOnce(initialFailure)
        .mockResolvedValueOnce(retrySuccess)

      const { result } = renderHook(() => useSignout())

      // Initial signout with partial cleanup failure
      await act(async () => {
        await result.current.signOut()
      })

      expect(result.current.lastResult?.cleanup.errors).toHaveLength(1)
      expect(mockPush).toHaveBeenCalledWith('http://localhost/auth/signin?message=signout_success')

      // Clear the first redirect call
      mockPush.mockClear()

      // Retry should complete cleanup successfully
      await act(async () => {
        await result.current.retry()
      })

      expect(result.current.lastResult?.cleanup.errors).toHaveLength(0)
      expect(result.current.lastResult?.cleanup.pickerTokens).toBe(true)
      expect(result.current.lastResult?.cleanup.storageCredentials).toBe(true)
    })
  })

  describe('authentication service failures', () => {
    it('should handle Supabase auth service downtime', async () => {
      const authServiceDown: SignoutResult = {
        success: false,
        error: 'Authentication service temporarily unavailable',
        redirectUrl: '/auth/signin',
        cleanup: {
          pickerTokens: true, // Cleanup succeeded
          storageCredentials: true, // Cleanup succeeded
          sessionData: false, // Auth signout failed
          errors: []
        }
      }

      mockSignoutService.signOut.mockResolvedValue(authServiceDown)

      const { result } = renderHook(() => useSignout())

      await act(async () => {
        await result.current.signOut()
      })

      expect(result.current.error).toBe('Authentication service temporarily unavailable')
      expect(result.current.lastResult?.cleanup.sessionData).toBe(false)
      expect(mockPush).not.toHaveBeenCalled()

      // Should allow force redirect for security
      await act(async () => {
        await result.current.signOut({ forceRedirect: true })
      })

      expect(mockPush).toHaveBeenCalledWith(
        'http://localhost/auth/signin?message=signout_error&error=Authentication+service+temporarily+unavailable'
      )
    })

    it('should handle token revocation failures', async () => {
      const tokenRevocationFailure: SignoutResult = {
        success: false,
        error: 'Failed to revoke OAuth tokens',
        redirectUrl: '/auth/signin',
        cleanup: {
          pickerTokens: true,
          storageCredentials: false, // Token revocation failed
          sessionData: true, // Local signout succeeded
          errors: ['OAuth provider token revocation failed']
        }
      }

      mockSignoutService.signOut.mockResolvedValue(tokenRevocationFailure)

      const { result } = renderHook(() => useSignout())

      await act(async () => {
        await result.current.signOut({ revokeProviderTokens: true })
      })

      expect(result.current.error).toBe('Failed to revoke OAuth tokens')
      expect(result.current.lastResult?.cleanup.errors).toContain('OAuth provider token revocation failed')
      
      // Should not redirect automatically on token revocation failure
      expect(mockPush).not.toHaveBeenCalled()
    })
  })

  describe('concurrent signout handling', () => {
    it('should prevent multiple concurrent signout attempts', async () => {
      let resolveSignout: (value: SignoutResult) => void
      const signoutPromise = new Promise<SignoutResult>((resolve) => {
        resolveSignout = resolve
      })

      mockSignoutService.signOut.mockReturnValue(signoutPromise)

      const { result } = renderHook(() => useSignout())

      // Start first signout
      act(() => {
        result.current.signOut()
      })

      expect(result.current.isSigningOut).toBe(true)

      // Try to start second signout while first is in progress
      act(() => {
        result.current.signOut()
      })

      // Should only call service once
      expect(mockSignoutService.signOut).toHaveBeenCalledTimes(1)

      // Try retry while signout is in progress
      act(() => {
        result.current.retry()
      })

      // Should still only have one call
      expect(mockSignoutService.signOut).toHaveBeenCalledTimes(1)

      // Complete the signout
      await act(async () => {
        resolveSignout!({
          success: true,
          redirectUrl: '/auth/signin',
          cleanup: {
            pickerTokens: true,
            storageCredentials: true,
            sessionData: true,
            errors: []
          }
        })
        await signoutPromise
      })

      expect(result.current.isSigningOut).toBe(false)
    })

    it('should handle sequential retry attempts', async () => {
      const failureResult: SignoutResult = {
        success: false,
        error: 'Temporary failure',
        redirectUrl: '/auth/signin',
        cleanup: {
          pickerTokens: false,
          storageCredentials: false,
          sessionData: false,
          errors: ['Temporary failure']
        }
      }

      mockSignoutService.signOut.mockResolvedValue(failureResult)

      const { result } = renderHook(() => useSignout())

      // Initial failure
      await act(async () => {
        await result.current.signOut()
      })

      expect(result.current.error).toBe('Temporary failure')

      // Sequential retry attempts
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          await result.current.retry()
        })
      }

      // Should have made 4 total calls (1 initial + 3 retries)
      expect(mockSignoutService.signOut).toHaveBeenCalledTimes(4)
      expect(result.current.error).toBe('Temporary failure')
    })
  })

  describe('error state management', () => {
    it('should provide error handling interface', async () => {
      const { result } = renderHook(() => useSignout())

      // Hook should render successfully
      expect(result.current).toBeTruthy()
      
      // Should provide required functions
      expect(typeof result.current.signOut).toBe('function')
      expect(typeof result.current.clearError).toBe('function')
      expect(typeof result.current.retry).toBe('function')
      
      // Initial state
      expect(result.current.isSigningOut).toBe(false)
      expect(result.current.error).toBe(null)
      expect(result.current.lastResult).toBe(null)
    })
  })
})