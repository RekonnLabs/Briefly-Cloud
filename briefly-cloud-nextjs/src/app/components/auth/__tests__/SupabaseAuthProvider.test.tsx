/**
 * Tests for SupabaseAuthProvider signout integration with SignoutService
 */

import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { SupabaseAuthProvider, useAuth } from '../SupabaseAuthProvider'
import type { SignoutService } from '@/app/lib/auth/signout-service'
import { getSupabaseBrowserClient } from '@/app/lib/auth/supabase-browser'

// Mock dependencies
jest.mock('@/app/lib/auth/supabase-browser')
jest.mock('@/app/lib/auth/supabase-auth')
jest.mock('@/app/lib/google-picker/token-service')
jest.mock('@/app/lib/cloud-storage/connection-manager')
jest.mock('@/app/lib/audit/comprehensive-audit-logger')
jest.mock('@/app/lib/logger')
jest.mock('@/app/lib/oauth-flow-monitoring', () => ({
  logMainAuthRoute: jest.fn(),
  logOAuthFlowCompletion: jest.fn()
}))

// Mock SignoutService
jest.mock('@/app/lib/auth/signout-service', () => ({
  signoutService: {
    signOut: jest.fn()
  },
  SignoutService: {
    getInstance: jest.fn(() => ({
      signOut: jest.fn()
    }))
  }
}))

const mockSupabase = {
  auth: {
    onAuthStateChange: jest.fn(() => ({
      data: { subscription: { unsubscribe: jest.fn() } }
    })),
    getSession: jest.fn(),
    getUser: jest.fn(),
    signOut: jest.fn(),
    signInWithOAuth: jest.fn()
  }
}

// Get the mocked signout service
const { signoutService: mockSignoutService } = jest.requireMock('@/app/lib/auth/signout-service')

// Test component that uses the auth context
function TestComponent() {
  const { signOut, user, loading } = useAuth()
  
  return (
    <div>
      <div data-testid="loading">{loading ? 'loading' : 'loaded'}</div>
      <div data-testid="user">{user ? user.email : 'no user'}</div>
      <button 
        data-testid="signout-btn" 
        onClick={() => signOut()}
      >
        Sign Out
      </button>
      <button 
        data-testid="signout-with-options-btn" 
        onClick={() => signOut({ skipCleanup: true, forceRedirect: true })}
      >
        Emergency Sign Out
      </button>
    </div>
  )
}

