/**
 * OAuth Token Management Integration Tests
 * Tests the TokenStore class and RPC-based token operations
 */

import { TokenStore, type OAuthTokenData } from '@/app/lib/oauth/token-store'

// Mock dependencies
jest.mock('@/app/lib/supabase-admin', () => ({
  supabaseAdmin: {
    rpc: jest.fn(),
  },
}))

jest.mock('@/app/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/app/lib/api-errors', () => ({
  createError: {
    internal: jest.fn((message: string) => new Error(message)),
  },
}))

// Mock fetch for token refresh tests
global.fetch = jest.fn()

describe('OAuth Token Management Integration Tests', () => {
  const mockUserId = 'test-user-id'
  const mockTokenData: OAuthTokenData = {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
    scope: 'https://www.googleapis.com/auth/drive.readonly'
  }

  beforeEach(() => {
    jest.clearAllMocks()
    // Reset environment variables
    process.env.GOOGLE_DRIVE_CLIENT_ID = 'test-google-client-id'
    process.env.GOOGLE_DRIVE_CLIENT_SECRET = 'test-google-client-secret'
    process.env.MS_DRIVE_CLIENT_ID = 'test-ms-client-id'
    process.env.MS_DRIVE_CLIENT_SECRET = 'test-ms-client-secret'
    process.env.MS_DRIVE_TENANT_ID = 'test-tenant-id'
  })

  describe('TokenStore.saveToken', () => {
    it('should save token via RPC successfully', async () => {
      const { supabaseAdmin } = require('@/app/lib/supabase-admin')
      supabaseAdmin.rpc.mockResolvedValue({ error: null })

      await TokenStore.saveToken(mockUserId, 'google_drive', mockTokenData)

      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('save_oauth_token', {
        p_user_id: mockUserId,
        p_provider: 'google_drive',
        p_access_token: mockTokenData.accessToken,
        p_refresh_token: mockTokenData.refreshToken,
        p_expires_at: mockTokenData.expiresAt,
        p_scope: mockTokenData.scope
      })
    })

    it('should handle RPC errors when saving token', async () => {
      const { supabaseAdmin } = require('@/app/lib/supabase-admin')
      const { logger } = require('@/app/lib/logger')
      
      supabaseAdmin.rpc.mockResolvedValue({ 
        error: { message: 'RPC function not found' } 
      })

      await expect(
        TokenStore.saveToken(mockUserId, 'google_drive', mockTokenData)
      ).rejects.toThrow('Failed to save OAuth token: RPC function not found')

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to save OAuth token via RPC',
        expect.objectContaining({
          userId: mockUserId,
          provider: 'google_drive',
          error: 'RPC function not found'
        })
      )
    })

    it('should save Microsoft token correctly', async () => {
      const { supabaseAdmin } = require('@/app/lib/supabase-admin')
      supabaseAdmin.rpc.mockResolvedValue({ error: null })

      const msTokenData: OAuthTokenData = {
        accessToken: 'ms-access-token',
        refreshToken: 'ms-refresh-token',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        scope: 'https://graph.microsoft.com/Files.Read.All offline_access'
      }

      await TokenStore.saveToken(mockUserId, 'microsoft', msTokenData)

      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('save_oauth_token', {
        p_user_id: mockUserId,
        p_provider: 'microsoft',
        p_access_token: msTokenData.accessToken,
        p_refresh_token: msTokenData.refreshToken,
        p_expires_at: msTokenData.expiresAt,
        p_scope: msTokenData.scope
      })
    })

    it('should handle null refresh token', async () => {
      const { supabaseAdmin } = require('@/app/lib/supabase-admin')
      supabaseAdmin.rpc.mockResolvedValue({ error: null })

      const tokenWithoutRefresh: OAuthTokenData = {
        accessToken: 'access-token-only',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        scope: 'read-only'
      }

      await TokenStore.saveToken(mockUserId, 'google_drive', tokenWithoutRefresh)

      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('save_oauth_token', {
        p_user_id: mockUserId,
        p_provider: 'google_drive',
        p_access_token: tokenWithoutRefresh.accessToken,
        p_refresh_token: null,
        p_expires_at: tokenWithoutRefresh.expiresAt,
        p_scope: tokenWithoutRefresh.scope
      })
    })
  })

  describe('TokenStore.getToken', () => {
    it('should retrieve token via RPC successfully', async () => {
      const { supabaseAdmin } = require('@/app/lib/supabase-admin')
      const mockRpcResponse = {
        access_token: mockTokenData.accessToken,
        refresh_token: mockTokenData.refreshToken,
        expires_at: mockTokenData.expiresAt,
        scope: mockTokenData.scope
      }
      
      supabaseAdmin.rpc.mockResolvedValue({ 
        data: [mockRpcResponse], 
        error: null 
      })

      const result = await TokenStore.getToken(mockUserId, 'google_drive')

      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('get_oauth_token', {
        p_user_id: mockUserId,
        p_provider: 'google_drive'
      })

      expect(result).toEqual({
        accessToken: mockTokenData.accessToken,
        refreshToken: mockTokenData.refreshToken,
        expiresAt: mockTokenData.expiresAt,
        scope: mockTokenData.scope
      })
    })

    it('should return null when no token exists', async () => {
      const { supabaseAdmin } = require('@/app/lib/supabase-admin')
      supabaseAdmin.rpc.mockResolvedValue({ data: [], error: null })

      const result = await TokenStore.getToken(mockUserId, 'google_drive')

      expect(result).toBeNull()
    })

    it('should handle RPC errors when getting token', async () => {
      const { supabaseAdmin } = require('@/app/lib/supabase-admin')
      const { logger } = require('@/app/lib/logger')
      
      supabaseAdmin.rpc.mockResolvedValue({ 
        data: null, 
        error: { message: 'Permission denied' } 
      })

      const result = await TokenStore.getToken(mockUserId, 'google_drive')

      expect(result).toBeNull()
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to get OAuth token via RPC',
        expect.objectContaining({
          userId: mockUserId,
          provider: 'google_drive',
          error: 'Permission denied'
        })
      )
    })

    it('should handle single object response (not array)', async () => {
      const { supabaseAdmin } = require('@/app/lib/supabase-admin')
      const mockRpcResponse = {
        access_token: mockTokenData.accessToken,
        refresh_token: mockTokenData.refreshToken,
        expires_at: mockTokenData.expiresAt,
        scope: mockTokenData.scope
      }
      
      supabaseAdmin.rpc.mockResolvedValue({ 
        data: mockRpcResponse, // Single object, not array
        error: null 
      })

      const result = await TokenStore.getToken(mockUserId, 'google_drive')

      expect(result).toEqual({
        accessToken: mockTokenData.accessToken,
        refreshToken: mockTokenData.refreshToken,
        expiresAt: mockTokenData.expiresAt,
        scope: mockTokenData.scope
      })
    })
  })

  describe('TokenStore.deleteToken', () => {
    it('should delete token via RPC successfully', async () => {
      const { supabaseAdmin } = require('@/app/lib/supabase-admin')
      supabaseAdmin.rpc.mockResolvedValue({ error: null })

      await TokenStore.deleteToken(mockUserId, 'google_drive')

      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('delete_oauth_token', {
        p_user_id: mockUserId,
        p_provider: 'google_drive'
      })
    })

    it('should handle RPC errors when deleting token', async () => {
      const { supabaseAdmin } = require('@/app/lib/supabase-admin')
      const { logger } = require('@/app/lib/logger')
      
      supabaseAdmin.rpc.mockResolvedValue({ 
        error: { message: 'Token not found' } 
      })

      await expect(
        TokenStore.deleteToken(mockUserId, 'google_drive')
      ).rejects.toThrow('Failed to delete OAuth token: Token not found')

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to delete OAuth token via RPC',
        expect.objectContaining({
          userId: mockUserId,
          provider: 'google_drive',
          error: 'Token not found'
        })
      )
    })

    it('should delete Microsoft token correctly', async () => {
      const { supabaseAdmin } = require('@/app/lib/supabase-admin')
      supabaseAdmin.rpc.mockResolvedValue({ error: null })

      await TokenStore.deleteToken(mockUserId, 'microsoft')

      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('delete_oauth_token', {
        p_user_id: mockUserId,
        p_provider: 'microsoft'
      })
    })
  })

  describe('TokenStore.refreshTokenIfNeeded', () => {
    it('should return token if not near expiry', async () => {
      const { supabaseAdmin } = require('@/app/lib/supabase-admin')
      const futureToken = {
        ...mockTokenData,
        expiresAt: new Date(Date.now() + 3600000).toISOString() // 1 hour from now
      }
      
      supabaseAdmin.rpc.mockResolvedValue({ 
        data: [{
          access_token: futureToken.accessToken,
          refresh_token: futureToken.refreshToken,
          expires_at: futureToken.expiresAt,
          scope: futureToken.scope
        }], 
        error: null 
      })

      const result = await TokenStore.refreshTokenIfNeeded(mockUserId, 'google_drive')

      expect(result).toEqual(futureToken)
      expect(fetch).not.toHaveBeenCalled()
    })

    it('should refresh Google token when near expiry', async () => {
      const { supabaseAdmin } = require('@/app/lib/supabase-admin')
      const { logger } = require('@/app/lib/logger')
      
      const expiringSoonToken = {
        ...mockTokenData,
        expiresAt: new Date(Date.now() + 2 * 60 * 1000).toISOString() // 2 minutes from now
      }

      // Mock getting the expiring token
      supabaseAdmin.rpc
        .mockResolvedValueOnce({ 
          data: [{
            access_token: expiringSoonToken.accessToken,
            refresh_token: expiringSoonToken.refreshToken,
            expires_at: expiringSoonToken.expiresAt,
            scope: expiringSoonToken.scope
          }], 
          error: null 
        })
        // Mock saving the refreshed token
        .mockResolvedValueOnce({ error: null })

      // Mock Google token refresh API
      const mockRefreshResponse = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600
      }
      
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockRefreshResponse)
      })

      const result = await TokenStore.refreshTokenIfNeeded(mockUserId, 'google_drive')

      expect(logger.info).toHaveBeenCalledWith(
        'Token expires soon, refreshing',
        expect.objectContaining({
          userId: mockUserId,
          provider: 'google_drive'
        })
      )

      expect(fetch).toHaveBeenCalledWith('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: expect.any(URLSearchParams)
      })

      expect(result?.accessToken).toBe('new-access-token')
      expect(result?.refreshToken).toBe('new-refresh-token')
    })

    it('should refresh Microsoft token when near expiry', async () => {
      const { supabaseAdmin } = require('@/app/lib/supabase-admin')
      
      const expiringSoonToken = {
        accessToken: 'ms-access-token',
        refreshToken: 'ms-refresh-token',
        expiresAt: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
        scope: 'https://graph.microsoft.com/Files.Read.All offline_access'
      }

      // Mock getting the expiring token
      supabaseAdmin.rpc
        .mockResolvedValueOnce({ 
          data: [{
            access_token: expiringSoonToken.accessToken,
            refresh_token: expiringSoonToken.refreshToken,
            expires_at: expiringSoonToken.expiresAt,
            scope: expiringSoonToken.scope
          }], 
          error: null 
        })
        // Mock saving the refreshed token
        .mockResolvedValueOnce({ error: null })

      // Mock Microsoft token refresh API
      const mockRefreshResponse = {
        access_token: 'new-ms-access-token',
        refresh_token: 'new-ms-refresh-token',
        expires_in: 3600
      }
      
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockRefreshResponse)
      })

      const result = await TokenStore.refreshTokenIfNeeded(mockUserId, 'microsoft')

      expect(fetch).toHaveBeenCalledWith(
        'https://login.microsoftonline.com/test-tenant-id/oauth2/v2.0/token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: expect.any(URLSearchParams)
        }
      )

      expect(result?.accessToken).toBe('new-ms-access-token')
      expect(result?.refreshToken).toBe('new-ms-refresh-token')
    })

    it('should handle Google token refresh failure', async () => {
      const { supabaseAdmin } = require('@/app/lib/supabase-admin')
      const { logger } = require('@/app/lib/logger')
      
      const expiringSoonToken = {
        ...mockTokenData,
        expiresAt: new Date(Date.now() + 2 * 60 * 1000).toISOString()
      }

      supabaseAdmin.rpc.mockResolvedValue({ 
        data: [{
          access_token: expiringSoonToken.accessToken,
          refresh_token: expiringSoonToken.refreshToken,
          expires_at: expiringSoonToken.expiresAt,
          scope: expiringSoonToken.scope
        }], 
        error: null 
      })

      // Mock failed refresh
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: false,
        statusText: 'Unauthorized'
      })

      const result = await TokenStore.refreshTokenIfNeeded(mockUserId, 'google_drive')

      expect(result).toBeNull()
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to refresh Google token',
        expect.objectContaining({
          userId: mockUserId,
          error: 'Google token refresh failed: Unauthorized'
        })
      )
    })

    it('should handle missing refresh token', async () => {
      const { supabaseAdmin } = require('@/app/lib/supabase-admin')
      const { logger } = require('@/app/lib/logger')
      
      const tokenWithoutRefresh = {
        accessToken: 'access-only-token',
        expiresAt: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
        scope: 'read-only'
      }

      supabaseAdmin.rpc.mockResolvedValue({ 
        data: [{
          access_token: tokenWithoutRefresh.accessToken,
          refresh_token: null,
          expires_at: tokenWithoutRefresh.expiresAt,
          scope: tokenWithoutRefresh.scope
        }], 
        error: null 
      })

      const result = await TokenStore.refreshTokenIfNeeded(mockUserId, 'google_drive')

      expect(result).toBeNull()
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to refresh Google token',
        expect.objectContaining({
          userId: mockUserId,
          error: 'No refresh token available for Google Drive'
        })
      )
    })

    it('should return null when token does not exist', async () => {
      const { supabaseAdmin } = require('@/app/lib/supabase-admin')
      supabaseAdmin.rpc.mockResolvedValue({ data: [], error: null })

      const result = await TokenStore.refreshTokenIfNeeded(mockUserId, 'google_drive')

      expect(result).toBeNull()
      expect(fetch).not.toHaveBeenCalled()
    })

    it('should handle token without expiry date', async () => {
      const { supabaseAdmin } = require('@/app/lib/supabase-admin')
      const tokenWithoutExpiry = {
        accessToken: 'no-expiry-token',
        refreshToken: 'refresh-token',
        scope: 'read-only'
      }

      supabaseAdmin.rpc.mockResolvedValue({ 
        data: [{
          access_token: tokenWithoutExpiry.accessToken,
          refresh_token: tokenWithoutExpiry.refreshToken,
          expires_at: null,
          scope: tokenWithoutExpiry.scope
        }], 
        error: null 
      })

      const result = await TokenStore.refreshTokenIfNeeded(mockUserId, 'google_drive')

      expect(result).toEqual({
        accessToken: tokenWithoutExpiry.accessToken,
        refreshToken: tokenWithoutExpiry.refreshToken,
        expiresAt: null,
        scope: tokenWithoutExpiry.scope
      })
      expect(fetch).not.toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle network errors during token refresh', async () => {
      const { supabaseAdmin } = require('@/app/lib/supabase-admin')
      const { logger } = require('@/app/lib/logger')
      
      const expiringSoonToken = {
        ...mockTokenData,
        expiresAt: new Date(Date.now() + 2 * 60 * 1000).toISOString()
      }

      supabaseAdmin.rpc.mockResolvedValue({ 
        data: [{
          access_token: expiringSoonToken.accessToken,
          refresh_token: expiringSoonToken.refreshToken,
          expires_at: expiringSoonToken.expiresAt,
          scope: expiringSoonToken.scope
        }], 
        error: null 
      })

      // Mock network error
      ;(fetch as jest.Mock).mockRejectedValue(new Error('Network error'))

      const result = await TokenStore.refreshTokenIfNeeded(mockUserId, 'google_drive')

      expect(result).toBeNull()
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to refresh Google token',
        expect.objectContaining({
          userId: mockUserId,
          error: 'Network error'
        })
      )
    })

    it('should handle malformed JSON response during token refresh', async () => {
      const { supabaseAdmin } = require('@/app/lib/supabase-admin')
      const { logger } = require('@/app/lib/logger')
      
      const expiringSoonToken = {
        ...mockTokenData,
        expiresAt: new Date(Date.now() + 2 * 60 * 1000).toISOString()
      }

      supabaseAdmin.rpc.mockResolvedValue({ 
        data: [{
          access_token: expiringSoonToken.accessToken,
          refresh_token: expiringSoonToken.refreshToken,
          expires_at: expiringSoonToken.expiresAt,
          scope: expiringSoonToken.scope
        }], 
        error: null 
      })

      // Mock malformed JSON response
      ;(fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON'))
      })

      const result = await TokenStore.refreshTokenIfNeeded(mockUserId, 'google_drive')

      expect(result).toBeNull()
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to refresh Google token',
        expect.objectContaining({
          userId: mockUserId,
          error: 'Invalid JSON'
        })
      )
    })
  })

  describe('Provider Disconnection', () => {
    it('should successfully disconnect provider by deleting token', async () => {
      const { supabaseAdmin } = require('@/app/lib/supabase-admin')
      const { logger } = require('@/app/lib/logger')
      
      supabaseAdmin.rpc.mockResolvedValue({ error: null })

      await TokenStore.deleteToken(mockUserId, 'google_drive')

      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('delete_oauth_token', {
        p_user_id: mockUserId,
        p_provider: 'google_drive'
      })

      expect(logger.info).toHaveBeenCalledWith(
        'OAuth token deleted successfully via RPC',
        expect.objectContaining({
          userId: mockUserId,
          provider: 'google_drive'
        })
      )
    })

    it('should verify token is deleted by checking retrieval returns null', async () => {
      const { supabaseAdmin } = require('@/app/lib/supabase-admin')
      
      // First delete the token
      supabaseAdmin.rpc.mockResolvedValueOnce({ error: null })
      await TokenStore.deleteToken(mockUserId, 'google_drive')

      // Then verify it's gone
      supabaseAdmin.rpc.mockResolvedValueOnce({ data: [], error: null })
      const result = await TokenStore.getToken(mockUserId, 'google_drive')

      expect(result).toBeNull()
    })
  })
})