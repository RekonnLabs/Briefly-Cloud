/**
 * Vector Store Factory
 * 
 * This factory creates and manages vector store instances based on configuration.
 * It supports multiple backends (pgvector, ChromaDB) and user-specific configurations.
 */

import { logger } from '@/app/lib/logger'
import { PgVectorStore } from './pgvector-store'
import type {
  IVectorStore,
  IVectorStoreFactory,
  VectorStoreConfig
} from './vector-store.interface'

/**
 * Vector Store Factory Implementation
 */
export class VectorStoreFactory implements IVectorStoreFactory {
  private static instance: VectorStoreFactory
  private defaultStore: IVectorStore | null = null
  private userStores: Map<string, IVectorStore> = new Map()

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): VectorStoreFactory {
    if (!VectorStoreFactory.instance) {
      VectorStoreFactory.instance = new VectorStoreFactory()
    }
    return VectorStoreFactory.instance
  }

  /**
   * Create a vector store instance
   */
  createVectorStore(config: VectorStoreConfig): IVectorStore {
    switch (config.backend) {
      case 'pgvector':
        return new PgVectorStore(config)
      
      case 'chromadb':
        // Legacy ChromaDB support (if needed for migration)
        throw new Error('ChromaDB backend is deprecated. Use pgvector instead.')
      
      default:
        throw new Error(`Unsupported vector store backend: ${config.backend}`)
    }
  }

  /**
   * Get the default vector store instance
   */
  getDefaultVectorStore(): IVectorStore {
    if (!this.defaultStore) {
      const config = this.getDefaultConfig()
      this.defaultStore = this.createVectorStore(config)
      
      logger.info('Created default vector store', {
        backend: config.backend,
        config: this.sanitizeConfig(config)
      })
    }
    
    return this.defaultStore
  }

  /**
   * Create a user-specific vector store (for BYOK scenarios)
   */
  createUserVectorStore(userId: string, userConfig: Partial<VectorStoreConfig>): IVectorStore {
    const cacheKey = `${userId}_${JSON.stringify(userConfig)}`
    
    if (this.userStores.has(cacheKey)) {
      return this.userStores.get(cacheKey)!
    }

    const defaultConfig = this.getDefaultConfig()
    const config: VectorStoreConfig = {
      ...defaultConfig,
      ...userConfig
    }

    const store = this.createVectorStore(config)
    this.userStores.set(cacheKey, store)

    logger.info('Created user-specific vector store', {
      userId,
      backend: config.backend,
      config: this.sanitizeConfig(config)
    })

    return store
  }

  /**
   * Get default configuration from environment
   */
  private getDefaultConfig(): VectorStoreConfig {
    const backend = (process.env.VECTOR_BACKEND || 'pgvector').toLowerCase() as 'pgvector' | 'chromadb'
    
    const config: VectorStoreConfig = {
      backend,
      maxConnections: parseInt(process.env.VECTOR_MAX_CONNECTIONS || '10'),
      timeout: parseInt(process.env.VECTOR_TIMEOUT || '30000')
    }

    // Add backend-specific configuration
    if (backend === 'pgvector') {
      // Safety check: ensure connection string is present for pgvector
      if (!process.env.SUPABASE_CONNECTION_STRING) {
        throw new Error(
          'Missing SUPABASE_CONNECTION_STRING. Use Supabase Transaction Pooler for serverless.'
        )
      }
      config.connectionString = process.env.SUPABASE_CONNECTION_STRING
    } else if (backend === 'chromadb') {
      config.apiKey = process.env.CHROMA_API_KEY
      config.tenantId = process.env.CHROMA_TENANT_ID
      config.dbName = process.env.CHROMA_DB_NAME
      config.host = process.env.CHROMA_HOST || 'api.trychroma.com'
      config.port = parseInt(process.env.CHROMA_PORT || '443')
      config.ssl = process.env.CHROMA_SSL !== 'false'
    }

    return config
  }

  /**
   * Sanitize config for logging (remove sensitive data)
   */
  private sanitizeConfig(config: VectorStoreConfig): Record<string, any> {
    return {
      backend: config.backend,
      host: config.host,
      port: config.port,
      ssl: config.ssl,
      maxConnections: config.maxConnections,
      timeout: config.timeout,
      hasApiKey: !!config.apiKey,
      hasTenantId: !!config.tenantId,
      hasConnectionString: !!config.connectionString
    }
  }

  /**
   * Clear user store cache
   */
  clearUserStoreCache(userId?: string): void {
    if (userId) {
      // Clear specific user's stores
      const keysToDelete = Array.from(this.userStores.keys()).filter(key => 
        key.startsWith(`${userId}_`)
      )
      keysToDelete.forEach(key => this.userStores.delete(key))
    } else {
      // Clear all user stores
      this.userStores.clear()
    }
  }

  /**
   * Get store statistics
   */
  getFactoryStats(): {
    defaultStoreConnected: boolean
    userStoreCount: number
    totalStores: number
  } {
    return {
      defaultStoreConnected: this.defaultStore?.isConnected() || false,
      userStoreCount: this.userStores.size,
      totalStores: (this.defaultStore ? 1 : 0) + this.userStores.size
    }
  }
}

/**
 * Convenience functions for common operations
 */

/**
 * Get the default vector store instance
 */
export function getVectorStore(): IVectorStore {
  return VectorStoreFactory.getInstance().getDefaultVectorStore()
}

/**
 * Get a user-specific vector store
 */
export function getUserVectorStore(userId: string, config?: Partial<VectorStoreConfig>): IVectorStore {
  if (config) {
    return VectorStoreFactory.getInstance().createUserVectorStore(userId, config)
  }
  return VectorStoreFactory.getInstance().getDefaultVectorStore()
}

/**
 * Create a vector store with specific configuration
 */
export function createVectorStore(config: VectorStoreConfig): IVectorStore {
  return VectorStoreFactory.getInstance().createVectorStore(config)
}

/**
 * Check if vector store is available and connected
 */
export async function isVectorStoreAvailable(): Promise<boolean> {
  try {
    const store = getVectorStore()
    return store.isConnected()
  } catch (error) {
    logger.error('Failed to check vector store availability', error as Error)
    return false
  }
}

/**
 * Get vector store health status
 */
export async function getVectorStoreHealth(): Promise<{
  available: boolean
  backend: string
  connected: boolean
  error?: string
  stats?: any
}> {
  try {
    const store = getVectorStore()
    const status = store.getConnectionStatus()
    const factory = VectorStoreFactory.getInstance()
    
    return {
      available: true,
      backend: status.backend,
      connected: status.connected,
      error: status.error || undefined,
      stats: factory.getFactoryStats()
    }
  } catch (error) {
    return {
      available: false,
      backend: 'unknown',
      connected: false,
      error: (error as Error).message
    }
  }
}
