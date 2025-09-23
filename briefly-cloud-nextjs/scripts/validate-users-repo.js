#!/usr/bin/env node

/**
 * Validation script for Users Repository
 * 
 * This script validates that the users repository works correctly with the app schema.
 * It tests basic CRUD operations and schema connectivity.
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

// Configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:')
  console.error('   - NEXT_PUBLIC_SUPABASE_URL')
  console.error('   - SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// Create Supabase client for app schema
const supabaseApp = createClient(supabaseUrl, supabaseServiceKey, {
  db: { schema: 'app' },
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Test user data
const testUserId = 'test-user-' + Date.now()
const testEmail = `test-${Date.now()}@example.com`

async function validateUsersRepo() {
  console.log('🔍 Validating Users Repository...\n')

  try {
    // Test 1: Schema connectivity
    console.log('1️⃣ Testing app schema connectivity...')
    const { data: schemaTest, error: schemaError } = await supabaseApp
      .from('users')
      .select('id')
      .limit(1)

    if (schemaError && schemaError.code !== 'PGRST116') {
      throw new Error(`Schema connectivity failed: ${schemaError.message}`)
    }
    console.log('   ✅ App schema connectivity verified')

    // Test 2: Create user profile
    console.log('\n2️⃣ Testing user profile creation...')
    const { data: createdUser, error: createError } = await supabaseApp
      .from('users')
      .insert({
        id: testUserId,
        email: testEmail,
        subscription_tier: 'free',
        documents_uploaded: 0,
        documents_limit: 25,
        storage_used_bytes: 0,
        storage_limit_bytes: 100 * 1024 * 1024,
        metadata: { source: 'validation-script' },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('*')
      .single()

    if (createError) {
      throw new Error(`User creation failed: ${createError.message}`)
    }
    console.log('   ✅ User profile created successfully')
    console.log(`   📝 User ID: ${createdUser.id}`)
    console.log(`   📧 Email: ${createdUser.email}`)
    console.log(`   🎯 Tier: ${createdUser.subscription_tier}`)

    // Test 3: Retrieve user profile
    console.log('\n3️⃣ Testing user profile retrieval...')
    const { data: retrievedUser, error: retrieveError } = await supabaseApp
      .from('users')
      .select('*')
      .eq('id', testUserId)
      .single()

    if (retrieveError) {
      throw new Error(`User retrieval failed: ${retrieveError.message}`)
    }
    console.log('   ✅ User profile retrieved successfully')
    console.log(`   📊 Documents: ${retrievedUser.documents_uploaded}/${retrievedUser.documents_limit}`)
    console.log(`   💾 Storage: ${retrievedUser.storage_used_bytes}/${retrievedUser.storage_limit_bytes} bytes`)

    // Test 4: Update usage statistics
    console.log('\n4️⃣ Testing usage statistics update...')
    const { error: updateError } = await supabaseApp
      .from('users')
      .update({
        documents_uploaded: 5,
        storage_used_bytes: 1024000,
        updated_at: new Date().toISOString()
      })
      .eq('id', testUserId)

    if (updateError) {
      throw new Error(`Usage update failed: ${updateError.message}`)
    }
    console.log('   ✅ Usage statistics updated successfully')

    // Test 5: Verify usage update
    console.log('\n5️⃣ Verifying usage update...')
    const { data: updatedUser, error: verifyError } = await supabaseApp
      .from('users')
      .select('documents_uploaded, storage_used_bytes, subscription_tier')
      .eq('id', testUserId)
      .single()

    if (verifyError) {
      throw new Error(`Usage verification failed: ${verifyError.message}`)
    }

    if (updatedUser.documents_uploaded !== 5 || updatedUser.storage_used_bytes !== 1024000) {
      throw new Error('Usage statistics not updated correctly')
    }
    console.log('   ✅ Usage statistics verified')
    console.log(`   📊 Documents: ${updatedUser.documents_uploaded}`)
    console.log(`   💾 Storage: ${updatedUser.storage_used_bytes} bytes`)

    // Test 6: Update subscription tier
    console.log('\n6️⃣ Testing subscription tier update...')
    const { error: tierError } = await supabaseApp
      .from('users')
      .update({
        subscription_tier: 'pro',
        documents_limit: 500,
        storage_limit_bytes: 1024 * 1024 * 1024,
        updated_at: new Date().toISOString()
      })
      .eq('id', testUserId)

    if (tierError) {
      throw new Error(`Tier update failed: ${tierError.message}`)
    }
    console.log('   ✅ Subscription tier updated successfully')

    // Test 7: Verify tier update
    console.log('\n7️⃣ Verifying tier update...')
    const { data: tierUser, error: tierVerifyError } = await supabaseApp
      .from('users')
      .select('subscription_tier, documents_limit, storage_limit_bytes')
      .eq('id', testUserId)
      .single()

    if (tierVerifyError) {
      throw new Error(`Tier verification failed: ${tierVerifyError.message}`)
    }

    if (tierUser.subscription_tier !== 'pro' || tierUser.documents_limit !== 500) {
      throw new Error('Tier update not applied correctly')
    }
    console.log('   ✅ Tier update verified')
    console.log(`   🎯 New tier: ${tierUser.subscription_tier}`)
    console.log(`   📊 New limits: ${tierUser.documents_limit} docs, ${tierUser.storage_limit_bytes} bytes`)

    // Test 8: Test user retrieval by email
    console.log('\n8️⃣ Testing user retrieval by email...')
    const { data: emailUser, error: emailError } = await supabaseApp
      .from('users')
      .select('*')
      .eq('email', testEmail)
      .single()

    if (emailError) {
      throw new Error(`Email retrieval failed: ${emailError.message}`)
    }

    if (emailUser.id !== testUserId) {
      throw new Error('Email retrieval returned wrong user')
    }
    console.log('   ✅ User retrieval by email successful')

    // Test 9: Test metadata update
    console.log('\n9️⃣ Testing metadata update...')
    const metadata = {
      preferences: { theme: 'dark', language: 'en' },
      settings: { notifications: true },
      validation: { tested: true, timestamp: new Date().toISOString() }
    }

    const { error: metadataError } = await supabaseApp
      .from('users')
      .update({
        metadata,
        updated_at: new Date().toISOString()
      })
      .eq('id', testUserId)

    if (metadataError) {
      throw new Error(`Metadata update failed: ${metadataError.message}`)
    }
    console.log('   ✅ Metadata updated successfully')

    // Test 10: Verify metadata
    console.log('\n🔟 Verifying metadata...')
    const { data: metadataUser, error: metadataVerifyError } = await supabaseApp
      .from('users')
      .select('metadata')
      .eq('id', testUserId)
      .single()

    if (metadataVerifyError) {
      throw new Error(`Metadata verification failed: ${metadataVerifyError.message}`)
    }

    if (!metadataUser.metadata || !metadataUser.metadata.validation?.tested) {
      throw new Error('Metadata not updated correctly')
    }
    console.log('   ✅ Metadata verified')
    console.log(`   📝 Metadata keys: ${Object.keys(metadataUser.metadata).join(', ')}`)

    console.log('\n🎉 All users repository tests passed!')
    console.log('\n📋 Summary:')
    console.log('   ✅ Schema connectivity')
    console.log('   ✅ User profile creation')
    console.log('   ✅ User profile retrieval (by ID and email)')
    console.log('   ✅ Usage statistics tracking')
    console.log('   ✅ Subscription tier management')
    console.log('   ✅ Metadata management')
    console.log('   ✅ App schema operations')

  } catch (error) {
    console.error('\n❌ Validation failed:', error.message)
    console.error('\n🔧 Troubleshooting:')
    console.error('   1. Verify database schema migration is complete')
    console.error('   2. Check that app.users table exists with correct columns')
    console.error('   3. Verify Supabase service role key has proper permissions')
    console.error('   4. Ensure app schema is accessible')
    
    return false
  } finally {
    // Cleanup: Delete test user
    console.log('\n🧹 Cleaning up test data...')
    try {
      await supabaseApp
        .from('users')
        .delete()
        .eq('id', testUserId)
      console.log('   ✅ Test data cleaned up')
    } catch (cleanupError) {
      console.warn('   ⚠️ Cleanup warning:', cleanupError.message)
    }
  }

  return true
}

// Run validation
if (require.main === module) {
  validateUsersRepo()
    .then(success => {
      process.exit(success ? 0 : 1)
    })
    .catch(error => {
      console.error('❌ Unexpected error:', error)
      process.exit(1)
    })
}

module.exports = { validateUsersRepo }