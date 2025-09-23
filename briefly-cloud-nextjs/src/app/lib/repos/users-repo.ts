import { BaseRepository } from './base-repo'

// TypeScript interfaces for user data and repository methods
export interface UserProfile {
  id: string
  email: string
  subscription_tier: 'free' | 'pro' | 'pro_byok' | 'team' | 'enterprise'
  documents_uploaded: number
  documents_limit: number
  storage_used_bytes: number
  storage_limit_bytes: number
  created_at: string
  updated_at: string
  last_login_at?: string
  metadata?: Record<string, any>
}

export interface UserUsageStats {
  documents_uploaded: number
  documents_limit: number
  storage_used_bytes: number
  storage_limit_bytes: number
  subscription_tier: string
}

export interface UpdateUserUsageInput {
  documents_uploaded?: number
  storage_used_bytes?: number
  last_login_at?: string
  metadata?: Record<string, any>
}

export interface CreateUserInput {
  id: string
  email: string
  subscription_tier?: 'free' | 'pro' | 'pro_byok' | 'team' | 'enterprise'
  metadata?: Record<string, any>
}

// Tier-based limits configuration
export const TIER_LIMITS = {
  free: {
    documents_limit: 25,
    storage_limit_bytes: 100 * 1024 * 1024, // 100MB
  },
  pro: {
    documents_limit: 500,
    storage_limit_bytes: 1024 * 1024 * 1024, // 1GB
  },
  pro_byok: {
    documents_limit: 5000,
    storage_limit_bytes: 10 * 1024 * 1024 * 1024, // 10GB
  },
  team: {
    documents_limit: 10000,
    storage_limit_bytes: 50 * 1024 * 1024 * 1024, // 50GB
  },
  enterprise: {
    documents_limit: 100000,
    storage_limit_bytes: 500 * 1024 * 1024 * 1024, // 500GB
  },
} as const

/**
 * Users Repository - App Schema Implementation
 * 
 * This repository handles user operations using the app schema (app.users table).
 * It extends BaseRepository for schema-aware operations and proper error handling.
 */
export class UsersRepository extends BaseRepository {
  private readonly TABLE_NAME = 'users'

  /**
   * Get user profile by ID
   */
  async getById(userId: string): Promise<UserProfile | null> {
    this.validateRequiredFields({ userId }, ['userId'], 'get user profile')

    try {
      const { data, error } = await this.appClient
        .from(this.TABLE_NAME)
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (error) {
        this.handleDatabaseError(error, 'fetch user profile')
      }

      return data ? this.mapRecordToUserProfile(data) : null
    } catch (error) {
      this.handleDatabaseError(error, 'fetch user profile from app schema')
    }
  }

  /**
   * Get user profile by email
   */
  async getByEmail(email: string): Promise<UserProfile | null> {
    this.validateRequiredFields({ email }, ['email'], 'get user by email')

    try {
      const { data, error } = await this.appClient
        .from(this.TABLE_NAME)
        .select('*')
        .eq('email', email)
        .maybeSingle()

      if (error) {
        this.handleDatabaseError(error, 'fetch user by email')
      }

      return data ? this.mapRecordToUserProfile(data) : null
    } catch (error) {
      this.handleDatabaseError(error, 'fetch user by email from app schema')
    }
  }

  /**
   * Create a new user profile
   */
  async create(input: CreateUserInput): Promise<UserProfile> {
    this.validateRequiredFields(input, ['id', 'email'], 'create user profile')

    const tier = input.subscription_tier || 'free'
    const limits = TIER_LIMITS[tier]

    const payload = this.sanitizeInput({
      id: input.id,
      email: input.email,
      subscription_tier: tier,
      documents_uploaded: 0,
      documents_limit: limits.documents_limit,
      storage_used_bytes: 0,
      storage_limit_bytes: limits.storage_limit_bytes,
      metadata: input.metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })

    try {
      const { data, error } = await this.appClient
        .from(this.TABLE_NAME)
        .insert(payload)
        .select('*')
        .single()

      if (error) {
        this.handleDatabaseError(error, 'create user profile')
      }

      if (!data) {
        throw new Error('No data returned from user creation')
      }

      return this.mapRecordToUserProfile(data)
    } catch (error) {
      this.handleDatabaseError(error, 'create user profile in app schema')
    }
  }

  /**
   * Update user usage statistics
   */
  async updateUsage(userId: string, updates: UpdateUserUsageInput): Promise<void> {
    this.validateRequiredFields({ userId }, ['userId'], 'update user usage')

    const payload = this.sanitizeInput({
      ...updates,
      updated_at: new Date().toISOString()
    })

    if (Object.keys(payload).length <= 1) return // Only updated_at

    try {
      const { error } = await this.appClient
        .from(this.TABLE_NAME)
        .update(payload)
        .eq('id', userId)

      if (error) {
        this.handleDatabaseError(error, 'update user usage')
      }
    } catch (error) {
      this.handleDatabaseError(error, 'update user usage in app schema')
    }
  }

