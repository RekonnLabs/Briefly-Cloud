import 'server-only'
import { getSupabaseServerReadOnly } from './auth/supabase-server-readonly'
import { supabaseAdmin } from './supabase-admin'

// Re-export types from the types file for server-side use
export type {
  CompleteUserData,
  UserDataResult,
  UserDataError
} from './user-data-types'

export {
  isValidUserData,
  getUserDataErrorMessage,
  getSafeUserData
} from './user-data-types'

import type { CompleteUserData, UserDataResult } from './user-data-types'

/**
 * Query performance monitoring interface
 */
interface QueryPerformanceMetrics {
  queryName: string
  startTime: number
  endTime: number
  duration: number
  success: boolean
  error?: string
  userId?: string
  cacheHit?: boolean
}

/**
 * Database connection retry configuration
 */
interface RetryConfig {
  maxRetries: number
  baseDelay: number
  maxDelay: number
  backoffMultiplier: number
}

/**
 * Default retry configuration for database operations
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 100, // 100ms
  maxDelay: 2000, // 2 seconds
  backoffMultiplier: 2
}

/**
 * In-memory cache for user data to reduce database load
 * In production, this should be replaced with Redis or similar
 */
const userDataCache = new Map<string, { data: CompleteUserData; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Log query performance metrics
 */
function logQueryPerformance(metrics: QueryPerformanceMetrics): void {
  const logLevel = metrics.duration > 1000 ? 'warn' : 'info'
  const cacheStatus = metrics.cacheHit ? '[CACHE HIT]' : '[DB QUERY]'
  
  console[logLevel](`[USER_DATA_QUERY] ${cacheStatus} ${metrics.queryName}`, {
    duration: `${metrics.duration}ms`,
    success: metrics.success,
    userId: metrics.userId,
    timestamp: new Date(metrics.startTime).toISOString(),
    ...(metrics.error && { error: metrics.error })
  })

  // Log slow queries for optimization
  if (metrics.duration > 500) {
    console.warn(`[SLOW_QUERY] ${metrics.queryName} took ${metrics.duration}ms`, {
      userId: metrics.userId,
      timestamp: new Date(metrics.startTime).toISOString()
    })
  }
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Calculate exponential backoff delay
 */
function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  const delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1)
  return Math.min(delay, config.maxDelay)
}

/**
 * Execute database operation with retry logic and performance monitoring
 */
async function executeWithRetry<T>(
  operation: () => Promise<T>,
  queryName: string,
  userId?: string,
  retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: Error | null = null
  
  for (let attempt = 1; attempt <= retryConfig.maxRetries; attempt++) {
    const startTime = Date.now()
    
    try {
      const result = await operation()
      const endTime = Date.now()
      
      // Log successful query
      logQueryPerformance({
        queryName,
        startTime,
        endTime,
        duration: endTime - startTime,
        success: true,
        userId
      })
      
      return result
    } catch (error) {
      const endTime = Date.now()
      lastError = error instanceof Error ? error : new Error(String(error))
      
      // Log failed query
      logQueryPerformance({
        queryName,
        startTime,
        endTime,
        duration: endTime - startTime,
        success: false,
        error: lastError.message,
        userId
      })
      
      // Don't retry on certain error types
      if (isNonRetryableError(lastError)) {
        throw lastError
      }
      
      // If this was the last attempt, throw the error
      if (attempt === retryConfig.maxRetries) {
        console.error(`[DB_RETRY_EXHAUSTED] ${queryName} failed after ${attempt} attempts`, {
          userId,
          error: lastError.message,
          attempts: attempt
        })
        throw lastError
      }
      
      // Calculate delay and wait before retry
      const delay = calculateBackoffDelay(attempt, retryConfig)
      console.warn(`[DB_RETRY] ${queryName} attempt ${attempt} failed, retrying in ${delay}ms`, {
        userId,
        error: lastError.message,
        attempt,
        nextDelay: delay
      })
      
      await sleep(delay)
    }
  }
  
  throw lastError || new Error('Retry loop completed without result')
}

