/**
 * Custom Jest reporter for performance metrics
 * Captures and reports performance data from test runs
 */

class PerformanceReporter {
  constructor(globalConfig, options) {
    this.globalConfig = globalConfig
    this.options = options
    this.performanceData = {
      suites: [],
      totalDuration: 0,
      slowTests: [],
      errors: [],
      startTime: Date.now()
    }
  }

  onRunStart(results, options) {
    console.log('📊 Performance Reporter: Starting performance monitoring...')
    this.performanceData.startTime = Date.now()
  }

  onTestSuiteResult(test, testResult, aggregatedResult) {
    const suiteDuration = testResult.perfStats?.end - testResult.perfStats?.start || 0
    
    const suiteData = {
      name: testResult.testFilePath,
      duration: suiteDuration,
      numTests: testResult.numPassingTests + testResult.numFailingTests,
      numPassing: testResult.numPassingTests,
      numFailing: testResult.numFailingTests,
      tests: []
    }

    // Process individual test results
    testResult.testResults.forEach(test => {
      const testData = {
        name: test.fullName,
        duration: test.duration || 0,
        status: test.status,
        errors: test.failureMessages
      }

      suiteData.tests.push(testData)

      // Track slow tests (over 5 seconds)
      if (testData.duration > 5000) {
        this.performanceData.slowTests.push({
          suite: suiteData.name,
          test: testData.name,
          duration: testData.duration
        })
      }

      // Track errors
      if (test.status === 'failed') {
        this.performanceData.errors.push({
          suite: suiteData.name,
          test: testData.name,
          errors: test.failureMessages
        })
      }
    })

    this.performanceData.suites.push(suiteData)
    this.performanceData.totalDuration += suiteDuration
  }

  onRunComplete(contexts, results) {
    const totalTime = Date.now() - this.performanceData.startTime
    
    console.log('\n' + '='.repeat(60))
    console.log('📊 PERFORMANCE REPORT')
    console.log('='.repeat(60))
    
    // Overall statistics
    console.log('\n📈 Overall Statistics:')
    console.log(`Total Runtime: ${totalTime}ms`)
    console.log(`Total Test Suites: ${this.performanceData.suites.length}`)
    console.log(`Total Tests: ${results.numTotalTests}`)
    console.log(`Passing Tests: ${results.numPassedTests}`)
    console.log(`Failing Tests: ${results.numFailedTests}`)
    
    if (results.numTotalTests > 0) {
      const avgTestTime = this.performanceData.totalDuration / results.numTotalTests
      console.log(`Average Test Duration: ${avgTestTime.toFixed(2)}ms`)
    }

    // Suite performance breakdown
    if (this.performanceData.suites.length > 0) {
      console.log('\n📋 Suite Performance:')
      this.performanceData.suites
        .sort((a, b) => b.duration - a.duration)
        .forEach(suite => {
          const suiteName = suite.name.split('/').pop() || suite.name
          const avgTestTime = suite.numTests > 0 ? (suite.duration / suite.numTests).toFixed(2) : '0'
          console.log(`  ${suiteName}: ${suite.duration}ms (${suite.numTests} tests, avg: ${avgTestTime}ms/test)`)
        })
    }

    // Slow tests
    if (this.performanceData.slowTests.length > 0) {
      console.log('\n🐌 Slow Tests (>5s):')
      this.performanceData.slowTests
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 10) // Top 10 slowest
        .forEach(slowTest => {
          const suiteName = slowTest.suite.split('/').pop() || slowTest.suite
          console.log(`  ${slowTest.test} (${suiteName}): ${slowTest.duration}ms`)
        })
    } else {
      console.log('\n✅ No slow tests detected')
    }

    // Performance thresholds check
    console.log('\n🎯 Performance Threshold Analysis:')
    const thresholds = {
      'Simple Query': 100,
      'Complex Query': 500,
      'RPC Function': 200,
      'Bulk Operation': 1000,
      'Concurrent Operation': 2000
    }

