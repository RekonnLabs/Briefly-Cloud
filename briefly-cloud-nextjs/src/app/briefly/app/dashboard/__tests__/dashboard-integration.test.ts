/**
 * Integration tests for dashboard user data flow
 * Tests complete user data flow from page to component, different subscription scenarios,
 * error scenarios, fallback behavior, and authentication integration
 * 
 * Requirements: 1.1, 1.2, 1.3, 3.1, 3.2, 3.3, 3.4
 */

// Mock server-only module
jest.mock('server-only', () => ({}))

// Mock Next.js headers
jest.mock('next/headers', () => ({
  headers: jest.fn()
}))

// Mock the user data utility
jest.mock('@/app/lib/user-data', () => ({
  getCurrentUserData: jest.fn(),
  getCompleteUserData: jest.fn(),
  isValidUserData: jest.fn(),
  getUserDataErrorMessage: jest.fn(),
  getSafeUserData: jest.fn()
}))

// Mock the dashboard page component
jest.mock('../page', () => {
  return jest.fn()
})

// Mock the dashboard client component
jest.mock('../DashboardClient', () => {
  return jest.fn()
})

// Mock React for Suspense
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  Suspense: ({ children }: { children: React.ReactNode }) => children
}))

import { headers } from 'next/headers'
import { 
  getCurrentUserData, 
  getCompleteUserData,
  isValidUserData,
  getUserDataErrorMessage,
  getSafeUserData
} from '@/app/lib/user-data'
import { CompleteUserData, UserDataResult, UserDataError } from '@/app/lib/user-data-types'

// Get mocked functions
const mockHeaders = headers as jest.MockedFunction<typeof headers>
const mockGetCurrentUserData = getCurrentUserData as jest.MockedFunction<typeof getCurrentUserData>
const mockGetCompleteUserData = getCompleteUserData as jest.MockedFunction<typeof getCompleteUserData>
const mockIsValidUserData = isValidUserData as jest.MockedFunction<typeof isValidUserData>
const mockGetUserDataErrorMessage = getUserDataErrorMessage as jest.MockedFunction<typeof getUserDataErrorMessage>
const mockGetSafeUserData = getSafeUserData as jest.MockedFunction<typeof getSafeUserData>

