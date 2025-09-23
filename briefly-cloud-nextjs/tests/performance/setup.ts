/**
 * Performance test setup
 * Configures environment and utilities for performance testing
 */

import { schemaMonitor } from '@/app/lib/performance/schema-monitor'

// Global performance test configuration
declare global {
  var __PERFORMANCE_TEST_CONFIG__: {
    startTime: number
    testMetrics: Array<{
      testName: string
      duration: number
      memoryUsage: NodeJS.MemoryUsage
      timestamp: Date
    }>
  }
}

// Initialize global performance tracking
global.__PERFORMANCE_TEST_CONFIG__ = {
  startTime: Date.now(),
  testMetrics: []
}

// Setup performance monitoring
beforeAll(() => {
  // Clear any existing metrics
  schemaMonitor.clearMetrics()
  
  // Enable performance monitoring for tests
  process.env.ENABLE_PERFORMANCE_MONITORING = 'true'
  
  console.log('🚀 Performance test suite starting...')
  console.log(`Memory usage at start: ${JSON.stringify(process.memoryUsage(), null, 2)}`)
})

// Track individual test performance
beforeEach(() => {
  const testName = expect.getState().currentTestName || 'unknown'
  global.__PERFORMANCE_TEST_CONFIG__.testMetrics.push({
    testName,
    duration: 0,
    memoryUsage: process.memoryUsage(),
    timestamp: new Date()
  })
})

afterEach(() => {
  const testName = expect.getState().currentTestName || 'unknown'
  const metrics = global.__PERFORMANCE_TEST_CONFIG__.testMetrics
  const currentTest = metrics[metrics.length - 1]
  
  if (currentTest && currentTest.testName === testName) {
    currentTest.duration = Date.now() - currentTest.timestamp.getTime()
    
    // Log slow tests
    if (currentTest.duration > 5000) {
      console.warn(`⚠️  Slow test detected: ${testName} took ${currentTest.duration}ms`)
    }
  }
})

// Cleanup and reporting
afterAll(() => {
  const totalDuration = Date.now() - global.__PERFORMANCE_TEST_CONFIG__.startTime
  const metrics = global.__PERFORMANCE_TEST_CONFIG__.testMetrics
  
  console.log('\n📊 Performance Test Summary:')
  console.log(`Total suite duration: ${totalDuration}ms`)
  console.log(`Total tests: ${metrics.length}`)
  
  if (metrics.length > 0) {
    const avgDuration = metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length
    const slowestTest = metrics.reduce((max, m) => m.duration > max.duration ? m : max)
    
    console.log(`Average test duration: ${avgDuration.toFixed(2)}ms`)
    console.log(`Slowest test: ${slowestTest.testName} (${slowestTest.duration}ms)`)
  }
  
  // Generate schema performance report
  const schemaStats = schemaMonitor.getStats()
  if (schemaStats.totalOperations > 0) {
    console.log('\n📈 Schema Performance Stats:')
    console.log(`Total operations: ${schemaStats.totalOperations}`)
    console.log(`Average duration: ${schemaStats.averageDuration.toFixed(2)}ms`)
    console.log(`Success rate: ${(schemaStats.successRate * 100).toFixed(2)}%`)
    
    if (schemaStats.errorCount > 0) {
      console.log(`❌ Errors: ${schemaStats.errorCount}`)
      schemaStats.recentErrors.slice(0, 3).forEach(error => {
        console.log(`  - ${error}`)
      })
    }
  }
  
  console.log(`Memory usage at end: ${JSON.stringify(process.memoryUsage(), null, 2)}`)
})

// Utility functions for performance tests
export const performanceUtils = {
  /**
   * Measure the execution time of a function
   */
  async measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const start = Date.now()
    const result = await fn()
    const duration = Date.now() - start
    return { result, duration }
  },

  /**
   * Run a function multiple times and return statistics
   */
  async benchmark<T>(
    fn: () => Promise<T>,
    iterations: number = 10
  ): Promise<{
    results: T[]
    durations: number[]
    avgDuration: number
    minDuration: number
    maxDuration: number
    totalDuration: number
  }> {
    const results: T[] = []
    const durations: number[] = []

    for (let i = 0; i < iterations; i++) {
      const { result, duration } = await this.measureTime(fn)
      results.push(result)
      durations.push(duration)
    }

    return {
      results,
      durations,
      avgDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      totalDuration: durations.reduce((sum, d) => sum + d, 0)
    }
  },

  /**
   * Check if a duration meets a performance threshold
   */
  checkThreshold(
    duration: number,
    threshold: number,
    operation: string
  ): { passed: boolean; message: string } {
    const passed = duration <= threshold
    const message = passed
      ? `✅ ${operation} completed in ${duration}ms (threshold: ${threshold}ms)`
      : `❌ ${operation} took ${duration}ms, exceeding threshold of ${threshold}ms`
    
    return { passed, message }
  },

  /**
   * Get current memory usage
   */
  getMemoryUsage(): NodeJS.MemoryUsage {
    return process.memoryUsage()
  },

  /**
   * Format memory usage for display
   */
  formatMemoryUsage(usage: NodeJS.MemoryUsage): string {
    return `RSS: ${Math.round(usage.rss / 1024 / 1024)}MB, ` +
           `Heap Used: ${Math.round(usage.heapUsed / 1024 / 1024)}MB, ` +
           `Heap Total: ${Math.round(usage.heapTotal / 1024 / 1024)}MB`
  }
}

// Export for use in tests
export { schemaMonitor }