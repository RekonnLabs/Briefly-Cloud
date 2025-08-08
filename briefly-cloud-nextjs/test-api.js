/**
 * Simple test script to verify API endpoints are working
 */

const BASE_URL = 'http://localhost:3000'

async function testEndpoint(path, method = 'GET', body = null, headers = {}) {
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    }
    
    if (body) {
      options.body = JSON.stringify(body)
    }
    
    const response = await fetch(`${BASE_URL}${path}`, options)
    const data = await response.json()
    
    console.log(`\n${method} ${path}`)
    console.log(`Status: ${response.status}`)
    console.log(`Response:`, JSON.stringify(data, null, 2))
    
    return { response, data }
  } catch (error) {
    console.error(`\nError testing ${method} ${path}:`, error.message)
    return { error }
  }
}

async function runTests() {
  console.log('🧪 Testing API endpoints...\n')
  
  // Test health endpoint
  await testEndpoint('/api/health')
  
  // Test diagnostics endpoint
  await testEndpoint('/api/diagnostics')
  
  // Test rate limiting by making multiple requests
  console.log('\n🚦 Testing rate limiting...')
  for (let i = 0; i < 3; i++) {
    await testEndpoint('/api/health')
  }
  
  console.log('\n✅ API tests completed!')
}

// Run tests if this script is executed directly
if (require.main === module) {
  runTests().catch(console.error)
}

module.exports = { testEndpoint, runTests }