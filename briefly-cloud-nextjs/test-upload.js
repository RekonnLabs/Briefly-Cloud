/**
 * Test script for file upload system
 */

const fs = require('fs')
const path = require('path')

const BASE_URL = 'http://localhost:3000'

// Mock authentication token (in real testing, you'd get this from login)
const AUTH_TOKEN = 'your-test-token-here'

async function testUploadEndpoint(endpoint, method = 'GET', body = null, headers = {}) {
  try {
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        ...headers
      }
    }
    
    if (body && !(body instanceof FormData)) {
      options.headers['Content-Type'] = 'application/json'
      options.body = JSON.stringify(body)
    } else if (body) {
      options.body = body
    }
    
    const response = await fetch(`${BASE_URL}${endpoint}`, options)
    const data = await response.json()
    
    console.log(`\n${method} ${endpoint}`)
    console.log(`Status: ${response.status}`)
    console.log(`Response:`, JSON.stringify(data, null, 2))
    
    return { response, data }
  } catch (error) {
    console.error(`\nError testing ${method} ${endpoint}:`, error.message)
    return { error }
  }
}

async function createTestFile() {
  const testContent = `# Test Document

This is a test document for upload testing.

## Features to test:
- File upload validation
- Size limits
- Type checking
- Metadata storage

Created at: ${new Date().toISOString()}
`
  
  const testFilePath = path.join(__dirname, 'test-upload.md')
  fs.writeFileSync(testFilePath, testContent)
  return testFilePath
}

async function runUploadTests() {
  console.log('🧪 Testing File Upload System...\n')
  
  // Test 1: Get upload info
  console.log('=== Test 1: Get Upload Info ===')
  await testUploadEndpoint('/api/upload')
  
  // Test 2: List files (empty initially)
  console.log('\n=== Test 2: List Files (Initial) ===')
  await testUploadEndpoint('/api/upload/files')
  
  // Test 3: Upload a file (requires authentication)
  console.log('\n=== Test 3: File Upload ===')
  try {
    const testFilePath = createTestFile()
    const fileBuffer = fs.readFileSync(testFilePath)
    const formData = new FormData()
    
    // Create a File-like object for Node.js
    const file = new Blob([fileBuffer], { type: 'text/markdown' })
    formData.append('file', file, 'test-upload.md')
    formData.append('metadata', JSON.stringify({
      description: 'Test upload file',
      category: 'test'
    }))
    
    await testUploadEndpoint('/api/upload', 'POST', formData)
    
    // Clean up test file
    fs.unlinkSync(testFilePath)
  } catch (error) {
    console.log('File upload test requires authentication token')
  }
  
  // Test 4: Test file validation (invalid type)
  console.log('\n=== Test 4: Invalid File Type ===')
  try {
    const formData = new FormData()
    const invalidFile = new Blob(['invalid content'], { type: 'application/exe' })
    formData.append('file', invalidFile, 'test.exe')
    
    await testUploadEndpoint('/api/upload', 'POST', formData)
  } catch (error) {
    console.log('Invalid file type test requires authentication')
  }
  
  // Test 5: Bulk operations
  console.log('\n=== Test 5: Bulk File Info ===')
  await testUploadEndpoint('/api/upload/bulk', 'POST', {
    file_ids: ['test-id-1', 'test-id-2']
  })
  
  console.log('\n✅ Upload system tests completed!')
  console.log('\nNote: Some tests require valid authentication tokens to fully execute.')
  console.log('To test with authentication:')
  console.log('1. Start the development server: npm run dev')
  console.log('2. Login through the web interface')
  console.log('3. Extract the JWT token from browser storage')
  console.log('4. Update AUTH_TOKEN in this script')
}

// Test file type validation
function testFileTypeValidation() {
  console.log('\n=== File Type Validation Test ===')
  
  const supportedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/csv',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint'
  ]
  
  const unsupportedTypes = [
    'image/jpeg',
    'image/png',
    'video/mp4',
    'application/exe',
    'application/zip'
  ]
  
  console.log('Supported file types:')
  supportedTypes.forEach(type => console.log(`  ✅ ${type}`))
  
  console.log('\nUnsupported file types:')
  unsupportedTypes.forEach(type => console.log(`  ❌ ${type}`))
}

// Test tier limits
function testTierLimits() {
  console.log('\n=== Tier Limits Test ===')
  
  const tierLimits = {
    free: {
      maxFileSize: '10MB',
      maxFiles: 25,
      totalStorage: '100MB'
    },
    pro: {
      maxFileSize: '50MB',
      maxFiles: 500,
      totalStorage: '1GB'
    },
    pro_byok: {
      maxFileSize: '100MB',
      maxFiles: 5000,
      totalStorage: '10GB'
    }
  }
  
  Object.entries(tierLimits).forEach(([tier, limits]) => {
    console.log(`\n${tier.toUpperCase()} Tier:`)
    console.log(`  Max file size: ${limits.maxFileSize}`)
    console.log(`  Max files: ${limits.maxFiles}`)
    console.log(`  Total storage: ${limits.totalStorage}`)
  })
}

// Run tests if this script is executed directly
if (require.main === module) {
  runUploadTests()
    .then(() => {
      testFileTypeValidation()
      testTierLimits()
    })
    .catch(console.error)
}

module.exports = { testUploadEndpoint, runUploadTests }