/**
 * OAuth Tokens Repository Tests
 * 
 * Tests for the OAuth tokens repository that manages tokens using RPC functions
 */

import { OAuthTokensRepository, type OAuthTokenData, type OAuthProvider } from '../oauth-tokens-repo'

// Mock the Supabase clients
jest.mock('@/app/lib/supabase-clients', () => ({
  supabaseApp: {
    rpc: jest.fn(),
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn()
          }))
        }))
      }))
    }))
  },
  supabasePrivate: {
    rpc: jest.fn()
  },
  supabasePublic: {
    rpc: jest.fn()
  }
}))

// Mock the api-errors module
jest.mock('@/app/lib/api-errors', () => ({
  createError: {
    databaseError: jest.fn((message: string, originalError?: any) => {
      const error = new Error(message)
      error.name = 'DatabaseError'
      return error
    }),
    validation: jest.fn((message: string, details?: any) => {
      const error = new Error(message)
      error.name = 'ValidationError'
      return error
    })
  }
}))

describe('OAuthTokensRepository', () => {
  let repository: OAuthTokensRepository
  let mockRpc: jest.MockedFunction<any>
  let mockFrom: jest.MockedFunction<any>
  let mockCreateError: any

  const testUserId = '12345678-1234-1234-1234-123456789012'
  const testProvider: OAuthProvider = 'google'
  const testTokenData: OAuthTokenData = {
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    expiresAt: '2024-12-31T23:59:59Z',
    scope: 'https://www.googleapis.com/auth/drive.file'
  }

  beforeEach(() => {
    jest.clearAllMocks()
    repository = new OAuthTokensRepository()
    
    // Get the mocked functions
    const { supabaseApp } = require('@/app/lib/supabase-clients')
    const { createError } = require('@/app/lib/api-errors')
    mockRpc = supabaseApp.rpc as jest.MockedFunction<any>
    mockFrom = supabaseApp.from as jest.MockedFunction<any>
    mockCreateError = createError
  })

  describe('saveToken', () => {
    it('should save OAuth token successfully', async () => {
      // Mock successful RPC call for save_oauth_token
      mockRpc.mockResolvedValueOnce({ data: null, error: null })
      // Mock successful RPC call for update_connection_status
      mockRpc.mockResolvedValueOnce({ data: null, error: null })

      await repository.saveToken(testUserId, testProvider, testTokenData)

      expect(mockRpc).toHaveBeenCalledWith('save_oauth_token', {
        p_user_id: testUserId,
        p_provider: testProvider,
        p_access_token: testTokenData.accessToken,
        p_refresh_token: testTokenData.refreshToken,
        p_expires_at: testTokenData.expiresAt,
        p_scope: testTokenData.scope
      })

      expect(mockRpc).toHaveBeenCalledWith('update_connection_status', {
        p_user_id: testUserId,
        p_provider: testProvider,
        p_connected: true,
        p_error_message: null
      })
    })

    it('should handle missing refresh token', async () => {
      const tokenDataWithoutRefresh = {
        accessToken: 'test-access-token',
        expiresAt: '2024-12-31T23:59:59Z'
      }

      mockRpc.mockResolvedValueOnce({ data: null, error: null })
      mockRpc.mockResolvedValueOnce({ data: null, error: null })

      await repository.saveToken(testUserId, testProvider, tokenDataWithoutRefresh)

      expect(mockRpc).toHaveBeenCalledWith('save_oauth_token', {
        p_user_id: testUserId,
        p_provider: testProvider,
        p_access_token: tokenDataWithoutRefresh.accessToken,
        p_refresh_token: null,
        p_expires_at: tokenDataWithoutRefresh.expiresAt,
        p_scope: null
      })
    })

    it('should throw error when RPC call fails', async () => {
      const rpcError = { message: 'RPC call failed', code: 'RPC_ERROR' }
      mockRpc.mockResolvedValueOnce({ data: null, error: rpcError })

      await expect(repository.saveToken(testUserId, testProvider, testTokenData))
        .rejects.toThrow('Failed to save OAuth token for google')

      expect(mockCreateError.databaseError).toHaveBeenCalledWith(
        'Failed to save OAuth token for google',
        expect.any(Error)
      )
    })

    it('should validate required fields', async () => {
      await expect(repository.saveToken('', testProvider, testTokenData))
        .rejects.toThrow('Missing required fields')

      await expect(repository.saveToken(testUserId, testProvider, { accessToken: '' }))
        .rejects.toThrow('Missing required fields')
    })
  })

  describe('getToken', () => {
    it('should retrieve OAuth token successfully', async () => {
      const mockTokenResponse = [{
        access_token: testTokenData.accessToken,
        refresh_token: testTokenData.refreshToken,
        expires_at: testTokenData.expiresAt,
        scope: testTokenData.scope
      }]

      mockRpc.mockResolvedValueOnce({ data: mockTokenResponse, error: null })

      const result = await repository.getToken(testUserId, testProvider)

      expect(mockRpc).toHaveBeenCalledWith('get_oauth_token', {
        p_user_id: testUserId,
        p_provider: testProvider
      })

      expect(result).toEqual(testTokenData)
    })

    it('should return null when no token found', async () => {
      mockRpc.mockResolvedValueOnce({ data: [], error: null })

      const result = await repository.getToken(testUserId, testProvider)

      expect(result).toBeNull()
    })

    it('should handle single object response', async () => {
      const mockTokenResponse = {
        access_token: testTokenData.accessToken,
        refresh_token: testTokenData.refreshToken,
        expires_at: testTokenData.expiresAt,
        scope: testTokenData.scope
      }

      mockRpc.mockResolvedValueOnce({ data: mockTokenResponse, error: null })

      const result = await repository.getToken(testUserId, testProvider)

      expect(result).toEqual(testTokenData)
    })

    it('should handle token without refresh token', async () => {
      const mockTokenResponse = [{
        access_token: 'test-access-token',
        refresh_token: null,
        expires_at: '2024-12-31T23:59:59Z',
        scope: 'test-scope'
      }]

      mockRpc.mockResolvedValueOnce({ data: mockTokenResponse, error: null })

      const result = await repository.getToken(testUserId, testProvider)

      expect(result).toEqual({
        accessToken: 'test-access-token',
        expiresAt: '2024-12-31T23:59:59Z',
        scope: 'test-scope'
      })
    })

    it('should throw error when RPC call fails', async () => {
      const rpcError = { message: 'RPC call failed', code: 'RPC_ERROR' }
      mockRpc.mockResolvedValueOnce({ data: null, error: rpcError })

      await expect(repository.getToken(testUserId, testProvider))
        .rejects.toThrow('Failed to get OAuth token for google')
    })
  })

  describe('deleteToken', () => {
    it('should delete OAuth token successfully', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: null })
      mockRpc.mockResolvedValueOnce({ data: null, error: null })

      await repository.deleteToken(testUserId, testProvider)

      expect(mockRpc).toHaveBeenCalledWith('delete_oauth_token', {
        p_user_id: testUserId,
        p_provider: testProvider
      })

      expect(mockRpc).toHaveBeenCalledWith('update_connection_status', {
        p_user_id: testUserId,
        p_provider: testProvider,
        p_connected: false,
        p_error_message: null
      })
    })

    it('should throw error when RPC call fails', async () => {
      const rpcError = { message: 'RPC call failed', code: 'RPC_ERROR' }
      mockRpc.mockResolvedValueOnce({ data: null, error: rpcError })

      await expect(repository.deleteToken(testUserId, testProvider))
        .rejects.toThrow('Failed to delete OAuth token for google')
    })
  })

  describe('tokenExists', () => {
    it('should return true when token exists', async () => {
      mockRpc.mockResolvedValueOnce({ data: true, error: null })

      const result = await repository.tokenExists(testUserId, testProvider)

      expect(mockRpc).toHaveBeenCalledWith('oauth_token_exists', {
        p_user_id: testUserId,
        p_provider: testProvider
      })

      expect(result).toBe(true)
    })

    it('should return false when token does not exist', async () => {
      mockRpc.mockResolvedValueOnce({ data: false, error: null })

      const result = await repository.tokenExists(testUserId, testProvider)

      expect(result).toBe(false)
    })

    it('should throw error when RPC call fails', async () => {
      const rpcError = { message: 'RPC call failed', code: 'RPC_ERROR' }
      mockRpc.mockResolvedValueOnce({ data: null, error: rpcError })

      await expect(repository.tokenExists(testUserId, testProvider))
        .rejects.toThrow('Failed to check if OAuth token exists for google')
    })
  })

  describe('getTokenStatus', () => {
    it('should return token status when token exists', async () => {
      const mockStatusResponse = [{
        exists: true,
        expires_at: '2024-12-31T23:59:59Z',
        is_expired: false,
        expires_soon: true
      }]

      mockRpc.mockResolvedValueOnce({ data: mockStatusResponse, error: null })

      const result = await repository.getTokenStatus(testUserId, testProvider)

      expect(mockRpc).toHaveBeenCalledWith('get_oauth_token_status', {
        p_user_id: testUserId,
        p_provider: testProvider
      })

      expect(result).toEqual({
        exists: true,
        expiresAt: '2024-12-31T23:59:59Z',
        isExpired: false,
        expiresSoon: true
      })
    })

    it('should return default status when no token found', async () => {
      mockRpc.mockResolvedValueOnce({ data: [], error: null })

      const result = await repository.getTokenStatus(testUserId, testProvider)

      expect(result).toEqual({
        exists: false,
        isExpired: false,
        expiresSoon: false
      })
    })
  })

  describe('updateConnectionStatus', () => {
    it('should update connection status successfully', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: null })

      await repository.updateConnectionStatus(testUserId, testProvider, true, 'Test error')

      expect(mockRpc).toHaveBeenCalledWith('update_connection_status', {
        p_user_id: testUserId,
        p_provider: testProvider,
        p_connected: true,
        p_error_message: 'Test error'
      })
    })

    it('should handle null error message', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: null })

      await repository.updateConnectionStatus(testUserId, testProvider, false)

      expect(mockRpc).toHaveBeenCalledWith('update_connection_status', {
        p_user_id: testUserId,
        p_provider: testProvider,
        p_connected: false,
        p_error_message: null
      })
    })
  })

  describe('getConnectionStatus', () => {
    it('should return connection status when found', async () => {
      const mockConnectionData = {
        connected: true,
        last_sync: '2024-01-01T12:00:00Z',
        error_message: null
      }

      const mockQuery = {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({ data: mockConnectionData, error: null })
            }))
          }))
        }))
      }

      mockFrom.mockReturnValue(mockQuery)

      const result = await repository.getConnectionStatus(testUserId, testProvider)

      expect(result).toEqual({
        connected: true,
        lastSync: '2024-01-01T12:00:00Z'
      })
    })

    it('should return null when no connection status found', async () => {
      const mockQuery = {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({ 
                data: null, 
                error: { code: 'PGRST116' } 
              })
            }))
          }))
        }))
      }

      mockFrom.mockReturnValue(mockQuery)

      const result = await repository.getConnectionStatus(testUserId, testProvider)

      expect(result).toBeNull()
    })
  })

  describe('getAllConnectionStatuses', () => {
    it('should return all connection statuses for user', async () => {
      const mockConnectionsData = [
        {
          provider: 'google',
          connected: true,
          last_sync: '2024-01-01T12:00:00Z',
          error_message: null
        },
        {
          provider: 'microsoft',
          connected: false,
          last_sync: null,
          error_message: 'Connection failed'
        }
      ]

      const mockQuery = {
        select: jest.fn(() => ({
          eq: jest.fn().mockResolvedValue({ data: mockConnectionsData, error: null })
        }))
      }

      mockFrom.mockReturnValue(mockQuery)

      const result = await repository.getAllConnectionStatuses(testUserId)

      expect(result).toEqual([
        {
          provider: 'google',
          connected: true,
          lastSync: '2024-01-01T12:00:00Z'
        },
        {
          provider: 'microsoft',
          connected: false,
          errorMessage: 'Connection failed'
        }
      ])
    })

    it('should return empty array when no connections found', async () => {
      const mockQuery = {
        select: jest.fn(() => ({
          eq: jest.fn().mockResolvedValue({ data: null, error: null })
        }))
      }

      mockFrom.mockReturnValue(mockQuery)

      const result = await repository.getAllConnectionStatuses(testUserId)

      expect(result).toEqual([])
    })
  })

  describe('validation', () => {
    it('should validate required fields for all methods', async () => {
      // Test saveToken validation
      await expect(repository.saveToken('', testProvider, testTokenData))
        .rejects.toThrow('Missing required fields')

      // Test getToken validation
      await expect(repository.getToken('', testProvider))
        .rejects.toThrow('Missing required fields')

      // Test deleteToken validation
      await expect(repository.deleteToken(testUserId, '' as OAuthProvider))
        .rejects.toThrow('Missing required fields')

      // Test tokenExists validation
      await expect(repository.tokenExists('', testProvider))
        .rejects.toThrow('Missing required fields')

      // Test getTokenStatus validation
      await expect(repository.getTokenStatus(testUserId, '' as OAuthProvider))
        .rejects.toThrow('Missing required fields')

      // Test updateConnectionStatus validation
      await expect(repository.updateConnectionStatus('', testProvider, true))
        .rejects.toThrow('Missing required fields')

      // Test getConnectionStatus validation
      await expect(repository.getConnectionStatus('', testProvider))
        .rejects.toThrow('Missing required fields')

      // Test getAllConnectionStatuses validation
      await expect(repository.getAllConnectionStatuses(''))
        .rejects.toThrow('Missing required fields')
    })
  })
})