import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { UsersRepository, TIER_LIMITS } from '../users-repo'
import { supabaseApp } from '@/app/lib/supabase-clients'

// Integration tests require actual database connection
// These tests will be skipped if SKIP_INTEGRATION_TESTS is set
const skipIntegration = process.env.SKIP_INTEGRATION_TESTS === 'true'

describe.skipIf(skipIntegration)('UsersRepository Integration Tests', () => {
  let usersRepo: UsersRepository
  const testUserId = 'test-user-' + Date.now()
  const testEmail = `test-${Date.now()}@example.com`

  beforeEach(() => {
    usersRepo = new UsersRepository()
  })

  afterEach(async () => {
    // Clean up test data
    try {
      await supabaseApp
        .from('users')
        .delete()
        .eq('id', testUserId)
    } catch (error) {
      // Ignore cleanup errors
      console.warn('Cleanup error:', error)
    }
  })

  describe('User Profile Operations', () => {
    it('should create and retrieve user profile', async () => {
      // Create user
      const createdUser = await usersRepo.create({
        id: testUserId,
        email: testEmail,
        subscription_tier: 'free',
        metadata: { source: 'integration-test' }
      })

      expect(createdUser).toMatchObject({
        id: testUserId,
        email: testEmail,
        subscription_tier: 'free',
        documents_uploaded: 0,
        documents_limit: TIER_LIMITS.free.documents_limit,
        storage_used_bytes: 0,
        storage_limit_bytes: TIER_LIMITS.free.storage_limit_bytes,
        metadata: { source: 'integration-test' }
      })

      // Retrieve by ID
      const retrievedById = await usersRepo.getById(testUserId)
      expect(retrievedById).toMatchObject({
        id: testUserId,
        email: testEmail,
        subscription_tier: 'free'
      })

      // Retrieve by email
      const retrievedByEmail = await usersRepo.getByEmail(testEmail)
      expect(retrievedByEmail).toMatchObject({
        id: testUserId,
        email: testEmail,
        subscription_tier: 'free'
      })
    })

    it('should return null for non-existent user', async () => {
      const result = await usersRepo.getById('non-existent-user')
      expect(result).toBeNull()

      const resultByEmail = await usersRepo.getByEmail('non-existent@example.com')
      expect(resultByEmail).toBeNull()
    })

    it('should create user with different tiers and correct limits', async () => {
      const proUserId = testUserId + '-pro'
      const proEmail = 'pro-' + testEmail

      try {
        const proUser = await usersRepo.create({
          id: proUserId,
          email: proEmail,
          subscription_tier: 'pro'
        })

        expect(proUser.subscription_tier).toBe('pro')
        expect(proUser.documents_limit).toBe(TIER_LIMITS.pro.documents_limit)
        expect(proUser.storage_limit_bytes).toBe(TIER_LIMITS.pro.storage_limit_bytes)

        // Clean up
        await supabaseApp.from('users').delete().eq('id', proUserId)
      } catch (error) {
        // Clean up on error
        await supabaseApp.from('users').delete().eq('id', proUserId)
        throw error
      }
    })
  })

  describe('Usage Tracking', () => {
    beforeEach(async () => {
      // Create test user
      await usersRepo.create({
        id: testUserId,
        email: testEmail,
        subscription_tier: 'free'
      })
    })

    it('should update usage statistics', async () => {
      await usersRepo.updateUsage(testUserId, {
        documents_uploaded: 5,
        storage_used_bytes: 1024000
      })

      const stats = await usersRepo.getUsageStats(testUserId)
      expect(stats).toMatchObject({
        documents_uploaded: 5,
        storage_used_bytes: 1024000,
        subscription_tier: 'free'
      })
    })

    it('should increment usage correctly', async () => {
      // Set initial usage
      await usersRepo.updateUsage(testUserId, {
        documents_uploaded: 3,
        storage_used_bytes: 512000
      })

      // Increment usage
      await usersRepo.incrementUsage(testUserId, 2, 256000)

      const stats = await usersRepo.getUsageStats(testUserId)
      expect(stats).toMatchObject({
        documents_uploaded: 5, // 3 + 2
        storage_used_bytes: 768000, // 512000 + 256000
        subscription_tier: 'free'
      })
    })

    it('should check usage limits correctly', async () => {
      // Set usage near limits
      await usersRepo.updateUsage(testUserId, {
        documents_uploaded: 23, // 2 remaining out of 25
        storage_used_bytes: 90 * 1024 * 1024 // 10MB remaining out of 100MB
      })

      const limits = await usersRepo.checkUsageLimits(testUserId)
      expect(limits).toMatchObject({
        canUploadFiles: true,
        canUseStorage: true,
        documentsRemaining: 2,
        storageRemaining: 10 * 1024 * 1024
      })

      // Set usage at limits
      await usersRepo.updateUsage(testUserId, {
        documents_uploaded: 25,
        storage_used_bytes: 100 * 1024 * 1024
      })

      const limitsExceeded = await usersRepo.checkUsageLimits(testUserId)
      expect(limitsExceeded).toMatchObject({
        canUploadFiles: false,
        canUseStorage: false,
        documentsRemaining: 0,
        storageRemaining: 0
      })
    })
  })

  describe('Tier Management', () => {
    beforeEach(async () => {
      // Create test user
      await usersRepo.create({
        id: testUserId,
        email: testEmail,
        subscription_tier: 'free'
      })
    })

    it('should update user tier and limits', async () => {
      await usersRepo.updateTier(testUserId, 'pro')

      const user = await usersRepo.getById(testUserId)
      expect(user).toMatchObject({
        subscription_tier: 'pro',
        documents_limit: TIER_LIMITS.pro.documents_limit,
        storage_limit_bytes: TIER_LIMITS.pro.storage_limit_bytes
      })
    })

    it('should handle tier upgrades and downgrades', async () => {
      // Upgrade to pro
      await usersRepo.updateTier(testUserId, 'pro')
      let user = await usersRepo.getById(testUserId)
      expect(user?.subscription_tier).toBe('pro')
      expect(user?.documents_limit).toBe(TIER_LIMITS.pro.documents_limit)

      // Upgrade to pro_byok
      await usersRepo.updateTier(testUserId, 'pro_byok')
      user = await usersRepo.getById(testUserId)
      expect(user?.subscription_tier).toBe('pro_byok')
      expect(user?.documents_limit).toBe(TIER_LIMITS.pro_byok.documents_limit)

      // Downgrade to free
      await usersRepo.updateTier(testUserId, 'free')
      user = await usersRepo.getById(testUserId)
      expect(user?.subscription_tier).toBe('free')
      expect(user?.documents_limit).toBe(TIER_LIMITS.free.documents_limit)
    })
  })

  describe('User Metadata and Login Tracking', () => {
    beforeEach(async () => {
      // Create test user
      await usersRepo.create({
        id: testUserId,
        email: testEmail,
        subscription_tier: 'free'
      })
    })

    it('should update user metadata', async () => {
      const metadata = {
        preferences: { theme: 'dark', language: 'en' },
        settings: { notifications: true, autoSave: false },
        customData: { source: 'integration-test' }
      }

      await usersRepo.updateMetadata(testUserId, metadata)

      const user = await usersRepo.getById(testUserId)
      expect(user?.metadata).toEqual(metadata)
    })

    it('should update last login timestamp', async () => {
      const beforeLogin = new Date()
      
      await usersRepo.updateLastLogin(testUserId)

      const user = await usersRepo.getById(testUserId)
      expect(user?.last_login_at).toBeTruthy()
      
      const lastLoginDate = new Date(user!.last_login_at!)
      expect(lastLoginDate.getTime()).toBeGreaterThanOrEqual(beforeLogin.getTime())
    })
  })

  describe('Bulk Operations', () => {
    const testUserIds = [
      testUserId + '-bulk-1',
      testUserId + '-bulk-2',
      testUserId + '-bulk-3'
    ]

    beforeEach(async () => {
      // Create multiple test users
      for (let i = 0; i < testUserIds.length; i++) {
        await usersRepo.create({
          id: testUserIds[i],
          email: `bulk-${i}-${testEmail}`,
          subscription_tier: i === 0 ? 'free' : i === 1 ? 'pro' : 'pro_byok'
        })
      }
    })

    afterEach(async () => {
      // Clean up bulk test users
      for (const userId of testUserIds) {
        try {
          await supabaseApp.from('users').delete().eq('id', userId)
        } catch (error) {
          console.warn('Bulk cleanup error:', error)
        }
      }
    })

    it('should fetch multiple users by IDs', async () => {
      const users = await usersRepo.getByIds(testUserIds)

      expect(users).toHaveLength(3)
      expect(users.map(u => u.id).sort()).toEqual(testUserIds.sort())
      
      // Check different tiers
      const tiers = users.map(u => u.subscription_tier).sort()
      expect(tiers).toEqual(['free', 'pro', 'pro_byok'])
    })

    it('should return empty array for empty IDs list', async () => {
      const users = await usersRepo.getByIds([])
      expect(users).toEqual([])
    })

    it('should handle partial matches for user IDs', async () => {
      const mixedIds = [...testUserIds, 'non-existent-user-1', 'non-existent-user-2']
      const users = await usersRepo.getByIds(mixedIds)

      // Should only return existing users
      expect(users).toHaveLength(3)
      expect(users.map(u => u.id).sort()).toEqual(testUserIds.sort())
    })
  })

  describe('Error Handling', () => {
    it('should handle duplicate user creation', async () => {
      // Create user first time
      await usersRepo.create({
        id: testUserId,
        email: testEmail,
        subscription_tier: 'free'
      })

      // Try to create same user again - should throw error
      await expect(
        usersRepo.create({
          id: testUserId,
          email: testEmail,
          subscription_tier: 'pro'
        })
      ).rejects.toThrow()
    })

    it('should handle operations on non-existent user', async () => {
      const nonExistentUserId = 'non-existent-user-' + Date.now()

      // incrementUsage should throw when user doesn't exist
      await expect(
        usersRepo.incrementUsage(nonExistentUserId, 1, 1024)
      ).rejects.toThrow()

      // checkUsageLimits should throw when user doesn't exist
      await expect(
        usersRepo.checkUsageLimits(nonExistentUserId)
      ).rejects.toThrow()
    })

    it('should validate required fields', async () => {
      await expect(
        usersRepo.create({ id: '', email: testEmail })
      ).rejects.toThrow()

      await expect(
        usersRepo.create({ id: testUserId, email: '' })
      ).rejects.toThrow()

      await expect(
        usersRepo.getById('')
      ).rejects.toThrow()

      await expect(
        usersRepo.updateUsage('', { documents_uploaded: 1 })
      ).rejects.toThrow()
    })
  })

  describe('Schema Verification', () => {
    it('should work with app schema tables', async () => {
      // This test verifies that the repository is correctly using app.users table
      // by successfully performing operations that would fail if using wrong schema
      
      const user = await usersRepo.create({
        id: testUserId,
        email: testEmail,
        subscription_tier: 'free'
      })

      expect(user.id).toBe(testUserId)

      // Update usage
      await usersRepo.updateUsage(testUserId, {
        documents_uploaded: 1,
        storage_used_bytes: 1024
      })

      // Verify the update worked
      const stats = await usersRepo.getUsageStats(testUserId)
      expect(stats?.documents_uploaded).toBe(1)
      expect(stats?.storage_used_bytes).toBe(1024)

      // Update tier
      await usersRepo.updateTier(testUserId, 'pro')
      
      // Verify tier update
      const updatedUser = await usersRepo.getById(testUserId)
      expect(updatedUser?.subscription_tier).toBe('pro')
    })
  })
})