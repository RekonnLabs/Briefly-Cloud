/**
 * Comprehensive test suite for user-data.ts utility functions
 * Tests all utility functions with various input scenarios, error handling,
 * authentication failures, database errors, and TypeScript interface compliance
 */

// Mock server-only module
jest.mock('server-only', () => ({}))

// Mock the Supabase modules before importing
jest.mock('../supabase-admin', () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn()
        }))
      }))
    }))
  }
}))

jest.mock('../auth/supabase-server-readonly', () => ({
  createServerClientReadOnly: jest.fn(() => ({
    auth: {
      getUser: jest.fn()
    }
  }))
}))

import { 
  CompleteUserData, 
  UserDataResult, 
  UserDataError,
  getCompleteUserData,
  getCurrentUserData,
  isValidUserData,
  getUserDataErrorMessage,
  getSafeUserData
} from '../user-data'

// Get the mocked modules
const { supabaseAdmin } = require('../supabase-admin')
const { createServerClientReadOnly } = require('../auth/supabase-server-readonly')

describe('User Data Utility - Comprehensive Test Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('TypeScript Interface Compliance', () => {
    it('should have correct CompleteUserData interface with all required fields', () => {
      const mockUser: CompleteUserData = {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
        image: 'https://example.com/avatar.jpg',
        subscription_tier: 'free',
        subscription_status: 'active',
        usage_count: 5,
        usage_limit: 10,
        trial_end_date: '2025-02-01T00:00:00Z',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-27T00:00:00Z',
        full_name: 'Test User Full',
        chat_messages_count: 5,
        chat_messages_limit: 10,
        documents_uploaded: 3,
        documents_limit: 10,
        api_calls_count: 15,
        api_calls_limit: 100,
        storage_used_bytes: 1024000,
        storage_limit_bytes: 104857600,
        usage_stats: { last_login: '2025-01-27' },
        preferences: { theme: 'dark' },
        features_enabled: { advanced_search: true },
        permissions: { can_upload: true },
        usage_reset_date: '2025-02-01T00:00:00Z'
      }

      // Test that the interface accepts all required fields
      expect(mockUser.id).toBe('test-user-id')
      expect(mockUser.subscription_tier).toBe('free')
      expect(mockUser.subscription_status).toBe('active')
      expect(typeof mockUser.usage_count).toBe('number')
      expect(typeof mockUser.usage_limit).toBe('number')
    })

    it('should validate subscription_tier enum values', () => {
      const validTiers: CompleteUserData['subscription_tier'][] = ['free', 'pro', 'pro_byok']
      
      validTiers.forEach(tier => {
        const user: CompleteUserData = {
          id: 'test-id',
          email: 'test@example.com',
          subscription_tier: tier,
          subscription_status: 'active',
          usage_count: 0,
          usage_limit: 10,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-27T00:00:00Z',
          chat_messages_count: 0,
          chat_messages_limit: 10,
          documents_uploaded: 0,
          documents_limit: 10,
          api_calls_count: 0,
          api_calls_limit: 100,
          storage_used_bytes: 0,
          storage_limit_bytes: 104857600,
          usage_stats: {},
          preferences: {},
          features_enabled: {},
          permissions: {},
          usage_reset_date: '2025-02-01T00:00:00Z'
        }
        expect(user.subscription_tier).toBe(tier)
      })
    })

    it('should validate subscription_status enum values', () => {
      const validStatuses: CompleteUserData['subscription_status'][] = [
        'active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired'
      ]
      
      validStatuses.forEach(status => {
        const user: CompleteUserData = {
          id: 'test-id',
          email: 'test@example.com',
          subscription_tier: 'free',
          subscription_status: status,
          usage_count: 0,
          usage_limit: 10,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-27T00:00:00Z',
          chat_messages_count: 0,
          chat_messages_limit: 10,
          documents_uploaded: 0,
          documents_limit: 10,
          api_calls_count: 0,
          api_calls_limit: 100,
          storage_used_bytes: 0,
          storage_limit_bytes: 104857600,
          usage_stats: {},
          preferences: {},
          features_enabled: {},
          permissions: {},
          usage_reset_date: '2025-02-01T00:00:00Z'
        }
        expect(user.subscription_status).toBe(status)
      })
    })

    it('should have correct UserDataResult interface', () => {
      const successResult: UserDataResult = {
        user: {
          id: 'test-id',
          email: 'test@example.com',
          subscription_tier: 'pro',
          subscription_status: 'active',
          usage_count: 0,
          usage_limit: 100,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-27T00:00:00Z',
          chat_messages_count: 0,
          chat_messages_limit: 100,
          documents_uploaded: 0,
          documents_limit: 100,
          api_calls_count: 0,
          api_calls_limit: 1000,
          storage_used_bytes: 0,
          storage_limit_bytes: 1073741824,
          usage_stats: {},
          preferences: {},
          features_enabled: {},
          permissions: {},
          usage_reset_date: '2025-02-01T00:00:00Z'
        }
      }

      const errorResult: UserDataResult = {
        user: null,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found in database',
          details: { userId: 'invalid-id' }
        }
      }

      expect(successResult.user).toBeTruthy()
      expect(successResult.error).toBeUndefined()
      expect(errorResult.user).toBeNull()
      expect(errorResult.error?.code).toBe('USER_NOT_FOUND')
    })

    it('should have correct UserDataError interface with all error codes', () => {
      const errorCodes: UserDataError['code'][] = [
        'AUTH_REQUIRED', 'USER_NOT_FOUND', 'DATABASE_ERROR', 
        'PERMISSION_DENIED', 'INVALID_USER_ID', 'NETWORK_ERROR'
      ]

      errorCodes.forEach(code => {
        const error: UserDataError = {
          code,
          message: `Test error for ${code}`,
          details: { test: true }
        }
        expect(error.code).toBe(code)
        expect(error.message).toBeDefined()
      })
    })
  })

  describe('getCompleteUserData Function', () => {
    describe('Success Scenarios', () => {
      it('should return complete user data for valid user ID', async () => {
        const mockUserData = {
          id: 'valid-user-id',
          email: 'user@example.com',
          name: 'Test User',
          subscription_tier: 'pro',
          subscription_status: 'active',
          usage_count: 25,
          usage_limit: 100,
          chat_messages_count: 15,
          chat_messages_limit: 100,
          documents_uploaded: 5,
          documents_limit: 100,
          api_calls_count: 50,
          api_calls_limit: 1000,
          storage_used_bytes: 5000000,
          storage_limit_bytes: 1073741824,
          usage_stats: { last_active: '2025-01-27' },
          preferences: { notifications: true },
          features_enabled: { ai_chat: true },
          permissions: { admin: false },
          usage_reset_date: '2025-02-01T00:00:00Z',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-27T00:00:00Z'
        }

        supabaseAdmin.from.mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: mockUserData, error: null })
            })
          })
        })

        const result = await getCompleteUserData('valid-user-id')

        expect(result.user).toBeTruthy()
        expect(result.error).toBeUndefined()
        expect(result.user?.id).toBe('valid-user-id')
        expect(result.user?.subscription_tier).toBe('pro')
        expect(result.user?.usage_count).toBe(25)
      })

      it('should merge with defaults for missing optional fields', async () => {
        const partialUserData = {
          id: 'partial-user-id',
          email: 'partial@example.com',
          subscription_tier: null,
          subscription_status: null,
          usage_count: null,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-27T00:00:00Z'
        }

        supabaseAdmin.from.mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: partialUserData, error: null })
            })
          })
        })

        const result = await getCompleteUserData('partial-user-id')

        expect(result.user).toBeTruthy()
        expect(result.user?.subscription_tier).toBe('free') // Default value
        expect(result.user?.subscription_status).toBe('active') // Default value
        expect(result.user?.usage_count).toBe(0) // Default value
        expect(result.user?.usage_limit).toBe(10) // Default value
      })

      it('should handle user with trial subscription', async () => {
        const trialUserData = {
          id: 'trial-user-id',
          email: 'trial@example.com',
          subscription_tier: 'pro',
          subscription_status: 'trialing',
          trial_end_date: '2025-02-15T00:00:00Z',
          usage_count: 10,
          usage_limit: 100,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-27T00:00:00Z',
          chat_messages_count: 10,
          chat_messages_limit: 100,
          documents_uploaded: 3,
          documents_limit: 100,
          api_calls_count: 25,
          api_calls_limit: 1000,
          storage_used_bytes: 2000000,
          storage_limit_bytes: 1073741824,
          usage_stats: {},
          preferences: {},
          features_enabled: {},
          permissions: {},
          usage_reset_date: '2025-02-01T00:00:00Z'
        }

        supabaseAdmin.from.mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: trialUserData, error: null })
            })
          })
        })

        const result = await getCompleteUserData('trial-user-id')

        expect(result.user?.subscription_status).toBe('trialing')
        expect(result.user?.trial_end_date).toBe('2025-02-15T00:00:00Z')
      })
    })

    describe('Error Scenarios', () => {
      it('should return INVALID_USER_ID error for null user ID', async () => {
        const result = await getCompleteUserData(null as any)

        expect(result.user).toBeNull()
        expect(result.error?.code).toBe('INVALID_USER_ID')
        expect(result.error?.message).toContain('Invalid user ID')
      })

      it('should return INVALID_USER_ID error for empty user ID', async () => {
        const result = await getCompleteUserData('')

        expect(result.user).toBeNull()
        expect(result.error?.code).toBe('INVALID_USER_ID')
        expect(result.error?.message).toContain('Invalid user ID')
      })

      it('should return INVALID_USER_ID error for non-string user ID', async () => {
        const result = await getCompleteUserData(123 as any)

        expect(result.user).toBeNull()
        expect(result.error?.code).toBe('INVALID_USER_ID')
        expect(result.error?.message).toContain('Invalid user ID')
      })

      it('should return USER_NOT_FOUND error for non-existent user', async () => {
        supabaseAdmin.from.mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ 
                data: null, 
                error: { code: 'PGRST116', message: 'No rows found' }
              })
            })
          })
        })

        const result = await getCompleteUserData('non-existent-id')

        expect(result.user).toBeNull()
        expect(result.error?.code).toBe('USER_NOT_FOUND')
        expect(result.error?.message).toContain('User not found')
      })

      it('should return PERMISSION_DENIED error for RLS policy violation', async () => {
        supabaseAdmin.from.mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ 
                data: null, 
                error: { code: 'PGRST301', message: 'Permission denied' }
              })
            })
          })
        })

        const result = await getCompleteUserData('unauthorized-id')

        expect(result.user).toBeNull()
        expect(result.error?.code).toBe('PERMISSION_DENIED')
        expect(result.error?.message).toContain('Permission denied')
      })

      it('should return DATABASE_ERROR for other Supabase errors', async () => {
        supabaseAdmin.from.mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ 
                data: null, 
                error: { code: 'PGRST500', message: 'Internal server error' }
              })
            })
          })
        })

        const result = await getCompleteUserData('error-user-id')

        expect(result.user).toBeNull()
        expect(result.error?.code).toBe('DATABASE_ERROR')
        expect(result.error?.message).toContain('Database error')
      })

      it('should return NETWORK_ERROR for unexpected exceptions', async () => {
        supabaseAdmin.from.mockImplementation(() => {
          throw new Error('Network connection failed')
        })

        const result = await getCompleteUserData('exception-user-id')

        expect(result.user).toBeNull()
        expect(result.error?.code).toBe('NETWORK_ERROR')
        expect(result.error?.message).toContain('Unexpected error')
      })
    })

    describe('Data Validation', () => {
      it('should properly query the users table with correct fields', async () => {
        const mockSelect = jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: {}, error: null })
          })
        })
        const mockFrom = jest.fn().mockReturnValue({ select: mockSelect })
        supabaseAdmin.from = mockFrom

        await getCompleteUserData('test-user-id')

        expect(mockFrom).toHaveBeenCalledWith('users')
        expect(mockSelect).toHaveBeenCalledWith(expect.stringContaining('id,'))
        expect(mockSelect).toHaveBeenCalledWith(expect.stringContaining('email,'))
        expect(mockSelect).toHaveBeenCalledWith(expect.stringContaining('subscription_tier,'))
        expect(mockSelect).toHaveBeenCalledWith(expect.stringContaining('subscription_status,'))
      })

      it('should use eq filter with provided user ID', async () => {
        const mockEq = jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: {}, error: null })
        })
        const mockSelect = jest.fn().mockReturnValue({ eq: mockEq })
        supabaseAdmin.from.mockReturnValue({ select: mockSelect })

        await getCompleteUserData('specific-user-id')

        expect(mockEq).toHaveBeenCalledWith('id', 'specific-user-id')
      })
    })
  })

  describe('getCurrentUserData Function', () => {
    describe('Success Scenarios', () => {
      it('should return current user data for authenticated user', async () => {
        const mockAuthUser = { id: 'auth-user-id', email: 'auth@example.com' }
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
          api_calls_count: 10,
          api_calls_limit: 100,
          storage_used_bytes: 1000000,
          storage_limit_bytes: 104857600,
          usage_stats: {},
          preferences: {},
          features_enabled: {},
          permissions: {},
          usage_reset_date: '2025-02-01T00:00:00Z'
        }

        createServerClientReadOnly.mockReturnValue({
          auth: {
            getUser: jest.fn().mockResolvedValue({ 
              data: { user: mockAuthUser }, 
              error: null 
            })
          }
        })

        supabaseAdmin.from.mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: mockUserData, error: null })
            })
          })
        })

        const result = await getCurrentUserData()

        expect(result.user).toBeTruthy()
        expect(result.user?.id).toBe('auth-user-id')
        expect(result.error).toBeUndefined()
      })
    })

    describe('Authentication Error Scenarios', () => {
      it('should return AUTH_REQUIRED error when auth.getUser fails', async () => {
        createServerClientReadOnly.mockReturnValue({
          auth: {
            getUser: jest.fn().mockResolvedValue({ 
              data: { user: null }, 
              error: { message: 'Invalid JWT' }
            })
          }
        })

        const result = await getCurrentUserData()

        expect(result.user).toBeNull()
        expect(result.error?.code).toBe('AUTH_REQUIRED')
        expect(result.error?.message).toContain('Authentication error')
      })

      it('should return AUTH_REQUIRED error when user is null', async () => {
        createServerClientReadOnly.mockReturnValue({
          auth: {
            getUser: jest.fn().mockResolvedValue({ 
              data: { user: null }, 
              error: null 
            })
          }
        })

        const result = await getCurrentUserData()

        expect(result.user).toBeNull()
        expect(result.error?.code).toBe('AUTH_REQUIRED')
        expect(result.error?.message).toContain('User not authenticated')
      })

      it('should return NETWORK_ERROR for unexpected auth exceptions', async () => {
        createServerClientReadOnly.mockReturnValue({
          auth: {
            getUser: jest.fn().mockRejectedValue(new Error('Auth service unavailable'))
          }
        })

        const result = await getCurrentUserData()

        expect(result.user).toBeNull()
        expect(result.error?.code).toBe('NETWORK_ERROR')
        expect(result.error?.message).toContain('Unexpected error')
      })
    })

    describe('Integration with getCompleteUserData', () => {
      it('should pass authenticated user ID to getCompleteUserData', async () => {
        const mockAuthUser = { id: 'integration-user-id', email: 'integration@example.com' }
        
        createServerClientReadOnly.mockReturnValue({
          auth: {
            getUser: jest.fn().mockResolvedValue({ 
              data: { user: mockAuthUser }, 
              error: null 
            })
          }
        })

        // Mock getCompleteUserData to return an error so we can verify the user ID was passed
        supabaseAdmin.from.mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ 
                data: null, 
                error: { code: 'PGRST116', message: 'No rows found' }
              })
            })
          })
        })

        const result = await getCurrentUserData()

        // Verify that the error details contain the correct user ID
        expect(result.error?.details).toEqual(
          expect.objectContaining({ userId: 'integration-user-id' })
        )
      })
    })
  })

  describe('Helper Functions', () => {
    describe('isValidUserData', () => {
      it('should return true for valid complete user data', () => {
        const validUser: CompleteUserData = {
          id: 'valid-id',
          email: 'valid@example.com',
          subscription_tier: 'free',
          subscription_status: 'active',
          usage_count: 5,
          usage_limit: 10,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-27T00:00:00Z',
          chat_messages_count: 5,
          chat_messages_limit: 10,
          documents_uploaded: 0,
          documents_limit: 10,
          api_calls_count: 0,
          api_calls_limit: 100,
          storage_used_bytes: 0,
          storage_limit_bytes: 104857600,
          usage_stats: {},
          preferences: {},
          features_enabled: {},
          permissions: {},
          usage_reset_date: '2025-02-01T00:00:00Z'
        }

        expect(isValidUserData(validUser)).toBe(true)
      })

      it('should return false for null user data', () => {
        expect(isValidUserData(null)).toBe(false)
      })

      it('should return false for undefined user data', () => {
        expect(isValidUserData(undefined as any)).toBe(false)
      })

      it('should return false for user data missing required id', () => {
        const incompleteUser = {
          email: 'test@example.com',
          subscription_tier: 'free',
          subscription_status: 'active',
          usage_count: 0,
          usage_limit: 10
        } as CompleteUserData

        expect(isValidUserData(incompleteUser)).toBe(false)
      })

      it('should return false for user data missing required email', () => {
        const incompleteUser = {
          id: 'test-id',
          subscription_tier: 'free',
          subscription_status: 'active',
          usage_count: 0,
          usage_limit: 10
        } as CompleteUserData

        expect(isValidUserData(incompleteUser)).toBe(false)
      })

      it('should return false for user data missing subscription_tier', () => {
        const incompleteUser = {
          id: 'test-id',
          email: 'test@example.com',
          subscription_status: 'active',
          usage_count: 0,
          usage_limit: 10
        } as CompleteUserData

        expect(isValidUserData(incompleteUser)).toBe(false)
      })

      it('should return false for user data with non-numeric usage_count', () => {
        const invalidUser = {
          id: 'test-id',
          email: 'test@example.com',
          subscription_tier: 'free',
          subscription_status: 'active',
          usage_count: 'invalid' as any,
          usage_limit: 10
        } as CompleteUserData

        expect(isValidUserData(invalidUser)).toBe(false)
      })

      it('should return false for user data with non-numeric usage_limit', () => {
        const invalidUser = {
          id: 'test-id',
          email: 'test@example.com',
          subscription_tier: 'free',
          subscription_status: 'active',
          usage_count: 5,
          usage_limit: 'invalid' as any
        } as CompleteUserData

        expect(isValidUserData(invalidUser)).toBe(false)
      })
    })

    describe('getUserDataErrorMessage', () => {
      it('should return appropriate message for AUTH_REQUIRED error', () => {
        const error: UserDataError = { code: 'AUTH_REQUIRED', message: 'Auth required' }
        const message = getUserDataErrorMessage(error)
        
        expect(message).toContain('sign in')
        expect(message).toContain('access your account')
      })

      it('should return appropriate message for USER_NOT_FOUND error', () => {
        const error: UserDataError = { code: 'USER_NOT_FOUND', message: 'Not found' }
        const message = getUserDataErrorMessage(error)
        
        expect(message).toContain('not found')
        expect(message).toContain('contact support')
      })

      it('should return appropriate message for DATABASE_ERROR', () => {
        const error: UserDataError = { code: 'DATABASE_ERROR', message: 'DB error' }
        const message = getUserDataErrorMessage(error)
        
        expect(message).toContain('Unable to load')
        expect(message).toContain('try again later')
      })

      it('should return appropriate message for PERMISSION_DENIED error', () => {
        const error: UserDataError = { code: 'PERMISSION_DENIED', message: 'Permission denied' }
        const message = getUserDataErrorMessage(error)
        
        expect(message).toContain('Access denied')
        expect(message).toContain('permissions')
      })

      it('should return appropriate message for INVALID_USER_ID error', () => {
        const error: UserDataError = { code: 'INVALID_USER_ID', message: 'Invalid ID' }
        const message = getUserDataErrorMessage(error)
        
        expect(message).toContain('Invalid user')
        expect(message).toContain('sign in again')
      })

      it('should return appropriate message for NETWORK_ERROR', () => {
        const error: UserDataError = { code: 'NETWORK_ERROR', message: 'Network error' }
        const message = getUserDataErrorMessage(error)
        
        expect(message).toContain('Network error')
        expect(message).toContain('connection')
      })

      it('should return default message for unknown error code', () => {
        const error = { code: 'UNKNOWN_ERROR', message: 'Unknown' } as UserDataError
        const message = getUserDataErrorMessage(error)
        
        expect(message).toContain('unexpected error')
        expect(message).toContain('try again later')
      })
    })

    describe('getSafeUserData', () => {
      it('should return null for null input', () => {
        expect(getSafeUserData(null)).toBeNull()
      })

      it('should return sanitized user data with all safe fields', () => {
        const fullUser: CompleteUserData = {
          id: 'test-id',
          email: 'test@example.com',
          name: 'Test User',
          full_name: 'Test User Full',
          image: 'avatar.jpg',
          subscription_tier: 'pro',
          subscription_status: 'active',
          usage_count: 10,
          usage_limit: 100,
          trial_end_date: '2025-02-01T00:00:00Z',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-27T00:00:00Z',
          chat_messages_count: 10,
          chat_messages_limit: 100,
          documents_uploaded: 5,
          documents_limit: 100,
          api_calls_count: 50,
          api_calls_limit: 1000,
          storage_used_bytes: 5000000,
          storage_limit_bytes: 1073741824,
          usage_stats: { last_login: '2025-01-27', sensitive_data: 'hidden' },
          preferences: { theme: 'dark', private_setting: 'secret' },
          features_enabled: { advanced_search: true },
          permissions: { can_upload: true },
          usage_reset_date: '2025-02-01T00:00:00Z'
        }

        const safeData = getSafeUserData(fullUser)

        // Should include safe fields
        expect(safeData?.id).toBe('test-id')
        expect(safeData?.email).toBe('test@example.com')
        expect(safeData?.name).toBe('Test User') // Should prefer name over full_name
        expect(safeData?.subscription_tier).toBe('pro')
        expect(safeData?.subscription_status).toBe('active')
        expect(safeData?.usage_count).toBe(10)
        expect(safeData?.usage_limit).toBe(100)
        expect(safeData?.features_enabled).toEqual({ advanced_search: true })
        expect(safeData?.permissions).toEqual({ can_upload: true })
        
        // Should exclude sensitive internal fields
        expect(safeData).not.toHaveProperty('usage_stats')
        expect(safeData).not.toHaveProperty('preferences')
        expect(safeData).not.toHaveProperty('created_at')
        expect(safeData).not.toHaveProperty('updated_at')
      })

      it('should use full_name when name is not available', () => {
        const userWithFullName: CompleteUserData = {
          id: 'test-id',
          email: 'test@example.com',
          full_name: 'Full Name Only',
          subscription_tier: 'free',
          subscription_status: 'active',
          usage_count: 0,
          usage_limit: 10,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-27T00:00:00Z',
          chat_messages_count: 0,
          chat_messages_limit: 10,
          documents_uploaded: 0,
          documents_limit: 10,
          api_calls_count: 0,
          api_calls_limit: 100,
          storage_used_bytes: 0,
          storage_limit_bytes: 104857600,
          usage_stats: {},
          preferences: {},
          features_enabled: {},
          permissions: {},
          usage_reset_date: '2025-02-01T00:00:00Z'
        }

        const safeData = getSafeUserData(userWithFullName)
        expect(safeData?.name).toBe('Full Name Only')
      })

      it('should handle user with no name or full_name', () => {
        const userWithoutName: CompleteUserData = {
          id: 'test-id',
          email: 'test@example.com',
          subscription_tier: 'free',
          subscription_status: 'active',
          usage_count: 0,
          usage_limit: 10,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-27T00:00:00Z',
          chat_messages_count: 0,
          chat_messages_limit: 10,
          documents_uploaded: 0,
          documents_limit: 10,
          api_calls_count: 0,
          api_calls_limit: 100,
          storage_used_bytes: 0,
          storage_limit_bytes: 104857600,
          usage_stats: {},
          preferences: {},
          features_enabled: {},
          permissions: {},
          usage_reset_date: '2025-02-01T00:00:00Z'
        }

        const safeData = getSafeUserData(userWithoutName)
        expect(safeData?.name).toBeUndefined()
      })

      it('should include all usage and limit fields', () => {
        const userWithUsage: CompleteUserData = {
          id: 'test-id',
          email: 'test@example.com',
          subscription_tier: 'pro',
          subscription_status: 'active',
          usage_count: 25,
          usage_limit: 100,
          chat_messages_count: 15,
          chat_messages_limit: 100,
          documents_uploaded: 8,
          documents_limit: 100,
          api_calls_count: 75,
          api_calls_limit: 1000,
          storage_used_bytes: 50000000,
          storage_limit_bytes: 1073741824,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-27T00:00:00Z',
          usage_stats: {},
          preferences: {},
          features_enabled: {},
          permissions: {},
          usage_reset_date: '2025-02-01T00:00:00Z'
        }

        const safeData = getSafeUserData(userWithUsage)
        
        expect(safeData?.usage_count).toBe(25)
        expect(safeData?.usage_limit).toBe(100)
        expect(safeData?.chat_messages_count).toBe(15)
        expect(safeData?.chat_messages_limit).toBe(100)
        expect(safeData?.documents_uploaded).toBe(8)
        expect(safeData?.documents_limit).toBe(100)
        expect(safeData?.api_calls_count).toBe(75)
        expect(safeData?.api_calls_limit).toBe(1000)
        expect(safeData?.storage_used_bytes).toBe(50000000)
        expect(safeData?.storage_limit_bytes).toBe(1073741824)
      })
    })
  })

  describe('Error Handling Edge Cases', () => {
    it('should handle malformed database responses gracefully', async () => {
      supabaseAdmin.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ 
              data: { id: 'test', email: null }, // Malformed data
              error: null 
            })
          })
        })
      })

      const result = await getCompleteUserData('test-user-id')

      expect(result.user).toBeTruthy()
      expect(result.user?.email).toBeNull()
      expect(result.user?.subscription_tier).toBe('free') // Should use default
    })

    it('should handle concurrent requests properly', async () => {
      const mockUserData = {
        id: 'concurrent-user-id',
        email: 'concurrent@example.com',
        subscription_tier: 'free',
        subscription_status: 'active',
        usage_count: 0,
        usage_limit: 10,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-27T00:00:00Z',
        chat_messages_count: 0,
        chat_messages_limit: 10,
        documents_uploaded: 0,
        documents_limit: 10,
        api_calls_count: 0,
        api_calls_limit: 100,
        storage_used_bytes: 0,
        storage_limit_bytes: 104857600,
        usage_stats: {},
        preferences: {},
        features_enabled: {},
        permissions: {},
        usage_reset_date: '2025-02-01T00:00:00Z'
      }

      supabaseAdmin.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockUserData, error: null })
          })
        })
      })

      // Make multiple concurrent requests
      const promises = Array(5).fill(null).map(() => 
        getCompleteUserData('concurrent-user-id')
      )

      const results = await Promise.all(promises)

      // All requests should succeed
      results.forEach(result => {
        expect(result.user).toBeTruthy()
        expect(result.user?.id).toBe('concurrent-user-id')
        expect(result.error).toBeUndefined()
      })
    })
  })
})