    // Analyze test names to categorize performance
    const testCategories = this.categorizeTests()
    Object.entries(testCategories).forEach(([category, tests]) => {
      if (tests.length > 0) {
        const avgDuration = tests.reduce((sum, test) => sum + test.duration, 0) / tests.length
        const threshold = thresholds[category] || 1000
        const status = avgDuration <= threshold ? '✅' : '❌'
        console.log(`  ${category}: ${avgDuration.toFixed(2)}ms avg ${status} (threshold: ${threshold}ms)`)
        
        if (avgDuration > threshold) {
          const slowInCategory = tests.filter(test => test.duration > threshold)
          console.log(`    ${slowInCategory.length}/${tests.length} tests exceeded threshold`)
        }
      }
    })

    // Error summary
    if (this.performanceData.errors.length > 0) {
      console.log('\n❌ Test Errors:')
      this.performanceData.errors.slice(0, 5).forEach(error => {
        const suiteName = error.suite.split('/').pop() || error.suite
        console.log(`  ${error.test} (${suiteName})`)
        if (error.errors.length > 0) {
          console.log(`    ${error.errors[0].split('\n')[0]}`)
        }
      })
      
      if (this.performanceData.errors.length > 5) {
        console.log(`  ... and ${this.performanceData.errors.length - 5} more errors`)
      }
    }

    // Memory usage if available
    if (global.__PERFORMANCE_TEST_CONFIG__) {
      const memoryUsage = process.memoryUsage()
      console.log('\n💾 Memory Usage:')
      console.log(`  RSS: ${Math.round(memoryUsage.rss / 1024 / 1024)}MB`)
      console.log(`  Heap Used: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`)
      console.log(`  Heap Total: ${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`)
    }

    // Recommendations
    console.log('\n💡 Recommendations:')
    const recommendations = this.generateRecommendations()
    recommendations.forEach(rec => console.log(`  - ${rec}`))

    console.log('\n' + '='.repeat(60))
    console.log('📊 END PERFORMANCE REPORT')
    console.log('='.repeat(60))
  }

  categorizeTests() {
    const categories = {
      'Simple Query': [],
      'Complex Query': [],
      'RPC Function': [],
      'Bulk Operation': [],
      'Concurrent Operation': []
    }

    this.performanceData.suites.forEach(suite => {
      suite.tests.forEach(test => {
        const testName = test.name.toLowerCase()
        
        if (testName.includes('rpc') || testName.includes('oauth')) {
          categories['RPC Function'].push(test)
        } else if (testName.includes('concurrent')) {
          categories['Concurrent Operation'].push(test)
        } else if (testName.includes('bulk') || testName.includes('multiple')) {
          categories['Bulk Operation'].push(test)
        } else if (testName.includes('complex') || testName.includes('join') || testName.includes('search')) {
          categories['Complex Query'].push(test)
        } else if (testName.includes('query') || testName.includes('find') || testName.includes('get')) {
          categories['Simple Query'].push(test)
        }
      })
    })

    return categories
  }

  generateRecommendations() {
    const recommendations = []

    // Check for slow tests
    if (this.performanceData.slowTests.length > 0) {
      recommendations.push('Investigate and optimize slow tests (>5s)')
    }

    // Check for high error rate
    const errorRate = this.performanceData.errors.length / this.performanceData.suites.reduce((sum, suite) => sum + suite.numTests, 0)
    if (errorRate > 0.1) {
      recommendations.push('High error rate detected - review failing tests')
    }

    // Check overall performance
    const avgSuiteDuration = this.performanceData.totalDuration / this.performanceData.suites.length
    if (avgSuiteDuration > 10000) {
      recommendations.push('Consider breaking down large test suites for better performance')
    }

    // Memory recommendations
    const memoryUsage = process.memoryUsage()
    if (memoryUsage.heapUsed > 500 * 1024 * 1024) { // 500MB
      recommendations.push('High memory usage detected - check for memory leaks in tests')
    }

    if (recommendations.length === 0) {
      recommendations.push('Performance looks good! Continue monitoring in production')
    }

    return recommendations
  }
}

module.exports = PerformanceReporter