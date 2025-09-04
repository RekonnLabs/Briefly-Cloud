/**
 * OAuth Flow End-to-End Integration Tests
 * Tests complete OAuth flow from start to callback with state verification,
 * token storage, and error handling for various failure scenarios
 */

import { NextRequest } from 'next/server'

// Mock Supabase
jest.mock('@/app/lib/supabase-server', () => ({
  createSupabaseServerClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn(),
    },
  })),
}))

// Mock API middleware
jest.mock('@/app/lib/api-middleware', () => ({
  createProtectedApiHandler: (handler: Function) => handler,
}))

// Mock TokenStore
jest.mock('@/app/lib/oauth/token-store', () => ({
  TokenStore: {
    saveToken: jest.fn(),
  },
}))

// Mock OAuth utilities
jest.mock('@/app/lib/oauth/state-manager', () => ({
  OAuthStateManager: {
    generateState: jest.fn((userId: string) => userId),
    verifyState: jest.fn((returned: string, expected: string) => returned === expected),
    logStateGeneration: jest.fn(),
    createSecurityError: jest.fn((expected: string, received: string) => ({
      code: 'OAUTH_STATE_MISMATCH',
      message: 'OAuth state verification failed',
      details: { expected, received },
      retryable: false,
    })),
  },
}))

jest.mock('@/app/lib/oauth/logger', () => ({
  OAuthLogger: {
    logStart: jest.fn(),
    logCallback: jest.fn(),
    logSecurityEvent: jest.fn(),
    logError: jest.fn(),
  },
}))

jest.mock('@/app/lib/oauth/error-codes', () => ({
  OAuthErrorCodes: {
    UNEXPECTED_ERROR: 'UNEXPECTED_ERROR',
  },
  OAuthErrorHandler: {
    getMessage: jest.fn((code: string) => `Error: ${code}`),
  },
}))

jest.mock('@/app/lib/oauth/security-config', () => ({
  getOAuthScopes: jest.fn((provider: string) => {
    if (provider === 'google') {
      return 'openid email profile https://www.googleapis.com/auth/drive.readonly'
    }
    return 'offline_access Files.Read User.Read openid profile email'
  }),
  getOAuthSettings: jest.fn((provider: string) => {
    if (provider === 'google') {
      return {
        response_type: 'code',
        access_type: 'offline',
        include_granted_scopes: 'true',
        prompt: 'consent',
      }
    }
    return {
      response_type: 'code',
      prompt: 'consent',
    }
  }),
}))

jest.mock('@/app/lib/oauth/redirect-validation', () => ({
  constructRedirectUri: jest.fn((origin: string, provider: string, path: string) => {
    return `${origin}${path}`
  }),
}))

// Mock fetch for token exchange
global.fetch = jest.fn()

