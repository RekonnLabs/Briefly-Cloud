#!/usr/bin/env node

/**
 * Test script for OAuth RPC functions
 * Tests the RPC functions for private schema operations
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('  - NEXT_PUBLIC_SUPABASE_URL');
  console.error('  - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runTests() {
  console.log('🧪 Testing OAuth RPC Functions');
  console.log('================================');

  const testUserId = '12345678-1234-1234-1234-123456789012';
  const testAccessToken = 'test-access-token-12345';
  const testRefreshToken = 'test-refresh-token-67890';
  const testExpiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now
  const testScope = 'https://www.googleapis.com/auth/drive.file';

  let testsPassed = 0;
  let testsTotal = 0;

  // Helper function to run a test
  async function runTest(testName, testFn) {
    testsTotal++;
    try {
      console.log(`\n🔍 Test ${testsTotal}: ${testName}`);
      await testFn();
      console.log(`✅ PASSED: ${testName}`);
      testsPassed++;
    } catch (error) {
      console.log(`❌ FAILED: ${testName}`);
      console.log(`   Error: ${error.message}`);
    }
  }

  // Test 1: Create test user
  await runTest('Create test user', async () => {
    const { error } = await supabase
      .from('users')
      .upsert({
        id: testUserId,
        email: 'test@example.com',
        full_name: 'Test User'
      }, { onConflict: 'id' });

    if (error) throw error;
  });

  // Test 2: Save OAuth token
  await runTest('Save OAuth token', async () => {
    const { error } = await supabase.rpc('save_oauth_token', {
      p_user_id: testUserId,
      p_provider: 'google',
      p_access_token: testAccessToken,
      p_refresh_token: testRefreshToken,
      p_expires_at: testExpiresAt,
      p_scope: testScope
    });

    if (error) throw error;
  });

  // Test 3: Retrieve OAuth token
  await runTest('Retrieve OAuth token', async () => {
    const { data, error } = await supabase.rpc('get_oauth_token', {
      p_user_id: testUserId,
      p_provider: 'google'
    });

    if (error) throw error;
    if (!data || data.length === 0) throw new Error('No token retrieved');

    const token = data[0];
    if (token.access_token !== testAccessToken) {
      throw new Error(`Access token mismatch: expected ${testAccessToken}, got ${token.access_token}`);
    }
    if (token.refresh_token !== testRefreshToken) {
      throw new Error(`Refresh token mismatch: expected ${testRefreshToken}, got ${token.refresh_token}`);
    }

    console.log(`   ✓ Access Token: ${token.access_token}`);
    console.log(`   ✓ Refresh Token: ${token.refresh_token}`);
    console.log(`   ✓ Expires At: ${token.expires_at}`);
    console.log(`   ✓ Scope: ${token.scope}`);
  });

  // Test 4: Check token exists
  await runTest('Check token exists', async () => {
    const { data, error } = await supabase.rpc('oauth_token_exists', {
      p_user_id: testUserId,
      p_provider: 'google'
    });

    if (error) throw error;
    if (!data) throw new Error('Token should exist but function returned false');
  });

  // Test 5: Get token status
  await runTest('Get token status', async () => {
    const { data, error } = await supabase.rpc('get_oauth_token_status', {
      p_user_id: testUserId,
      p_provider: 'google'
    });

    if (error) throw error;
    if (!data || data.length === 0) throw new Error('No status returned');

    const status = data[0];
    if (!status.exists) throw new Error('Token status should show exists=true');

    console.log(`   ✓ Exists: ${status.exists}`);
    console.log(`   ✓ Expires At: ${status.expires_at}`);
    console.log(`   ✓ Is Expired: ${status.is_expired}`);
    console.log(`   ✓ Expires Soon: ${status.expires_soon}`);
  });

  // Test 6: Update connection status
  await runTest('Update connection status', async () => {
    const { error } = await supabase.rpc('update_connection_status', {
      p_user_id: testUserId,
      p_provider: 'google',
      p_connected: true,
      p_error_message: null
    });

    if (error) throw error;
  });

  // Test 7: Test invalid provider validation
  await runTest('Invalid provider validation', async () => {
    const { error } = await supabase.rpc('save_oauth_token', {
      p_user_id: testUserId,
      p_provider: 'invalid_provider',
      p_access_token: 'test-token',
      p_refresh_token: null,
      p_expires_at: null,
      p_scope: null
    });

    if (!error || !error.message.includes('Invalid provider')) {
      throw new Error('Should have raised exception for invalid provider');
    }
  });

  // Test 8: Delete OAuth token
  await runTest('Delete OAuth token', async () => {
    const { error } = await supabase.rpc('delete_oauth_token', {
      p_user_id: testUserId,
      p_provider: 'google'
    });

    if (error) throw error;

    // Verify token was deleted
    const { data: existsData, error: existsError } = await supabase.rpc('oauth_token_exists', {
      p_user_id: testUserId,
      p_provider: 'google'
    });

    if (existsError) throw existsError;
    if (existsData) throw new Error('Token should be deleted but still exists');
  });

  // Cleanup
  console.log('\n🧹 Cleaning up test data...');
  try {
    // Clean up connection status
    await supabase
      .from('connection_status')
      .delete()
      .eq('user_id', testUserId);

    // Clean up test user
    await supabase
      .from('users')
      .delete()
      .eq('id', testUserId);

    console.log('✅ Cleanup completed');
  } catch (error) {
    console.log(`⚠️  Cleanup warning: ${error.message}`);
  }

  // Summary
  console.log('\n📊 Test Summary');
  console.log('================');
  console.log(`Tests Passed: ${testsPassed}/${testsTotal}`);
  
  if (testsPassed === testsTotal) {
    console.log('🎉 All tests passed! OAuth RPC functions are working correctly.');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed. Please check the errors above.');
    process.exit(1);
  }
}

// Run the tests
runTests().catch((error) => {
  console.error('💥 Test runner failed:', error);
  process.exit(1);
});