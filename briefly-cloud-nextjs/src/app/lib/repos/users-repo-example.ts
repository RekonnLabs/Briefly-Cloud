/**
 * Users Repository Usage Examples
 * 
 * This file demonstrates how to use the UsersRepository for common operations
 * in the Briefly Cloud application.
 */

import { usersRepo } from './users-repo'
import type { UserProfile, CreateUserInput, UpdateUserUsageInput } from './users-repo'

/**
 * Example: Create a new user profile
 */
export async function createNewUser(userId: string, email: string): Promise<UserProfile> {
  try {
    const newUser = await usersRepo.create({
      id: userId,
      email: email,
      subscription_tier: 'free', // Default to free tier
      metadata: {
        source: 'signup',
        createdAt: new Date().toISOString()
      }
    })

    console.log('✅ User created successfully:', newUser.id)
    return newUser
  } catch (error) {
    console.error('❌ Failed to create user:', error)
    throw error
  }
}

/**
 * Example: Get user profile and check usage limits
 */
export async function getUserWithLimits(userId: string) {
  try {
    // Get user profile
    const user = await usersRepo.getById(userId)
    if (!user) {
      throw new Error('User not found')
    }

    // Check usage limits
    const limits = await usersRepo.checkUsageLimits(userId)

    return {
      user,
      limits,
      canUpload: limits.canUploadFiles && limits.canUseStorage,
      usage: {
        documents: `${user.documents_uploaded}/${user.documents_limit}`,
        storage: `${Math.round(user.storage_used_bytes / 1024 / 1024)}MB/${Math.round(user.storage_limit_bytes / 1024 / 1024)}MB`
      }
    }
  } catch (error) {
    console.error('❌ Failed to get user with limits:', error)
    throw error
  }
}

/**
 * Example: Update user usage after file upload
 */
export async function updateUsageAfterUpload(userId: string, fileSize: number): Promise<void> {
  try {
    // Increment usage by 1 document and the file size
    await usersRepo.incrementUsage(userId, 1, fileSize)
    
    console.log('✅ Usage updated after upload')
  } catch (error) {
    console.error('❌ Failed to update usage:', error)
    throw error
  }
}

/**
 * Example: Upgrade user subscription tier
 */
export async function upgradeUserTier(userId: string, newTier: 'pro' | 'pro_byok' | 'team' | 'enterprise'): Promise<void> {
  try {
    await usersRepo.updateTier(userId, newTier)
    
    const updatedUser = await usersRepo.getById(userId)
    console.log('✅ User tier upgraded:', {
      tier: updatedUser?.subscription_tier,
      newLimits: {
        documents: updatedUser?.documents_limit,
        storage: `${Math.round((updatedUser?.storage_limit_bytes || 0) / 1024 / 1024)}MB`
      }
    })
  } catch (error) {
    console.error('❌ Failed to upgrade user tier:', error)
    throw error
  }
}

/**
 * Example: Update user preferences and metadata
 */
export async function updateUserPreferences(userId: string, preferences: Record<string, any>): Promise<void> {
  try {
    // Get current user to preserve existing metadata
    const currentUser = await usersRepo.getById(userId)
    if (!currentUser) {
      throw new Error('User not found')
    }

    // Merge new preferences with existing metadata
    const updatedMetadata = {
      ...currentUser.metadata,
      preferences: {
        ...currentUser.metadata?.preferences,
        ...preferences
      },
      lastUpdated: new Date().toISOString()
    }

    await usersRepo.updateMetadata(userId, updatedMetadata)
    console.log('✅ User preferences updated')
  } catch (error) {
    console.error('❌ Failed to update user preferences:', error)
    throw error
  }
}

/**
 * Example: Track user login
 */
export async function trackUserLogin(userId: string): Promise<void> {
  try {
    await usersRepo.updateLastLogin(userId)
    console.log('✅ User login tracked')
  } catch (error) {
    console.error('❌ Failed to track user login:', error)
    throw error
  }
}

/**
 * Example: Get usage statistics for dashboard
 */
export async function getDashboardStats(userId: string) {
  try {
    const stats = await usersRepo.getUsageStats(userId)
    if (!stats) {
      throw new Error('User not found')
    }

    const limits = await usersRepo.checkUsageLimits(userId)

    return {
      tier: stats.subscription_tier,
      documents: {
        used: stats.documents_uploaded,
        limit: stats.documents_limit,
        remaining: limits.documentsRemaining,
        percentage: Math.round((stats.documents_uploaded / stats.documents_limit) * 100)
      },
      storage: {
        used: stats.storage_used_bytes,
        limit: stats.storage_limit_bytes,
        remaining: limits.storageRemaining,
        percentage: Math.round((stats.storage_used_bytes / stats.storage_limit_bytes) * 100),
        usedFormatted: `${Math.round(stats.storage_used_bytes / 1024 / 1024)}MB`,
        limitFormatted: `${Math.round(stats.storage_limit_bytes / 1024 / 1024)}MB`
      },
      canUpload: limits.canUploadFiles && limits.canUseStorage
    }
  } catch (error) {
    console.error('❌ Failed to get dashboard stats:', error)
    throw error
  }
}

/**
 * Example: Bulk operations for admin
 */
export async function getMultipleUsers(userIds: string[]): Promise<UserProfile[]> {
  try {
    const users = await usersRepo.getByIds(userIds)
    console.log(`✅ Retrieved ${users.length} users`)
    return users
  } catch (error) {
    console.error('❌ Failed to get multiple users:', error)
    throw error
  }
}

/**
 * Example: Check if user can perform an action
 */
export async function canUserUploadFile(userId: string, fileSize: number): Promise<{
  canUpload: boolean
  reason?: string
}> {
  try {
    const limits = await usersRepo.checkUsageLimits(userId)
    
    if (!limits.canUploadFiles) {
      return {
        canUpload: false,
        reason: 'Document limit reached'
      }
    }
    
    if (limits.storageRemaining < fileSize) {
      return {
        canUpload: false,
        reason: 'Storage limit would be exceeded'
      }
    }
    
    return { canUpload: true }
  } catch (error) {
    console.error('❌ Failed to check upload permission:', error)
    return {
      canUpload: false,
      reason: 'Error checking limits'
    }
  }
}

/**
 * Example: Usage in API route handlers
 */
export const apiExamples = {
  // In upload API route
  async handleFileUpload(userId: string, fileSize: number) {
    // Check limits before upload
    const canUpload = await canUserUploadFile(userId, fileSize)
    if (!canUpload.canUpload) {
      throw new Error(canUpload.reason)
    }

    // ... perform upload ...

    // Update usage after successful upload
    await updateUsageAfterUpload(userId, fileSize)
  },

  // In chat API route
  async getChatUserInfo(userId: string) {
    const stats = await usersRepo.getUsageStats(userId)
    return {
      tier: stats?.subscription_tier || 'free',
      canUseAdvancedFeatures: ['pro', 'pro_byok', 'team', 'enterprise'].includes(stats?.subscription_tier || 'free')
    }
  },

  // In dashboard API route
  async getDashboardData(userId: string) {
    return await getDashboardStats(userId)
  }
}

// Export commonly used functions
export {
  createNewUser,
  getUserWithLimits,
  updateUsageAfterUpload,
  upgradeUserTier,
  updateUserPreferences,
  trackUserLogin,
  getDashboardStats,
  canUserUploadFile
}