describe('OAuth Flow End-to-End Integration Tests', () => {
  const mockUser = {
    id: 'test-user-id-123',
    email: 'test@example.com',
  }

  const mockContext = {
    user: mockUser,
    correlationId: 'test-correlation-id',
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

  describe('Complete Google OAuth Flow', () => {
    it('should complete full OAuth flow from start to successful callback', async () => {
      // Step 1: Start OAuth flow
      const { GET: StartGET } = await import('@/app/api/storage/google/start/route')
      
      const startRequest = new NextRequest('http://localhost:3000/api/storage/google/start')
      const startResponse = await StartGET(startRequest, mockContext)
      
      expect(startResponse.status).toBe(200)
      expect(startResponse.headers.get('X-Correlation-ID')).toBeDefined()
      
      // Step 2: Simulate successful callback
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
      
      const { GET: CallbackGET } = await import('@/app/api/storage/google/callback/route')
      
      const callbackRequest = new NextRequest(
        `http://localhost:3000/api/storage/google/callback?code=test-code&state=${mockUser.id}`
      )
      
      const callbackResponse = await CallbackGET(callbackRequest)
      
      expect(callbackResponse.status).toBe(302)
      
      const location = callbackResponse.headers.get('location')
      expect(location).toContain('connected=google')
      expect(location).toContain('/briefly/app/dashboard')
      
      // Verify token was saved
      expect(TokenStore.saveToken).toHaveBeenCalledWith(
        mockUser.id,
        'google_drive',
        expect.objectContaining({
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          scope: 'https://www.googleapis.com/auth/drive.readonly',
        })
      )
    })

    it('should handle complete flow with state verification', async () => {
      const { OAuthStateManager } = require('@/app/lib/oauth/state-manager')
      const { OAuthLogger } = require('@/app/lib/oauth/logger')
      
      // Step 1: Start OAuth - verify state generation
      const { GET: StartGET } = await import('@/app/api/storage/google/start/route')
      
      const startRequest = new NextRequest('http://localhost:3000/api/storage/google/start')
      await StartGET(startRequest, mockContext)
      
      expect(OAuthStateManager.generateState).toHaveBeenCalledWith(mockUser.id)
      expect(OAuthLogger.logStart).toHaveBeenCalledWith(
        'google',
        mockUser.id,
        expect.any(String),
        expect.any(Object)
      )
      
      // Step 2: Callback with state verification
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
      
      const { GET: CallbackGET } = await import('@/app/api/storage/google/callback/route')
      
      const callbackRequest = new NextRequest(
        `http://localhost:3000/api/storage/google/callback?code=test-code&state=${mockUser.id}`
      )
      
      await CallbackGET(callbackRequest)
      
      // Verify state was checked
      expect(OAuthStateManager.verifyState).toHaveBeenCalledWith(mockUser.id, mockUser.id)
      
      // Verify successful callback was logged
      expect(OAuthLogger.logCallback).toHaveBeenCalledWith(
        'google',
        mockUser.id,
        true,
        undefined,
        expect.any(Object)
      )
    })
  })

  describe('Complete Microsoft OAuth Flow', () => {
    it('should complete full OAuth flow from start to successful callback', async () => {
      // Step 1: Start OAuth flow
      const { GET: StartGET } = await import('@/app/api/storage/microsoft/start/route')
      
      const startRequest = new NextRequest('http://localhost:3000/api/storage/microsoft/start')
      const startResponse = await StartGET(startRequest, mockContext)
      
      expect(startResponse.status).toBe(200)
      expect(startResponse.headers.get('X-Correlation-ID')).toBeDefined()
      
      // Step 2: Simulate successful callback
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
      
      // Mock successful token exchange
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test-ms-access-token',
          refresh_token: 'test-ms-refresh-token',
          expires_in: 3600,
          scope: 'https://graph.microsoft.com/Files.Read.All offline_access',
        }),
      })
      
      const { TokenStore } = require('@/app/lib/oauth/token-store')
      TokenStore.saveToken.mockResolvedValue(undefined)
      
      const { GET: CallbackGET } = await import('@/app/api/storage/microsoft/callback/route')
      
      const callbackRequest = new NextRequest(
        `http://localhost:3000/api/storage/microsoft/callback?code=test-code&state=${mockUser.id}`
      )
      
      const callbackResponse = await CallbackGET(callbackRequest)
      
      expect(callbackResponse.status).toBe(302)
      
      const location = callbackResponse.headers.get('location')
      expect(location).toContain('connected=microsoft')
      expect(location).toContain('/briefly/app/dashboard')
      
      // Verify token was saved
      expect(TokenStore.saveToken).toHaveBeenCalledWith(
        mockUser.id,
        'microsoft',
        expect.objectContaining({
          accessToken: 'test-ms-access-token',
          refreshToken: 'test-ms-refresh-token',
          scope: 'https://graph.microsoft.com/Files.Read.All offline_access',
        })
      )
    })
  })

  describe('OAuth Flow Error Scenarios', () => {
    it('should handle state mismatch in complete flow', async () => {
      const { OAuthStateManager } = require('@/app/lib/oauth/state-manager')
      const { OAuthLogger } = require('@/app/lib/oauth/logger')
      
      // Mock state verification to fail
      OAuthStateManager.verifyState.mockReturnValue(false)
      
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
      
      const { GET: CallbackGET } = await import('@/app/api/storage/google/callback/route')
      
      const callbackRequest = new NextRequest(
        'http://localhost:3000/api/storage/google/callback?code=test-code&state=wrong-state'
      )
      
      const callbackResponse = await CallbackGET(callbackRequest)
      
      expect(callbackResponse.status).toBe(302)
      
      const location = callbackResponse.headers.get('location')
      expect(location).toContain('error=state_mismatch')
      
      // Verify security event was logged
      expect(OAuthLogger.logSecurityEvent).toHaveBeenCalledWith(
        'google',
        'state_mismatch',
        expect.objectContaining({
          expected: mockUser.id,
          received: 'wrong-state',
        })
      )
    })

    it('should handle token exchange failure in complete flow', async () => {
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
      
      // Mock failed token exchange
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      })
      
      const { GET: CallbackGET } = await import('@/app/api/storage/google/callback/route')
      
      const callbackRequest = new NextRequest(
        `http://localhost:3000/api/storage/google/callback?code=invalid-code&state=${mockUser.id}`
      )
      
      const callbackResponse = await CallbackGET(callbackRequest)
      
      expect(callbackResponse.status).toBe(302)
      
      const location = callbackResponse.headers.get('location')
      expect(location).toContain('error=token_exchange_failed')
    })

    it('should handle token storage failure in complete flow', async () => {
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
      
      // Mock token storage failure
      const { TokenStore } = require('@/app/lib/oauth/token-store')
      TokenStore.saveToken.mockRejectedValue(new Error('Database error'))
      
      const { GET: CallbackGET } = await import('@/app/api/storage/google/callback/route')
      
      const callbackRequest = new NextRequest(
        `http://localhost:3000/api/storage/google/callback?code=test-code&state=${mockUser.id}`
      )
      
      const callbackResponse = await CallbackGET(callbackRequest)
      
      expect(callbackResponse.status).toBe(302)
      
      const location = callbackResponse.headers.get('location')
      expect(location).toContain('error=')
    })

    it('should handle authentication failure in callback', async () => {
      const { createSupabaseServerClient } = require('@/app/lib/supabase-server')
      const mockSupabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'Invalid token' },
          }),
        },
      }
      createSupabaseServerClient.mockReturnValue(mockSupabase)
      
      const { GET: CallbackGET } = await import('@/app/api/storage/google/callback/route')
      
      const callbackRequest = new NextRequest(
        `http://localhost:3000/api/storage/google/callback?code=test-code&state=${mockUser.id}`
      )
      
      const callbackResponse = await CallbackGET(callbackRequest)
      
      expect(callbackResponse.status).toBe(302)
      
      const location = callbackResponse.headers.get('location')
      expect(location).toContain('/auth/signin')
    })

    it('should handle OAuth provider errors', async () => {
      const { GET: CallbackGET } = await import('@/app/api/storage/google/callback/route')
      
      const callbackRequest = new NextRequest(
        'http://localhost:3000/api/storage/google/callback?error=access_denied&error_description=User%20denied%20access'
      )
      
      const callbackResponse = await CallbackGET(callbackRequest)
      
      expect(callbackResponse.status).toBe(302)
      
      const location = callbackResponse.headers.get('location')
      expect(location).toContain('error=')
      expect(decodeURIComponent(location)).toContain('User denied access')
    })
  })

  describe('Cross-Provider Flow Consistency', () => {
    it('should have consistent flow behavior between Google and Microsoft', async () => {
      // Test both providers with same user context
      const { GET: GoogleStartGET } = await import('@/app/api/storage/google/start/route')
      const { GET: MicrosoftStartGET } = await import('@/app/api/storage/microsoft/start/route')
      
      const googleStartRequest = new NextRequest('http://localhost:3000/api/storage/google/start')
      const microsoftStartRequest = new NextRequest('http://localhost:3000/api/storage/microsoft/start')
      
      const googleStartResponse = await GoogleStartGET(googleStartRequest, mockContext)
      const microsoftStartResponse = await MicrosoftStartGET(microsoftStartRequest, mockContext)
      
      // Both should return 200 with correlation IDs
      expect(googleStartResponse.status).toBe(200)
      expect(microsoftStartResponse.status).toBe(200)
      expect(googleStartResponse.headers.get('X-Correlation-ID')).toBeDefined()
      expect(microsoftStartResponse.headers.get('X-Correlation-ID')).toBeDefined()
      
      // Both should have cache prevention headers
      expect(googleStartResponse.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate')
      expect(microsoftStartResponse.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate')
    })

    it('should handle errors consistently across providers', async () => {
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
      
      const { OAuthStateManager } = require('@/app/lib/oauth/state-manager')
      OAuthStateManager.verifyState.mockReturnValue(false)
      
      const { GET: GoogleCallbackGET } = await import('@/app/api/storage/google/callback/route')
      const { GET: MicrosoftCallbackGET } = await import('@/app/api/storage/microsoft/callback/route')
      
      const googleRequest = new NextRequest(
        'http://localhost:3000/api/storage/google/callback?code=test-code&state=wrong-state'
      )
      const microsoftRequest = new NextRequest(
        'http://localhost:3000/api/storage/microsoft/callback?code=test-code&state=wrong-state'
      )
      
      const googleResponse = await GoogleCallbackGET(googleRequest)
      const microsoftResponse = await MicrosoftCallbackGET(microsoftRequest)
      
      // Both should redirect with same error
      expect(googleResponse.status).toBe(302)
      expect(microsoftResponse.status).toBe(302)
      
      const googleLocation = googleResponse.headers.get('location')
      const microsoftLocation = microsoftResponse.headers.get('location')
      
      expect(googleLocation).toContain('error=state_mismatch')
      expect(microsoftLocation).toContain('error=state_mismatch')
    })
  })

  describe('OAuth Flow Performance and Reliability', () => {
    it('should complete OAuth flow within reasonable time limits', async () => {
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
      
      // Mock fast token exchange
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
      
      const { GET: CallbackGET } = await import('@/app/api/storage/google/callback/route')
      
      const startTime = Date.now()
      
      const callbackRequest = new NextRequest(
        `http://localhost:3000/api/storage/google/callback?code=test-code&state=${mockUser.id}`
      )
      
      const callbackResponse = await CallbackGET(callbackRequest)
      
      const endTime = Date.now()
      const responseTime = endTime - startTime
      
      expect(callbackResponse.status).toBe(302)
      expect(responseTime).toBeLessThan(5000) // Should complete within 5 seconds
    })

    it('should handle concurrent OAuth flows correctly', async () => {
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
      
      const { GET: CallbackGET } = await import('@/app/api/storage/google/callback/route')
      
      // Simulate concurrent requests
      const requests = Array.from({ length: 3 }, (_, i) => 
        new NextRequest(
          `http://localhost:3000/api/storage/google/callback?code=test-code-${i}&state=${mockUser.id}`
        )
      )
      
      const responses = await Promise.all(
        requests.map(request => CallbackGET(request))
      )
      
      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(302)
        expect(response.headers.get('location')).toContain('connected=google')
      })
    })
  })

  describe('OAuth Flow Logging and Observability', () => {
    it('should log complete OAuth flow events', async () => {
      const { OAuthLogger } = require('@/app/lib/oauth/logger')
      
      // Step 1: Start flow
      const { GET: StartGET } = await import('@/app/api/storage/google/start/route')
      
      const startRequest = new NextRequest('http://localhost:3000/api/storage/google/start')
      await StartGET(startRequest, mockContext)
      
      expect(OAuthLogger.logStart).toHaveBeenCalledWith(
        'google',
        mockUser.id,
        expect.any(String),
        expect.objectContaining({
          origin: 'http://localhost:3000',
        })
      )
      
      // Step 2: Complete callback
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
      
      const { GET: CallbackGET } = await import('@/app/api/storage/google/callback/route')
      
      const callbackRequest = new NextRequest(
        `http://localhost:3000/api/storage/google/callback?code=test-code&state=${mockUser.id}`
      )
      
      await CallbackGET(callbackRequest)
      
      expect(OAuthLogger.logCallback).toHaveBeenCalledWith(
        'google',
        mockUser.id,
        true,
        undefined,
        expect.any(Object)
      )
    })

    it('should provide correlation IDs for end-to-end tracing', async () => {
      const { GET: StartGET } = await import('@/app/api/storage/google/start/route')
      
      const startRequest = new NextRequest('http://localhost:3000/api/storage/google/start')
      const startResponse = await StartGET(startRequest, mockContext)
      
      const correlationId = startResponse.headers.get('X-Correlation-ID')
      expect(correlationId).toBeDefined()
      expect(correlationId).toMatch(/^req_\d+_[a-z0-9]+$/)
      
      // Correlation ID should be unique per request
      const startResponse2 = await StartGET(startRequest, mockContext)
      const correlationId2 = startResponse2.headers.get('X-Correlation-ID')
      
      expect(correlationId).not.toBe(correlationId2)
    })
  })
})