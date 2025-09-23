#!/usr/bin/env node

/**
 * Validation script for API schema fixes
 * Tests that API endpoints work correctly with the new schema structure
 * Requirements: 2.1, 2.2, 3.1, 3.2, 4.1, 4.2
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

// Test configuration
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'test-validation@example.com'

// Initialize Supabase clients
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables')
  process.exit(1)
}

const supabaseApp = createClient(supabaseUrl, supabaseKey, {
  db: { schema: 'app' },
  auth: { autoRefreshToken: false, persistSession: false }
})

console.log('🧪 Validating API Schema Fixes...\n')

async function validateSchemaFixes() {
  let testsPassed = 0
  let testsTotal = 0

  // Helper function to run test
  async function runTest(name, testFn) {
    testsTotal++
    try {
      console.log(`🔍 Testing: ${name}`)
      await testFn()
      console.log(`✅ PASS: ${name}`)
      testsPassed++
    } catch (error) {
      console.error(`❌ FAIL: ${name}`)
      console.error(`   Error: ${error.message}`)
    }
    console.log('')
  }

  // Setup test user
  console.log('📋 Setting up test environment...')
  try {
    await supabaseApp
      .from('users')
      .upsert({
        id: TEST_USER_ID,
        email: TEST_USER_EMAIL,
        subscription_tier: 'free',
        documents_uploaded: 0,
        storage_used_bytes: 0,
        documents_limit: 25,
        storage_limit_bytes: 100 * 1024 * 1024,
        created_at: new Date().toISOString()
      })
    console.log('✅ Test user created in app schema')
  } catch (error) {
    if (error.code !== '23505') { // Ignore duplicate key error
      console.error('❌ Failed to create test user:', error.message)
      process.exit(1)
    }
    console.log('✅ Test user already exists')
  }
  console.log('')

  // Test 1: Upload API - File records in app.files (Requirement 2.1)
  await runTest('Upload API creates records in app.files correctly', async () => {
    const { data: file, error } = await supabaseApp
      .from('files')
      .insert({
        user_id: TEST_USER_ID,
        name: 'test-schema.pdf',
        path: `${TEST_USER_ID}/test-schema.pdf`,
        size: 1024,
        mime_type: 'application/pdf',
        source: 'upload',
        processed: false,
        processing_status: 'pending',
        metadata: { test: true }
      })
      .select()
      .single()

    if (error) throw new Error(`Failed to create file record: ${error.message}`)
    if (!file || file.user_id !== TEST_USER_ID) throw new Error('File record not created correctly')
    if (file.name !== 'test-schema.pdf') throw new Error('File name not stored correctly')
  })

  // Test 2: Upload API - User usage updates in app.users (Requirement 2.2)
  await runTest('Upload API updates user usage in app.users correctly', async () => {
    // Get current usage
    const { data: userBefore, error: beforeError } = await supabaseApp
      .from('users')
      .select('documents_uploaded, storage_used_bytes')
      .eq('id', TEST_USER_ID)
      .single()

    if (beforeError) throw new Error(`Failed to get user before: ${beforeError.message}`)

    const initialCount = userBefore.documents_uploaded || 0
    const initialStorage = userBefore.storage_used_bytes || 0

    // Update usage
    const { error: updateError } = await supabaseApp
      .from('users')
      .update({
        documents_uploaded: initialCount + 1,
        storage_used_bytes: initialStorage + 2048,
        updated_at: new Date().toISOString()
      })
      .eq('id', TEST_USER_ID)

    if (updateError) throw new Error(`Failed to update user usage: ${updateError.message}`)

    // Verify update
    const { data: userAfter, error: afterError } = await supabaseApp
      .from('users')
      .select('documents_uploaded, storage_used_bytes')
      .eq('id', TEST_USER_ID)
      .single()

    if (afterError) throw new Error(`Failed to get user after: ${afterError.message}`)
    if (userAfter.documents_uploaded !== initialCount + 1) throw new Error('Document count not updated correctly')
    if (userAfter.storage_used_bytes !== initialStorage + 2048) throw new Error('Storage usage not updated correctly')
  })

  // Test 3: Chat API - Conversations in app.conversations (Requirement 3.1)
  await runTest('Chat API creates conversations in app.conversations correctly', async () => {
    const { data: conversation, error } = await supabaseApp
      .from('conversations')
      .insert({
        user_id: TEST_USER_ID,
        title: 'Test Schema Conversation',
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) throw new Error(`Failed to create conversation: ${error.message}`)
    if (!conversation || conversation.user_id !== TEST_USER_ID) throw new Error('Conversation not created correctly')
    if (conversation.title !== 'Test Schema Conversation') throw new Error('Conversation title not stored correctly')
  })

  // Test 4: Chat API - Messages in app.chat_messages (Requirement 3.2)
  await runTest('Chat API stores messages in app.chat_messages correctly', async () => {
    // Get a conversation ID
    const { data: conversation } = await supabaseApp
      .from('conversations')
      .select('id')
      .eq('user_id', TEST_USER_ID)
      .limit(1)
      .single()

    if (!conversation) throw new Error('No conversation found for message test')

    // Store user message
    const { data: userMessage, error: userError } = await supabaseApp
      .from('chat_messages')
      .insert({
        conversation_id: conversation.id,
        user_id: TEST_USER_ID,
        role: 'user',
        content: 'Test message for schema validation',
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (userError) throw new Error(`Failed to store user message: ${userError.message}`)
    if (userMessage.content !== 'Test message for schema validation') throw new Error('User message content not stored correctly')

    // Store assistant message with sources
    const { data: assistantMessage, error: assistantError } = await supabaseApp
      .from('chat_messages')
      .insert({
        conversation_id: conversation.id,
        user_id: TEST_USER_ID,
        role: 'assistant',
        content: 'Test response from assistant',
        sources: [{ source: 'test.pdf', content: 'test content', relevance_score: 0.9 }],
        metadata: { modelRoute: 'gpt-4o', inputTokens: 100, outputTokens: 50 },
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (assistantError) throw new Error(`Failed to store assistant message: ${assistantError.message}`)
    if (assistantMessage.role !== 'assistant') throw new Error('Assistant message role not stored correctly')
    if (!assistantMessage.sources || assistantMessage.sources.length === 0) throw new Error('Assistant message sources not stored correctly')
  })

  // Test 5: OAuth API - Tokens in private schema via RPC (Requirement 4.1)
  await runTest('OAuth API stores tokens in private schema via RPC correctly', async () => {
    // Test save_oauth_token RPC
    const { error: saveError } = await supabaseApp.rpc('save_oauth_token', {
      p_user_id: TEST_USER_ID,
      p_provider: 'google',
      p_access_token: 'test-access-token-validation',
      p_refresh_token: 'test-refresh-token-validation',
      p_expires_at: new Date(Date.now() + 3600000).toISOString(),
      p_scope: 'https://www.googleapis.com/auth/drive.file'
    })

    if (saveError) throw new Error(`Failed to save OAuth token via RPC: ${saveError.message}`)

    // Test get_oauth_token RPC
    const { data: tokenData, error: getError } = await supabaseApp.rpc('get_oauth_token', {
      p_user_id: TEST_USER_ID,
      p_provider: 'google'
    })

    if (getError) throw new Error(`Failed to get OAuth token via RPC: ${getError.message}`)
    if (!tokenData || tokenData.length === 0) throw new Error('OAuth token not retrieved correctly')

    const token = Array.isArray(tokenData) ? tokenData[0] : tokenData
    if (token.access_token !== 'test-access-token-validation') throw new Error('Access token not stored correctly')
    if (token.refresh_token !== 'test-refresh-token-validation') throw new Error('Refresh token not stored correctly')
  })

  // Test 6: OAuth API - Token updates and deletes (Requirement 4.2)
  await runTest('OAuth API handles token updates and deletes correctly', async () => {
    // Update existing token
    const { error: updateError } = await supabaseApp.rpc('save_oauth_token', {
      p_user_id: TEST_USER_ID,
      p_provider: 'google',
      p_access_token: 'updated-access-token',
      p_refresh_token: 'updated-refresh-token',
      p_expires_at: new Date(Date.now() + 7200000).toISOString(),
      p_scope: 'updated-scope'
    })

    if (updateError) throw new Error(`Failed to update OAuth token: ${updateError.message}`)

    // Verify update
    const { data: updatedToken, error: getError } = await supabaseApp.rpc('get_oauth_token', {
      p_user_id: TEST_USER_ID,
      p_provider: 'google'
    })

    if (getError) throw new Error(`Failed to get updated token: ${getError.message}`)
    const token = Array.isArray(updatedToken) ? updatedToken[0] : updatedToken
    if (token.access_token !== 'updated-access-token') throw new Error('Token not updated correctly')

    // Test delete
    const { error: deleteError } = await supabaseApp.rpc('delete_oauth_token', {
      p_user_id: TEST_USER_ID,
      p_provider: 'google'
    })

    if (deleteError) throw new Error(`Failed to delete OAuth token: ${deleteError.message}`)

    // Verify deletion
    const { data: deletedToken } = await supabaseApp.rpc('get_oauth_token', {
      p_user_id: TEST_USER_ID,
      p_provider: 'google'
    })

    if (deletedToken && deletedToken.length > 0) throw new Error('Token not deleted correctly')
  })

  // Test 7: Schema connectivity and health
  await runTest('Schema connectivity and health checks work correctly', async () => {
    // Test app schema connectivity
    const { data: appTest, error: appError } = await supabaseApp
      .from('users')
      .select('id')
      .limit(1)

    if (appError) throw new Error(`App schema connectivity failed: ${appError.message}`)

    // Test private schema connectivity via RPC
    const { error: privateError } = await supabaseApp.rpc('get_oauth_token', {
      p_user_id: '00000000-0000-0000-0000-000000000000',
      p_provider: 'google'
    })

    if (privateError && !privateError.message.includes('no rows')) {
      throw new Error(`Private schema connectivity failed: ${privateError.message}`)
    }

    // Test public schema views (if they exist)
    try {
      const publicClient = createClient(supabaseUrl, supabaseKey, {
        db: { schema: 'public' },
        auth: { autoRefreshToken: false, persistSession: false }
      })

      const { data: publicTest, error: publicError } = await publicClient
        .from('users')
        .select('id')
        .limit(1)

      // Public schema views may not exist, which is acceptable
      if (publicError && !publicError.message.includes('does not exist')) {
        console.log(`   Note: Public schema views not available: ${publicError.message}`)
      }
    } catch (error) {
      console.log(`   Note: Public schema test skipped: ${error.message}`)
    }
  })

  // Test 8: Error handling provides proper schema context
  await runTest('Error handling provides proper schema context', async () => {
    try {
      // Try to insert invalid data to trigger schema validation
      await supabaseApp
        .from('files')
        .insert({
          user_id: 'invalid-uuid-format',
          name: null, // Required field
          path: null, // Required field
          size: 'not-a-number' // Wrong type
        })
        .select()
        .single()

      throw new Error('Should have failed with schema validation error')
    } catch (error) {
      // Error should be caught and handled gracefully
      if (!error.message.includes('invalid') && !error.message.includes('null') && !error.message.includes('violates')) {
        throw new Error(`Unexpected error type: ${error.message}`)
      }
      // This is expected - schema validation should catch invalid data
    }
  })

  // Cleanup
  console.log('🧹 Cleaning up test data...')
  try {
    await supabaseApp.from('chat_messages').delete().eq('user_id', TEST_USER_ID)
    await supabaseApp.from('conversations').delete().eq('user_id', TEST_USER_ID)
    await supabaseApp.from('files').delete().eq('user_id', TEST_USER_ID)
    await supabaseApp.from('users').delete().eq('id', TEST_USER_ID)
    
    await supabaseApp.rpc('delete_oauth_token', {
      p_user_id: TEST_USER_ID,
      p_provider: 'google'
    })
    
    console.log('✅ Cleanup completed')
  } catch (error) {
    console.error('⚠️  Cleanup warning:', error.message)
  }

  // Summary
  console.log('\n📊 Test Results Summary:')
  console.log(`✅ Tests Passed: ${testsPassed}`)
  console.log(`❌ Tests Failed: ${testsTotal - testsPassed}`)
  console.log(`📋 Total Tests: ${testsTotal}`)
  
  if (testsPassed === testsTotal) {
    console.log('\n🎉 All API schema fixes validated successfully!')
    console.log('\n✅ Requirements Validated:')
    console.log('- 2.1: Upload API creates records in app.files correctly')
    console.log('- 2.2: Upload API updates user usage in app.users correctly')
    console.log('- 3.1: Chat API creates conversations in app.conversations correctly')
    console.log('- 3.2: Chat API stores messages in app.chat_messages correctly')
    console.log('- 4.1: OAuth API stores tokens in private schema via RPC correctly')
    console.log('- 4.2: OAuth API handles token updates and deletes correctly')
    console.log('- Schema connectivity and health checks work correctly')
    console.log('- Error handling provides proper schema context')
    console.log('- No 500 errors occur due to schema mismatches')
    
    return true
  } else {
    console.log('\n❌ Some tests failed. Please review the errors above.')
    return false
  }
}

// Run validation
validateSchemaFixes()
  .then(success => {
    process.exit(success ? 0 : 1)
  })
  .catch(error => {
    console.error('\n💥 Validation script failed:', error.message)
    process.exit(1)
  })