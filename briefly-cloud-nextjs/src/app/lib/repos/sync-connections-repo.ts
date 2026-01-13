import { BaseRepository } from './base-repo'

export interface SyncConnection {
  id: string
  owner_id: string
  provider: 'gdrive' | 'onedrive' | 'dropbox'
  cursor: string | null
  last_sync_at: string | null
  status: 'active' | 'error' | 'revoked'
  error: string | null
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

export interface CreateSyncConnectionInput {
  ownerId: string
  provider: 'gdrive' | 'onedrive' | 'dropbox'
  cursor?: string | null
  metadata?: Record<string, any>
}

export interface UpdateSyncConnectionInput {
  cursor?: string | null
  last_sync_at?: string | null
  status?: 'active' | 'error' | 'revoked'
  error?: string | null
  metadata?: Record<string, any>
}

/**
 * Sync Connections Repository
 * 
 * Manages delta cursors and sync state for cloud storage providers
 */
export class SyncConnectionsRepository extends BaseRepository {
  private readonly TABLE_NAME = 'sync_connections'

  /**
   * Get sync connection for a user and provider
   */
  async get(userId: string, provider: string): Promise<SyncConnection | null> {
    this.validateRequiredFields({ userId, provider }, ['userId', 'provider'], 'get sync connection')

    try {
      const { data, error } = await this.appClient
        .schema('app')
        .from(this.TABLE_NAME)
        .select('*')
        .eq('owner_id', userId)
        .eq('provider', provider)
        .maybeSingle()

      if (error) {
        this.handleDatabaseError(error, 'get sync connection')
      }

      return data as SyncConnection | null
    } catch (error) {
      this.handleDatabaseError(error, 'get sync connection from app schema')
    }
  }

  /**
   * List all sync connections for a user
   */
  async listByUserId(userId: string): Promise<SyncConnection[]> {
    this.validateRequiredFields({ userId }, ['userId'], 'list sync connections')

    try {
      const { data, error } = await this.appClient
        .schema('app')
        .from(this.TABLE_NAME)
        .select('*')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false })

      if (error) {
        this.handleDatabaseError(error, 'list sync connections')
      }

      return (data || []) as SyncConnection[]
    } catch (error) {
      this.handleDatabaseError(error, 'list sync connections from app schema')
    }
  }

  /**
   * Create or update sync connection (upsert)
   */
  async upsert(input: CreateSyncConnectionInput): Promise<SyncConnection> {
    this.validateRequiredFields(input, ['ownerId', 'provider'], 'upsert sync connection')

    const payload = this.sanitizeInput({
      owner_id: input.ownerId,
      provider: input.provider,
      cursor: input.cursor || null,
      metadata: input.metadata || {},
      updated_at: new Date().toISOString()
    })

    try {
      const { data, error } = await this.appClient
        .schema('app')
        .from(this.TABLE_NAME)
        .upsert(payload, {
          onConflict: 'owner_id,provider',
          ignoreDuplicates: false
        })
        .select('*')
        .single()

      if (error) {
        this.handleDatabaseError(error, 'upsert sync connection')
      }

      if (!data) {
        throw new Error('No data returned from sync connection upsert')
      }

      return data as SyncConnection
    } catch (error) {
      this.handleDatabaseError(error, 'upsert sync connection in app schema')
    }
  }

  /**
   * Update sync connection
   */
  async update(userId: string, provider: string, updates: UpdateSyncConnectionInput): Promise<SyncConnection> {
    this.validateRequiredFields({ userId, provider }, ['userId', 'provider'], 'update sync connection')

    const payload = this.sanitizeInput({
      ...updates,
      updated_at: new Date().toISOString()
    })

    try {
      const { data, error } = await this.appClient
        .schema('app')
        .from(this.TABLE_NAME)
        .update(payload)
        .eq('owner_id', userId)
        .eq('provider', provider)
        .select('*')
        .single()

      if (error) {
        this.handleDatabaseError(error, 'update sync connection')
      }

      if (!data) {
        throw new Error('Sync connection not found')
      }

      return data as SyncConnection
    } catch (error) {
      this.handleDatabaseError(error, 'update sync connection in app schema')
    }
  }

  /**
   * Delete sync connection
   */
  async delete(userId: string, provider: string): Promise<void> {
    this.validateRequiredFields({ userId, provider }, ['userId', 'provider'], 'delete sync connection')

    try {
      const { error } = await this.appClient
        .schema('app')
        .from(this.TABLE_NAME)
        .delete()
        .eq('owner_id', userId)
        .eq('provider', provider)

      if (error) {
        this.handleDatabaseError(error, 'delete sync connection')
      }
    } catch (error) {
      this.handleDatabaseError(error, 'delete sync connection from app schema')
    }
  }
}

// Export singleton instance
export const syncConnectionsRepo = new SyncConnectionsRepository()