/**
 * Check if an error should not be retried
 */
function isNonRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase()
  
  // Don't retry authentication or permission errors
  if (message.includes('permission') || message.includes('unauthorized') || message.includes('forbidden')) {
    return true
  }
  
  // Don't retry validation errors
  if (message.includes('invalid') || message.includes('malformed')) {
    return true
  }
  
  // Don't retry "not found" errors
  if (message.includes('not found') || message.includes('pgrst116')) {
    return true
  }
  
  return false
}

/**
 * Get user data from cache if available and not expired
 */
function getCachedUserData(userId: string): CompleteUserData | null {
  const cached = userDataCache.get(userId)
  if (!cached) return null
  
  const now = Date.now()
  if (now - cached.timestamp > CACHE_TTL) {
    userDataCache.delete(userId)
    return null
  }
  
  return cached.data
}

/**
 * Cache user data with timestamp
 */
function setCachedUserData(userId: string, data: CompleteUserData): void {
  userDataCache.set(userId, {
    data,
    timestamp: Date.now()
  })
  
  // Clean up old cache entries periodically
  if (userDataCache.size > 1000) {
    const now = Date.now()
    for (const [key, value] of userDataCache.entries()) {
      if (now - value.timestamp > CACHE_TTL) {
        userDataCache.delete(key)
      }
    }
  }
}

/**
 * Optimized database query for user data
 * Uses specific field selection and proper indexing hints
 */
async function queryUserData(userId: string): Promise<any> {
  return await supabaseAdmin
    .from('users')
    .select(`
      id,
      email,
      name,
      image,
      full_name,
      subscription_tier,
      subscription_status,
      usage_count,
      usage_limit,
      trial_end_date,
      chat_messages_count,
      chat_messages_limit,
      documents_uploaded,
      documents_limit,
      api_calls_count,
      api_calls_limit,
      storage_used_bytes,
      storage_limit_bytes,
      usage_stats,
      preferences,
      features_enabled,
      permissions,
      usage_reset_date,
      created_at,
      updated_at
    `)
    .eq('id', userId)
    .single()
}

/**
 * Default user data for fallback scenarios
 */
const DEFAULT_USER_DATA: Partial<CompleteUserData> = {
  subscription_tier: 'free',
  subscription_status: 'active',
  usage_count: 0,
  usage_limit: 10, // Free tier default
  chat_messages_count: 0,
  chat_messages_limit: 10,
  documents_uploaded: 0,
  documents_limit: 10,
  api_calls_count: 0,
  api_calls_limit: 100,
  storage_used_bytes: 0,
  storage_limit_bytes: 100 * 1024 * 1024, // 100MB for free tier
  usage_stats: {},
  preferences: {},
  features_enabled: {},
  permissions: {},
  usage_reset_date: new Date().toISOString()
}

/**
 * Get complete user data by user ID with proper RLS, caching, and performance monitoring
 * Uses admin client to query app.users table with comprehensive error handling and retry logic
 * 
 * @param userId - The user ID to fetch data for
 * @param bypassCache - Whether to bypass cache and force fresh data
 * @returns Promise<UserDataResult> - User data with error handling
 */