describe('SupabaseAuthProvider signout integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getSupabaseBrowserClient as jest.Mock).mockReturnValue(mockSupabase)
    
    // Default mock implementations
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })
    mockSupabase.auth.signOut.mockResolvedValue({ error: null })
  })

  it('should use SignoutService for signout operations', async () => {
    const mockResult = {
      success: true,
      redirectUrl: '/auth/signin',
      cleanup: {
        pickerTokens: true,
        storageCredentials: true,
        sessionData: true,
        errors: []
      }
    }
    
    mockSignoutService.signOut.mockResolvedValue(mockResult)

    render(
      <SupabaseAuthProvider>
        <TestComponent />
      </SupabaseAuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded')
    })

    const signoutBtn = screen.getByTestId('signout-btn')
    
    await act(async () => {
      signoutBtn.click()
    })

    expect(mockSignoutService.signOut).toHaveBeenCalledWith({
      showLoading: true,
      forceRedirect: false
    })
  })

  it('should pass custom options to SignoutService', async () => {
    const mockResult = {
      success: true,
      redirectUrl: '/auth/signin',
      cleanup: {
        pickerTokens: false,
        storageCredentials: false,
        sessionData: true,
        errors: []
      }
    }
    
    mockSignoutService.signOut.mockResolvedValue(mockResult)

    render(
      <SupabaseAuthProvider>
        <TestComponent />
      </SupabaseAuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded')
    })

    const emergencySignoutBtn = screen.getByTestId('signout-with-options-btn')
    
    await act(async () => {
      emergencySignoutBtn.click()
    })

    expect(mockSignoutService.signOut).toHaveBeenCalledWith({
      showLoading: true,
      forceRedirect: true,
      skipCleanup: true
    })
  })

  it('should fallback to direct Supabase signout if SignoutService fails', async () => {
    mockSignoutService.signOut.mockRejectedValue(new Error('SignoutService failed'))
    mockSupabase.auth.signOut.mockResolvedValue({ error: null })

    render(
      <SupabaseAuthProvider>
        <TestComponent />
      </SupabaseAuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded')
    })

    const signoutBtn = screen.getByTestId('signout-btn')
    
    await act(async () => {
      signoutBtn.click()
    })

    expect(mockSignoutService.signOut).toHaveBeenCalled()
    expect(mockSupabase.auth.signOut).toHaveBeenCalled()
  })

  it('should handle both SignoutService and fallback failures gracefully', async () => {
    mockSignoutService.signOut.mockRejectedValue(new Error('SignoutService failed'))
    mockSupabase.auth.signOut.mockResolvedValue({ error: new Error('Supabase signout failed') })

    render(
      <SupabaseAuthProvider>
        <TestComponent />
      </SupabaseAuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded')
    })

    const signoutBtn = screen.getByTestId('signout-btn')
    
    let result
    await act(async () => {
      // We need to capture the result since the component doesn't display it
      const { signOut } = useAuth()
      result = await signOut()
    })

    expect(mockSignoutService.signOut).toHaveBeenCalled()
    expect(mockSupabase.auth.signOut).toHaveBeenCalled()
    
    // Should return error result but still clear local state
    expect(result).toEqual({
      success: false,
      error: 'Supabase signout failed',
      redirectUrl: '/auth/signin',
      cleanup: {
        pickerTokens: false,
        storageCredentials: false,
        sessionData: true,
        errors: ['Supabase signout failed']
      }
    })
  })

  it('should clear local state when signout is successful', async () => {
    // Set up initial authenticated state
    const mockUser = {
      id: 'test-user-id',
      email: 'test@example.com',
      user_metadata: { full_name: 'Test User' },
      app_metadata: { subscription_tier: 'free' }
    }
    
    const mockSession = {
      user: mockUser,
      access_token: 'test-token'
    }

    mockSupabase.auth.getSession.mockResolvedValue({ 
      data: { session: mockSession }, 
      error: null 
    })

    const mockResult = {
      success: true,
      redirectUrl: '/auth/signin',
      cleanup: {
        pickerTokens: true,
        storageCredentials: true,
        sessionData: true,
        errors: []
      }
    }
    
    mockSignoutService.signOut.mockResolvedValue(mockResult)

    render(
      <SupabaseAuthProvider>
        <TestComponent />
      </SupabaseAuthProvider>
    )

    // Wait for initial load and verify user is set
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded')
      expect(screen.getByTestId('user')).toHaveTextContent('test@example.com')
    })

    const signoutBtn = screen.getByTestId('signout-btn')
    
    await act(async () => {
      signoutBtn.click()
    })

    // Verify user state is cleared after signout
    expect(screen.getByTestId('user')).toHaveTextContent('no user')
  })

  it('should maintain backward compatibility with existing signout calls', async () => {
    const mockResult = {
      success: true,
      redirectUrl: '/auth/signin',
      cleanup: {
        pickerTokens: true,
        storageCredentials: true,
        sessionData: true,
        errors: []
      }
    }
    
    mockSignoutService.signOut.mockResolvedValue(mockResult)

    // Test component that calls signOut without options (backward compatibility)
    function LegacyTestComponent() {
      const { signOut } = useAuth()
      
      return (
        <button 
          data-testid="legacy-signout-btn" 
          onClick={() => signOut()}
        >
          Legacy Sign Out
        </button>
      )
    }

    render(
      <SupabaseAuthProvider>
        <LegacyTestComponent />
      </SupabaseAuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('legacy-signout-btn')).toBeInTheDocument()
    })

    const signoutBtn = screen.getByTestId('legacy-signout-btn')
    
    await act(async () => {
      signoutBtn.click()
    })

    expect(mockSignoutService.signOut).toHaveBeenCalledWith({
      showLoading: true,
      forceRedirect: false
    })
  })
})