#!/usr/bin/env node

/**
 * OAuth Test Runner Script
 * Runs all OAuth refinement tests and provides comprehensive reporting
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const OAUTH_TEST_FILES = [
  'tests/integration/oauth-response-consistency.test.ts',
  'tests/integration/oauth-state-verification.test.ts', 
  'tests/integration/oauth-cache-prevention.test.ts',
  'tests/integration/oauth-end-to-end.test.ts'
]

const PERFORMANCE_THRESHOLDS = {
  maxTestTime: 30000, // 30 seconds per test file
  maxTotalTime: 120000, // 2 minutes total
}

function formatTime(ms) {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function runTest(testFile) {
  console.log(`\n🧪 Running ${testFile}...`)
  const startTime = Date.now()
  
  try {
    const output = execSync(
      `npm test -- ${testFile} --verbose --runInBand`,
      { 
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: PERFORMANCE_THRESHOLDS.maxTestTime
      }
    )
    
    const endTime = Date.now()
    const duration = endTime - startTime
    
    // Parse test results
    const lines = output.split('\n')
    const passedTests = lines.filter(line => line.includes('✓')).length
    const failedTests = lines.filter(line => line.includes('✗')).length
    const totalTests = passedTests + failedTests
    
    console.log(`✅ ${testFile} completed in ${formatTime(duration)}`)
    console.log(`   Tests: ${totalTests} total, ${passedTests} passed, ${failedTests} failed`)
    
    return {
      file: testFile,
      success: true,
      duration,
      totalTests,
      passedTests,
      failedTests,
      output
    }
  } catch (error) {
    const endTime = Date.now()
    const duration = endTime - startTime
    
    console.log(`❌ ${testFile} failed in ${formatTime(duration)}`)
    console.log(`   Error: ${error.message}`)
    
    return {
      file: testFile,
      success: false,
      duration,
      error: error.message,
      output: error.stdout || error.stderr || ''
    }
  }
}

function generateReport(results) {
  const totalStartTime = Date.now()
  
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalFiles: results.length,
      passedFiles: results.filter(r => r.success).length,
      failedFiles: results.filter(r => !r.success).length,
      totalDuration: results.reduce((sum, r) => sum + r.duration, 0),
      totalTests: results.reduce((sum, r) => sum + (r.totalTests || 0), 0),
      totalPassed: results.reduce((sum, r) => sum + (r.passedTests || 0), 0),
      totalFailed: results.reduce((sum, r) => sum + (r.failedTests || 0), 0)
    },
    results,
    performance: {
      averageTestFileTime: results.reduce((sum, r) => sum + r.duration, 0) / results.length,
      slowestTest: results.reduce((max, r) => r.duration > max.duration ? r : max, results[0]),
      fastestTest: results.reduce((min, r) => r.duration < min.duration ? r : min, results[0]),
      withinThresholds: {
        maxTestTime: results.every(r => r.duration <= PERFORMANCE_THRESHOLDS.maxTestTime),
        maxTotalTime: results.reduce((sum, r) => sum + r.duration, 0) <= PERFORMANCE_THRESHOLDS.maxTotalTime
      }
    }
  }
  
  return report
}

function printSummary(report) {
  console.log('\n' + '='.repeat(80))
  console.log('📊 OAUTH REFINEMENT TESTS SUMMARY')
  console.log('='.repeat(80))
  
  const { summary, performance } = report
  
  console.log(`\n📈 Overall Results:`)
  console.log(`   Files: ${summary.totalFiles} total, ${summary.passedFiles} passed, ${summary.failedFiles} failed`)
  console.log(`   Tests: ${summary.totalTests} total, ${summary.totalPassed} passed, ${summary.totalFailed} failed`)
  console.log(`   Duration: ${formatTime(summary.totalDuration)}`)
  
  console.log(`\n⚡ Performance:`)
  console.log(`   Average per file: ${formatTime(performance.averageTestFileTime)}`)
  console.log(`   Slowest: ${performance.slowestTest.file} (${formatTime(performance.slowestTest.duration)})`)
  console.log(`   Fastest: ${performance.fastestTest.file} (${formatTime(performance.fastestTest.duration)})`)
  
  if (performance.withinThresholds.maxTestTime && performance.withinThresholds.maxTotalTime) {
    console.log(`   ✅ All tests within performance thresholds`)
  } else {
    console.log(`   ⚠️  Some tests exceeded performance thresholds`)
  }
  
  console.log(`\n📋 Test Coverage Areas:`)
  console.log(`   ✅ JSON Response Consistency`)
  console.log(`   ✅ State Verification Security`)
  console.log(`   ✅ Cache Prevention Validation`)
  console.log(`   ✅ End-to-End OAuth Flows`)
  
  if (summary.failedFiles > 0) {
    console.log(`\n❌ Failed Files:`)
    report.results
      .filter(r => !r.success)
      .forEach(r => {
        console.log(`   - ${r.file}: ${r.error}`)
      })
  }
  
  const successRate = (summary.passedFiles / summary.totalFiles) * 100
  console.log(`\n🎯 Success Rate: ${successRate.toFixed(1)}%`)
  
  if (successRate === 100) {
    console.log(`\n🎉 All OAuth refinement tests passed! Ready for production deployment.`)
  } else {
    console.log(`\n⚠️  Some tests failed. Please review and fix before deployment.`)
  }
  
  console.log('\n' + '='.repeat(80))
}

function saveReport(report) {
  const reportPath = join(process.cwd(), 'reports', 'oauth-test-report.json')
  
  try {
    writeFileSync(reportPath, JSON.stringify(report, null, 2))
    console.log(`\n📄 Detailed report saved to: ${reportPath}`)
  } catch (error) {
    console.log(`\n⚠️  Could not save report: ${error.message}`)
  }
}

async function main() {
  console.log('🚀 Starting OAuth Refinement Test Suite')
  console.log(`📁 Running ${OAUTH_TEST_FILES.length} test files...`)
  
  const overallStartTime = Date.now()
  const results = []
  
  // Run each test file
  for (const testFile of OAUTH_TEST_FILES) {
    const result = runTest(testFile)
    results.push(result)
    
    // Short pause between tests
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  
  const overallEndTime = Date.now()
  const totalDuration = overallEndTime - overallStartTime
  
  // Generate and display report
  const report = generateReport(results)
  report.summary.totalDuration = totalDuration
  
  printSummary(report)
  saveReport(report)
  
  // Exit with appropriate code
  const hasFailures = results.some(r => !r.success)
  process.exit(hasFailures ? 1 : 0)
}

// Handle errors gracefully
process.on('uncaughtException', (error) => {
  console.error('\n💥 Uncaught Exception:', error.message)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n💥 Unhandled Rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

// Run the test suite
main().catch(error => {
  console.error('\n💥 Test runner failed:', error.message)
  process.exit(1)
})