/**
 * Integration test for user data optimization features
 * This test verifies that the optimization features are properly integrated
 * and working as expected in the user data utility.
 */

import {
  DATABASE_INDEXING_RECOMMENDATIONS,
  getDatabaseOptimizationRecommendations,
  clearAllUserDataCache,
  getUserDataCacheStats
} from '../user-data'

describe('User Data Optimization Integration', () => {
  beforeEach(() => {
    // Clear cache before each test
    clearAllUserDataCache()
  })

  describe('Database Indexing Recommendations', () => {
    it('should provide comprehensive SQL indexing recommendations', () => {
      // Verify all required indexes are defined
      expect(DATABASE_INDEXING_RECOMMENDATIONS).toHaveProperty('primary')
      expect(DATABASE_INDEXING_RECOMMENDATIONS).toHaveProperty('email')
      expect(DATABASE_INDEXING_RECOMMENDATIONS).toHaveProperty('subscription')
      expect(DATABASE_INDEXING_RECOMMENDATIONS).toHaveProperty('updated_at')
      expect(DATABASE_INDEXING_RECOMMENDATIONS).toHaveProperty('active_users')
      expect(DATABASE_INDEXING_RECOMMENDATIONS).toHaveProperty('usage_reset')

      // Verify SQL syntax is valid
      expect(DATABASE_INDEXING_RECOMMENDATIONS.primary).toMatch(/CREATE UNIQUE INDEX.*users_pkey.*ON app\.users \(id\)/)
      expect(DATABASE_INDEXING_RECOMMENDATIONS.email).toMatch(/CREATE INDEX.*idx_users_email.*ON app\.users \(email\)/)
      expect(DATABASE_INDEXING_RECOMMENDATIONS.subscription).toMatch(/CREATE INDEX.*idx_users_subscription.*ON app\.users \(subscription_tier, subscription_status\)/)
      expect(DATABASE_INDEXING_RECOMMENDATIONS.updated_at).toMatch(/CREATE INDEX.*idx_users_updated_at.*ON app\.users \(updated_at\)/)
      expect(DATABASE_INDEXING_RECOMMENDATIONS.active_users).toMatch(/CREATE INDEX.*idx_users_active.*ON app\.users.*WHERE subscription_status IN/)
      expect(DATABASE_INDEXING_RECOMMENDATIONS.usage_reset).toMatch(/CREATE INDEX.*idx_users_usage_reset.*ON app\.users \(usage_reset_date\)/)
    })

    it('should provide optimization recommendations', () => {
      const recommendations = getDatabaseOptimizationRecommendations()
      
      // Verify structure
      expect(recommendations).toHaveProperty('indexing')
      expect(recommendations).toHaveProperty('queryOptimizations')
      expect(recommendations).toHaveProperty('cacheRecommendations')
      
      // Verify indexing recommendations match the constants
      expect(recommendations.indexing).toEqual(DATABASE_INDEXING_RECOMMENDATIONS)
      
      // Verify query optimization recommendations
      expect(Array.isArray(recommendations.queryOptimizations)).toBe(true)
      expect(recommendations.queryOptimizations.length).toBeGreaterThan(0)
      expect(recommendations.queryOptimizations.some(rec => 
        rec.includes('specific field selection')
      )).toBe(true)
      expect(recommendations.queryOptimizations.some(rec => 
        rec.includes('indexed columns')
      )).toBe(true)
      
      // Verify cache recommendations
      expect(Array.isArray(recommendations.cacheRecommendations)).toBe(true)
      expect(recommendations.cacheRecommendations.length).toBeGreaterThan(0)
      expect(recommendations.cacheRecommendations.some(rec => 
        rec.includes('Redis cache')
      )).toBe(true)
      expect(recommendations.cacheRecommendations.some(rec => 
        rec.includes('cache invalidation')
      )).toBe(true)
    })
  })

  describe('Cache Management System', () => {
    it('should provide cache statistics', () => {
      const stats = getUserDataCacheStats()
      
      // Verify structure
      expect(stats).toHaveProperty('size')
      expect(stats).toHaveProperty('entries')
      
      // Initially should be empty
      expect(stats.size).toBe(0)
      expect(Array.isArray(stats.entries)).toBe(true)
      expect(stats.entries).toHaveLength(0)
    })

    it('should clear all cache successfully', () => {
      // Clear cache should not throw
      expect(() => clearAllUserDataCache()).not.toThrow()
      
      // Verify cache is empty after clear
      const stats = getUserDataCacheStats()
      expect(stats.size).toBe(0)
      expect(stats.entries).toHaveLength(0)
    })
  })

  describe('Performance Monitoring Integration', () => {
    it('should have console logging available for monitoring', () => {
      // Verify console methods are available (they should be mocked in tests)
      expect(typeof console.info).toBe('function')
      expect(typeof console.warn).toBe('function')
      expect(typeof console.error).toBe('function')
    })
  })

  describe('Error Handling Integration', () => {
    it('should have proper error types defined', () => {
      // Import the types to verify they exist
      const { isValidUserData, getUserDataErrorMessage } = require('../user-data')
      
      expect(typeof isValidUserData).toBe('function')
      expect(typeof getUserDataErrorMessage).toBe('function')
      
      // Test error message function with different error codes
      const authError = { code: 'AUTH_REQUIRED', message: 'Test auth error' }
      const notFoundError = { code: 'USER_NOT_FOUND', message: 'Test not found error' }
      const dbError = { code: 'DATABASE_ERROR', message: 'Test database error' }
      const networkError = { code: 'NETWORK_ERROR', message: 'Test network error' }
      
      expect(getUserDataErrorMessage(authError)).toContain('sign in')
      expect(getUserDataErrorMessage(notFoundError)).toContain('not found')
      expect(getUserDataErrorMessage(dbError)).toContain('account data')
      expect(getUserDataErrorMessage(networkError)).toContain('Network error')
    })
  })

  describe('Function Signature Compatibility', () => {
    it('should maintain backward compatibility', () => {
      const { getCompleteUserData, getCurrentUserData } = require('../user-data')
      
      // Verify functions exist and are callable
      expect(typeof getCompleteUserData).toBe('function')
      expect(typeof getCurrentUserData).toBe('function')
      
      // Verify function signatures (should accept the expected parameters)
      // Note: Function.length only counts required parameters, not optional ones
      expect(getCompleteUserData.length).toBe(1) // userId (required), bypassCache (optional)
      expect(getCurrentUserData.length).toBe(0) // bypassCache (optional)
    })
  })

  describe('Optimization Constants', () => {
    it('should have all required optimization constants defined', () => {
      // Verify indexing recommendations constant exists and has correct structure
      expect(typeof DATABASE_INDEXING_RECOMMENDATIONS).toBe('object')
      expect(DATABASE_INDEXING_RECOMMENDATIONS).not.toBeNull()
      
      // Verify all required index recommendations are present
      const requiredIndexes = ['primary', 'email', 'subscription', 'updated_at', 'active_users', 'usage_reset']
      requiredIndexes.forEach(indexName => {
        expect(DATABASE_INDEXING_RECOMMENDATIONS).toHaveProperty(indexName)
        expect(typeof DATABASE_INDEXING_RECOMMENDATIONS[indexName]).toBe('string')
        expect(DATABASE_INDEXING_RECOMMENDATIONS[indexName].length).toBeGreaterThan(0)
      })
    })
  })
})