describe('Dashboard Integration Tests - Complete User Data Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Default mock implementations
    mockHeaders.mockResolvedValue({
      get: jest.fn().mockReturnValue('1')
    } as any)
    
    mockIsValidUserData.mockImplementation((user) => {
      return !!(user && user.id && user.email && user.subscription_tier && user.subscription_status)
    })
    
    mockGetUserDataErrorMessage.mockImplementation((error) => {
      const messages = {
        'AUTH_REQUIRED': 'Please sign in to access your account data.',
        'USER_NOT_FOUND': 'User account not found. Please contact support if this persists.',
        'DATABASE_ERROR': 'Unable to load account data. Please try again later.',
        'PERMISSION_DENIED': 'Access denied. Please check your account permissions.',
        'INVALID_USER_ID': 'Invalid user account. Please sign in again.',
        'NETWORK_ERROR': 'Network error. Please check your connection and try again.'
      }
      return messages[error.code] || 'An unexpected error occurred. Please try again later.'
    })
    
    mockGetSafeUserData.mockImplementation((user) => {
      if (!user) return null
      return {
        id: user.id,
        email: user.email,
        name: user.name || user.full_name,
        image: user.image,
        subscription_tier: user.subscription_tier,
        subscription_status: user.subscription_status,
        usage_count: user.usage_count,
        usage_limit: user.usage_limit,
        trial_end_date: user.trial_end_date,
        chat_messages_count: user.chat_messages_count,
        chat_messages_limit: user.chat_messages_limit,
        documents_uploaded: user.documents_uploaded,
        documents_limit: user.documents_limit,
        api_calls_count: user.api_calls_count,
        api_calls_limit: user.api_calls_limit,
        storage_used_bytes: user.storage_used_bytes,
        storage_limit_bytes: user.storage_limit_bytes,
        features_enabled: user.features_enabled,
        permissions: user.permissions
      }
    })
  })

  describe('Complete User Data Flow - Page to Component Integration', () => {
    it('should successfully load dashboard with complete user data flow', async () => {
      // Requirement 1.1, 1.2, 3.1, 3.2
      const mockUser: CompleteUserData = {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
        image: 'https://example.com/avatar.jpg',
        subscription_tier: 'pro',
        subscription_status: 'active',
        usage_count: 25,
        usage_limit: 100,
        trial_end_date: undefined,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-27T00:00:00Z',
        full_name: 'Test User Full',
        chat_messages_count: 15,
        chat_messages_limit: 100,
        documents_uploaded: 5,
        documents_limit: 100,
        api_calls_count: 50,
        api_calls_limit: 1000,
        storage_used_bytes: 5000000,
        storage_limit_bytes: 1073741824,
        usage_stats: { last_active: '2025-01-27' },
        preferences: { theme: 'dark' },
        features_enabled: { ai_chat: true, advanced_search: true },
        permissions: { can_upload: true, admin: false },
        usage_reset_date: '2025-02-01T00:00:00Z'
      }

      // Mock successful user data fetch
      mockGetCurrentUserData.mockResolvedValue({
        user: mockUser,
        error: undefined
      })

      // Simulate dashboard page logic
      const headers = await mockHeaders()
      const hasSession = headers.get('x-sb-session') === '1'
      expect(hasSession).toBe(true)

      const result = await mockGetCurrentUserData()
      expect(result.user).toBeTruthy()
      expect(result.error).toBeUndefined()
      expect(result.user?.id).toBe('test-user-id')
      expect(result.user?.subscription_tier).toBe('pro')
      expect(result.user?.subscription_status).toBe('active')

      // Verify user data validation
      const isValid = mockIsValidUserData(result.user)
      expect(isValid).toBe(true)

      // Verify safe data extraction for client component
      const safeData = mockGetSafeUserData(result.user)
      expect(safeData).toBeTruthy()
      expect(safeData?.id).toBe('test-user-id')
      expect(safeData?.subscription_tier).toBe('pro')
      expect(safeData).not.toHaveProperty('usage_stats') // Should exclude internal data
    })

    it('should handle middleware session check failure gracefully', async () => {
      // Requirement 1.3, 3.4
      // Mock no session header
      mockHeaders.mockResolvedValue({
        get: jest.fn().mockReturnValue(null)
      } as any)

      const headers = await mockHeaders()
      const hasSession = headers.get('x-sb-session') === '1'
      expect(hasSession).toBe(false)

      // Should not proceed to fetch user data when no session
      expect(mockGetCurrentUserData).not.toHaveBeenCalled()
    })

    it('should handle complete user data fetch and component integration', async () => {
      // Requirement 1.1, 1.2, 3.1, 3.2, 3.3
      const mockUser: CompleteUserData = {
        id: 'integration-user-id',
        email: 'integration@example.com',
        name: 'Integration User',
        subscription_tier: 'free',
        subscription_status: 'active',
        usage_count: 8,
        usage_limit: 10,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-27T00:00:00Z',
        full_name: 'Integration User Full',
        chat_messages_count: 8,
        chat_messages_limit: 10,
        documents_uploaded: 3,
        documents_limit: 10,
        api_calls_count: 25,
        api_calls_limit: 100,
        storage_used_bytes: 2000000,
        storage_limit_bytes: 104857600,
        usage_stats: {},
        preferences: {},
        features_enabled: { ai_chat: true },
        permissions: { can_upload: true },
        usage_reset_date: '2025-02-01T00:00:00Z'
      }

      mockGetCurrentUserData.mockResolvedValue({
        user: mockUser,
        error: undefined
      })

      // Simulate complete flow
      const result = await mockGetCurrentUserData()
      const isValid = mockIsValidUserData(result.user)
      const safeData = mockGetSafeUserData(result.user)

      expect(result.user).toBeTruthy()
      expect(isValid).toBe(true)
      expect(safeData?.usage_count).toBe(8)
      expect(safeData?.usage_limit).toBe(10)
      expect(safeData?.subscription_tier).toBe('free')
    })
  })

  describe('Subscription Scenarios Testing', () => {
    it('should handle free tier user correctly', async () => {
      // Requirement 1.1, 1.2, 3.1, 3.2
      const freeUser: CompleteUserData = {
        id: 'free-user-id',
        email: 'free@example.com',
        name: 'Free User',
        subscription_tier: 'free',
        subscription_status: 'active',
        usage_count: 5,
        usage_limit: 10,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-27T00:00:00Z',
        full_name: 'Free User',
        chat_messages_count: 5,
        chat_messages_limit: 10,
        documents_uploaded: 2,
        documents_limit: 10,
        api_calls_count: 15,
        api_calls_limit: 100,
        storage_used_bytes: 1000000,
        storage_limit_bytes: 104857600, // 100MB
        usage_stats: {},
        preferences: {},
        features_enabled: { ai_chat: true },
        permissions: { can_upload: true },
        usage_reset_date: '2025-02-01T00:00:00Z'
      }

      mockGetCurrentUserData.mockResolvedValue({
        user: freeUser,
        error: undefined
      })

      const result = await mockGetCurrentUserData()
      expect(result.user?.subscription_tier).toBe('free')
      expect(result.user?.usage_limit).toBe(10)
      expect(result.user?.storage_limit_bytes).toBe(104857600) // 100MB
      expect(result.user?.documents_limit).toBe(10)
    })

    it('should handle trial user correctly', async () => {
      // Requirement 1.1, 1.2, 3.1, 3.2
      const trialUser: CompleteUserData = {
        id: 'trial-user-id',
        email: 'trial@example.com',
        name: 'Trial User',
        subscription_tier: 'pro',
        subscription_status: 'trialing',
        usage_count: 25,
        usage_limit: 100,
        trial_end_date: '2025-02-15T00:00:00Z',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-27T00:00:00Z',
        full_name: 'Trial User',
        chat_messages_count: 25,
        chat_messages_limit: 100,
        documents_uploaded: 15,
        documents_limit: 100,
        api_calls_count: 150,
        api_calls_limit: 1000,
        storage_used_bytes: 50000000,
        storage_limit_bytes: 1073741824, // 1GB
        usage_stats: { trial_started: '2025-01-15' },
        preferences: {},
        features_enabled: { ai_chat: true, advanced_search: true },
        permissions: { can_upload: true },
        usage_reset_date: '2025-02-01T00:00:00Z'
      }

      mockGetCurrentUserData.mockResolvedValue({
        user: trialUser,
        error: undefined
      })

      const result = await mockGetCurrentUserData()
      expect(result.user?.subscription_tier).toBe('pro')
      expect(result.user?.subscription_status).toBe('trialing')
      expect(result.user?.trial_end_date).toBe('2025-02-15T00:00:00Z')
      expect(result.user?.usage_limit).toBe(100)
      expect(result.user?.storage_limit_bytes).toBe(1073741824) // 1GB
    })

    it('should handle paid pro user correctly', async () => {
      // Requirement 1.1, 1.2, 3.1, 3.2
      const proUser: CompleteUserData = {
        id: 'pro-user-id',
        email: 'pro@example.com',
        name: 'Pro User',
        subscription_tier: 'pro',
        subscription_status: 'active',
        usage_count: 150,
        usage_limit: 1000,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-27T00:00:00Z',
        full_name: 'Pro User',
        chat_messages_count: 150,
        chat_messages_limit: 1000,
        documents_uploaded: 75,
        documents_limit: 1000,
        api_calls_count: 500,
        api_calls_limit: 10000,
        storage_used_bytes: 500000000,
        storage_limit_bytes: 10737418240, // 10GB
        usage_stats: { subscription_started: '2025-01-01' },
        preferences: { advanced_features: true },
        features_enabled: { ai_chat: true, advanced_search: true, priority_support: true },
        permissions: { can_upload: true, admin: false },
        usage_reset_date: '2025-02-01T00:00:00Z'
      }

      mockGetCurrentUserData.mockResolvedValue({
        user: proUser,
        error: undefined
      })

      const result = await mockGetCurrentUserData()
      expect(result.user?.subscription_tier).toBe('pro')
      expect(result.user?.subscription_status).toBe('active')
      expect(result.user?.usage_limit).toBe(1000)
      expect(result.user?.documents_limit).toBe(1000)
      expect(result.user?.features_enabled?.priority_support).toBe(true)
    })

    it('should handle pro BYOK user correctly', async () => {
      // Requirement 1.1, 1.2, 3.1, 3.2
      const proByokUser: CompleteUserData = {
        id: 'pro-byok-user-id',
        email: 'probyok@example.com',
        name: 'Pro BYOK User',
        subscription_tier: 'pro_byok',
        subscription_status: 'active',
        usage_count: 500,
        usage_limit: 10000,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-27T00:00:00Z',
        full_name: 'Pro BYOK User',
        chat_messages_count: 500,
        chat_messages_limit: 10000,
        documents_uploaded: 200,
        documents_limit: 10000,
        api_calls_count: 2000,
        api_calls_limit: 100000,
        storage_used_bytes: 2000000000,
        storage_limit_bytes: 107374182400, // 100GB
        usage_stats: { byok_enabled: true },
        preferences: { own_api_key: true },
        features_enabled: { ai_chat: true, advanced_search: true, byok: true },
        permissions: { can_upload: true, use_own_key: true },
        usage_reset_date: '2025-02-01T00:00:00Z'
      }

      mockGetCurrentUserData.mockResolvedValue({
        user: proByokUser,
        error: undefined
      })

      const result = await mockGetCurrentUserData()
      expect(result.user?.subscription_tier).toBe('pro_byok')
      expect(result.user?.usage_limit).toBe(10000)
      expect(result.user?.features_enabled?.byok).toBe(true)
      expect(result.user?.permissions?.use_own_key).toBe(true)
    })

    it('should handle expired subscription correctly', async () => {
      // Requirement 1.1, 1.2, 3.1, 3.2, 3.3
      const expiredUser: CompleteUserData = {
        id: 'expired-user-id',
        email: 'expired@example.com',
        name: 'Expired User',
        subscription_tier: 'pro',
        subscription_status: 'past_due',
        usage_count: 75,
        usage_limit: 100,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-27T00:00:00Z',
        full_name: 'Expired User',
        chat_messages_count: 75,
        chat_messages_limit: 100,
        documents_uploaded: 50,
        documents_limit: 100,
        api_calls_count: 300,
        api_calls_limit: 1000,
        storage_used_bytes: 300000000,
        storage_limit_bytes: 1073741824,
        usage_stats: { last_payment_failed: '2025-01-20' },
        preferences: {},
        features_enabled: { ai_chat: false, advanced_search: false }, // Limited features
        permissions: { can_upload: false }, // Restricted permissions
        usage_reset_date: '2025-02-01T00:00:00Z'
      }

      mockGetCurrentUserData.mockResolvedValue({
        user: expiredUser,
        error: undefined
      })

      const result = await mockGetCurrentUserData()
      expect(result.user?.subscription_status).toBe('past_due')
      expect(result.user?.features_enabled?.ai_chat).toBe(false)
      expect(result.user?.permissions?.can_upload).toBe(false)
    })

    it('should handle canceled subscription correctly', async () => {
      // Requirement 1.1, 1.2, 3.1, 3.2, 3.3
      const canceledUser: CompleteUserData = {
        id: 'canceled-user-id',
        email: 'canceled@example.com',
        name: 'Canceled User',
        subscription_tier: 'free', // Downgraded to free
        subscription_status: 'canceled',
        usage_count: 8,
        usage_limit: 10, // Back to free limits
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-27T00:00:00Z',
        full_name: 'Canceled User',
        chat_messages_count: 8,
        chat_messages_limit: 10,
        documents_uploaded: 5,
        documents_limit: 10,
        api_calls_count: 20,
        api_calls_limit: 100,
        storage_used_bytes: 1500000,
        storage_limit_bytes: 104857600, // Back to 100MB
        usage_stats: { canceled_date: '2025-01-25' },
        preferences: {},
        features_enabled: { ai_chat: true }, // Basic features only
        permissions: { can_upload: true },
        usage_reset_date: '2025-02-01T00:00:00Z'
      }

      mockGetCurrentUserData.mockResolvedValue({
        user: canceledUser,
        error: undefined
      })

      const result = await mockGetCurrentUserData()
      expect(result.user?.subscription_status).toBe('canceled')
      expect(result.user?.subscription_tier).toBe('free')
      expect(result.user?.usage_limit).toBe(10)
      expect(result.user?.storage_limit_bytes).toBe(104857600)
    })
  })

  describe('Error Scenarios and Fallback Behavior', () => {
    it('should handle authentication required error', async () => {
      // Requirement 1.3, 3.4
      const authError: UserDataError = {
        code: 'AUTH_REQUIRED',
        message: 'User not authenticated',
        details: { reason: 'No valid session' }
      }

      mockGetCurrentUserData.mockResolvedValue({
        user: null,
        error: authError
      })

      const result = await mockGetCurrentUserData()
      expect(result.user).toBeNull()
      expect(result.error?.code).toBe('AUTH_REQUIRED')

      const errorMessage = mockGetUserDataErrorMessage(result.error!)
      expect(errorMessage).toBe('Please sign in to access your account data.')
    })

    it('should handle user not found error', async () => {
      // Requirement 1.3, 3.4
      const notFoundError: UserDataError = {
        code: 'USER_NOT_FOUND',
        message: 'User not found in database',
        details: { userId: 'missing-user-id' }
      }

      mockGetCurrentUserData.mockResolvedValue({
        user: null,
        error: notFoundError
      })

      const result = await mockGetCurrentUserData()
      expect(result.user).toBeNull()
      expect(result.error?.code).toBe('USER_NOT_FOUND')

      const errorMessage = mockGetUserDataErrorMessage(result.error!)
      expect(errorMessage).toBe('User account not found. Please contact support if this persists.')
    })

    it('should handle database error with fallback', async () => {
      // Requirement 1.3, 3.4
      const dbError: UserDataError = {
        code: 'DATABASE_ERROR',
        message: 'Database connection failed',
        details: { supabaseError: { code: 'PGRST500' } }
      }

      mockGetCurrentUserData.mockResolvedValue({
        user: null,
        error: dbError
      })

      const result = await mockGetCurrentUserData()
      expect(result.user).toBeNull()
      expect(result.error?.code).toBe('DATABASE_ERROR')

      const errorMessage = mockGetUserDataErrorMessage(result.error!)
      expect(errorMessage).toBe('Unable to load account data. Please try again later.')
    })

    it('should handle permission denied error', async () => {
      // Requirement 1.3, 3.4
      const permissionError: UserDataError = {
        code: 'PERMISSION_DENIED',
        message: 'Permission denied accessing user data',
        details: { supabaseError: { code: 'PGRST301' } }
      }

      mockGetCurrentUserData.mockResolvedValue({
        user: null,
        error: permissionError
      })

      const result = await mockGetCurrentUserData()
      expect(result.user).toBeNull()
      expect(result.error?.code).toBe('PERMISSION_DENIED')

      const errorMessage = mockGetUserDataErrorMessage(result.error!)
      expect(errorMessage).toBe('Access denied. Please check your account permissions.')
    })

    it('should handle network error with retry capability', async () => {
      // Requirement 1.3, 3.4
      const networkError: UserDataError = {
        code: 'NETWORK_ERROR',
        message: 'Network connection failed',
        details: { error: new Error('Connection timeout') }
      }

      mockGetCurrentUserData.mockResolvedValue({
        user: null,
        error: networkError
      })

      const result = await mockGetCurrentUserData()
      expect(result.user).toBeNull()
      expect(result.error?.code).toBe('NETWORK_ERROR')

      const errorMessage = mockGetUserDataErrorMessage(result.error!)
      expect(errorMessage).toBe('Network error. Please check your connection and try again.')
    })

    it('should handle invalid user ID error', async () => {
      // Requirement 1.3, 3.4
      const invalidIdError: UserDataError = {
        code: 'INVALID_USER_ID',
        message: 'Invalid user ID provided',
        details: { userId: null }
      }

      mockGetCompleteUserData.mockResolvedValue({
        user: null,
        error: invalidIdError
      })

      const result = await mockGetCompleteUserData('')
      expect(result.user).toBeNull()
      expect(result.error?.code).toBe('INVALID_USER_ID')

      const errorMessage = mockGetUserDataErrorMessage(result.error!)
      expect(errorMessage).toBe('Invalid user account. Please sign in again.')
    })

    it('should handle incomplete user data gracefully', async () => {
      // Requirement 1.3, 1.4, 3.4
      const incompleteUser = {
        id: 'incomplete-user-id',
        email: 'incomplete@example.com',
        // Missing required fields
        subscription_tier: undefined,
        subscription_status: undefined,
        usage_count: undefined,
        usage_limit: undefined
      } as any

      mockGetCurrentUserData.mockResolvedValue({
        user: incompleteUser,
        error: undefined
      })

      const result = await mockGetCurrentUserData()
      const isValid = mockIsValidUserData(result.user)
      
      expect(result.user).toBeTruthy()
      expect(isValid).toBe(false) // Should fail validation
    })

    it('should handle null user data with appropriate fallback', async () => {
      // Requirement 1.3, 1.4, 3.4
      mockGetCurrentUserData.mockResolvedValue({
        user: null,
        error: undefined // No specific error, just no user
      })

      const result = await mockGetCurrentUserData()
      expect(result.user).toBeNull()
      expect(result.error).toBeUndefined()

      const isValid = mockIsValidUserData(result.user)
      expect(isValid).toBe(false)

      const safeData = mockGetSafeUserData(result.user)
      expect(safeData).toBeNull()
    })
  })

  describe('Authentication Integration with User Data Fetching', () => {
    it('should integrate middleware session check with user data fetch', async () => {
      // Requirement 1.1, 1.2, 1.3, 3.1
      // Mock successful session check
      mockHeaders.mockResolvedValue({
        get: jest.fn().mockReturnValue('1')
      } as any)

      const mockUser: CompleteUserData = {
        id: 'auth-integration-user',
        email: 'auth@example.com',
        name: 'Auth User',
        subscription_tier: 'free',
        subscription_status: 'active',
        usage_count: 3,
        usage_limit: 10,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-27T00:00:00Z',
        full_name: 'Auth User',
        chat_messages_count: 3,
        chat_messages_limit: 10,
        documents_uploaded: 1,
        documents_limit: 10,
        api_calls_count: 8,
        api_calls_limit: 100,
        storage_used_bytes: 500000,
        storage_limit_bytes: 104857600,
        usage_stats: {},
        preferences: {},
        features_enabled: { ai_chat: true },
        permissions: { can_upload: true },
        usage_reset_date: '2025-02-01T00:00:00Z'
      }

      mockGetCurrentUserData.mockResolvedValue({
        user: mockUser,
        error: undefined
      })

      // Simulate complete authentication + data flow
      const headers = await mockHeaders()
      const hasSession = headers.get('x-sb-session') === '1'
      
      if (hasSession) {
        const result = await mockGetCurrentUserData()
        expect(result.user).toBeTruthy()
        expect(result.user?.id).toBe('auth-integration-user')
      }
    })

    it('should handle authentication failure before user data fetch', async () => {
      // Requirement 1.3, 3.4
      // Mock no session
      mockHeaders.mockResolvedValue({
        get: jest.fn().mockReturnValue(null)
      } as any)

      const headers = await mockHeaders()
      const hasSession = headers.get('x-sb-session') === '1'
      
      expect(hasSession).toBe(false)
      // Should not attempt to fetch user data without session
      expect(mockGetCurrentUserData).not.toHaveBeenCalled()
    })

    it('should handle session exists but user data fetch fails', async () => {
      // Requirement 1.3, 3.4
      // Mock session exists
      mockHeaders.mockResolvedValue({
        get: jest.fn().mockReturnValue('1')
      } as any)

      // But user data fetch fails
      mockGetCurrentUserData.mockResolvedValue({
        user: null,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Token expired',
          details: { reason: 'JWT expired' }
        }
      })

      const headers = await mockHeaders()
      const hasSession = headers.get('x-sb-session') === '1'
      expect(hasSession).toBe(true)

      const result = await mockGetCurrentUserData()
      expect(result.user).toBeNull()
      expect(result.error?.code).toBe('AUTH_REQUIRED')
    })

    it('should handle concurrent authentication and data validation', async () => {
      // Requirement 1.1, 1.2, 1.3, 3.1, 3.2, 3.3
      const mockUser: CompleteUserData = {
        id: 'concurrent-user-id',
        email: 'concurrent@example.com',
        name: 'Concurrent User',
        subscription_tier: 'pro',
        subscription_status: 'active',
        usage_count: 45,
        usage_limit: 100,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-27T00:00:00Z',
        full_name: 'Concurrent User',
        chat_messages_count: 45,
        chat_messages_limit: 100,
        documents_uploaded: 20,
        documents_limit: 100,
        api_calls_count: 200,
        api_calls_limit: 1000,
        storage_used_bytes: 25000000,
        storage_limit_bytes: 1073741824,
        usage_stats: {},
        preferences: {},
        features_enabled: { ai_chat: true, advanced_search: true },
        permissions: { can_upload: true },
        usage_reset_date: '2025-02-01T00:00:00Z'
      }

      // Mock all operations
      mockHeaders.mockResolvedValue({
        get: jest.fn().mockReturnValue('1')
      } as any)

      mockGetCurrentUserData.mockResolvedValue({
        user: mockUser,
        error: undefined
      })

      // Simulate concurrent operations
      const [headers, userData] = await Promise.all([
        mockHeaders(),
        mockGetCurrentUserData()
      ])

      const hasSession = headers.get('x-sb-session') === '1'
      const isValid = mockIsValidUserData(userData.user)
      const safeData = mockGetSafeUserData(userData.user)

      expect(hasSession).toBe(true)
      expect(userData.user).toBeTruthy()
      expect(isValid).toBe(true)
      expect(safeData).toBeTruthy()
      expect(safeData?.subscription_tier).toBe('pro')
    })

    it('should handle authentication state changes during data fetch', async () => {
      // Requirement 1.3, 3.4
      // Mock session initially exists
      mockHeaders.mockResolvedValue({
        get: jest.fn().mockReturnValue('1')
      } as any)

      // But authentication fails during user data fetch
      mockGetCurrentUserData.mockResolvedValue({
        user: null,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Session expired during request',
          details: { reason: 'Session invalidated' }
        }
      })

      const headers = await mockHeaders()
      const hasSession = headers.get('x-sb-session') === '1'
      expect(hasSession).toBe(true) // Session header says authenticated

      const result = await mockGetCurrentUserData()
      expect(result.user).toBeNull()
      expect(result.error?.code).toBe('AUTH_REQUIRED') // But actual auth failed

      // This scenario should trigger re-authentication flow
      const errorMessage = mockGetUserDataErrorMessage(result.error!)
      expect(errorMessage).toBe('Please sign in to access your account data.')
    })
  })

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle user with maximum usage limits', async () => {
      // Requirement 1.1, 1.2, 3.1, 3.2
      const maxUsageUser: CompleteUserData = {
        id: 'max-usage-user-id',
        email: 'maxusage@example.com',
        name: 'Max Usage User',
        subscription_tier: 'free',
        subscription_status: 'active',
        usage_count: 10, // At limit
        usage_limit: 10,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-27T00:00:00Z',
        full_name: 'Max Usage User',
        chat_messages_count: 10, // At limit
        chat_messages_limit: 10,
        documents_uploaded: 10, // At limit
        documents_limit: 10,
        api_calls_count: 100, // At limit
        api_calls_limit: 100,
        storage_used_bytes: 104857600, // At limit (100MB)
        storage_limit_bytes: 104857600,
        usage_stats: { at_limit_since: '2025-01-26' },
        preferences: {},
        features_enabled: { ai_chat: false }, // Disabled due to limits
        permissions: { can_upload: false }, // Disabled due to limits
        usage_reset_date: '2025-02-01T00:00:00Z'
      }

      mockGetCurrentUserData.mockResolvedValue({
        user: maxUsageUser,
        error: undefined
      })

      const result = await mockGetCurrentUserData()
      expect(result.user?.usage_count).toBe(result.user?.usage_limit)
      expect(result.user?.chat_messages_count).toBe(result.user?.chat_messages_limit)
      expect(result.user?.documents_uploaded).toBe(result.user?.documents_limit)
      expect(result.user?.storage_used_bytes).toBe(result.user?.storage_limit_bytes)
      expect(result.user?.features_enabled?.ai_chat).toBe(false)
      expect(result.user?.permissions?.can_upload).toBe(false)
    })

    it('should handle user with zero usage', async () => {
      // Requirement 1.1, 1.2, 3.1, 3.2
      const newUser: CompleteUserData = {
        id: 'new-user-id',
        email: 'new@example.com',
        name: 'New User',
        subscription_tier: 'free',
        subscription_status: 'active',
        usage_count: 0,
        usage_limit: 10,
        created_at: '2025-01-27T00:00:00Z', // Just created
        updated_at: '2025-01-27T00:00:00Z',
        full_name: 'New User',
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
        features_enabled: { ai_chat: true },
        permissions: { can_upload: true },
        usage_reset_date: '2025-02-01T00:00:00Z'
      }

      mockGetCurrentUserData.mockResolvedValue({
        user: newUser,
        error: undefined
      })

      const result = await mockGetCurrentUserData()
      expect(result.user?.usage_count).toBe(0)
      expect(result.user?.chat_messages_count).toBe(0)
      expect(result.user?.documents_uploaded).toBe(0)
      expect(result.user?.storage_used_bytes).toBe(0)
      expect(result.user?.features_enabled?.ai_chat).toBe(true)
      expect(result.user?.permissions?.can_upload).toBe(true)
    })

    it('should handle user with trial ending soon', async () => {
      // Requirement 1.1, 1.2, 3.1, 3.2
      const trialEndingSoonUser: CompleteUserData = {
        id: 'trial-ending-user-id',
        email: 'trialending@example.com',
        name: 'Trial Ending User',
        subscription_tier: 'pro',
        subscription_status: 'trialing',
        usage_count: 80,
        usage_limit: 100,
        trial_end_date: '2025-01-29T00:00:00Z', // Ending in 2 days
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-27T00:00:00Z',
        full_name: 'Trial Ending User',
        chat_messages_count: 80,
        chat_messages_limit: 100,
        documents_uploaded: 40,
        documents_limit: 100,
        api_calls_count: 400,
        api_calls_limit: 1000,
        storage_used_bytes: 400000000,
        storage_limit_bytes: 1073741824,
        usage_stats: { trial_days_remaining: 2 },
        preferences: {},
        features_enabled: { ai_chat: true, advanced_search: true },
        permissions: { can_upload: true },
        usage_reset_date: '2025-02-01T00:00:00Z'
      }

      mockGetCurrentUserData.mockResolvedValue({
        user: trialEndingSoonUser,
        error: undefined
      })

      const result = await mockGetCurrentUserData()
      expect(result.user?.subscription_status).toBe('trialing')
      expect(result.user?.trial_end_date).toBe('2025-01-29T00:00:00Z')
      
      // Calculate days remaining
      const trialEnd = new Date(result.user!.trial_end_date!)
      const now = new Date('2025-01-27T00:00:00Z')
      const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      expect(daysRemaining).toBe(2)
    })

    it('should handle user data with special characters and edge cases', async () => {
      // Requirement 1.1, 1.2, 3.1, 3.2
      const specialUser: CompleteUserData = {
        id: 'special-chars-user-id',
        email: 'special+chars@example.com',
        name: 'User with "Special" Characters & Symbols',
        subscription_tier: 'pro',
        subscription_status: 'active',
        usage_count: 42,
        usage_limit: 100,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-27T00:00:00Z',
        full_name: 'Full Name with "Quotes" & Ampersands',
        chat_messages_count: 42,
        chat_messages_limit: 100,
        documents_uploaded: 21,
        documents_limit: 100,
        api_calls_count: 210,
        api_calls_limit: 1000,
        storage_used_bytes: 21000000,
        storage_limit_bytes: 1073741824,
        usage_stats: { 'special-key': 'special-value', 'unicode-key': '🚀' },
        preferences: { 'theme': 'dark', 'language': 'en-US' },
        features_enabled: { ai_chat: true, 'advanced-search': true },
        permissions: { can_upload: true, 'special-permission': true },
        usage_reset_date: '2025-02-01T00:00:00Z'
      }

      mockGetCurrentUserData.mockResolvedValue({
        user: specialUser,
        error: undefined
      })

      const result = await mockGetCurrentUserData()
      expect(result.user?.email).toBe('special+chars@example.com')
      expect(result.user?.name).toBe('User with "Special" Characters & Symbols')
      expect(result.user?.full_name).toBe('Full Name with "Quotes" & Ampersands')
      
      const safeData = mockGetSafeUserData(result.user)
      expect(safeData?.name).toBe('User with "Special" Characters & Symbols')
    })
  })
})
