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

describe('User Data Optimization Features', () => {
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

  describe('Performance Monitoring', () => {
    it('should log query performance metrics', async () => {
      const consoleSpy = jest.spyOn(console, 'info')
      
      supabaseAdmin.from().select().eq().single.mockResolvedValue({
        data: mockUserData,
        error: null
      })

      await getCompleteUserData(mockUserId)

      // Should log performance metrics
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[USER_DATA_QUERY]'),
        expect.objectContaining({
          duration: expect.stringMatching(/\d+ms/),
          success: true,
          userId: mockUserId
        })
      )
    })

    it('should detect slow queries', async () => {
      const consoleSpy = jest.spyOn(console, 'warn')
      
      // Mock slow database response (600ms)
      supabaseAdmin.from().select().eq().single.mockImplementation(
        () => new Promise(resolve => {
          setTimeout(() => resolve({
            data: mockUserData,
            error: null
          }), 600)
        })
      )

      await getCompleteUserData(mockUserId)

      // Should log slow query warning
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SLOW_QUERY]'),
        expect.objectContaining({
          userId: mockUserId
        })
      )
    })
  })

  describe('Caching System', () => {
    it('should cache successful queries', async () => {
      supabaseAdmin.from().select().eq().single.mockResolvedValue({
        data: mockUserData,
        error: null
      })

      // First call should hit database
      const result1 = await getCompleteUserData(mockUserId)
      expect(result1.user).toBeTruthy()

      // Second call should hit cache (database should only be called once)
      const result2 = await getCompleteUserData(mockUserId)
      expect(result2.user).toBeTruthy()

      expect(supabaseAdmin.from().select().eq().single).toHaveBeenCalledTimes(1)
    })

    it('should bypass cache when requested', async () => {
      supabaseAdmin.from().select().eq().single.mockResolvedValue({
        data: mockUserData,
        error: null
      })

      // First call
      await getCompleteUserData(mockUserId)
      
      // Second call with bypass cache
      await getCompleteUserData(mockUserId, true)

      // Should call database twice
      expect(supabaseAdmin.from().select().eq().single).toHaveBeenCalledTimes(2)
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

    it('should clear cache', () => {
      clearUserDataCache(mockUserId)
      clearAllUserDataCache()
      
      const stats = getUserDataCacheStats()
      expect(stats.size).toBe(0)
    })
  })

  describe('Database Indexing Recommendations', () => {
    it('should provide indexing recommendations', () => {
      expect(DATABASE_INDEXING_RECOMMENDATIONS).toHaveProperty('primary')
      expect(DATABASE_INDEXING_RECOMMENDATIONS).toHaveProperty('email')
      expect(DATABASE_INDEXING_RECOMMENDATIONS).toHaveProperty('subscription')
      expect(DATABASE_INDEXING_RECOMMENDATIONS).toHaveProperty('updated_at')
      expect(DATABASE_INDEXING_RECOMMENDATIONS).toHaveProperty('active_users')
      expect(DATABASE_INDEXING_RECOMMENDATIONS).toHaveProperty('usage_reset')

      // Verify SQL syntax
      expect(DATABASE_INDEXING_RECOMMENDATIONS.primary).toContain('CREATE UNIQUE INDEX')
      expect(DATABASE_INDEXING_RECOMMENDATIONS.email).toContain('CREATE INDEX')
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

  describe('Error Handling', () => {
    it('should handle invalid user ID', async () => {
      const result = await getCompleteUserData('')

      expect(result.user).toBeNull()
      expect(result.error?.code).toBe('INVALID_USER_ID')
    })

    it('should handle database errors', async () => {
      const mockError = { code: 'PGRST116', message: 'Not found' }
      supabaseAdmin.from().select().eq().single.mockResolvedValue({
        data: null,
        error: mockError
      })

      const result = await getCompleteUserData(mockUserId)

      expect(result.user).toBeNull()
      expect(result.error?.code).toBe('USER_NOT_FOUND')
    })

    it('should handle network errors', async () => {
      supabaseAdmin.from().select().eq().single.mockRejectedValue(new Error('Network error'))

      const result = await getCompleteUserData(mockUserId)

      expect(result.user).toBeNull()
      expect(result.error?.code).toBe('NETWORK_ERROR')
    })
  })

  describe('getCurrentUserData Optimization', () => {
    it('should work with authentication', async () => {
      const mockReadOnlyClient = createServerClientReadOnly()
      mockReadOnlyClient.auth.getUser.mockResolvedValue({
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

    it('should handle auth errors', async () => {
      const mockReadOnlyClient = createServerClientReadOnly()
      mockReadOnlyClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null
      })

      const result = await getCurrentUserData()

      expect(result.user).toBeNull()
      expect(result.error?.code).toBe('AUTH_REQUIRED')
    })
  })
})
