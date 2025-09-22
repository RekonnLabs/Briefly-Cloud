/**
 * Integration test for user-data.ts utility functions
 * Tests the main functions with mocked dependencies
 */

// Mock the dependencies before importing the module
jest.mock('../auth/supabase-server-readonly', () => ({
  createServerClientReadOnly: jest.fn()
}))

jest.mock('../supabase-admin', () => ({
  supabaseAdmin: {
    from: jest.fn()
  }
}))

import { getCompleteUserData, getCurrentUserData } from '../user-data'
import { createServerClientReadOnly } from '../auth/supabase-server-readonly'
import { supabaseAdmin } from '../supabase-admin'

// Type the mocked functions
const mockCreateServerClientReadOnly = createServerClientReadOnly as jest.MockedFunction<typeof createServerClientReadOnly>
const mockSupabaseAdmin = supabaseAdmin as jest.Mocked<typeof supabaseAdmin>

describe('User Data Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getCompleteUserData', () => {
    it('should handle invalid user ID', async () => {
      const result = await getCompleteUserData('')
      
      expect(result.user).toBeNull()
      expect(result.error?.code).toBe('INVALID_USER_ID')
      expect(result.error?.message).toContain('Invalid user ID')
    })

    it('should handle database user not found', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116', message: 'No rows returned' }
        })
      }

      mockSupabaseAdmin.from.mockReturnValue(mockQuery as any)

      const result = await getCompleteUserData('valid-user-id')
      
      expect(result.user).toBeNull()
      expect(result.error?.code).toBe('USER_NOT_FOUND')
      expect(result.error?.message).toContain('User not found')
    })

    it('should handle database permission denied', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST301', message: 'Permission denied' }
        })
      }

      mockSupabaseAdmin.from.mockReturnValue(mockQuery as any)

      const result = await getCompleteUserData('valid-user-id')
      
      expect(result.user).toBeNull()
      expect(result.error?.code).toBe('PERMISSION_DENIED')
      expect(result.error?.message).toContain('Permission denied')
    })

    it('should handle successful user data retrieval', async () => {
      const mockUserData = {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
        subscription_tier: 'pro',
        subscription_status: 'active',
        usage_count: 15,
        usage_limit: 100,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-27T00:00:00Z',
        chat_messages_count: 15,
        chat_messages_limit: 100,
        documents_uploaded: 5,
        documents_limit: 100,
        api_calls_count: 50,
        api_calls_limit: 1000,
        storage_used_bytes: 5000000,
        storage_limit_bytes: 1073741824,
        usage_stats: { last_login: '2025-01-27' },
        preferences: { theme: 'dark' },
        features_enabled: { advanced_search: true },
        permissions: { can_upload: true },
        usage_reset_date: '2025-02-01T00:00:00Z'
      }

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockUserData,
          error: null
        })
      }

      mockSupabaseAdmin.from.mockReturnValue(mockQuery as any)

      const result = await getCompleteUserData('test-user-id')
      
      expect(result.user).toBeDefined()
      expect(result.user?.id).toBe('test-user-id')
      expect(result.user?.email).toBe('test@example.com')
      expect(result.user?.subscription_tier).toBe('pro')
      expect(result.user?.subscription_status).toBe('active')
      expect(result.user?.usage_count).toBe(15)
      expect(result.user?.usage_limit).toBe(100)
      expect(result.error).toBeUndefined()

      // Verify the query was called correctly
      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('users')
      expect(mockQuery.eq).toHaveBeenCalledWith('id', 'test-user-id')
    })

    it('should merge with defaults for missing fields', async () => {
      const mockUserDataPartial = {
        id: 'test-user-id',
        email: 'test@example.com',
        subscription_tier: 'free',
        subscription_status: 'active',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-27T00:00:00Z'
        // Missing many optional fields
      }

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockUserDataPartial,
          error: null
        })
      }

      mockSupabaseAdmin.from.mockReturnValue(mockQuery as any)

      const result = await getCompleteUserData('test-user-id')
      
      expect(result.user).toBeDefined()
      expect(result.user?.usage_count).toBe(0) // Default value
      expect(result.user?.usage_limit).toBe(10) // Default free tier limit
      expect(result.user?.chat_messages_limit).toBe(10) // Default free tier limit
      expect(result.user?.documents_limit).toBe(10) // Default free tier limit
      expect(result.user?.api_calls_limit).toBe(100) // Default free tier limit
      expect(result.user?.storage_limit_bytes).toBe(100 * 1024 * 1024) // Default 100MB
      expect(result.user?.usage_stats).toEqual({}) // Default empty object
      expect(result.user?.preferences).toEqual({}) // Default empty object
      expect(result.user?.features_enabled).toEqual({}) // Default empty object
      expect(result.user?.permissions).toEqual({}) // Default empty object
    })

    it('should handle unexpected errors', async () => {
      mockSupabaseAdmin.from.mockImplementation(() => {
        throw new Error('Unexpected database error')
      })

      const result = await getCompleteUserData('test-user-id')
      
      expect(result.user).toBeNull()
      expect(result.error?.code).toBe('NETWORK_ERROR')
      expect(result.error?.message).toContain('Unexpected error')
    })
  })

  describe('getCurrentUserData', () => {
    it('should handle authentication error', async () => {
      const mockSupabaseClient = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'Invalid token' }
          })
        }
      }

      mockCreateServerClientReadOnly.mockReturnValue(mockSupabaseClient as any)

      const result = await getCurrentUserData()
      
      expect(result.user).toBeNull()
      expect(result.error?.code).toBe('AUTH_REQUIRED')
      expect(result.error?.message).toContain('Authentication error')
    })

    it('should handle no authenticated user', async () => {
      const mockSupabaseClient = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: null },
            error: null
          })
        }
      }

      mockCreateServerClientReadOnly.mockReturnValue(mockSupabaseClient as any)

      const result = await getCurrentUserData()
      
      expect(result.user).toBeNull()
      expect(result.error?.code).toBe('AUTH_REQUIRED')
      expect(result.error?.message).toContain('User not authenticated')
    })

    it('should fetch user data for authenticated user', async () => {
      const mockAuthUser = {
        id: 'auth-user-id',
        email: 'auth@example.com'
      }

      const mockSupabaseClient = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: mockAuthUser },
            error: null
          })
        }
      }

      const mockUserData = {
        id: 'auth-user-id',
        email: 'auth@example.com',
        subscription_tier: 'free',
        subscription_status: 'active',
        usage_count: 5,
        usage_limit: 10,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-27T00:00:00Z',
        chat_messages_count: 5,
        chat_messages_limit: 10,
        documents_uploaded: 2,
        documents_limit: 10,
        api_calls_count: 20,
        api_calls_limit: 100,
        storage_used_bytes: 1000000,
        storage_limit_bytes: 104857600,
        usage_stats: {},
        preferences: {},
        features_enabled: {},
        permissions: {},
        usage_reset_date: '2025-02-01T00:00:00Z'
      }

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockUserData,
          error: null
        })
      }

      mockCreateServerClientReadOnly.mockReturnValue(mockSupabaseClient as any)
      mockSupabaseAdmin.from.mockReturnValue(mockQuery as any)

      const result = await getCurrentUserData()
      
      expect(result.user).toBeDefined()
      expect(result.user?.id).toBe('auth-user-id')
      expect(result.user?.email).toBe('auth@example.com')
      expect(result.error).toBeUndefined()

      // Verify the auth client was called
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalled()
      
      // Verify the admin client was called with the authenticated user's ID
      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('users')
      expect(mockQuery.eq).toHaveBeenCalledWith('id', 'auth-user-id')
    })

    it('should handle unexpected errors', async () => {
      mockCreateServerClientReadOnly.mockImplementation(() => {
        throw new Error('Unexpected auth error')
      })

      const result = await getCurrentUserData()
      
      expect(result.user).toBeNull()
      expect(result.error?.code).toBe('NETWORK_ERROR')
      expect(result.error?.message).toContain('Unexpected error')
    })
  })
})
