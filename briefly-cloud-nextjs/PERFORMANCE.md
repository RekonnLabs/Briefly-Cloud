# Performance Optimization Guide

This document outlines the performance optimization strategies implemented in the Briefly Cloud application, including caching mechanisms, performance monitoring, and optimization techniques.

## Table of Contents

1. [Caching System](#caching-system)
2. [Performance Monitoring](#performance-monitoring)
3. [Database Optimization](#database-optimization)
4. [API Response Optimization](#api-response-optimization)
5. [Frontend Performance](#frontend-performance)
6. [CDN and Static Assets](#cdn-and-static-assets)
7. [Monitoring and Analytics](#monitoring-and-analytics)
8. [Best Practices](#best-practices)

## Caching System

### In-Memory LRU Cache

The application uses an LRU (Least Recently Used) cache for frequently accessed data:

```typescript
// Cache configuration
const memoryCache = new LRUCache<string, any>({
  max: 500, // Maximum number of items
  ttl: 1000 * 60 * 5, // 5 minutes default TTL
  updateAgeOnGet: true, // Update age when accessed
  allowStale: true, // Allow stale items to be returned while updating
})
```

### Cache Keys

Standardized cache keys for different data types:

```typescript
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
}
```

### Cache Usage Examples

#### Database Query Caching

```typescript
// Cache user profile data
const userProfile = await withCache(
  CACHE_KEYS.USER_PROFILE(userId),
  () => supabase.from('users').select('*').eq('id', userId).single(),
  1000 * 60 * 5 // 5 minutes
)
```

#### Search Results Caching

```typescript
// Cache search results
const searchKey = CACHE_KEYS.SEARCH_RESULTS(query, userId)
const cachedResults = cacheManager.get(searchKey)
if (cachedResults) {
  return cachedResults
}

const results = await searchDocumentContext(query, userId)
cacheManager.set(searchKey, results, 1000 * 60 * 5)
```

### Cache Invalidation

```typescript
// Invalidate user-related cache
cacheManager.invalidateUserCache(userId)

// Invalidate file-related cache
cacheManager.invalidateFileCache(fileId)

// Invalidate by pattern
cacheManager.invalidatePattern('user:')
```

## Performance Monitoring

### Metrics Collection

The application tracks comprehensive performance metrics:

- **Request Metrics**: Total requests, average response time, error rate
- **Database Metrics**: Query count, average query time
- **External API Metrics**: API call count, average response time
- **Cache Metrics**: Hit rate, misses, cache size

### Performance Monitoring API

Access performance metrics via `/api/performance`:

```typescript
// GET /api/performance
{
  "performance": {
    "requests": 1250,
    "avgResponseTime": 245.67,
    "errorRate": 0.8,
    "databaseQueries": 3420,
    "avgDatabaseQueryTime": 45.23,
    "externalApiCalls": 890,
    "avgExternalApiTime": 156.78
  },
  "cache": {
    "size": 127,
    "max": 500,
    "hits": 2340,
    "misses": 156,
    "hitRate": 0.937
  }
}
```

### Performance Wrappers

Use performance monitoring wrappers for API calls:

```typescript
// Monitor external API calls
const result = await withApiPerformanceMonitoring(() =>
  openai.chat.completions.create({...})
)

// Monitor database queries
const data = await withQueryOptimization(() =>
  supabase.from('users').select('*')
)
```

## Database Optimization

### Connection Pooling

The application implements connection pooling to manage database connections efficiently:

```typescript
export class DatabaseConnectionPool {
  private static pool: Map<string, any> = new Map()
  private static maxConnections = 10
  
  static async getConnection(key: string): Promise<any> {
    // Reuse existing connections or create new ones
  }
}
```

### Query Optimization

Automatic query optimization:

```typescript
export class QueryOptimizer {
  static optimizeQuery(sql: string): string {
    // Remove unnecessary whitespace
    // Add LIMIT clauses where beneficial
    // Optimize query structure
  }
  
  static shouldCacheQuery(sql: string): boolean {
    // Determine if query should be cached
    // Avoid caching time-sensitive queries
  }
}
```

## API Response Optimization

### HTTP Caching Headers

```typescript
// Add cache headers to responses
response.headers.set('Cache-Control', 'public, max-age=300, s-maxage=300')
response.headers.set('ETag', `"${Date.now()}"`)

// Check for cached responses
const ifNoneMatch = request.headers.get('if-none-match')
if (ifNoneMatch && ifNoneMatch === response.headers.get('etag')) {
  return new NextResponse(null, { status: 304 })
}
```

### CDN Cache Policies

```typescript
export const CDN_CACHE = {
  STATIC_ASSETS: 'public, max-age=31536000, immutable',
  API_RESPONSES: 'public, max-age=300, s-maxage=300',
  SEARCH_RESULTS: 'public, max-age=60, s-maxage=60',
  NO_CACHE: 'no-cache, no-store, must-revalidate',
  PRIVATE: 'private, max-age=300',
}
```

## Frontend Performance

### Core Web Vitals Tracking

```typescript
export class CoreWebVitals {
  static trackLCP(element: Element) {
    // Track Largest Contentful Paint
  }
  
  static trackFID() {
    // Track First Input Delay
  }
  
  static trackCLS() {
    // Track Cumulative Layout Shift
  }
}
```

### Performance Monitoring Component

The `PerformanceMonitor` component provides real-time performance metrics:

- Performance metrics dashboard
- Cache statistics
- System information
- Auto-refresh capabilities
- Manual cache clearing

## CDN and Static Assets

### Static Asset Caching

```typescript
// Cache static assets for 1 year
'Cache-Control': 'public, max-age=31536000, immutable'
```

### API Response Caching

```typescript
// Cache API responses for 5 minutes
'Cache-Control': 'public, max-age=300, s-maxage=300'
```

### Search Results Caching

```typescript
// Cache search results for 1 minute
'Cache-Control': 'public, max-age=60, s-maxage=60'
```

## Monitoring and Analytics

### Performance Metrics

Track key performance indicators:

- **Response Time**: Target < 200ms for good performance
- **Error Rate**: Target < 1% for production
- **Cache Hit Rate**: Target > 80% for optimal performance
- **Database Query Time**: Target < 50ms average

### Memory Usage Monitoring

```typescript
// Monitor memory usage
const memory = process.memoryUsage()
const heapUsagePercent = (memory.heapUsed / memory.heapTotal) * 100
```

### Uptime Monitoring

```typescript
// Track application uptime
const uptime = process.uptime()
const formattedUptime = formatUptime(uptime)
```

## Best Practices

### Caching Best Practices

1. **Cache Frequently Accessed Data**: User profiles, settings, file metadata
2. **Set Appropriate TTL**: Balance freshness with performance
3. **Invalidate Cache on Updates**: Ensure data consistency
4. **Monitor Cache Hit Rates**: Optimize cache size and TTL
5. **Use Cache Keys Consistently**: Follow naming conventions

### Performance Best Practices

1. **Monitor Response Times**: Set up alerts for slow responses
2. **Optimize Database Queries**: Use indexes and limit results
3. **Implement Connection Pooling**: Reuse database connections
4. **Use CDN for Static Assets**: Reduce server load
5. **Implement Rate Limiting**: Prevent abuse and ensure fair usage

### Monitoring Best Practices

1. **Set Up Alerts**: Monitor error rates and response times
2. **Track Core Web Vitals**: Ensure good user experience
3. **Monitor Resource Usage**: Track memory and CPU usage
4. **Log Performance Metrics**: Use structured logging
5. **Regular Performance Reviews**: Analyze trends and optimize

### Cache Invalidation Strategies

1. **Time-Based**: Set TTL for data that becomes stale
2. **Event-Based**: Invalidate on data updates
3. **Pattern-Based**: Invalidate related cache entries
4. **Manual**: Allow administrators to clear cache

### Performance Optimization Checklist

- [ ] Implement caching for frequently accessed data
- [ ] Set up performance monitoring
- [ ] Optimize database queries
- [ ] Use connection pooling
- [ ] Implement CDN caching
- [ ] Track Core Web Vitals
- [ ] Set up performance alerts
- [ ] Monitor resource usage
- [ ] Regular performance reviews
- [ ] Cache invalidation strategy

## Configuration

### Environment Variables

```bash
# Performance monitoring
PERFORMANCE_MONITORING_ENABLED=true
CACHE_MAX_SIZE=500
CACHE_TTL=300000

# Database optimization
DB_MAX_CONNECTIONS=10
DB_CONNECTION_TIMEOUT=30000

# CDN configuration
CDN_ENABLED=true
CDN_CACHE_TTL=300
```

### Cache Configuration

```typescript
// Cache configuration options
const cacheConfig = {
  max: 500, // Maximum cache size
  ttl: 1000 * 60 * 5, // 5 minutes default TTL
  updateAgeOnGet: true, // Update age on access
  allowStale: true, // Allow stale items
  maxAge: 1000 * 60 * 10, // Maximum age of items
}
```

This performance optimization system ensures the application runs efficiently while providing comprehensive monitoring and optimization capabilities.
