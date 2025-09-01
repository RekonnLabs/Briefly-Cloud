#!/usr/bin/env node

/**
 * Test Runner for Backend API Fixes
 * Runs the comprehensive test suite and reports results
 */

const { execSync } = require('child_process')
const path = require('path')

const testSuites = [
  {
    name: 'Authentication and Middleware Tests',
    command: 'npm run test:middleware',
    description: 'Tests createProtectedApiHandler, authentication, and middleware functionality'
  },
  {
    name: 'OAuth Token Management Tests', 
    command: 'npm run test:oauth',
    description: 'Tests secure token storage, refresh flows, and RPC functions'
  },
  {
    name: 'Cloud Storage Integration Tests',
    command: 'npm run test:storage', 
    description: 'Tests file listing, pagination, import jobs, and error handling'
  },
  {
    name: 'Performance and Load Tests',
    command: 'npm run test:performance',
    description: 'Tests large folder imports, concurrent operations, and memory management'
  }
]

async function runTests() {
  console.log('🧪 Running Backend API Fixes Test Suite\n')
  
  const results = []
  
  for (const suite of testSuites) {
    console.log(`📋 ${suite.name}`)
    console.log(`   ${suite.description}`)
    
    try {
      const startTime = Date.now()
      execSync(suite.command, { 
        stdio: 'inherit',
        cwd: process.cwd()
      })
      const duration = Date.now() - startTime
      
      results.push({
        name: suite.name,
        status: 'PASSED',
        duration
      })
      
      console.log(`✅ PASSED (${duration}ms)\n`)
    } catch (error) {
      results.push({
        name: suite.name,
        status: 'FAILED',
        error: error.message
      })
      
      console.log(`❌ FAILED\n`)
    }
  }
  
  // Print summary
  console.log('📊 Test Results Summary')
  console.log('=' .repeat(50))
  
  const passed = results.filter(r => r.status === 'PASSED').length
  const failed = results.filter(r => r.status === 'FAILED').length
  
  results.forEach(result => {
    const icon = result.status === 'PASSED' ? '✅' : '❌'
    const duration = result.duration ? ` (${result.duration}ms)` : ''
    console.log(`${icon} ${result.name}${duration}`)
  })
  
  console.log('\n' + '='.repeat(50))
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`)
  
  if (failed > 0) {
    console.log('\n❌ Some tests failed. Check the output above for details.')
    process.exit(1)
  } else {
    console.log('\n🎉 All tests passed!')
    process.exit(0)
  }
}

// Handle command line arguments
const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log('Backend API Fixes Test Runner')
  console.log('')
  console.log('Usage: node tests/test-runner.js [options]')
  console.log('')
  console.log('Options:')
  console.log('  --help, -h     Show this help message')
  console.log('  --coverage     Run tests with coverage report')
  console.log('')
  console.log('Available test suites:')
  testSuites.forEach(suite => {
    console.log(`  • ${suite.name}`)
    console.log(`    ${suite.description}`)
  })
  process.exit(0)
}

if (args.includes('--coverage')) {
  console.log('Running tests with coverage...')
  try {
    execSync('npm run test:coverage', { stdio: 'inherit' })
  } catch (error) {
    console.error('Coverage tests failed:', error.message)
    process.exit(1)
  }
} else {
  runTests().catch(error => {
    console.error('Test runner failed:', error)
    process.exit(1)
  })
}