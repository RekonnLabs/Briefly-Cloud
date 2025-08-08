#!/usr/bin/env node

/**
 * Test script for data migration system
 * This script creates sample data and tests the migration functionality
 */

const { createClient } = require('@supabase/supabase-js')
const { v4: uuidv4 } = require('uuid')

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Sample data generators
function generateSampleUsers(count = 5) {
  const users = []
  for (let i = 0; i < count; i++) {
    users.push({
      id: uuidv4(),
      email: `testuser${i + 1}@example.com`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      subscription_tier: ['free', 'pro', 'pro_byok'][Math.floor(Math.random() * 3)],
      subscription_status: 'active',
      stripe_customer_id: `cus_${uuidv4().replace(/-/g, '')}`,
      usage_documents: Math.floor(Math.random() * 10),
      usage_chat_messages: Math.floor(Math.random() * 50),
      usage_api_calls: Math.floor(Math.random() * 100),
      settings: { theme: 'dark', notifications: true }
    })
  }
  return users
}

function generateSampleFiles(users, count = 10) {
  const files = []
  const fileTypes = ['pdf', 'docx', 'xlsx', 'txt', 'md']
  
  for (let i = 0; i < count; i++) {
    const user = users[Math.floor(Math.random() * users.length)]
    files.push({
      id: uuidv4(),
      user_id: user.id,
      filename: `sample-document-${i + 1}.${fileTypes[Math.floor(Math.random() * fileTypes.length)]}`,
      file_size: Math.floor(Math.random() * 1000000) + 1000,
      file_type: fileTypes[Math.floor(Math.random() * fileTypes.length)],
      upload_date: new Date().toISOString(),
      processing_status: ['pending', 'processing', 'completed', 'failed'][Math.floor(Math.random() * 4)],
      chunk_count: Math.floor(Math.random() * 20),
      embedding_count: Math.floor(Math.random() * 20),
      storage_path: `uploads/${user.id}/${uuidv4()}`,
      metadata: { 
        original_name: `sample-document-${i + 1}`,
        content_type: 'application/octet-stream'
      }
    })
  }
  return files
}

function generateSampleChunks(files, count = 50) {
  const chunks = []
  
  for (let i = 0; i < count; i++) {
    const file = files[Math.floor(Math.random() * files.length)]
    chunks.push({
      id: uuidv4(),
      file_id: file.id,
      user_id: file.user_id,
      chunk_text: `This is sample chunk text ${i + 1}. It contains some content that would be extracted from the document. This chunk represents a portion of the original document that has been processed for vector search and AI chat functionality.`,
      chunk_index: i,
      embedding_id: uuidv4(),
      created_at: new Date().toISOString()
    })
  }
  return chunks
}

