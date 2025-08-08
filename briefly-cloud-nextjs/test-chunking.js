/**
 * Test script for document chunking system
 */

const fs = require('fs')
const path = require('path')

const BASE_URL = 'http://localhost:3000'

// Mock authentication token (in real testing, you'd get this from login)
const AUTH_TOKEN = 'your-test-token-here'

async function testChunkingEndpoint(endpoint, method = 'GET', body = null, headers = {}) {
  try {
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
        ...headers
      }
    }
    
    if (body) {
      options.body = JSON.stringify(body)
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

async function runChunkingTests() {
  console.log('🧪 Testing Document Chunking System...\n')
  
  // Test 1: Get chunking capabilities and configurations
  console.log('=== Test 1: Get Chunking Capabilities ===')
  await testChunkingEndpoint('/api/chunks')
  
  // Test 2: Create chunks from text (requires authentication)
  console.log('\n=== Test 2: Create Chunks from Text ===')
  const testText = `# Document Chunking Test

This is a comprehensive test document for the document chunking system. The system should be able to split this text into meaningful chunks based on different strategies.

## Paragraph Strategy
The paragraph strategy splits text by paragraph boundaries. This preserves the natural structure of the document and maintains context within each chunk. It's the default strategy and works well for most documents.

## Sentence Strategy  
The sentence strategy provides more granular control by splitting text at sentence boundaries. This is useful for question-answering systems and detailed analysis where precise context is important.

## Fixed Strategy
The fixed strategy creates chunks of approximately equal size. This provides predictable chunk sizes and is useful for consistent processing and memory management.

## Sliding Window Strategy
The sliding window strategy creates overlapping chunks to preserve context across boundaries. This prevents information loss at chunk boundaries and is excellent for search applications.

## Performance Considerations
Different strategies have different performance characteristics:
- Paragraph: Fast processing, variable sizes
- Sentence: Medium processing, smaller chunks
- Fixed: Fastest processing, consistent sizes  
- Sliding: Medium processing, more chunks due to overlap

## Conclusion
The chunking system provides flexible options for different use cases. Choose the strategy that best fits your specific requirements for chunk size, processing speed, and context preservation.

Created at: ${new Date().toISOString()}`

  await testChunkingEndpoint('/api/chunks', 'POST', {
    text: testText,
    fileId: 'test-file-123',
    fileName: 'test-chunking.md',
    mimeType: 'text/markdown',
    strategy: 'paragraph',
    maxChunkSize: 500,
    saveToDatabase: false
  })
  
  // Test 3: Test different chunking strategies
  console.log('\n=== Test 3: Test Different Strategies ===')
  
  const strategies = ['paragraph', 'sentence', 'fixed', 'sliding']
  
  for (const strategy of strategies) {
    console.log(`\n--- Testing ${strategy} strategy ---`)
    await testChunkingEndpoint('/api/chunks', 'POST', {
      text: testText,
      fileId: `test-${strategy}-123`,
      fileName: `test-${strategy}.md`,
      mimeType: 'text/markdown',
      strategy: strategy,
      maxChunkSize: 400,
      minChunkSize: 100,
      overlap: strategy === 'sliding' ? 100 : undefined,
      saveToDatabase: false
    })
  }
  
  // Test 4: Test file-based chunking
  console.log('\n=== Test 4: File-based Chunking ===')
  await testChunkingEndpoint('/api/chunks/test-file-id', 'POST', {
    strategy: 'paragraph',
    maxChunkSize: 1000,
    saveToDatabase: true,
    forceReprocess: false
  })
  
  // Test 5: Get existing chunks for file
  console.log('\n=== Test 5: Get File Chunks ===')
  await testChunkingEndpoint('/api/chunks/test-file-id', 'GET')
  
  // Test 6: Batch chunking
  console.log('\n=== Test 6: Batch Chunking ===')
  await testChunkingEndpoint('/api/chunks/batch', 'POST', {
    file_ids: ['file1', 'file2', 'file3'],
    strategy: 'paragraph',
    maxChunkSize: 1000,
    saveToDatabase: true,
    forceReprocess: false
  })
  
  // Test 7: Delete file chunks
  console.log('\n=== Test 7: Delete File Chunks ===')
  await testChunkingEndpoint('/api/chunks/test-file-id', 'DELETE')
  
  console.log('\n✅ Document chunking system tests completed!')
  console.log('\nNote: Some tests require valid authentication tokens and existing files to fully execute.')
  console.log('To test with authentication:')
  console.log('1. Start the development server: npm run dev')
  console.log('2. Login through the web interface')
  console.log('3. Extract the JWT token from browser storage')
  console.log('4. Update AUTH_TOKEN in this script')
}

// Test chunking strategies
function testChunkingStrategies() {
  console.log('\n=== Chunking Strategies ===')
  
  const strategies = {
    'Paragraph-based': {
      description: 'Split by paragraph boundaries, preserving document structure',
      best_for: ['documents', 'articles', 'reports'],
      chunk_size: 'Variable (typically 500-1500 chars)',
      processing_speed: 'Fast',
      context_preservation: 'High',
    },
    'Sentence-based': {
      description: 'Split by sentence boundaries for granular control',
      best_for: ['Q&A systems', 'detailed analysis', 'precise retrieval'],
      chunk_size: 'Small (typically 100-800 chars)',
      processing_speed: 'Medium',
      context_preservation: 'Medium',
    },
    'Fixed-size': {
      description: 'Create chunks of approximately equal size',
      best_for: ['consistent processing', 'memory constraints', 'batch operations'],
      chunk_size: 'Consistent (configurable)',
      processing_speed: 'Fastest',
      context_preservation: 'Low',
    },
    'Sliding window': {
      description: 'Create overlapping chunks to preserve context',
      best_for: ['search applications', 'embeddings', 'context preservation'],
      chunk_size: 'Consistent with overlap',
      processing_speed: 'Medium',
      context_preservation: 'Highest',
    },
    'Semantic boundaries': {
      description: 'Split based on semantic meaning (future enhancement)',
      best_for: ['advanced analysis', 'topic modeling', 'content understanding'],
      chunk_size: 'Variable based on topics',
      processing_speed: 'Slowest',
      context_preservation: 'Highest',
      status: 'Coming Soon',
    },
  }
  
  Object.entries(strategies).forEach(([name, info]) => {
    console.log(`\n${name}:`)
    console.log(`  Description: ${info.description}`)
    console.log(`  Best for: ${info.best_for.join(', ')}`)
    console.log(`  Chunk size: ${info.chunk_size}`)
    console.log(`  Processing speed: ${info.processing_speed}`)
    console.log(`  Context preservation: ${info.context_preservation}`)
    if (info.status) {
      console.log(`  Status: ${info.status}`)
    }
  })
}

// Test configuration options
function testConfigurationOptions() {
  console.log('\n=== Configuration Options ===')
  
  const options = {
    'maxChunkSize': {
      description: 'Maximum characters per chunk',
      range: '100 - 5000 characters',
      default: 1000,
      recommendations: {
        'Short documents': 500,
        'Medium documents': 1000,
        'Long documents': 1500,
        'Embeddings': 1000,
        'Search applications': 800,
      },
    },
    'minChunkSize': {
      description: 'Minimum characters per chunk (prevents tiny chunks)',
      range: '50 - 2000 characters',
      default: 100,
      note: 'Helps avoid creating very small chunks that lack context',
    },
    'overlap': {
      description: 'Character overlap for sliding window strategy',
      range: '0 - 1000 characters',
      default: 200,
      note: 'Only applies to sliding window strategy',
    },
    'preserveStructure': {
      description: 'Try to preserve document structure',
      type: 'boolean',
      default: true,
      note: 'Maintains paragraph and section boundaries when possible',
    },
    'respectBoundaries': {
      description: 'Avoid breaking words or sentences',
      type: 'boolean',
      default: true,
      note: 'Ensures chunks end at natural language boundaries',
    },
  }
  
  Object.entries(options).forEach(([name, info]) => {
    console.log(`\n${name}:`)
    console.log(`  Description: ${info.description}`)
    if (info.range) console.log(`  Range: ${info.range}`)
    if (info.type) console.log(`  Type: ${info.type}`)
    console.log(`  Default: ${info.default}`)
    if (info.recommendations) {
      console.log(`  Recommendations:`)
      Object.entries(info.recommendations).forEach(([use_case, value]) => {
        console.log(`    ${use_case}: ${value}`)
      })
    }
    if (info.note) console.log(`  Note: ${info.note}`)
  })
}

// Test performance expectations
function testPerformanceExpectations() {
  console.log('\n=== Performance Expectations ===')
  
  const performance = {
    'Processing Speed': {
      'Paragraph strategy': '~10ms per 1000 characters',
      'Sentence strategy': '~20ms per 1000 characters',
      'Fixed strategy': '~5ms per 1000 characters',
      'Sliding strategy': '~15ms per 1000 characters',
      'Semantic strategy': '~100ms per 1000 characters (when available)',
    },
    'Memory Usage': {
      'Paragraph strategy': 'Low',
      'Sentence strategy': 'Medium',
      'Fixed strategy': 'Low',
      'Sliding strategy': 'High (due to overlap)',
      'Semantic strategy': 'High',
    },
    'Chunk Count Estimates': {
      '1,000 characters': '~1 chunk',
      '5,000 characters': '3-5 chunks',
      '10,000 characters': '8-12 chunks',
      '50,000 characters': '40-60 chunks',
    },
    'Limitations': {
      'Max text length': '1MB per document',
      'Max chunks per document': '1,000 chunks',
      'Batch processing': 'Up to 10 documents per request',
      'Supported languages': 'English (primary), others (basic)',
    },
  }
  
  Object.entries(performance).forEach(([category, items]) => {
    console.log(`\n${category}:`)
    Object.entries(items).forEach(([item, value]) => {
      console.log(`  ${item}: ${value}`)
    })
  })
}

// Run tests if this script is executed directly
if (require.main === module) {
  runChunkingTests()
    .then(() => {
      testChunkingStrategies()
      testConfigurationOptions()
      testPerformanceExpectations()
    })
    .catch(console.error)
}

module.exports = { testChunkingEndpoint, runChunkingTests }