export async function getCompleteUserData(userId: string, bypassCache: boolean = false): Promise<UserDataResult> {
  const startTime = Date.now()
  
  try {
    // Validate user ID
    if (!userId || typeof userId !== 'string') {
      logQueryPerformance({
        queryName: 'getCompleteUserData',
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
        success: false,
        error: 'Invalid user ID',
        userId
      })
      
      return {
        user: null,
        error: {
          code: 'INVALID_USER_ID',
          message: 'Invalid user ID provided',
          details: { userId }
        }
      }
    }

    // Check cache first (unless bypassed)
    if (!bypassCache) {
      const cachedData = getCachedUserData(userId)
      if (cachedData) {
        logQueryPerformance({
          queryName: 'getCompleteUserData',
          startTime,
          endTime: Date.now(),
          duration: Date.now() - startTime,
          success: true,
          userId,
          cacheHit: true
        })
        
        return {
          user: cachedData,
          error: undefined
        }
      }
    }

    // Execute database query with retry logic and performance monitoring
    const { data, error } = await executeWithRetry(
      () => queryUserData(userId),
      'getCompleteUserData',
      userId
    )

    if (error) {
      // Handle specific Supabase errors
      if (error.code === 'PGRST116') {
        return {
          user: null,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found in database',
            details: { userId, supabaseError: error }
          }
        }
      }

      if (error.code === 'PGRST301') {
        return {
          user: null,
          error: {
            code: 'PERMISSION_DENIED',
            message: 'Permission denied accessing user data',
            details: { userId, supabaseError: error }
          }
        }
      }

      return {
        user: null,
        error: {
          code: 'DATABASE_ERROR',
          message: `Database error: ${error.message}`,
          details: { userId, supabaseError: error }
        }
      }
    }

    // Merge with defaults to ensure all required fields are present
    const completeUserData: CompleteUserData = {
      ...DEFAULT_USER_DATA,
      ...data,
      // Ensure required fields are properly typed
      subscription_tier: data.subscription_tier || 'free',
      subscription_status: data.subscription_status || 'active',
      usage_count: data.usage_count || 0,
      usage_limit: data.usage_limit || 10,
      chat_messages_count: data.chat_messages_count || 0,
      chat_messages_limit: data.chat_messages_limit || 10,
      documents_uploaded: data.documents_uploaded || 0,
      documents_limit: data.documents_limit || 10,
      api_calls_count: data.api_calls_count || 0,
      api_calls_limit: data.api_calls_limit || 100,
      storage_used_bytes: data.storage_used_bytes || 0,
      storage_limit_bytes: data.storage_limit_bytes || (100 * 1024 * 1024),
      usage_stats: data.usage_stats || {},
      preferences: data.preferences || {},
      features_enabled: data.features_enabled || {},
      permissions: data.permissions || {},
      usage_reset_date: data.usage_reset_date || new Date().toISOString()
    } as CompleteUserData

    // Cache the result for future requests
    setCachedUserData(userId, completeUserData)

    return {
      user: completeUserData,
      error: undefined
    }

  } catch (error) {
    // Handle unexpected errors
    return {
      user: null,
      error: {
        code: 'NETWORK_ERROR',
        message: `Unexpected error fetching user data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { userId, error }
      }
    }
  }
}

/**
 * Get current authenticated user's complete data with performance monitoring
 * Uses read-only Supabase client to get current user, then fetches complete data
 * 
 * @param bypassCache - Whether to bypass cache and force fresh data
 * @returns Promise<UserDataResult> - Current user's complete data with error handling
 */
export async function getCurrentUserData(bypassCache: boolean = false): Promise<UserDataResult> {
  const startTime = Date.now()
  
  try {
    // Get current authenticated user using read-only client with retry logic
    const authResult = await executeWithRetry(
      async () => {
        const supabase = getSupabaseServerReadOnly()
        return await supabase.auth.getUser()
      },
      'getCurrentUserAuth',
      undefined
    )

    const { data: { user: authUser }, error: authError } = authResult

    if (authError) {
      return {
        user: null,
        error: {
          code: 'AUTH_REQUIRED',
          message: `Authentication error: ${authError.message}`,
          details: { authError }
        }
      }
    }

    if (!authUser) {
      return {
        user: null,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'User not authenticated',
          details: { authUser }
        }
      }
    }

    // Fetch complete user data using the authenticated user's ID
    return await getCompleteUserData(authUser.id, bypassCache)

  } catch (error) {
    logQueryPerformance({
      queryName: 'getCurrentUserData',
      startTime,
      endTime: Date.now(),
      duration: Date.now() - startTime,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    
    return {
      user: null,
      error: {
        code: 'NETWORK_ERROR',
        message: `Unexpected error getting current user data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error }
      }
    }
  }
}

