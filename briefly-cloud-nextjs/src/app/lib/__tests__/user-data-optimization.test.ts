/**
 * @jest-environment node
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

// Import after mocking
import {
  getCompleteUserData,
  getCurrentUserData,
  clearUserDataCache,
  clearAllUserDataCache,
  getUserDataCacheStats,
  DATABASE_INDEXING_RECOMMENDATIONS,
  getDatabaseOptimizationRecommendations
} from '../user-data'

// Get the mocked modules
const { supabaseAdmin } = require('../supabase-admin')
const { createServerClientReadOnly } = require('../auth/supabase-server-readonly')

describe('User Data Optimization and Monitoring', () => {
  const mockUserId = 'test-user-id'
  const mockUserData = {
    id: mockUserId,
    email: 'test@example.com',
    name: 'Test User',
    subscription_tier: 'pro',
    subscription_status: 'active',
    usage_count: 5,
    usage_limit: 100,
    chat_messages_count: 10,
    chat_messages_limit: 1000,
    documents_uploaded: 3,
    documents_limit: 100,
    api_calls_count: 50,
    api_calls_limit: 10000,
    storage_used_bytes: 1024000,
    storage_limit_bytes: 1073741824,
    usage_stats: {},
    preferences: {},
    features_enabled: {},
    permissions: {},
    usage_reset_date: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  beforeEach(() => {
    jest.clearAllMocks()
    clearAllUserDataCache()
    
    // Mock console methods to avoid noise in tests
    jest.spyOn(console, 'info').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('Query Performance Monitoring', () => {
    it('should log successful database queries with performance metrics', async () => {
      const consoleSpy = jest.spyOn(console, 'info')
      
      // Mock successful database response
      supabaseAdmin.from().select().eq().single.mockResolvedValue({
        data: mockUserData,
        error: null
      })

      const result = await getCompleteUserData(mockUserId)

      expect(result.user).toBeTruthy()
      expect(result.error).toBeUndefined()
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[USER_DATA_QUERY]'),
        expect.objectContaining({
          duration: expect.stringMatching(/\d+ms/),
          success: true,
          userId: mockUserId
        })
      )
    })

    it('should log slow queries with warning level', async () => {
      const consoleSpy = jest.spyOn(console, 'warn')
      
      // Mock slow database response
      supabaseAdmin.from().select().eq().single.mockImplementation(
        () => new Promise(resolve => {
          setTimeout(() => resolve({
            data: mockUserData,
            error: null
          }), 600) // Simulate 600ms query (slow)
        })
      )

      await getCompleteUserData(mockUserId)

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SLOW_QUERY]'),
        expect.objectContaining({
          userId: mockUserId
        })
      )
    })

    it('should log failed queries with error details', async () => {
      const consoleSpy = jest.spyOn(console, 'info')
      const mockError = new Error('Database connection failed')
      
      supabaseAdmin.from().select().eq().single.mockRejectedValue(mockError)

      const result = await getCompleteUserData(mockUserId)

      expect(result.user).toBeNull()
      expect(result.error).toBeTruthy()
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[USER_DATA_QUERY]'),
        expect.objectContaining({
          success: false,
          error: mockError.message,
          userId: mockUserId
        })
      )
    })
  })

  describe('Database Connection Retry Logic', () => {
    it('should retry failed database connections', async () => {
      const consoleSpy = jest.spyOn(console, 'warn')
      
      // Mock first call to fail, second to succeed
      supabaseAdmin.from().select().eq().single
        .mockRejectedValueOnce(new Error('Connection timeout'))
        .mockResolvedValueOnce({
          data: mockUserData,
          error: null
        })

      const result = await getCompleteUserData(mockUserId)

      expect(result.user).toBeTruthy()
      expect(result.error).toBeUndefined()
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DB_RETRY]'),
        expect.objectContaining({
          userId: mockUserId,
          attempt: 1
        })
      )
    })

    it('should not retry non-retryable errors', async () => {
      const mockError = new Error('Permission denied')
      supabaseAdmin.from().select().eq().single.mockRejectedValue(mockError)

      const result = await getCompleteUserData(mockUserId)

      expect(result.user).toBeNull()
      expect(result.error?.code).toBe('NETWORK_ERROR')
      // Should not see retry logs for permission errors
      expect(console.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('[DB_RETRY]'),
        expect.any(Object)
      )
    })

    it('should exhaust retries and log failure', async () => {
      const consoleSpy = jest.spyOn(console, 'error')
      const mockError = new Error('Network error')
      
      supabaseAdmin.from().select().eq().single.mockRejectedValue(mockError)

      const result = await getCompleteUserData(mockUserId)

      expect(result.user).toBeNull()
      expect(result.error).toBeTruthy()
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DB_RETRY_EXHAUSTED]'),
        expect.objectContaining({
          userId: mockUserId,
          attempts: 3
        })
      )
    })
  })

  describe('Caching System', () => {
    it('should cache user data after successful query', async () => {
      supabaseAdmin.from().select().eq().single.mockResolvedValue({
        data: mockUserData,
        error: null
      })

      // First call should hit database
      const result1 = await getCompleteUserData(mockUserId)
      expect(result1.user).toBeTruthy()

      // Second call should hit cache
      const result2 = await getCompleteUserData(mockUserId)
      expect(result2.user).toBeTruthy()

      // Database should only be called once
      expect(supabaseAdmin.from().select().eq().single).toHaveBeenCalledTimes(1)
    })

    it('should bypass cache when requested', async () => {
      supabaseAdmin.from().select().eq().single.mockResolvedValue({
        data: mockUserData,
        error: null
      })

      // First call to populate cache
      await getCompleteUserData(mockUserId)
      
      // Second call with bypass cache should hit database again
      await getCompleteUserData(mockUserId, true)

      expect(supabaseAdmin.from().select().eq().single).toHaveBeenCalledTimes(2)
    })

    it('should log cache hits', async () => {
      const consoleSpy = jest.spyOn(console, 'info')
      
      supabaseAdmin.from().select().eq().single.mockResolvedValue({
        data: mockUserData,
        error: null
      })

      // First call to populate cache
      await getCompleteUserData(mockUserId)
      
      // Second call should hit cache
      await getCompleteUserData(mockUserId)

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[CACHE HIT]'),
        expect.objectContaining({
          userId: mockUserId,
          cacheHit: true
        })
      )
    })

    it('should clear specific user cache', () => {
      const consoleSpy = jest.spyOn(console, 'info')
      
      clearUserDataCache(mockUserId)
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[USER_DATA_CACHE] Cleared cache for user'),
        expect.stringContaining(mockUserId)
      )
    })

    it('should clear all cache', () => {
      const consoleSpy = jest.spyOn(console, 'info')
      
      clearAllUserDataCache()
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[USER_DATA_CACHE] Cleared all cached data')
      )
    })

    it('should provide cache statistics', async () => {
      supabaseAdmin.from().select().eq().single.mockResolvedValue({
        data: mockUserData,
        error: null
      })

      // Populate cache
      await getCompleteUserData(mockUserId)
      
      const stats = getUserDataCacheStats()
      
      expect(stats.size).toBe(1)
      expect(stats.entries).toHaveLength(1)
      expect(stats.entries[0].userId).toBe(mockUserId)
      expect(typeof stats.entries[0].age).toBe('number')
    })
  })

  describe('getCurrentUserData with Optimization', () => {
    it('should handle authentication with retry logic', async () => {
      const mockReadOnlyClient = createServerClientReadOnly()
      mockReadOnlyClient.auth.getUser
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce({
          data: { user: { id: mockUserId } },
          error: null
        })

      supabaseAdmin.from().select().eq().single.mockResolvedValue({
        data: mockUserData,
        error: null
      })

      const result = await getCurrentUserData()

      expect(result.user).toBeTruthy()
      expect(result.error).toBeUndefined()
    })

    it('should bypass cache when requested', async () => {
      const mockReadOnlyClient = createServerClientReadOnly()
      mockReadOnlyClient.auth.getUser.mockResolvedValue({
        data: { user: { id: mockUserId } },
        error: null
      })

      supabaseAdmin.from().select().eq().single.mockResolvedValue({
        data: mockUserData,
        error: null
      })

      // First call to populate cache
      await getCurrentUserData()
      
      // Second call with bypass cache
      await getCurrentUserData(true)

      expect(supabaseAdmin.from().select().eq().single).toHaveBeenCalledTimes(2)
    })
  })

  describe('Database Indexing Recommendations', () => {
    it('should provide comprehensive indexing recommendations', () => {
      expect(DATABASE_INDEXING_RECOMMENDATIONS).toHaveProperty('primary')
      expect(DATABASE_INDEXING_RECOMMENDATIONS).toHaveProperty('email')
      expect(DATABASE_INDEXING_RECOMMENDATIONS).toHaveProperty('subscription')
      expect(DATABASE_INDEXING_RECOMMENDATIONS).toHaveProperty('updated_at')
      expect(DATABASE_INDEXING_RECOMMENDATIONS).toHaveProperty('active_users')
      expect(DATABASE_INDEXING_RECOMMENDATIONS).toHaveProperty('usage_reset')

      // Verify SQL syntax
      expect(DATABASE_INDEXING_RECOMMENDATIONS.primary).toContain('CREATE UNIQUE INDEX')
      expect(DATABASE_INDEXING_RECOMMENDATIONS.email).toContain('CREATE INDEX')
      expect(DATABASE_INDEXING_RECOMMENDATIONS.subscription).toContain('subscription_tier, subscription_status')
    })

    it('should provide optimization recommendations', () => {
      const recommendations = getDatabaseOptimizationRecommendations()
      
      expect(recommendations).toHaveProperty('indexing')
      expect(recommendations).toHaveProperty('queryOptimizations')
      expect(recommendations).toHaveProperty('cacheRecommendations')
      
      expect(Array.isArray(recommendations.queryOptimizations)).toBe(true)
      expect(Array.isArray(recommendations.cacheRecommendations)).toBe(true)
      expect(recommendations.queryOptimizations.length).toBeGreaterThan(0)
      expect(recommendations.cacheRecommendations.length).toBeGreaterThan(0)
    })
  })

  describe('Error Handling with Monitoring', () => {
    it('should handle invalid user ID with performance logging', async () => {
      const result = await getCompleteUserData('')

      expect(result.user).toBeNull()
      expect(result.error?.code).toBe('INVALID_USER_ID')
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('[USER_DATA_QUERY]'),
        expect.objectContaining({
          success: false,
          error: 'Invalid user ID'
        })
      )
    })

    it('should handle database errors with proper logging', async () => {
      const mockError = { code: 'PGRST116', message: 'Not found' }
      supabaseAdmin.from().select().eq().single.mockResolvedValue({
        data: null,
        error: mockError
      })

      const result = await getCompleteUserData(mockUserId)

      expect(result.user).toBeNull()
      expect(result.error?.code).toBe('USER_NOT_FOUND')
    })
  })
})
