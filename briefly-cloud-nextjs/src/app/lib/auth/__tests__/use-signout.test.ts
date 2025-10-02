/**
 * Tests for useSignout hook
 * 
 * Tests the React hook interface for the centralized signout service,
 * including loading states, error handling, and retry functionality.
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import { useSignout, useQuickSignout, useEmergencySignout, useCompleteSignout } from '../use-signout'
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
    randomUUID: () => 'test-uuid-123'
  }
})

// Note: jsdom provides window.location with origin 'http://localhost' by default

const mockPush = jest.fn()
const mockSignoutService = signoutService as jest.Mocked<typeof signoutService>
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>

describe('useSignout', () => {
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
  })

  describe('basic functionality', () => {
    it('should initialize with correct default state', () => {
      const { result } = renderHook(() => useSignout())

      expect(result.current.isSigningOut).toBe(false)
      expect(result.current.error).toBe(null)
      expect(result.current.lastResult).toBe(null)
      expect(typeof result.current.signOut).toBe('function')
      expect(typeof result.current.clearError).toBe('function')
      expect(typeof result.current.retry).toBe('function')
    })

    it('should handle successful signout', async () => {
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

      mockSignoutService.signOut.mockResolvedValue(successResult)

      const { result } = renderHook(() => useSignout())

      await act(async () => {
        await result.current.signOut()
      })

      expect(mockSignoutService.signOut).toHaveBeenCalledWith({})
      expect(mockPush).toHaveBeenCalledWith('http://localhost/auth/signin?message=signout_success')
      expect(result.current.isSigningOut).toBe(false)
      expect(result.current.error).toBe(null)
      expect(result.current.lastResult).toEqual(successResult)
    })

    it('should handle signout failure without forceRedirect', async () => {
      const failureResult: SignoutResult = {
        success: false,
        error: 'Network error',
        redirectUrl: '/auth/signin',
        cleanup: {
          pickerTokens: false,
          storageCredentials: false,
          sessionData: false,
          errors: ['Network error']
        }
      }

      mockSignoutService.signOut.mockResolvedValue(failureResult)

      const { result } = renderHook(() => useSignout())

      await act(async () => {
        await result.current.signOut()
      })

      expect(result.current.error).toBe('Network error')
      expect(result.current.isSigningOut).toBe(false)
      expect(mockPush).not.toHaveBeenCalled()
      expect(result.current.lastResult).toEqual(failureResult)
    })

    it('should handle signout failure with forceRedirect', async () => {
      const failureResult: SignoutResult = {
        success: false,
        error: 'Network error',
        redirectUrl: '/auth/signin',
        cleanup: {
          pickerTokens: false,
          storageCredentials: false,
          sessionData: false,
          errors: ['Network error']
        }
      }

      mockSignoutService.signOut.mockResolvedValue(failureResult)

      const { result } = renderHook(() => useSignout())

      await act(async () => {
        await result.current.signOut({ forceRedirect: true })
      })

      expect(result.current.error).toBe('Network error')
      expect(mockPush).toHaveBeenCalledWith('http://localhost/auth/signin?message=signout_error&error=Network+error')
    })
  })

  describe('loading state management', () => {
    it('should set loading state during signout', async () => {
      let resolveSignout: (value: SignoutResult) => void
      const signoutPromise = new Promise<SignoutResult>((resolve) => {
        resolveSignout = resolve
      })

      mockSignoutService.signOut.mockReturnValue(signoutPromise)

      const { result } = renderHook(() => useSignout())

      // Start signout
      act(() => {
        result.current.signOut()
      })

      // Should be loading
      expect(result.current.isSigningOut).toBe(true)

      // Resolve signout
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

      // Should no longer be loading
      expect(result.current.isSigningOut).toBe(false)
    })

    it('should prevent concurrent signout attempts', async () => {
      mockSignoutService.signOut.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          success: true,
          redirectUrl: '/auth/signin',
          cleanup: {
            pickerTokens: true,
            storageCredentials: true,
            sessionData: true,
            errors: []
          }
        }), 100))
      )

      const { result } = renderHook(() => useSignout())

      // Start first signout
      act(() => {
        result.current.signOut()
      })

      expect(result.current.isSigningOut).toBe(true)

      // Try to start second signout
      act(() => {
        result.current.signOut()
      })

      // Should only call signout service once
      expect(mockSignoutService.signOut).toHaveBeenCalledTimes(1)
    })
  })

  describe('error handling', () => {
    it('should handle service exceptions', async () => {
      const error = new Error('Service unavailable')
      mockSignoutService.signOut.mockRejectedValue(error)

      const { result } = renderHook(() => useSignout())

      await act(async () => {
        await result.current.signOut()
      })

      expect(result.current.error).toBe('Service unavailable')
      expect(result.current.isSigningOut).toBe(false)
      expect(mockPush).not.toHaveBeenCalled()
    })

    it('should handle service exceptions with forceRedirect', async () => {
      const error = new Error('Service unavailable')
      mockSignoutService.signOut.mockRejectedValue(error)

      const { result } = renderHook(() => useSignout())

      await act(async () => {
        await result.current.signOut({ forceRedirect: true })
      })

      expect(result.current.error).toBe('Service unavailable')
      expect(mockPush).toHaveBeenCalledWith('http://localhost/auth/signin?message=signout_error&error=Service+unavailable')
    })

    it('should clear error state', () => {
      const { result } = renderHook(() => useSignout())

      // Set error state manually for testing
      act(() => {
        // Simulate error by calling signOut with a failing service
        mockSignoutService.signOut.mockRejectedValue(new Error('Test error'))
        result.current.signOut()
      })

      // Wait for error to be set
      waitFor(() => {
        expect(result.current.error).toBe('Test error')
      })

      // Clear error
      act(() => {
        result.current.clearError()
      })

      expect(result.current.error).toBe(null)
    })
  })

  describe('retry functionality', () => {
    it('should retry with last options', async () => {
      const failureResult: SignoutResult = {
        success: false,
        error: 'Network error',
        redirectUrl: '/auth/signin',
        cleanup: {
          pickerTokens: false,
          storageCredentials: false,
          sessionData: false,
          errors: ['Network error']
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
        .mockResolvedValueOnce(failureResult)
        .mockResolvedValueOnce(successResult)

      const { result } = renderHook(() => useSignout())

      // First attempt fails
      await act(async () => {
        await result.current.signOut({ showLoading: true })
      })

      expect(result.current.error).toBe('Network error')

      // Retry should use same options
      await act(async () => {
        await result.current.retry()
      })

      expect(mockSignoutService.signOut).toHaveBeenCalledTimes(2)
      expect(mockSignoutService.signOut).toHaveBeenNthCalledWith(1, { showLoading: true })
      expect(mockSignoutService.signOut).toHaveBeenNthCalledWith(2, { showLoading: true })
      expect(mockPush).toHaveBeenCalledWith('http://localhost/auth/signin?message=signout_success')
    })

    it('should handle retry when no previous options exist', async () => {
      const { result } = renderHook(() => useSignout())

      await act(async () => {
        await result.current.retry()
      })

      // Should not call signout service if no previous options
      expect(mockSignoutService.signOut).not.toHaveBeenCalled()
    })
  })
})

describe('convenience hooks', () => {
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
  })

  describe('useQuickSignout', () => {
    it('should call signOut with quick options', async () => {
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

      mockSignoutService.signOut.mockResolvedValue(successResult)

      const { result } = renderHook(() => useQuickSignout())

      await act(async () => {
        await result.current.signOut()
      })

      expect(mockSignoutService.signOut).toHaveBeenCalledWith({
        showLoading: true,
        forceRedirect: true
      })
    })
  })

  describe('useEmergencySignout', () => {
    it('should call signOut with emergency options', async () => {
      const successResult: SignoutResult = {
        success: true,
        redirectUrl: '/auth/signin',
        cleanup: {
          pickerTokens: false,
          storageCredentials: false,
          sessionData: true,
          errors: []
        }
      }

      mockSignoutService.signOut.mockResolvedValue(successResult)

      const { result } = renderHook(() => useEmergencySignout())

      await act(async () => {
        await result.current.signOut()
      })

      expect(mockSignoutService.signOut).toHaveBeenCalledWith({
        skipCleanup: true,
        forceRedirect: true,
        showLoading: false
      })
    })
  })

  describe('useCompleteSignout', () => {
    it('should call signOut with complete options', async () => {
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

      mockSignoutService.signOut.mockResolvedValue(successResult)

      const { result } = renderHook(() => useCompleteSignout())

      await act(async () => {
        await result.current.signOut()
      })

      expect(mockSignoutService.signOut).toHaveBeenCalledWith({
        showLoading: true,
        revokeProviderTokens: true,
        cancelRunningJobs: true,
        forceRedirect: false
      })
    })

    it('should provide retry functionality', async () => {
      const failureResult: SignoutResult = {
        success: false,
        error: 'Network error',
        redirectUrl: '/auth/signin',
        cleanup: {
          pickerTokens: false,
          storageCredentials: false,
          sessionData: false,
          errors: ['Network error']
        }
      }

      mockSignoutService.signOut.mockResolvedValue(failureResult)

      const { result } = renderHook(() => useCompleteSignout())

      await act(async () => {
        await result.current.signOut()
      })

      expect(result.current.retry).toBeDefined()
      expect(typeof result.current.retry).toBe('function')
    })
  })
})