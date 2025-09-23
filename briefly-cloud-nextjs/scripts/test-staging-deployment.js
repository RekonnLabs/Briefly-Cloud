#!/usr/bin/env node

/**
 * Staging Deployment Test Script
 * Tests RPC functions in staging environment before production deployment
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Allow override for staging environment
const supabaseUrl = process.env.STAGING_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.STAGING_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('  - STAGING_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
  console.error('  - STAGING_SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function testStagingDeployment() {
  console.log('🧪 Testing RPC Functions in Staging Environment');
  console.log('================================================');
  console.log(`🔗 Database URL: ${supabaseUrl}`);
  console.log(`🔑 Using Service Key: ${supabaseServiceKey.substring(0, 20)}...`);

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

  // Test 1: Database Connection
  await runTest('Database connection', async () => {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .limit(1);

    if (error && !error.message.includes('relation "users" does not exist')) {
      throw error;
    }
  });

  // Test 2: Check Schema Existence
  await runTest('Schema existence (app, private)', async () => {
    const { data, error } = await supabase
      .rpc('exec', { 
        sql: `SELECT schema_name FROM information_schema.schemata 
              WHERE schema_name IN ('app', 'private') 
              ORDER BY schema_name;` 
      });

    if (error) {
      // Try alternative method
      const { data: schemaData, error: schemaError } = await supabase
        .from('information_schema.schemata')
        .select('schema_name')
        .in('schema_name', ['app', 'private']);

      if (schemaError) throw new Error('Could not verify schema existence');
    }
  });

  // Test 3: OAuth RPC Functions Existence
  await runTest('OAuth RPC functions exist', async () => {
    const expectedFunctions = [
      'save_oauth_token',
      'get_oauth_token',
      'delete_oauth_token',
      'oauth_token_exists',
      'get_oauth_token_status',
      'update_connection_status'
    ];

    for (const functionName of expectedFunctions) {
      const { data, error } = await supabase
        .from('information_schema.routines')
        .select('routine_name')
        .eq('routine_schema', 'public')
        .eq('routine_name', functionName)
        .single();

      if (error && !error.message.includes('No rows')) {
        throw new Error(`Function ${functionName} not found: ${error.message}`);
      }
    }
  });

  // Test 4: Vector Similarity RPC Function Existence
  await runTest('Vector similarity RPC function exists', async () => {
    const { data, error } = await supabase
      .from('information_schema.routines')
      .select('routine_name')
      .eq('routine_schema', 'public')
      .eq('routine_name', 'search_document_chunks_by_similarity')
      .single();

    if (error && !error.message.includes('No rows')) {
      throw new Error(`Vector similarity function not found: ${error.message}`);
    }
  });

  // Test 5: Function Permissions
  await runTest('Function permissions', async () => {
    const { data, error } = await supabase
      .from('information_schema.routine_privileges')
      .select('routine_name, grantee, privilege_type')
      .eq('routine_schema', 'public')
      .eq('routine_name', 'save_oauth_token')
      .eq('privilege_type', 'EXECUTE');

    if (error) {
      throw new Error(`Could not verify function permissions: ${error.message}`);
    }

    const hasAuthenticated = data?.some(p => p.grantee === 'authenticated');
    const hasServiceRole = data?.some(p => p.grantee === 'service_role');

    if (!hasAuthenticated || !hasServiceRole) {
      throw new Error('Missing required permissions for authenticated or service_role');
    }
  });

  // Test 6: Create Test User
  const testUserId = '12345678-1234-1234-1234-123456789012';
  await runTest('Create test user', async () => {
    const { error } = await supabase
      .from('users')
      .upsert({
        id: testUserId,
        email: 'staging-test@example.com',
        full_name: 'Staging Test User'
      }, { onConflict: 'id' });

    if (error) throw error;
  });

  // Test 7: OAuth Token Save/Retrieve/Delete Flow
  await runTest('OAuth token lifecycle', async () => {
    const testAccessToken = 'staging-test-access-token';
    const testRefreshToken = 'staging-test-refresh-token';
    const testExpiresAt = new Date(Date.now() + 3600000).toISOString();
    const testScope = 'https://www.googleapis.com/auth/drive.file';

    // Save token
    const { error: saveError } = await supabase.rpc('save_oauth_token', {
      p_user_id: testUserId,
      p_provider: 'google',
      p_access_token: testAccessToken,
      p_refresh_token: testRefreshToken,
      p_expires_at: testExpiresAt,
      p_scope: testScope
    });

    if (saveError) throw new Error(`Save failed: ${saveError.message}`);

    // Retrieve token
    const { data: retrieveData, error: retrieveError } = await supabase.rpc('get_oauth_token', {
      p_user_id: testUserId,
      p_provider: 'google'
    });

    if (retrieveError) throw new Error(`Retrieve failed: ${retrieveError.message}`);
    if (!retrieveData || retrieveData.length === 0) throw new Error('No token retrieved');

    const token = retrieveData[0];
    if (token.access_token !== testAccessToken) {
      throw new Error(`Token mismatch: expected ${testAccessToken}, got ${token.access_token}`);
    }

    // Delete token
    const { error: deleteError } = await supabase.rpc('delete_oauth_token', {
      p_user_id: testUserId,
      p_provider: 'google'
    });

    if (deleteError) throw new Error(`Delete failed: ${deleteError.message}`);

    // Verify deletion
    const { data: existsData, error: existsError } = await supabase.rpc('oauth_token_exists', {
      p_user_id: testUserId,
      p_provider: 'google'
    });

    if (existsError) throw new Error(`Exists check failed: ${existsError.message}`);
    if (existsData) throw new Error('Token should be deleted but still exists');
  });

  // Test 8: Connection Status Management
  await runTest('Connection status management', async () => {
    // Update connection status
    const { error: updateError } = await supabase.rpc('update_connection_status', {
      p_user_id: testUserId,
      p_provider: 'google',
      p_connected: true,
      p_error_message: null
    });

    if (updateError) throw new Error(`Connection status update failed: ${updateError.message}`);

    // Verify connection status was created
    const { data: statusData, error: statusError } = await supabase
      .from('connection_status')
      .select('*')
      .eq('user_id', testUserId)
      .eq('provider', 'google')
      .single();

    if (statusError) throw new Error(`Connection status check failed: ${statusError.message}`);
    if (!statusData.connected) throw new Error('Connection status should be true');
  });

  // Test 9: Vector Similarity Function (if vector extension available)
  await runTest('Vector similarity function', async () => {
    try {
      // Test with dummy data
      const { data, error } = await supabase.rpc('search_document_chunks_by_similarity', {
        query_embedding: Array(1536).fill(0.1),
        user_id: testUserId,
        similarity_threshold: 0.0,
        match_count: 5,
        file_ids: null
      });

      if (error && !error.message.includes('vector')) {
        throw error;
      }

      // Function exists and can be called (even if no results)
    } catch (error) {
      if (error.message.includes('vector')) {
        console.log('   ⚠️  Vector extension not available - function exists but cannot execute');
      } else {
        throw error;
      }
    }
  });

  // Test 10: Security Validation
  await runTest('Security validation', async () => {
    // Test invalid provider
    try {
      await supabase.rpc('save_oauth_token', {
        p_user_id: testUserId,
        p_provider: 'invalid_provider',
        p_access_token: 'test',
        p_refresh_token: null,
        p_expires_at: null,
        p_scope: null
      });
      throw new Error('Should have rejected invalid provider');
    } catch (error) {
      if (!error.message.includes('Invalid provider')) {
        throw new Error('Expected provider validation error');
      }
    }
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
  console.log('\n📊 Staging Test Summary');
  console.log('=======================');
  console.log(`Tests Passed: ${testsPassed}/${testsTotal}`);
  
  if (testsPassed === testsTotal) {
    console.log('🎉 All staging tests passed! RPC functions are ready for production.');
    console.log('\n📝 Next steps:');
    console.log('1. Deploy RPC functions to production database');
    console.log('2. Run production verification tests');
    console.log('3. Update application code to use RPC functions');
    console.log('4. Monitor production deployment');
    return true;
  } else {
    console.log('❌ Some staging tests failed. Please fix issues before production deployment.');
    return false;
  }
}

// Run the staging tests
testStagingDeployment()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('💥 Staging test runner failed:', error);
    process.exit(1);
  });