/**
 * Clear cached user data for a specific user
 * Useful when user data is updated and cache needs to be invalidated
 * 
 * @param userId - The user ID to clear from cache
 */
export function clearUserDataCache(userId: string): void {
  userDataCache.delete(userId)
  console.info(`[USER_DATA_CACHE] Cleared cache for user ${userId}`)
}

/**
 * Clear all cached user data
 * Useful for memory management or when cache needs to be reset
 */
export function clearAllUserDataCache(): void {
  const cacheSize = userDataCache.size
  userDataCache.clear()
  console.info(`[USER_DATA_CACHE] Cleared all cached data (${cacheSize} entries)`)
}

/**
 * Get cache statistics for monitoring
 */
export function getUserDataCacheStats(): {
  size: number
  entries: Array<{ userId: string; timestamp: number; age: number }>
} {
  const now = Date.now()
  const entries = Array.from(userDataCache.entries()).map(([userId, { timestamp }]) => ({
    userId,
    timestamp,
    age: now - timestamp
  }))
  
  return {
    size: userDataCache.size,
    entries
  }
}

/**
 * Database indexing recommendations for optimal query performance
 * These should be applied to the app.users table in Supabase
 */
export const DATABASE_INDEXING_RECOMMENDATIONS = {
  // Primary index on id (should already exist)
  primary: 'CREATE UNIQUE INDEX IF NOT EXISTS users_pkey ON app.users (id)',
  
  // Index on email for authentication lookups
  email: 'CREATE INDEX IF NOT EXISTS idx_users_email ON app.users (email)',
  
  // Composite index for subscription queries
  subscription: 'CREATE INDEX IF NOT EXISTS idx_users_subscription ON app.users (subscription_tier, subscription_status)',
  
  // Index on updated_at for cache invalidation queries
  updated_at: 'CREATE INDEX IF NOT EXISTS idx_users_updated_at ON app.users (updated_at)',
  
  // Partial index for active users (most common queries)
  active_users: 'CREATE INDEX IF NOT EXISTS idx_users_active ON app.users (id, subscription_status) WHERE subscription_status IN (\'active\', \'trialing\')',
  
  // Index on usage_reset_date for usage tracking queries
  usage_reset: 'CREATE INDEX IF NOT EXISTS idx_users_usage_reset ON app.users (usage_reset_date)'
} as const

/**
 * Get database performance recommendations based on query patterns
 */
export function getDatabaseOptimizationRecommendations(): {
  indexing: typeof DATABASE_INDEXING_RECOMMENDATIONS
  queryOptimizations: string[]
  cacheRecommendations: string[]
} {
  return {
    indexing: DATABASE_INDEXING_RECOMMENDATIONS,
    queryOptimizations: [
      'Use specific field selection instead of SELECT * to reduce data transfer',
      'Add WHERE clauses with indexed columns for better query performance',
      'Consider using LIMIT for pagination queries',
      'Use prepared statements for repeated queries',
      'Monitor slow query logs and optimize accordingly'
    ],
    cacheRecommendations: [
      'Implement Redis cache for production environments',
      'Use cache invalidation strategies based on data update patterns',
      'Consider cache warming for frequently accessed user data',
      'Implement cache compression for large user data objects',
      'Monitor cache hit rates and adjust TTL accordingly'
    ]
  }
}


/**
 * Get dashboard user data using RPC (no phantom columns)
 */
export async function getDashboardUser() {
  const supabase = getSupabaseServerReadOnly()
  const { data, error } = await supabase.rpc('bc_get_user_profile')
  if (error) throw error // surfaces DB issues in logs
  return data?.[0] ?? null
}
