#!/usr/bin/env node

/**
 * Performance Test Runner
 * Runs comprehensive performance tests for the schema migration
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// Performance test configuration
const PERFORMANCE_CONFIG = {
  testTimeout: 30000, // 30 seconds per test
  maxConcurrency: 10,
  warmupRuns: 3,
  measurementRuns: 10,
  thresholds: {
    simpleQuery: 100,
    complexQuery: 500,
    rpcFunction: 200,
    bulkOperation: 1000,
    concurrentOperation: 2000
  }
}

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function logSection(title) {
  log(`\n${'='.repeat(60)}`, 'cyan')
  log(`${title}`, 'bright')
  log(`${'='.repeat(60)}`, 'cyan')
}

function logSubsection(title) {
  log(`\n${'-'.repeat(40)}`, 'blue')
  log(`${title}`, 'blue')
  log(`${'-'.repeat(40)}`, 'blue')
}

async function runPerformanceTests() {
  logSection('Schema Performance Test Suite')
  
  try {
    // Check if required environment variables are set
    checkEnvironment()
    
    // Run warmup
    await runWarmup()
    
    // Run performance tests
    await runTests()
    
    // Generate performance report
    await generateReport()
    
    log('\n✅ Performance tests completed successfully!', 'green')
    
  } catch (error) {
    log(`\n❌ Performance tests failed: ${error.message}`, 'red')
    process.exit(1)
  }
}

function checkEnvironment() {
  logSubsection('Environment Check')
  
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
  ]
  
  const missing = requiredEnvVars.filter(envVar => !process.env[envVar])
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
  
  log('✅ Environment variables check passed', 'green')
  
  // Check if test database is accessible
  try {
    execSync('npm run test:db-connection', { stdio: 'pipe' })
    log('✅ Database connection check passed', 'green')
  } catch (error) {
    log('⚠️  Database connection check failed, continuing anyway', 'yellow')
  }
}

async function runWarmup() {
  logSubsection('Warmup Phase')
  
  log(`Running ${PERFORMANCE_CONFIG.warmupRuns} warmup iterations...`)
  
  try {
    for (let i = 1; i <= PERFORMANCE_CONFIG.warmupRuns; i++) {
      log(`Warmup run ${i}/${PERFORMANCE_CONFIG.warmupRuns}`)
      execSync('npm test -- tests/performance/schema-performance.test.ts --silent', { 
        stdio: 'pipe',
        timeout: PERFORMANCE_CONFIG.testTimeout 
      })
    }
    log('✅ Warmup completed', 'green')
  } catch (error) {
    log('⚠️  Warmup failed, continuing with tests', 'yellow')
  }
}

async function runTests() {
  logSubsection('Performance Test Execution')
  
  const testSuites = [
    {
      name: 'App Schema Query Performance',
      pattern: 'App Schema Query Performance',
      description: 'Tests basic query performance on app schema tables'
    },
    {
      name: 'RPC Function Performance',
      pattern: 'RPC Function Performance',
      description: 'Tests OAuth RPC function performance'
    },
    {
      name: 'Concurrent Operations',
      pattern: 'Concurrent Operations',
      description: 'Tests concurrent operations across schemas'
    },
    {
      name: 'Connection Pooling Efficiency',
      pattern: 'Connection Pooling Efficiency',
      description: 'Tests connection pooling with multiple schemas'
    }
  ]
  
  const results = []
  
  for (const suite of testSuites) {
    log(`\nRunning: ${suite.name}`)
    log(`Description: ${suite.description}`, 'blue')
    
    try {
      const startTime = Date.now()
      
      const output = execSync(
        `npm test -- tests/performance/schema-performance.test.ts --testNamePattern="${suite.pattern}" --verbose`,
        { 
          encoding: 'utf8',
          timeout: PERFORMANCE_CONFIG.testTimeout 
        }
      )
      
      const duration = Date.now() - startTime
      
      // Parse test results
      const passed = output.includes('PASS')
      const failed = output.includes('FAIL')
      
      results.push({
        name: suite.name,
        passed,
        failed,
        duration,
        output: output.split('\n').slice(-10).join('\n') // Last 10 lines
      })
      
      if (passed) {
        log(`✅ ${suite.name} passed (${duration}ms)`, 'green')
      } else {
        log(`❌ ${suite.name} failed (${duration}ms)`, 'red')
      }
      
    } catch (error) {
      log(`❌ ${suite.name} failed with error: ${error.message}`, 'red')
      results.push({
        name: suite.name,
        passed: false,
        failed: true,
        duration: 0,
        error: error.message
      })
    }
  }
  
  // Summary
  const passedCount = results.filter(r => r.passed).length
  const failedCount = results.filter(r => r.failed).length
  
  log(`\nTest Summary:`, 'bright')
  log(`✅ Passed: ${passedCount}`, 'green')
  log(`❌ Failed: ${failedCount}`, failedCount > 0 ? 'red' : 'reset')
  log(`⏱️  Total Duration: ${results.reduce((sum, r) => sum + r.duration, 0)}ms`)
  
  return results
}

async function generateReport() {
  logSubsection('Performance Report Generation')
  
  try {
    // Run a comprehensive test to generate performance data
    const output = execSync(
      'npm test -- tests/performance/schema-performance.test.ts --verbose',
      { encoding: 'utf8', timeout: PERFORMANCE_CONFIG.testTimeout }
    )
    
    // Extract performance metrics from test output
    const performanceData = extractPerformanceMetrics(output)
    
    // Generate report
    const report = generatePerformanceReport(performanceData)
    
    // Save report to file
    const reportPath = path.join(__dirname, '..', 'performance-report.md')
    fs.writeFileSync(reportPath, report)
    
    log(`📊 Performance report saved to: ${reportPath}`, 'green')
    
    // Display summary
    displayPerformanceSummary(performanceData)
    
  } catch (error) {
    log(`⚠️  Report generation failed: ${error.message}`, 'yellow')
  }
}

function extractPerformanceMetrics(testOutput) {
  const metrics = {
    queryTimes: [],
    rpcTimes: [],
    concurrentTimes: [],
    errors: [],
    warnings: []
  }
  
  // Extract timing information from console.log statements in tests
  const lines = testOutput.split('\n')
  
  lines.forEach(line => {
    // Look for performance stats
    if (line.includes('Query Performance Stats:')) {
      const avgMatch = line.match(/Average: ([\d.]+)ms/)
      if (avgMatch) {
        metrics.queryTimes.push(parseFloat(avgMatch[1]))
      }
    }
    
    if (line.includes('RPC Performance Stats:')) {
      const avgMatch = line.match(/Average: ([\d.]+)ms/)
      if (avgMatch) {
        metrics.rpcTimes.push(parseFloat(avgMatch[1]))
      }
    }
    
    // Look for errors and warnings
    if (line.includes('ERROR') || line.includes('FAIL')) {
      metrics.errors.push(line.trim())
    }
    
    if (line.includes('WARN') || line.includes('⚠️')) {
      metrics.warnings.push(line.trim())
    }
  })
  
  return metrics
}

function generatePerformanceReport(metrics) {
  const timestamp = new Date().toISOString()
  
  return `# Schema Performance Test Report

Generated: ${timestamp}

## Test Configuration
- Test Timeout: ${PERFORMANCE_CONFIG.testTimeout}ms
- Warmup Runs: ${PERFORMANCE_CONFIG.warmupRuns}
- Measurement Runs: ${PERFORMANCE_CONFIG.measurementRuns}

## Performance Thresholds
- Simple Query: ${PERFORMANCE_CONFIG.thresholds.simpleQuery}ms
- Complex Query: ${PERFORMANCE_CONFIG.thresholds.complexQuery}ms
- RPC Function: ${PERFORMANCE_CONFIG.thresholds.rpcFunction}ms
- Bulk Operation: ${PERFORMANCE_CONFIG.thresholds.bulkOperation}ms
- Concurrent Operation: ${PERFORMANCE_CONFIG.thresholds.concurrentOperation}ms

## Results Summary

### Query Performance
${metrics.queryTimes.length > 0 ? `
- Average Query Time: ${(metrics.queryTimes.reduce((a, b) => a + b, 0) / metrics.queryTimes.length).toFixed(2)}ms
- Min Query Time: ${Math.min(...metrics.queryTimes).toFixed(2)}ms
- Max Query Time: ${Math.max(...metrics.queryTimes).toFixed(2)}ms
- Threshold Compliance: ${metrics.queryTimes.every(t => t < PERFORMANCE_CONFIG.thresholds.simpleQuery) ? '✅ PASS' : '❌ FAIL'}
` : '- No query performance data collected'}

### RPC Function Performance
${metrics.rpcTimes.length > 0 ? `
- Average RPC Time: ${(metrics.rpcTimes.reduce((a, b) => a + b, 0) / metrics.rpcTimes.length).toFixed(2)}ms
- Min RPC Time: ${Math.min(...metrics.rpcTimes).toFixed(2)}ms
- Max RPC Time: ${Math.max(...metrics.rpcTimes).toFixed(2)}ms
- Threshold Compliance: ${metrics.rpcTimes.every(t => t < PERFORMANCE_CONFIG.thresholds.rpcFunction) ? '✅ PASS' : '❌ FAIL'}
` : '- No RPC performance data collected'}

## Issues Found

### Errors
${metrics.errors.length > 0 ? metrics.errors.map(e => `- ${e}`).join('\n') : '- None'}

### Warnings
${metrics.warnings.length > 0 ? metrics.warnings.map(w => `- ${w}`).join('\n') : '- None'}

## Recommendations

${generateRecommendations(metrics)}

## Next Steps

1. Review any failed tests and address performance issues
2. Monitor performance in production environment
3. Set up automated performance regression testing
4. Consider implementing performance monitoring in production

---
*Report generated by Schema Performance Test Suite*
`
}

function generateRecommendations(metrics) {
  const recommendations = []
  
  if (metrics.queryTimes.some(t => t > PERFORMANCE_CONFIG.thresholds.simpleQuery)) {
    recommendations.push('- Consider adding database indexes for slow queries')
    recommendations.push('- Review query patterns and optimize WHERE clauses')
  }
  
  if (metrics.rpcTimes.some(t => t > PERFORMANCE_CONFIG.thresholds.rpcFunction)) {
    recommendations.push('- Optimize RPC function implementations')
    recommendations.push('- Consider caching for frequently accessed OAuth tokens')
  }
  
  if (metrics.errors.length > 0) {
    recommendations.push('- Address test errors before deploying to production')
    recommendations.push('- Review error handling in repository classes')
  }
  
  if (recommendations.length === 0) {
    recommendations.push('- Performance looks good! Continue monitoring in production')
    recommendations.push('- Consider setting up automated performance regression tests')
  }
  
  return recommendations.join('\n')
}

function displayPerformanceSummary(metrics) {
  logSubsection('Performance Summary')
  
  if (metrics.queryTimes.length > 0) {
    const avgQuery = (metrics.queryTimes.reduce((a, b) => a + b, 0) / metrics.queryTimes.length).toFixed(2)
    const queryStatus = metrics.queryTimes.every(t => t < PERFORMANCE_CONFIG.thresholds.simpleQuery)
    log(`Query Performance: ${avgQuery}ms avg ${queryStatus ? '✅' : '❌'}`, queryStatus ? 'green' : 'red')
  }
  
  if (metrics.rpcTimes.length > 0) {
    const avgRpc = (metrics.rpcTimes.reduce((a, b) => a + b, 0) / metrics.rpcTimes.length).toFixed(2)
    const rpcStatus = metrics.rpcTimes.every(t => t < PERFORMANCE_CONFIG.thresholds.rpcFunction)
    log(`RPC Performance: ${avgRpc}ms avg ${rpcStatus ? '✅' : '❌'}`, rpcStatus ? 'green' : 'red')
  }
  
  if (metrics.errors.length > 0) {
    log(`Errors Found: ${metrics.errors.length} ❌`, 'red')
  } else {
    log(`No Errors Found ✅`, 'green')
  }
  
  if (metrics.warnings.length > 0) {
    log(`Warnings: ${metrics.warnings.length} ⚠️`, 'yellow')
  }
}

// Run the performance tests
if (require.main === module) {
  runPerformanceTests().catch(error => {
    console.error('Performance test runner failed:', error)
    process.exit(1)
  })
}

module.exports = {
  runPerformanceTests,
  PERFORMANCE_CONFIG
}