function generateSampleConversations(users, count = 8) {
  const conversations = []
  
  for (let i = 0; i < count; i++) {
    const user = users[Math.floor(Math.random() * users.length)]
    conversations.push({
      id: uuidv4(),
      user_id: user.id,
      title: `Sample Conversation ${i + 1}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      message_count: Math.floor(Math.random() * 10) + 1
    })
  }
  return conversations
}

function generateSampleMessages(conversations, count = 30) {
  const messages = []
  const roles = ['user', 'assistant']
  
  for (let i = 0; i < count; i++) {
    const conversation = conversations[Math.floor(Math.random() * conversations.length)]
    messages.push({
      id: uuidv4(),
      conversation_id: conversation.id,
      user_id: conversation.user_id,
      role: roles[Math.floor(Math.random() * roles.length)],
      content: `This is a sample ${roles[Math.floor(Math.random() * roles.length)]} message ${i + 1}. It contains some content that would be part of a chat conversation.`,
      sources: Math.random() > 0.5 ? [`file-${uuidv4()}`] : [],
      created_at: new Date().toISOString()
    })
  }
  return messages
}

function generateSampleOAuthTokens(users, count = 6) {
  const tokens = []
  const providers = ['google', 'microsoft']
  
  for (let i = 0; i < count; i++) {
    const user = users[Math.floor(Math.random() * users.length)]
    const provider = providers[Math.floor(Math.random() * providers.length)]
    tokens.push({
      id: uuidv4(),
      user_id: user.id,
      provider,
      access_token: `access_token_${uuidv4().replace(/-/g, '')}`,
      refresh_token: `refresh_token_${uuidv4().replace(/-/g, '')}`,
      expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  }
  return tokens
}

function generateSampleUsageLogs(users, count = 25) {
  const logs = []
  const actions = ['upload', 'chat', 'search', 'embed', 'download']
  const resourceTypes = ['file', 'message', 'chunk', 'conversation']
  
  for (let i = 0; i < count; i++) {
    const user = users[Math.floor(Math.random() * users.length)]
    logs.push({
      id: uuidv4(),
      user_id: user.id,
      action: actions[Math.floor(Math.random() * actions.length)],
      resource_type: resourceTypes[Math.floor(Math.random() * resourceTypes.length)],
      resource_id: uuidv4(),
      metadata: { 
        ip_address: '192.168.1.1',
        user_agent: 'Mozilla/5.0 (Test Browser)',
        timestamp: new Date().toISOString()
      },
      created_at: new Date().toISOString()
    })
  }
  return logs
}

// Test functions
async function createTestData() {
  console.log('Creating test data...')
  
  try {
    // Generate sample data
    const users = generateSampleUsers(5)
    const files = generateSampleFiles(users, 10)
    const chunks = generateSampleChunks(files, 50)
    const conversations = generateSampleConversations(users, 8)
    const messages = generateSampleMessages(conversations, 30)
    const tokens = generateSampleOAuthTokens(users, 6)
    const logs = generateSampleUsageLogs(users, 25)
    
    // Insert users
    console.log('Inserting users...')
    const { error: usersError } = await supabase
      .from('users')
      .insert(users)
    
    if (usersError) {
      console.error('Error inserting users:', usersError)
      return false
    }
    
    // Insert files
    console.log('Inserting files...')
    const { error: filesError } = await supabase
      .from('file_metadata')
      .insert(files)
    
    if (filesError) {
      console.error('Error inserting files:', filesError)
      return false
    }
    
    // Insert chunks
    console.log('Inserting chunks...')
    const { error: chunksError } = await supabase
      .from('document_chunks')
      .insert(chunks)
    
    if (chunksError) {
      console.error('Error inserting chunks:', chunksError)
      return false
    }
    
    // Insert conversations
    console.log('Inserting conversations...')
    const { error: conversationsError } = await supabase
      .from('conversations')
      .insert(conversations)
    
    if (conversationsError) {
      console.error('Error inserting conversations:', conversationsError)
      return false
    }
    
    // Insert messages
    console.log('Inserting messages...')
    const { error: messagesError } = await supabase
      .from('chat_messages')
      .insert(messages)
    
    if (messagesError) {
      console.error('Error inserting messages:', messagesError)
      return false
    }
    
    // Insert OAuth tokens
    console.log('Inserting OAuth tokens...')
    const { error: tokensError } = await supabase
      .from('oauth_tokens')
      .insert(tokens)
    
    if (tokensError) {
      console.error('Error inserting OAuth tokens:', tokensError)
      return false
    }
    
    // Insert usage logs
    console.log('Inserting usage logs...')
    const { error: logsError } = await supabase
      .from('usage_logs')
      .insert(logs)
    
    if (logsError) {
      console.error('Error inserting usage logs:', logsError)
      return false
    }
    
    console.log('✅ Test data created successfully!')
    console.log(`📊 Summary:`)
    console.log(`   Users: ${users.length}`)
    console.log(`   Files: ${files.length}`)
    console.log(`   Chunks: ${chunks.length}`)
    console.log(`   Conversations: ${conversations.length}`)
    console.log(`   Messages: ${messages.length}`)
    console.log(`   OAuth Tokens: ${tokens.length}`)
    console.log(`   Usage Logs: ${logs.length}`)
    
    return true
    
  } catch (error) {
    console.error('Error creating test data:', error)
    return false
  }
}

async function testMigrationValidation() {
  console.log('\n🧪 Testing migration validation...')
  
  try {
    const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/migration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'validate' })
    })
    
    const data = await response.json()
    
    if (data.success) {
      console.log('✅ Validation test passed!')
      console.log(`   Valid: ${data.data.valid}`)
      console.log(`   Errors: ${data.data.errors.length}`)
      if (data.data.errors.length > 0) {
        console.log('   Error details:', data.data.errors)
      }
    } else {
      console.log('❌ Validation test failed:', data.message)
    }
    
    return data.success
    
  } catch (error) {
    console.error('❌ Validation test error:', error)
    return false
  }
}

async function testMigrationRun() {
  console.log('\n🚀 Testing migration run...')
  
  try {
    const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/migration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'run',
        config: {
          batchSize: 50,
          maxRetries: 2,
          retryDelay: 500,
          validateData: true,
          createBackup: true,
          dryRun: true // Safe test run
        }
      })
    })
    
    const data = await response.json()
    
    if (data.success) {
      console.log('✅ Migration test passed!')
      console.log(`   Migration ID: ${data.data.id}`)
      console.log(`   Status: ${data.data.status}`)
      console.log(`   Records Total: ${data.data.records_total}`)
    } else {
      console.log('❌ Migration test failed:', data.message)
    }
    
    return data.success
    
  } catch (error) {
    console.error('❌ Migration test error:', error)
    return false
  }
}

async function cleanupTestData() {
  console.log('\n🧹 Cleaning up test data...')
  
  try {
    // Delete in reverse order to respect foreign key constraints
    const tables = [
      'usage_logs',
      'oauth_tokens', 
      'chat_messages',
      'conversations',
      'document_chunks',
      'file_metadata',
      'users'
    ]
    
    for (const table of tables) {
      const { error } = await supabase
        .from(table)
        .delete()
        .like('email', 'testuser%@example.com')
      
      if (error) {
        console.error(`Error cleaning up ${table}:`, error)
      } else {
        console.log(`   Cleaned up ${table}`)
      }
    }
    
    console.log('✅ Test data cleanup completed!')
    return true
    
  } catch (error) {
    console.error('❌ Cleanup error:', error)
    return false
  }
}

// Main execution
async function main() {
  console.log('🧪 Starting migration system tests...\n')
  
  const args = process.argv.slice(2)
  const command = args[0] || 'all'
  
  try {
    switch (command) {
      case 'create-data':
        await createTestData()
        break
        
      case 'test-validation':
        await testMigrationValidation()
        break
        
      case 'test-migration':
        await testMigrationRun()
        break
        
      case 'cleanup':
        await cleanupTestData()
        break
        
      case 'all':
        console.log('Running full test suite...\n')
        
        // Create test data
        const dataCreated = await createTestData()
        if (!dataCreated) {
          console.error('❌ Failed to create test data, aborting tests')
          process.exit(1)
        }
        
        // Test validation
        await testMigrationValidation()
        
        // Test migration
        await testMigrationRun()
        
        // Cleanup
        console.log('\n🧹 Running cleanup...')
        await cleanupTestData()
        
        console.log('\n✅ All tests completed!')
        break
        
      default:
        console.log('Usage: node test-migration.js [command]')
        console.log('Commands:')
        console.log('  create-data    - Create sample test data')
        console.log('  test-validation - Test data validation')
        console.log('  test-migration  - Test migration execution')
        console.log('  cleanup        - Clean up test data')
        console.log('  all            - Run full test suite (default)')
        break
    }
    
  } catch (error) {
    console.error('❌ Test execution failed:', error)
    process.exit(1)
  }
}

// Run if called directly
if (require.main === module) {
  main()
}

module.exports = {
  createTestData,
  testMigrationValidation,
  testMigrationRun,
  cleanupTestData
}
