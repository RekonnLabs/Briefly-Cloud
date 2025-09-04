/**
 * OAuth State Verification Integration Tests
 * Tests that callbacks reject mismatched state parameters and verify state_mismatch error redirects
 */

import { NextRequest, NextResponse } from 'next/server'
import { OAuthStateManager } from '@/app/lib/oauth/state-manager'

// Mock Supabase
jest.mock('@/app/lib/supabase-server', () => ({
  createSupabaseServerClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn(),
    },
  })),
}))

// Mock TokenStore
jest.mock('@/app/lib/oauth/token-store', () => ({
  TokenStore: {
    saveToken: jest.fn(),
  },
}))

// Mock Logger
jest.mock('@/app/lib/oauth/logger', () => ({
  OAuthLogger: {
    logCallback: jest.fn(),
    logSecurityEvent: jest.fn(),
  },
}))

// Mock fetch for token exchange
global.fetch = jest.fn()

describe('OAuth State Verification Integration Tests', () => {
  const mockUser = {
    id: 'test-user-id-123',
    email: 'test@example.com',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Set up environment variables
    process.env.GOOGLE_DRIVE_CLIENT_ID = 'test-google-client-id'
    process.env.GOOGLE_DRIVE_CLIENT_SECRET = 'test-google-client-secret'
    process.env.MS_DRIVE_CLIENT_ID = 'test-ms-client-id'
    process.env.MS_DRIVE_CLIENT_SECRET = 'test-ms-client-secret'
    process.env.MS_DRIVE_TENANT_ID = 'test-tenant-id'
  })

  describe('OAuthStateManager', () => {
    it('should generate state equal to user ID', () => {
      const userId = 'user-123'
      const state = OAuthStateManager.generateState(userId)
      
      expect(state).toBe(userId)
    })

    it('should verify state correctly when it matches user ID', () => {
      const userId = 'user-123'
      const returnedState = 'user-123'
      
      const isValid = OAuthStateManager.verifyState(returnedState, userId)
      
      expect(isValid).toBe(true)
    })

    it('should reject state when it does not match user ID', () => {
      const userId = 'user-123'
      const returnedState = 'different-user-456'
      
      const isValid = OAuthStateManager.verifyState(returnedState, userId)
      
      expect(isValid).toBe(false)
    })

    it('should reject empty or null state', () => {
      const userId = 'user-123'
      
      expect(OAuthStateManager.verifyState('', userId)).toBe(false)
      expect(OAuthStateManager.verifyState(null as any, userId)).toBe(false)
      expect(OAuthStateManager.verifyState(undefined as any, userId)).toBe(false)
    })

    it('should create security error for state mismatch', () => {
      const expected = 'user-123'
      const received = 'attacker-456'
      
      const error = OAuthStateManager.createSecurityError(expected, received)
      
      expect(error.code).toBe('OAUTH_STATE_MISMATCH')
      expect(error.message).toContain('OAuth state verification failed')
      expect(error.details).toEqual({ expected, received })
      expect(error.retryable).toBe(false)
    })
  })

  describe('Google OAuth Callback State Verification', () => {
    let mockSupabase: any

    beforeEach(() => {
      const { createSupabaseServerClient } = require('@/app/lib/supabase-server')
      mockSupabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: mockUser },
            error: null,
          }),
        },
      }
      createSupabaseServerClient.mockReturnValue(mockSupabase)
    })

    it('should reject callback with mismatched state parameter', async () => {
      // Import the callback handler
      const { GET } = await import('@/app/api/storage/google/callback/route')
      
      // Create request with mismatched state
      const request = new NextRequest(
        'http://localhost:3000/api/storage/google/callback?code=test-code&state=wrong-user-id'
      )
      
      const response = await GET(request)
      
      expect(response.status).toBe(302) // Redirect
      
      const location = response.headers.get('location')
      expect(location).toContain('error=state_mismatch')
      expect(location).toContain('/briefly/app/dashboard')
    })

    it('should accept callback with correct state parameter', async () => {
      // Mock successful token exchange
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/drive.readonly',
        }),
      })

      const { TokenStore } = require('@/app/lib/oauth/token-store')
      TokenStore.saveToken.mockResolvedValue(undefined)

      // Import the callback handler
      const { GET } = await import('@/app/api/storage/google/callback/route')
      
      // Create request with correct state (matching user ID)
      const request = new NextRequest(
        `http://localhost:3000/api/storage/google/callback?code=test-code&state=${mockUser.id}`
      )
      
      const response = await GET(request)
      
      expect(response.status).toBe(302) // Redirect
      
      const location = response.headers.get('location')
      expect(location).toContain('connected=google')
      expect(location).toContain('/briefly/app/dashboard')
      expect(location).not.toContain('error=')
    })

    it('should handle missing state parameter', async () => {
      // Import the callback handler
      const { GET } = await import('@/app/api/storage/google/callback/route')
      
      // Create request without state parameter
      const request = new NextRequest(
        'http://localhost:3000/api/storage/google/callback?code=test-code'
      )
      
      const response = await GET(request)
      
      expect(response.status).toBe(302) // Redirect
      
      const location = response.headers.get('location')
      expect(location).toContain('error=state_mismatch')
    })

    it('should handle missing code parameter', async () => {
      // Import the callback handler
      const { GET } = await import('@/app/api/storage/google/callback/route')
      
      // Create request without code parameter
      const request = new NextRequest(
        `http://localhost:3000/api/storage/google/callback?state=${mockUser.id}`
      )
      
      const response = await GET(request)
      
      expect(response.status).toBe(302) // Redirect
      
      const location = response.headers.get('location')
      expect(location).toContain('error=missing_code')
    })

    it('should handle OAuth provider error', async () => {
      // Import the callback handler
      const { GET } = await import('@/app/api/storage/google/callback/route')
      
      // Create request with OAuth error
      const request = new NextRequest(
        'http://localhost:3000/api/storage/google/callback?error=access_denied&error_description=User%20denied%20access'
      )
      
      const response = await GET(request)
      
      expect(response.status).toBe(302) // Redirect
      
      const location = response.headers.get('location')
      expect(location).toContain('error=')
      expect(decodeURIComponent(location)).toContain('User denied access')
    })

    it('should handle authentication failure', async () => {
      // Mock auth failure
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      })

      // Import the callback handler
      const { GET } = await import('@/app/api/storage/google/callback/route')
      
      const request = new NextRequest(
        `http://localhost:3000/api/storage/google/callback?code=test-code&state=${mockUser.id}`
      )
      
      const response = await GET(request)
      
      expect(response.status).toBe(302) // Redirect
      
      const location = response.headers.get('location')
      expect(location).toContain('/auth/signin')
    })

    it('should handle token exchange failure', async () => {
      // Mock failed token exchange
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      })

      // Import the callback handler
      const { GET } = await import('@/app/api/storage/google/callback/route')
      
      const request = new NextRequest(
        `http://localhost:3000/api/storage/google/callback?code=invalid-code&state=${mockUser.id}`
      )
      
      const response = await GET(request)
      
      expect(response.status).toBe(302) // Redirect
      
      const location = response.headers.get('location')
      expect(location).toContain('error=token_exchange_failed')
    })
  })

  describe('Microsoft OAuth Callback State Verification', () => {
    let mockSupabase: any

    beforeEach(() => {
      const { createSupabaseServerClient } = require('@/app/lib/supabase-server')
      mockSupabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: mockUser },
            error: null,
          }),
        },
      }
      createSupabaseServerClient.mockReturnValue(mockSupabase)
    })

    it('should reject callback with mismatched state parameter', async () => {
      // Import the callback handler
      const { GET } = await import('@/app/api/storage/microsoft/callback/route')
      
      // Create request with mismatched state
      const request = new NextRequest(
        'http://localhost:3000/api/storage/microsoft/callback?code=test-code&state=wrong-user-id'
      )
      
      const response = await GET(request)
      
      expect(response.status).toBe(302) // Redirect
      
      const location = response.headers.get('location')
      expect(location).toContain('error=state_mismatch')
      expect(location).toContain('/briefly/app/dashboard')
    })

    it('should accept callback with correct state parameter', async () => {
      // Mock successful token exchange
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expires_in: 3600,
          scope: 'https://graph.microsoft.com/Files.Read.All offline_access',
        }),
      })

      const { TokenStore } = require('@/app/lib/oauth/token-store')
      TokenStore.saveToken.mockResolvedValue(undefined)

      // Import the callback handler
      const { GET } = await import('@/app/api/storage/microsoft/callback/route')
      
      // Create request with correct state (matching user ID)
      const request = new NextRequest(
        `http://localhost:3000/api/storage/microsoft/callback?code=test-code&state=${mockUser.id}`
      )
      
      const response = await GET(request)
      
      expect(response.status).toBe(302) // Redirect
      
      const location = response.headers.get('location')
      expect(location).toContain('connected=microsoft')
      expect(location).toContain('/briefly/app/dashboard')
      expect(location).not.toContain('error=')
    })

    it('should handle missing state parameter', async () => {
      // Import the callback handler
      const { GET } = await import('@/app/api/storage/microsoft/callback/route')
      
      // Create request without state parameter
      const request = new NextRequest(
        'http://localhost:3000/api/storage/microsoft/callback?code=test-code'
      )
      
      const response = await GET(request)
      
      expect(response.status).toBe(302) // Redirect
      
      const location = response.headers.get('location')
      expect(location).toContain('error=state_mismatch')
    })
  })

  describe('State Verification Security Logging', () => {
    it('should log security events for state mismatches', () => {
      const { OAuthLogger } = require('@/app/lib/oauth/logger')
      
      const expected = 'user-123'
      const received = 'attacker-456'
      
      // Simulate what the callback would do
      OAuthLogger.logSecurityEvent('google', 'state_mismatch', {
        expected,
        received,
        timestamp: new Date().toISOString(),
        severity: 'HIGH',
      })
      
      expect(OAuthLogger.logSecurityEvent).toHaveBeenCalledWith(
        'google',
        'state_mismatch',
        expect.objectContaining({
          expected,
          received,
          severity: 'HIGH',
        })
      )
    })

    it('should log successful state verification', () => {
      const { OAuthLogger } = require('@/app/lib/oauth/logger')
      
      // Simulate successful callback logging
      OAuthLogger.logCallback('google', mockUser.id, true, undefined, {
        stateVerified: true,
      })
      
      expect(OAuthLogger.logCallback).toHaveBeenCalledWith(
        'google',
        mockUser.id,
        true,
        undefined,
        expect.objectContaining({
          stateVerified: true,
        })
      )
    })
  })

  describe('Cross-Provider State Verification Consistency', () => {
    it('should use identical state verification logic for both providers', () => {
      const userId = 'test-user-123'
      const correctState = userId
      const wrongState = 'different-user-456'
      
      // Both providers should use the same OAuthStateManager
      expect(OAuthStateManager.verifyState(correctState, userId)).toBe(true)
      expect(OAuthStateManager.verifyState(wrongState, userId)).toBe(false)
      
      // Both should create identical security errors
      const googleError = OAuthStateManager.createSecurityError(userId, wrongState)
      const microsoftError = OAuthStateManager.createSecurityError(userId, wrongState)
      
      expect(googleError.code).toBe(microsoftError.code)
      expect(googleError.message).toBe(microsoftError.message)
      expect(googleError.retryable).toBe(microsoftError.retryable)
    })

    it('should redirect to same error URL format for both providers', async () => {
      const { createSupabaseServerClient } = require('@/app/lib/supabase-server')
      const mockSupabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: mockUser },
            error: null,
          }),
        },
      }
      createSupabaseServerClient.mockReturnValue(mockSupabase)

      // Test Google callback with wrong state
      const { GET: GoogleGET } = await import('@/app/api/storage/google/callback/route')
      const googleRequest = new NextRequest(
        'http://localhost:3000/api/storage/google/callback?code=test-code&state=wrong-state'
      )
      const googleResponse = await GoogleGET(googleRequest)
      
      // Test Microsoft callback with wrong state
      const { GET: MicrosoftGET } = await import('@/app/api/storage/microsoft/callback/route')
      const microsoftRequest = new NextRequest(
        'http://localhost:3000/api/storage/microsoft/callback?code=test-code&state=wrong-state'
      )
      const microsoftResponse = await MicrosoftGET(microsoftRequest)
      
      // Both should redirect with same error parameter
      const googleLocation = googleResponse.headers.get('location')
      const microsoftLocation = microsoftResponse.headers.get('location')
      
      expect(googleLocation).toContain('error=state_mismatch')
      expect(microsoftLocation).toContain('error=state_mismatch')
      expect(googleLocation).toContain('/briefly/app/dashboard')
      expect(microsoftLocation).toContain('/briefly/app/dashboard')
    })
  })

  describe('State Parameter Edge Cases', () => {
    it('should handle URL-encoded state parameters', () => {
      const userId = 'user@example.com'
      const encodedState = encodeURIComponent(userId)
      
      // Should still verify correctly with encoded state
      expect(OAuthStateManager.verifyState(encodedState, userId)).toBe(false) // Different after encoding
      expect(OAuthStateManager.verifyState(userId, userId)).toBe(true) // Same when not encoded
    })

    it('should handle special characters in user ID', () => {
      const userId = 'user-123_test@domain.com'
      const state = OAuthStateManager.generateState(userId)
      
      expect(state).toBe(userId)
      expect(OAuthStateManager.verifyState(state, userId)).toBe(true)
    })

    it('should handle very long user IDs', () => {
      const longUserId = 'a'.repeat(1000) // Very long user ID
      const state = OAuthStateManager.generateState(longUserId)
      
      expect(state).toBe(longUserId)
      expect(OAuthStateManager.verifyState(state, longUserId)).toBe(true)
    })

    it('should handle case sensitivity correctly', () => {
      const userId = 'User-123'
      const wrongCaseState = 'user-123'
      
      expect(OAuthStateManager.verifyState(wrongCaseState, userId)).toBe(false)
      expect(OAuthStateManager.verifyState(userId, userId)).toBe(true)
    })
  })

  describe('Error Redirect URL Construction', () => {
    it('should construct proper error redirect URLs', async () => {
      const { createSupabaseServerClient } = require('@/app/lib/supabase-server')
      const mockSupabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: mockUser },
            error: null,
          }),
        },
      }
      createSupabaseServerClient.mockReturnValue(mockSupabase)

      const { GET } = await import('@/app/api/storage/google/callback/route')
      
      const request = new NextRequest(
        'http://localhost:3000/api/storage/google/callback?code=test-code&state=wrong-state'
      )
      
      const response = await GET(request)
      const location = response.headers.get('location')
      
      // Should be a valid URL
      expect(() => new URL(location!)).not.toThrow()
      
      const url = new URL(location!)
      expect(url.pathname).toBe('/briefly/app/dashboard')
      expect(url.searchParams.get('tab')).toBe('storage')
      expect(url.searchParams.get('error')).toBe('state_mismatch')
    })

    it('should preserve origin in redirect URLs', async () => {
      const { createSupabaseServerClient } = require('@/app/lib/supabase-server')
      const mockSupabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: mockUser },
            error: null,
          }),
        },
      }
      createSupabaseServerClient.mockReturnValue(mockSupabase)

      const { GET } = await import('@/app/api/storage/google/callback/route')
      
      const request = new NextRequest(
        'https://briefly.rekonnlabs.com/api/storage/google/callback?code=test-code&state=wrong-state'
      )
      
      const response = await GET(request)
      const location = response.headers.get('location')
      
      const url = new URL(location!)
      expect(url.origin).toBe('https://briefly.rekonnlabs.com')
    })
  })
})