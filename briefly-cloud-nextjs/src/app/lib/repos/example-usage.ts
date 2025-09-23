/**
 * Example usage of BaseRepository class
 * This demonstrates how to extend BaseRepository for schema-aware operations
 */

import { BaseRepository } from './base-repo'

// Example interface for a user record
interface UserRecord {
  id: string
  email: string
  subscription_tier: string
  created_at: string
  updated_at: string
}

// Example repository extending BaseRepository
export class UsersRepository extends BaseRepository {
  /**
   * Create a new user in the app schema
   */
  async createUser(userData: {
    email: string
    subscription_tier?: string
  }): Promise<UserRecord> {
    // Validate required fields
    this.validateRequiredFields(userData, ['email'], 'user creation')

    // Sanitize input data
    const sanitizedData = this.sanitizeInput({
      email: userData.email,
      subscription_tier: userData.subscription_tier || 'free',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })

    // Execute operation with app schema
    return this.executeWithAppSchema(async (client) => {
      const { data, error } = await client
        .from('users')
        .insert(sanitizedData)
        .select()
        .single()

      if (error) {
        this.handleDatabaseError(error, 'user creation')
      }

      return data as UserRecord
    })
  }

  /**
   * Get user by ID from app schema
   */
  async getUserById(userId: string): Promise<UserRecord | null> {
    this.validateRequiredFields({ userId }, ['userId'], 'user lookup')

    return this.executeWithAppSchema(async (client) => {
      const { data, error } = await client
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (error) {
        this.handleDatabaseError(error, 'user lookup')
      }

      return data as UserRecord | null
    })
  }

  /**
   * Update user subscription tier
   */
  async updateUserTier(userId: string, tier: string): Promise<void> {
    this.validateRequiredFields({ userId, tier }, ['userId', 'tier'], 'user tier update')

    const sanitizedData = this.sanitizeInput({
      subscription_tier: tier,
      updated_at: new Date().toISOString()
    })

    return this.executeWithAppSchema(async (client) => {
      const { error } = await client
        .from('users')
        .update(sanitizedData)
        .eq('id', userId)

      if (error) {
        this.handleDatabaseError(error, 'user tier update')
      }
    })
  }

  /**
   * List users with pagination
   */
  async listUsers(options: {
    limit?: number
    offset?: number
    search?: string
  } = {}): Promise<{ users: UserRecord[]; count: number }> {
    const { limit = 50, offset = 0, search } = options

    return this.executeWithAppSchema(async (client) => {
      let query = client
        .from('users')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (search) {
        query = query.ilike('email', `%${search}%`)
      }

      const { data, error, count } = await query

      if (error) {
        this.handleDatabaseError(error, 'user listing')
      }

      return {
        users: (data || []) as UserRecord[],
        count: count || 0
      }
    })
  }
}

// Example OAuth tokens repository using private schema
export class OAuthTokensRepository extends BaseRepository {
  /**
   * Save OAuth token using RPC function in private schema
   */
  async saveToken(
    userId: string,
    provider: 'google' | 'microsoft',
    tokenData: {
      accessToken: string
      refreshToken?: string
      expiresAt?: string
      scope?: string
    }
  ): Promise<void> {
    this.validateRequiredFields(
      { userId, provider, accessToken: tokenData.accessToken },
      ['userId', 'provider', 'accessToken'],
      'OAuth token save'
    )

    // Use app client to call RPC function (RPC functions are in public schema but access private)
    return this.executeWithAppSchema(async (client) => {
      const { error } = await client.rpc('save_oauth_token', {
        p_user_id: userId,
        p_provider: provider,
        p_access_token: tokenData.accessToken,
        p_refresh_token: tokenData.refreshToken || null,
        p_expires_at: tokenData.expiresAt || null,
        p_scope: tokenData.scope || null
      })

      if (error) {
        this.handleDatabaseError(error, 'OAuth token save')
      }
    })
  }

  /**
   * Get OAuth token using RPC function
   */
  async getToken(
    userId: string,
    provider: 'google' | 'microsoft'
  ): Promise<{
    accessToken: string
    refreshToken?: string
    expiresAt?: string
    scope?: string
  } | null> {
    this.validateRequiredFields({ userId, provider }, ['userId', 'provider'], 'OAuth token get')

    return this.executeWithAppSchema(async (client) => {
      const { data, error } = await client.rpc('get_oauth_token', {
        p_user_id: userId,
        p_provider: provider
      })

      if (error) {
        this.handleDatabaseError(error, 'OAuth token get')
      }

      if (!data || data.length === 0) {
        return null
      }

      const token = Array.isArray(data) ? data[0] : data
      return {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: token.expires_at,
        scope: token.scope
      }
    })
  }

  /**
   * Delete OAuth token using RPC function
   */
  async deleteToken(userId: string, provider: 'google' | 'microsoft'): Promise<void> {
    this.validateRequiredFields({ userId, provider }, ['userId', 'provider'], 'OAuth token delete')

    return this.executeWithAppSchema(async (client) => {
      const { error } = await client.rpc('delete_oauth_token', {
        p_user_id: userId,
        p_provider: provider
      })

      if (error) {
        this.handleDatabaseError(error, 'OAuth token delete')
      }
    })
  }
}

// Export repository instances
export const usersRepo = new UsersRepository()
export const oauthTokensRepo = new OAuthTokensRepository()