import { NextRequest, NextResponse } from 'next/server'
import { cacheManager, CachePerformanceMonitor } from './cache'

// Performance metrics collection
export class PerformanceMonitor {
  private static metrics = {
    requests: 0,
    responseTime: 0,
    errors: 0,
    cacheHits: 0,
    cacheMisses: 0,
    databaseQueries: 0,
    databaseQueryTime: 0,
    externalApiCalls: 0,
    externalApiTime: 0,
  }

  static recordRequest(duration: number) {
    this.metrics.requests++
    this.metrics.responseTime += duration
  }

  static recordError() {
    this.metrics.errors++
  }

  static recordDatabaseQuery(duration: number) {
    this.metrics.databaseQueries++
    this.metrics.databaseQueryTime += duration
  }

  static recordExternalApiCall(duration: number) {
    this.metrics.externalApiCalls++
    this.metrics.externalApiTime += duration
  }

  static getMetrics() {
    const cacheMetrics = CachePerformanceMonitor.getMetrics()
    return {
      ...this.metrics,
      avgResponseTime: this.metrics.requests > 0 
        ? this.metrics.responseTime / this.metrics.requests 
        : 0,
      avgDatabaseQueryTime: this.metrics.databaseQueries > 0 
        ? this.metrics.databaseQueryTime / this.metrics.databaseQueries 
        : 0,
      avgExternalApiTime: this.metrics.externalApiCalls > 0 
        ? this.metrics.externalApiTime / this.metrics.externalApiCalls 
        : 0,
      errorRate: this.metrics.requests > 0 
        ? (this.metrics.errors / this.metrics.requests) * 100 
        : 0,
      cache: cacheMetrics,
    }
  }

  static reset() {
    this.metrics = {
      requests: 0,
      responseTime: 0,
      errors: 0,
      cacheHits: 0,
      cacheMisses: 0,
      databaseQueries: 0,
      databaseQueryTime: 0,
      externalApiCalls: 0,
      externalApiTime: 0,
    }
    CachePerformanceMonitor.reset()
  }
}

// Database connection pooling
export class DatabaseConnectionPool {
  private static pool: Map<string, any> = new Map()
  private static maxConnections = 10
  private static connectionTimeout = 30000 // 30 seconds

  static async getConnection(key: string): Promise<any> {
    if (this.pool.has(key)) {
      const connection = this.pool.get(key)
      if (connection && !connection.closed) {
        return connection
      }
    }

    if (this.pool.size >= this.maxConnections) {
      // Remove oldest connection
      const oldestKey = this.pool.keys().next().value
      if (oldestKey) {
        const oldConnection = this.pool.get(oldestKey)
        if (oldConnection) {
          await oldConnection.end()
        }
        this.pool.delete(oldestKey)
      }
    }

    // Create new connection (this would be implemented based on your database client)
    const connection = await this.createConnection(key)
    this.pool.set(key, connection)
    
    return connection
  }

  private static async createConnection(key: string): Promise<any> {
    // This would be implemented based on your specific database client
    // For now, we'll return a mock connection
    return {
      key,
      closed: false,
      end: async () => {
        this.pool.delete(key)
      },
      query: async (sql: string, params: any[]) => {
        const startTime = Date.now()
        try {
          // Mock database query
          const result = { rows: [], rowCount: 0 }
          PerformanceMonitor.recordDatabaseQuery(Date.now() - startTime)
          return result
        } catch (error) {
          PerformanceMonitor.recordError()
          throw error
        }
      }
    }
  }

  static async closeAll() {
    for (const [key, connection] of this.pool) {
      if (connection && !connection.closed) {
        await connection.end()
      }
    }
    this.pool.clear()
  }
}

// Query optimization utilities
export class QueryOptimizer {
  static optimizeQuery(sql: string): string {
    // Basic query optimization
    let optimized = sql.trim()
    
    // Remove unnecessary whitespace
    optimized = optimized.replace(/\s+/g, ' ')
    
    // Add LIMIT if not present and query looks like it could benefit
    if (!optimized.toLowerCase().includes('limit') && 
        (optimized.toLowerCase().includes('select') || optimized.toLowerCase().includes('where'))) {
      optimized += ' LIMIT 1000'
    }
    
    return optimized
  }

  static shouldCacheQuery(sql: string): boolean {
    const lowerSql = sql.toLowerCase()
    
    // Cache SELECT queries that don't have time-sensitive data
    return lowerSql.startsWith('select') && 
           !lowerSql.includes('now()') && 
           !lowerSql.includes('current_timestamp') &&
           !lowerSql.includes('random()')
  }

  static getQueryCacheKey(sql: string, params: any[]): string {
    return `query:${sql}:${JSON.stringify(params)}`
  }
}

// Core Web Vitals tracking
export class CoreWebVitals {
  static trackLCP(element: Element) {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'largest-contentful-paint') {
          this.recordLCP(entry.startTime)
        }
      }
    })
    observer.observe({ entryTypes: ['largest-contentful-paint'] })
  }

  static trackFID() {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'first-input') {
          this.recordFID(entry.processingStart - entry.startTime)
        }
      }
    })
    observer.observe({ entryTypes: ['first-input'] })
  }

  static trackCLS() {
    let clsValue = 0
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'layout-shift') {
          clsValue += (entry as any).value
        }
      }
    })
    observer.observe({ entryTypes: ['layout-shift'] })
    
    // Report CLS when page is hidden
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.recordCLS(clsValue)
      }
    })
  }

  private static recordLCP(value: number) {
    console.log('LCP:', value)
    // Send to analytics service
  }

  private static recordFID(value: number) {
    console.log('FID:', value)
    // Send to analytics service
  }

  private static recordCLS(value: number) {
    console.log('CLS:', value)
    // Send to analytics service
  }
}

// Performance middleware for API routes
export function withPerformanceMonitoring(
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const startTime = Date.now()
    
    try {
      const response = await handler(req)
      const duration = Date.now() - startTime
      
      PerformanceMonitor.recordRequest(duration)
      
      // Add performance headers
      response.headers.set('X-Response-Time', `${duration}ms`)
      response.headers.set('X-Cache-Hit', response.headers.get('X-Cache-Hit') || 'false')
      
      return response
    } catch (error) {
      PerformanceMonitor.recordError()
      throw error
    }
  }
}

// Database query performance wrapper
export async function withQueryOptimization<T>(
  queryFn: () => Promise<T>,
  sql?: string,
  params?: any[]
): Promise<T> {
  const startTime = Date.now()
  
  try {
    let optimizedSql = sql
    if (sql) {
      optimizedSql = QueryOptimizer.optimizeQuery(sql)
    }
    
    const result = await queryFn()
    
    PerformanceMonitor.recordDatabaseQuery(Date.now() - startTime)
    
    return result
  } catch (error) {
    PerformanceMonitor.recordError()
    throw error
  }
}

// External API call performance wrapper
export function withApiPerformanceMonitoring<T>(
  apiCall: () => Promise<T>
): Promise<T> {
  return async () => {
    const startTime = Date.now()
    
    try {
      const result = await apiCall()
      
      PerformanceMonitor.recordExternalApiCall(Date.now() - startTime)
      
      return result
    } catch (error) {
      PerformanceMonitor.recordError()
      throw error
    }
  }()
}

// Performance monitoring API endpoint
export async function GET() {
  const metrics = PerformanceMonitor.getMetrics()
  const cacheStats = cacheManager.getStats()
  
  return NextResponse.json({
    performance: metrics,
    cache: cacheStats,
    timestamp: new Date().toISOString(),
  })
}
