import { supabaseAdmin, SupabaseError } from './supabase'

// Database connection and retry utilities
export interface RetryOptions {
  maxRetries: number
  baseDelay: number
  maxDelay: number
  backoffMultiplier: number
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2
}

export class DatabaseConnectionError extends Error {
  constructor(message: string, public originalError?: unknown) {
    super(message)
    this.name = 'DatabaseConnectionError'
  }
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options }
  let lastError: unknown

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      
      // Don't retry on certain types of errors
      if (error instanceof SupabaseError) {
        // Don't retry on authentication or permission errors
        if (error.code === 'PGRST301' || error.code === 'PGRST116') {
          throw error
        }
      }

      if (attempt === config.maxRetries) {
        break
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        config.baseDelay * Math.pow(config.backoffMultiplier, attempt),
        config.maxDelay
      )

      console.warn(`Database operation failed (attempt ${attempt + 1}/${config.maxRetries + 1}), retrying in ${delay}ms:`, error)
      
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw new DatabaseConnectionError(
    `Database operation failed after ${config.maxRetries + 1} attempts`,
    lastError
  )
}

export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from('app.users')
      .select('id')
      .limit(1)

    if (error) {
      console.error('Database connection test failed:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Database connection test failed:', error)
    return false
  }
}

export async function getDatabaseHealth(): Promise<{
  connected: boolean
  latency?: number
  error?: string
}> {
  const startTime = Date.now()
  
  try {
    const { error } = await supabaseAdmin
      .from('app.users')
      .select('id')
      .limit(1)

    const latency = Date.now() - startTime

    if (error) {
      return {
        connected: false,
        latency,
        error: error.message
      }
    }

    return {
      connected: true,
      latency
    }
  } catch (error) {
    return {
      connected: false,
      latency: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// Connection pooling helpers
export class ConnectionPool {
  private static instance: ConnectionPool
  private connections: Map<string, unknown> = new Map()
  private maxConnections: number = 10
  private connectionTimeout: number = 30000 // 30 seconds

  static getInstance(): ConnectionPool {
    if (!ConnectionPool.instance) {
      ConnectionPool.instance = new ConnectionPool()
    }
    return ConnectionPool.instance
  }

  async getConnection(key: string = 'default'): Promise<unknown> {
    if (this.connections.has(key)) {
      return this.connections.get(key)
    }

    // For Supabase, we don't need actual connection pooling
    // as the client handles this internally
    const connection = supabaseAdmin
    this.connections.set(key, connection)
    
    return connection
  }

  releaseConnection(key: string = 'default'): void {
    // For Supabase, we don't need to explicitly release connections
    // but we can remove from our tracking
    this.connections.delete(key)
  }

  async closeAllConnections(): Promise<void> {
    this.connections.clear()
  }
}

// Query optimization helpers
export interface QueryOptions {
  timeout?: number
  retries?: number
  cache?: boolean
  cacheKey?: string
  cacheTTL?: number
}

const queryCache = new Map<string, { data: unknown; expires: number }>()

export async function executeQuery<T>(
  queryFn: () => Promise<T>,
  options: QueryOptions = {}
): Promise<T> {
  const {
    timeout = 30000,
    retries = 3,
    cache = false,
    cacheKey,
    cacheTTL = 300000 // 5 minutes
  } = options

  // Check cache first
  if (cache && cacheKey) {
    const cached = queryCache.get(cacheKey)
    if (cached && cached.expires > Date.now()) {
      return cached.data as T
    }
  }

  // Execute query with timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Query timeout')), timeout)
  })

  try {
    const result = await Promise.race([
      withRetry(queryFn, { maxRetries: retries }),
      timeoutPromise
    ])

    // Cache result if requested
    if (cache && cacheKey) {
      queryCache.set(cacheKey, {
        data: result,
        expires: Date.now() + cacheTTL
      })
    }

    return result
  } catch (error) {
    throw new DatabaseConnectionError(
      `Query execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error
    )
  }
}

// Batch operations
export async function batchInsert<T>(
  table: string,
  records: T[],
  batchSize: number = 100
): Promise<T[]> {
  const results: T[] = []
  
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize)
    
    try {
      const { data, error } = await supabaseAdmin
        .from(table)
        .insert(batch)
        .select()

      if (error) {
        throw new SupabaseError(`Batch insert failed: ${error.message}`, error.code, error)
      }

      if (data) {
        results.push(...data)
      }
    } catch (error) {
      console.error(`Batch insert failed for batch ${i / batchSize + 1}:`, error)
      throw error
    }
  }

  return results
}

export async function batchUpdate<T>(
  table: string,
  updates: Array<{ id: string; data: Partial<T> }>,
  batchSize: number = 100
): Promise<T[]> {
  const results: T[] = []
  
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize)
    
    // Execute updates in parallel for better performance
    const promises = batch.map(async ({ id, data }) => {
      const { data: result, error } = await supabaseAdmin
        .from(table)
        .update(data)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        throw new SupabaseError(`Batch update failed for id ${id}: ${error.message}`, error.code, error)
      }

      return result
    })

    try {
      const batchResults = await Promise.all(promises)
      results.push(...batchResults)
    } catch (error) {
      console.error(`Batch update failed for batch ${i / batchSize + 1}:`, error)
      throw error
    }
  }

  return results
}

// Transaction helpers (Supabase doesn't support transactions in the same way, but we can simulate)
export async function withTransaction<T>(
  operations: Array<() => Promise<unknown>>
): Promise<T[]> {
  const results: unknown[] = []
  const rollbackOperations: Array<() => Promise<void>> = []

  try {
    for (const operation of operations) {
      const result = await operation()
      results.push(result)
      
      // Note: Actual rollback would need to be implemented based on the specific operation
      // This is a simplified version
    }

    return results as T[]
  } catch (error) {
    // Attempt to rollback completed operations
    console.warn('Transaction failed, attempting rollback...')
    
    for (const rollback of rollbackOperations.reverse()) {
      try {
        await rollback()
      } catch (rollbackError) {
        console.error('Rollback operation failed:', rollbackError)
      }
    }

    throw error
  }
}

// Cleanup utilities
export function clearQueryCache(): void {
  queryCache.clear()
}

export function cleanupExpiredCache(): void {
  const now = Date.now()
  for (const [key, value] of queryCache.entries()) {
    if (value.expires <= now) {
      queryCache.delete(key)
    }
  }
}

// Auto-cleanup expired cache entries every 5 minutes
if (typeof window === 'undefined') { // Only run on server
  setInterval(cleanupExpiredCache, 5 * 60 * 1000)
}
