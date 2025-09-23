/**
 * Global teardown for performance tests
 * Cleans up test environment and generates final performance report
 */

export default async function globalTeardown() {
  console.log('🧹 Cleaning up performance test environment...')
  
  try {
    // Import performance monitor to generate final report
    const { schemaMonitor } = await import('../../src/app/lib/performance/schema-monitor')
    
    // Generate comprehensive performance report
    const report = schemaMonitor.generateReport()
    
    if (report) {
      console.log('\n📊 Final Performance Report:')
      console.log(report)
    }
    
    // Export metrics for analysis
    const metrics = schemaMonitor.exportMetrics()
    if (metrics.length > 0) {
      console.log(`\n📈 Total operations monitored: ${metrics.length}`)
      
      // Group by schema
      const schemaGroups = metrics.reduce((acc, metric) => {
        acc[metric.schema] = (acc[metric.schema] || 0) + 1
        return acc
      }, {} as Record<string, number>)
      
      console.log('Operations by schema:')
      Object.entries(schemaGroups).forEach(([schema, count]) => {
        console.log(`  - ${schema}: ${count} operations`)
      })
      
      // Show slowest operations
      const slowOps = metrics
        .filter(m => m.duration > 500)
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 5)
      
      if (slowOps.length > 0) {
        console.log('\n🐌 Slowest operations:')
        slowOps.forEach(op => {
          console.log(`  - ${op.operation} (${op.schema}): ${op.duration}ms`)
        })
      }
      
      // Show error summary
      const errors = metrics.filter(m => !m.success)
      if (errors.length > 0) {
        console.log(`\n❌ Operations with errors: ${errors.length}`)
        const errorGroups = errors.reduce((acc, error) => {
          const key = error.error || 'Unknown error'
          acc[key] = (acc[key] || 0) + 1
          return acc
        }, {} as Record<string, number>)
        
        Object.entries(errorGroups).forEach(([error, count]) => {
          console.log(`  - ${error}: ${count} occurrences`)
        })
      }
    }
    
  } catch (error) {
    console.warn('⚠️  Performance report generation failed:', error.message)
  }
  
  // Clean up environment variables
  delete process.env.ENABLE_PERFORMANCE_MONITORING
  delete process.env.JEST_PERFORMANCE_TEST
  
  console.log('✅ Performance test cleanup completed')
}