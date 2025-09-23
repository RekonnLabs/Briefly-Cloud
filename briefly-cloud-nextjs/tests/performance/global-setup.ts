/**
 * Global setup for performance tests
 * Prepares the test environment and database for performance testing
 */

import { execSync } from 'child_process'
import { config } from 'dotenv'

export default async function globalSetup() {
  console.log('🔧 Setting up performance test environment...')
  
  // Load environment variables
  config({ path: '.env.local' })
  
  // Check for required environment variables (optional for mock tests)
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
  ]
  
  const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar])
  if (missingVars.length > 0) {
    console.warn(`⚠️  Missing environment variables: ${missingVars.join(', ')}`)
    console.log('Running in mock mode - database connectivity tests will be skipped')
    process.env.PERFORMANCE_TEST_MOCK_MODE = 'true'
  } else {
    console.log('✅ Environment variables verified')
  }
  
  // Warm up the database connection (skip in mock mode)
  if (!process.env.PERFORMANCE_TEST_MOCK_MODE) {
    try {
      console.log('🔥 Warming up database connections...')
      
      // Import and test basic connectivity
      const { supabaseApp } = await import('../../src/app/lib/supabase-clients')
      
      // Test app schema connectivity
      const { data: appTest, error: appError } = await supabaseApp
        .from('users')
        .select('id')
        .limit(1)
      
      if (appError && !appError.message.includes('no rows')) {
        console.warn('⚠️  App schema connectivity issue:', appError.message)
      } else {
        console.log('✅ App schema connection verified')
      }
      
      // Test RPC function connectivity
      const { data: rpcTest, error: rpcError } = await supabaseApp.rpc('get_oauth_token', {
        p_user_id: '00000000-0000-0000-0000-000000000000',
        p_provider: 'google'
      })
      
      if (rpcError && !rpcError.message.includes('no rows')) {
        console.warn('⚠️  RPC function connectivity issue:', rpcError.message)
      } else {
        console.log('✅ RPC function connectivity verified')
      }
      
    } catch (error) {
      console.warn('⚠️  Database warmup failed:', error.message)
      console.log('Continuing with performance tests...')
    }
  } else {
    console.log('🧪 Running in mock mode - skipping database warmup')
  }
  
  // Set performance test environment variables
  process.env.NODE_ENV = 'test'
  process.env.ENABLE_PERFORMANCE_MONITORING = 'true'
  process.env.JEST_PERFORMANCE_TEST = 'true'
  
  console.log('🚀 Performance test environment ready')
}