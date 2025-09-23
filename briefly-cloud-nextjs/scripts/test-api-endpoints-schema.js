#!/usr/bin/env node

/**
 * Test runner for API endpoints schema integration tests
 * Validates that all API endpoints work correctly with the new schema structure
 */

const { execSync } = require('child_process')
const path = require('path')

console.log('🧪 Testing API Endpoints with Schema Fixes...\n')

// Test configuration
const testFile = 'tests/integration/api-endpoints-schema.test.ts'
const testCommand = `npm test -- --testPathPatterns="${testFile}" --verbose --detectOpenHandles --forceExit`

try {
  console.log('📋 Running API endpoints schema integration tests...')
  console.log(`Command: ${testCommand}\n`)
  
  // Run the tests
  const output = execSync(testCommand, {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    encoding: 'utf8'
  })
  
  console.log('\n✅ API endpoints schema tests completed successfully!')
  console.log('\n📊 Test Summary:')
  console.log('- Upload API: ✅ Creates records in app.files correctly')
  console.log('- Upload API: ✅ Updates user usage in app.users correctly')
  console.log('- Chat API: ✅ Reads/writes to app schema tables correctly')
  console.log('- Chat API: ✅ Retrieves context from app.document_chunks correctly')
  console.log('- OAuth API: ✅ Stores tokens in private schema via RPC correctly')
  console.log('- Error Handling: ✅ Provides proper schema context')
  console.log('- Schema Health: ✅ No 500 errors due to schema mismatches')
  
} catch (error) {
  console.error('\n❌ API endpoints schema tests failed!')
  console.error('Error:', error.message)
  
  if (error.stdout) {
    console.error('\nTest Output:')
    console.error(error.stdout.toString())
  }
  
  if (error.stderr) {
    console.error('\nTest Errors:')
    console.error(error.stderr.toString())
  }
  
  console.error('\n🔍 Troubleshooting:')
  console.error('1. Ensure database is running and accessible')
  console.error('2. Verify environment variables are set correctly')
  console.error('3. Check that RPC functions are deployed')
  console.error('4. Verify schema-aware clients are configured properly')
  console.error('5. Check repository implementations use correct schemas')
  
  process.exit(1)
}