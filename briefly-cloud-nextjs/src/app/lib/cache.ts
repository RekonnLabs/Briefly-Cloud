import { LRUCache } from 'lru-cache'
import { NextRequest, NextResponse } from 'next/server'

// In-memory LRU cache for frequently accessed data
const memoryCache = new LRUCache<string, any>({
  max: 500, // Maximum number of items
  ttl: 1000 * 60 * 5, // 5 minutes default TTL
  updateAgeOnGet: true, // Update age when accessed
  allowStale: true, // Allow stale items to be returned while updating
})

// Cache keys for different types of data
export const CACHE_KEYS = {
  USER_PROFILE: (userId: string) => `user:profile:${userId}`,
  USER_SETTINGS: (userId: string) => `user:settings:${userId}`,
  FILE_METADATA: (fileId: string) => `file:metadata:${fileId}`,
  DOCUMENT_CHUNKS: (fileId: string) => `file:chunks:${fileId}`,
  SEARCH_RESULTS: (query: string, userId: string) => `search:${userId}:${query}`,
  EMBEDDING: (text: string) => `embedding:${text}`,
  VECTOR_SEARCH: (query: string, userId: string) => `vector:${userId}:${query}`,
  OAUTH_TOKENS: (userId: string, provider: string) => `oauth:${userId}:${provider}`,
  SUBSCRIPTION_STATUS: (userId: string) => `subscription:${userId}`,
  USAGE_STATS: (userId: string) => `usage:${userId}`,
} as const

// Cache utility functions
export class CacheManager {
  private static instance: CacheManager
  private cache: LRUCache<string, any>

  private constructor() {
    this.cache = memoryCache
  }

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager()
    }
    return CacheManager.instance
  }

  // Get cached value
  get<T>(key: string): T | undefined {
    return this.cache.get(key) as T
  }

  // Set cached value with optional TTL
  set<T>(key: string, value: T, ttl?: number): void {
    this.cache.set(key, value, { ttl })
  }

  // Delete cached value
  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  // Clear all cache
  clear(): void {
    this.cache.clear()
  }

  // Get cache statistics
  getStats() {
    return {
      size: this.cache.size,
      max: this.cache.max,
      hits: this.cache.stats.hits,
      misses: this.cache.stats.misses,
      hitRate: this.cache.stats.hitRate,
    }
  }

  // Invalidate cache by pattern
  invalidatePattern(pattern: string): number {
    let deleted = 0
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key)
        deleted++
      }
    }
    return deleted
  }

  // Invalidate user-related cache
  invalidateUserCache(userId: string): number {
    return this.invalidatePattern(`user:${userId}`)
  }

  // Invalidate file-related cache
  invalidateFileCache(fileId: string): number {
    return this.invalidatePattern(`file:${fileId}`)
  }
}

// Database query caching wrapper
export function withCache<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttl: number = 1000 * 60 * 5 // 5 minutes default
): Promise<T> {
  const cache = CacheManager.getInstance()
  const cached = cache.get<T>(key)
  
  if (cached !== undefined) {
    return Promise.resolve(cached)
  }

  return fetchFn().then(result => {
    cache.set(key, result, ttl)
    return result
  })
}

// HTTP response caching middleware
export function withResponseCache(
  request: NextRequest,
  response: NextResponse,
  maxAge: number = 300 // 5 minutes
): NextResponse {
  // Add cache headers
  response.headers.set('Cache-Control', `public, max-age=${maxAge}, s-maxage=${maxAge}`)
  response.headers.set('ETag', `"${Date.now()}"`)
  
  // Check if client has cached version
  const ifNoneMatch = request.headers.get('if-none-match')
  if (ifNoneMatch && ifNoneMatch === response.headers.get('etag')) {
    return new NextResponse(null, { status: 304 })
  }

  return response
}

// CDN caching utilities
export const CDN_CACHE = {
  // Cache static assets for 1 year
  STATIC_ASSETS: 'public, max-age=31536000, immutable',
  
  // Cache API responses for 5 minutes
  API_RESPONSES: 'public, max-age=300, s-maxage=300',
  
  // Cache search results for 1 minute
  SEARCH_RESULTS: 'public, max-age=60, s-maxage=60',
  
  // No cache for sensitive data
  NO_CACHE: 'no-cache, no-store, must-revalidate',
  
  // Private cache for user-specific data
  PRIVATE: 'private, max-age=300',
} as const

// Performance monitoring for cache operations
export class CachePerformanceMonitor {
  private static metrics = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
  }

  static recordHit() {
    this.metrics.hits++
  }

  static recordMiss() {
    this.metrics.misses++
  }

  static recordSet() {
    this.metrics.sets++
  }

  static recordDelete() {
    this.metrics.deletes++
  }

  static recordError() {
    this.metrics.errors++
  }

  static getMetrics() {
    return { ...this.metrics }
  }

  static reset() {
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
    }
  }
}

// Enhanced cache with performance monitoring
export class MonitoredCacheManager extends CacheManager {
  get<T>(key: string): T | undefined {
    try {
      const result = super.get<T>(key)
      if (result !== undefined) {
        CachePerformanceMonitor.recordHit()
      } else {
        CachePerformanceMonitor.recordMiss()
      }
      return result
    } catch (error) {
      CachePerformanceMonitor.recordError()
      throw error
    }
  }

  set<T>(key: string, value: T, ttl?: number): void {
    try {
      super.set(key, value, ttl)
      CachePerformanceMonitor.recordSet()
    } catch (error) {
      CachePerformanceMonitor.recordError()
      throw error
    }
  }

  delete(key: string): boolean {
    try {
      const result = super.delete(key)
      CachePerformanceMonitor.recordDelete()
      return result
    } catch (error) {
      CachePerformanceMonitor.recordError()
      throw error
    }
  }
}

// Export singleton instance
export const cacheManager = MonitoredCacheManager.getInstance()

// Legacy export for compatibility
export const cache = cacheManager
