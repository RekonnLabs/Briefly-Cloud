#!/usr/bin/env node

/**
 * OAuth Smoke Test Scripts
 * Comprehensive testing for OAuth flow validation
 */

import assert from "node:assert/strict"

const base = process.env.SMOKE_BASE_URL || 'http://localhost:3000'

console.log(`🔍 Running OAuth smoke tests against: ${base}`)

/**
 * Test 1: Authentication check
 */
async function testAuth() {
  console.log("Testing authentication with /api/dev/whoami...")
  
  try {
    const response = await fetch(`${base}/api/dev/whoami`, { 
      credentials: 'include',
      headers: {
        'Cookie': process.env.SMOKE_AUTH_COOKIE || ''
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      if (data.success && data.data.userId) {
        console.log(`✅ Auth working: User ID ${data.data.userId}`)
        console.log(`   Email: ${data.data.email || 'N/A'}`)
        console.log(`   Environment: ${data.data.environment}`)
        console.log(`   Correlation ID: ${data.data.correlationId}`)
        return { success: true, userId: data.data.userId }
      } else {
        console.log(`❌ Auth failed: Invalid response structure`)
        return { success: false, error: 'Invalid response structure' }
      }
    } else {
      console.log(`❌ Auth failed: ${response.status}`)
      const errorData = await response.json().catch(() => ({}))
      return { success: false, status: response.status, error: errorData }
    }
  } catch (error) {
    console.log(`❌ Auth failed: ${error.message}`)
    return { success: false, error: error.message }
  }
}

/**
 * Test 2: OAuth start endpoints
 */
async function testOAuthStart() {
  console.log("Testing OAuth start endpoints...")
  
  const providers = ['google', 'microsoft']
  const results = []
  
  for (const provider of providers) {
    try {
      console.log(`  Testing ${provider} start endpoint...`)
      
      const response = await fetch(`${base}/api/storage/${provider}/start`, { 
        credentials: 'include',
        headers: {
          'Cookie': process.env.SMOKE_AUTH_COOKIE || ''
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        
        // Validate response structure
        assert(data.success === true, `${provider}: success should be true`)
        assert(data.data && data.data.url, `${provider}: should have data.url`)
        assert(data.message, `${provider}: should have message`)
        assert(data.correlationId, `${provider}: should have correlationId`)
        assert(data.timestamp, `${provider}: should have timestamp`)
        
        // Validate OAuth URL structure
        const url = new URL(data.data.url)
        assert(url.searchParams.get('state'), `${provider}: OAuth URL should have state parameter`)
        assert(url.searchParams.get('client_id'), `${provider}: OAuth URL should have client_id`)
        
        console.log(`✅ ${provider} start: ${response.status}`)
        console.log(`   OAuth URL: ${url.origin}${url.pathname}`)
        console.log(`   State: ${url.searchParams.get('state')}`)
        console.log(`   Correlation ID: ${data.correlationId}`)
        
        results.push({ 
          provider, 
          success: true, 
          url: data.data.url,
          correlationId: data.correlationId,
          state: url.searchParams.get('state')
        })
      } else {
        console.log(`❌ ${provider} start: ${response.status}`)
        const errorData = await response.json().catch(() => ({}))
        results.push({ 
          provider, 
          success: false, 
          status: response.status,
          error: errorData
        })
      }
    } catch (error) {
      console.log(`❌ ${provider} start failed: ${error.message}`)
      results.push({ 
        provider, 
        success: false, 
        error: error.message 
      })
    }
  }
  
  return results
}

/**
 * Test 3: Unauthenticated access (should return 401)
 */
async function testUnauthenticated() {
  console.log("Testing unauthenticated access...")
  
  const endpoints = [
    '/api/storage/google/start',
    '/api/storage/microsoft/start',
    '/api/dev/whoami'
  ]
  
  const results = []
  
  for (const endpoint of endpoints) {
    try {
      console.log(`  Testing ${endpoint} without auth...`)
      
      const response = await fetch(`${base}${endpoint}`)
      
      if (response.status === 401) {
        console.log(`✅ ${endpoint}: Correctly blocked (401)`)
        results.push({ endpoint, success: true, status: 401 })
      } else {
        console.log(`❌ ${endpoint}: Should return 401, got ${response.status}`)
        results.push({ endpoint, success: false, status: response.status })
      }
    } catch (error) {
      console.log(`❌ ${endpoint}: Error - ${error.message}`)
      results.push({ endpoint, success: false, error: error.message })
    }
  }
  
  return results
}

/**
 * Test 4: Storage status endpoint
 */
async function testStorageStatus() {
  console.log("Testing storage status endpoint...")
  
  try {
    const response = await fetch(`${base}/api/storage/status`, { 
      credentials: 'include',
      headers: {
        'Cookie': process.env.SMOKE_AUTH_COOKIE || ''
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      
      if (data.success && data.data) {
        console.log(`✅ Storage status: ${response.status}`)
        console.log(`   Google Drive: ${data.data.google ? 'Connected' : 'Not connected'}`)
        console.log(`   Microsoft OneDrive: ${data.data.microsoft ? 'Connected' : 'Not connected'}`)
        
        return { 
          success: true, 
          status: data.data,
          correlationId: data.correlationId
        }
      } else {
        console.log(`❌ Storage status: Invalid response structure`)
        return { success: false, error: 'Invalid response structure' }
      }
    } else {
      console.log(`❌ Storage status: ${response.status}`)
      const errorData = await response.json().catch(() => ({}))
      return { success: false, status: response.status, error: errorData }
    }
  } catch (error) {
    console.log(`❌ Storage status failed: ${error.message}`)
    return { success: false, error: error.message }
  }
}

/**
 * Run all smoke tests
 */
async function runAllTests() {
  console.log("🚀 Starting OAuth smoke tests...\n")
  
  const results = {
    auth: await testAuth(),
    oauthStart: await testOAuthStart(),
    unauthenticated: await testUnauthenticated(),
    storageStatus: await testStorageStatus()
  }
  
  console.log("\n📊 Test Results Summary:")
  console.log("========================")
  
  // Auth test summary
  console.log(`Auth Test: ${results.auth.success ? '✅ PASS' : '❌ FAIL'}`)
  if (!results.auth.success) {
    console.log(`  Error: ${results.auth.error}`)
  }
  
  // OAuth start tests summary
  const oauthPassed = results.oauthStart.filter(r => r.success).length
  const oauthTotal = results.oauthStart.length
  console.log(`OAuth Start Tests: ${oauthPassed}/${oauthTotal} passed`)
  results.oauthStart.forEach(r => {
    console.log(`  ${r.provider}: ${r.success ? '✅ PASS' : '❌ FAIL'}`)
  })
  
  // Unauthenticated tests summary
  const unauthPassed = results.unauthenticated.filter(r => r.success).length
  const unauthTotal = results.unauthenticated.length
  console.log(`Unauthenticated Tests: ${unauthPassed}/${unauthTotal} passed`)
  
  // Storage status test summary
  console.log(`Storage Status Test: ${results.storageStatus.success ? '✅ PASS' : '❌ FAIL'}`)
  
  // Overall result
  const allPassed = results.auth.success && 
                   oauthPassed === oauthTotal && 
                   unauthPassed === unauthTotal && 
                   results.storageStatus.success
  
  console.log(`\n🎯 Overall Result: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`)
  
  if (!allPassed) {
    process.exit(1)
  }
  
  return results
}

// Export functions for programmatic use
export const smokeTests = {
  testAuth,
  testOAuthStart,
  testUnauthenticated,
  testStorageStatus,
  runAllTests
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await runAllTests()
    console.log("\n🎉 All OAuth smoke tests completed successfully!")
  } catch (error) {
    console.error("\n💥 Smoke tests failed:", error.message)
    process.exit(1)
  }
}