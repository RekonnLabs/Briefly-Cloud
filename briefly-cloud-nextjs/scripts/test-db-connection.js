#!/usr/bin/env node

/**
 * Simple database connection test
 */

const { config } = require('dotenv')
const fs = require('fs')

// Try to load environment variables from various sources
const envFiles = ['.env.local', '.env', '../.env.local', '../.env']
for (const envFile of envFiles) {
  if (fs.existsSync(envFile)) {
    config({ path: envFile })
    console.log(`Loaded environment from ${envFile}`)
    break
  }
}

async function testConnection() {
  try {
    // Import Supabase
    const { createClient } = require('@supabase/supabase-js')
    
    // Create client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        db: { schema: 'app' },
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )
    
    // Test connection
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .limit(1)
    
    if (error && !error.message.includes('no rows')) {
      throw error
    }
    
    console.log('✅ Database connection OK')
    process.exit(0)
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message)
    process.exit(1)
  }
}

testConnection()