  /**
   * Increment document count and storage usage
   */
  async incrementUsage(userId: string, documentCount: number, storageBytes: number): Promise<void> {
    this.validateRequiredFields({ userId }, ['userId'], 'increment user usage')

    try {
      // First get current values
      const currentProfile = await this.getById(userId)
      if (!currentProfile) {
        throw new Error(`User profile not found: ${userId}`)
      }

      // Update with incremented values
      await this.updateUsage(userId, {
        documents_uploaded: currentProfile.documents_uploaded + documentCount,
        storage_used_bytes: currentProfile.storage_used_bytes + storageBytes
      })
    } catch (error) {
      this.handleDatabaseError(error, 'increment user usage in app schema')
    }
  }

  /**
   * Update user subscription tier and limits
   */
  async updateTier(userId: string, tier: 'free' | 'pro' | 'pro_byok' | 'team' | 'enterprise'): Promise<void> {
    this.validateRequiredFields({ userId, tier }, ['userId', 'tier'], 'update user tier')

    const limits = TIER_LIMITS[tier]

    const payload = {
      subscription_tier: tier,
      documents_limit: limits.documents_limit,
      storage_limit_bytes: limits.storage_limit_bytes,
      updated_at: new Date().toISOString()
    }

    try {
      const { error } = await this.appClient
        .from(this.TABLE_NAME)
        .update(payload)
        .eq('id', userId)

      if (error) {
        this.handleDatabaseError(error, 'update user tier')
      }
    } catch (error) {
      this.handleDatabaseError(error, 'update user tier in app schema')
    }
  }

  /**
   * Get user usage statistics
   */
  async getUsageStats(userId: string): Promise<UserUsageStats | null> {
    this.validateRequiredFields({ userId }, ['userId'], 'get user usage stats')

    try {
      const { data, error } = await this.appClient
        .from(this.TABLE_NAME)
        .select('documents_uploaded, documents_limit, storage_used_bytes, storage_limit_bytes, subscription_tier')
        .eq('id', userId)
        .maybeSingle()

      if (error) {
        this.handleDatabaseError(error, 'fetch user usage stats')
      }

      return data ? {
        documents_uploaded: data.documents_uploaded || 0,
        documents_limit: data.documents_limit || 0,
        storage_used_bytes: data.storage_used_bytes || 0,
        storage_limit_bytes: data.storage_limit_bytes || 0,
        subscription_tier: data.subscription_tier || 'free'
      } : null
    } catch (error) {
      this.handleDatabaseError(error, 'fetch user usage stats from app schema')
    }
  }

  /**
   * Update last login timestamp
   */
  async updateLastLogin(userId: string): Promise<void> {
    this.validateRequiredFields({ userId }, ['userId'], 'update last login')

    try {
      const { error } = await this.appClient
        .from(this.TABLE_NAME)
        .update({
          last_login_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)

      if (error) {
        this.handleDatabaseError(error, 'update last login')
      }
    } catch (error) {
      this.handleDatabaseError(error, 'update last login in app schema')
    }
  }

  /**
   * Check if user has reached usage limits
   */
  async checkUsageLimits(userId: string): Promise<{
    canUploadFiles: boolean
    canUseStorage: boolean
    documentsRemaining: number
    storageRemaining: number
  }> {
    const stats = await this.getUsageStats(userId)
    
    if (!stats) {
      throw new Error(`User profile not found: ${userId}`)
    }

    const documentsRemaining = Math.max(0, stats.documents_limit - stats.documents_uploaded)
    const storageRemaining = Math.max(0, stats.storage_limit_bytes - stats.storage_used_bytes)

    return {
      canUploadFiles: documentsRemaining > 0,
      canUseStorage: storageRemaining > 0,
      documentsRemaining,
      storageRemaining
    }
  }

  /**
   * Get multiple users by IDs (for admin operations)
   */
  async getByIds(userIds: string[]): Promise<UserProfile[]> {
    if (!userIds.length) return []

    this.validateRequiredFields({ userIds }, ['userIds'], 'get users by IDs')

    try {
      const { data, error } = await this.appClient
        .from(this.TABLE_NAME)
        .select('*')
        .in('id', userIds)

      if (error) {
        this.handleDatabaseError(error, 'fetch users by IDs')
      }

      return (data || []).map(record => this.mapRecordToUserProfile(record))
    } catch (error) {
      this.handleDatabaseError(error, 'fetch users by IDs from app schema')
    }
  }

  /**
   * Update user metadata
   */
  async updateMetadata(userId: string, metadata: Record<string, any>): Promise<void> {
    this.validateRequiredFields({ userId }, ['userId'], 'update user metadata')

    try {
      const { error } = await this.appClient
        .from(this.TABLE_NAME)
        .update({
          metadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)

      if (error) {
        this.handleDatabaseError(error, 'update user metadata')
      }
    } catch (error) {
      this.handleDatabaseError(error, 'update user metadata in app schema')
    }
  }

  /**
   * Map database record to UserProfile interface
   */
  private mapRecordToUserProfile(record: Record<string, any>): UserProfile {
    return {
      id: record.id,
      email: record.email,
      subscription_tier: record.subscription_tier || 'free',
      documents_uploaded: record.documents_uploaded || 0,
      documents_limit: record.documents_limit || 0,
      storage_used_bytes: record.storage_used_bytes || 0,
      storage_limit_bytes: record.storage_limit_bytes || 0,
      created_at: record.created_at || new Date().toISOString(),
      updated_at: record.updated_at || new Date().toISOString(),
      last_login_at: record.last_login_at || null,
      metadata: record.metadata || {}
    }
  }
}

// Export singleton instance
export const usersRepo = new UsersRepository()