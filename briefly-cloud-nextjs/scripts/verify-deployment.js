#!/usr/bin/env node

/**
 * Post-Deployment Verification Script
 * Quick verification that the database migration was successful and the system is ready
 * 
 * Requirements addressed: 1.1, 1.2, 1.3, 1.4 (verification)
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

/**
 * Quick deployment verification
 */
async function verifyDeployment() {
  console.log('🔍 Post-Deployment Verification');
  console.log('===============================');
  console.log('');

  const checks = [
    {
      name: 'Database Connection',
      test: async () => {
        const { data, error } = await supabase.rpc('exec', {
          sql: 'SELECT NOW() as time;'
        });
        return !error && data && data[0];
      }
    },
    {
      name: 'Table Access',
      test: async () => {
        const { data, error } = await supabase.rpc('exec', {
          sql: 'SELECT COUNT(*) as count FROM app.apideck_connections;'
        });
        return !error && data && typeof data[0]?.count === 'number';
      }
    },
    {
      name: 'RLS Enabled',
      test: async () => {
        const { data, error } = await supabase.rpc('exec', {
          sql: `
            SELECT relrowsecurity 
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'app' AND c.relname = 'apideck_connections';
          `
        });
        return !error && data && data[0]?.relrowsecurity === true;
      }
    },
    {
      name: 'User Policy Exists',
      test: async () => {
        const { data, error } = await supabase.rpc('exec', {
          sql: `
            SELECT COUNT(*) as count
            FROM pg_policies 
            WHERE schemaname = 'app' 
            AND tablename = 'apideck_connections'
            AND policyname = 'Users can manage own apideck connections';
          `
        });
        return !error && data && data[0]?.count >= 1;
      }
    },
    {
      name: 'Service Policy Exists',
      test: async () => {
        const { data, error } = await supabase.rpc('exec', {
          sql: `
            SELECT COUNT(*) as count
            FROM pg_policies 
            WHERE schemaname = 'app' 
            AND tablename = 'apideck_connections'
            AND policyname = 'Service can access all apideck connections';
          `
        });
        return !error && data && data[0]?.count >= 1;
      }
    },
    {
      name: 'Helper Functions',
      test: async () => {
        const { data, error } = await supabase.rpc('exec', {
          sql: `
            SELECT COUNT(*) as count
            FROM information_schema.routines 
            WHERE routine_schema = 'app' 
            AND routine_name IN ('validate_apideck_connection_access', 'get_user_apideck_connections');
          `
        });
        return !error && data && data[0]?.count >= 2;
      }
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const check of checks) {
    try {
      const result = await check.test();
      if (result) {
        console.log(`✅ ${check.name}`);
        passed++;
      } else {
        console.log(`❌ ${check.name}`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${check.name}: ${error.message}`);
      failed++;
    }
  }

  console.log('');
  console.log(`📊 Results: ${passed}/${checks.length} checks passed`);

  if (failed === 0) {
    console.log('🎉 Deployment verification successful!');
    console.log('');
    console.log('✅ Google Drive OAuth integration should now work');
    console.log('✅ Connection storage will function properly');
    console.log('✅ Users can only access their own connections');
    console.log('');
    console.log('📝 Next steps:');
    console.log('1. Test the OAuth flow in the application');
    console.log('2. Verify connection storage works');
    console.log('3. Check that indexing begins after connection');
    return true;
  } else {
    console.log('⚠️  Some checks failed - review deployment');
    console.log('');
    console.log('🔧 Troubleshooting:');
    console.log('1. Run full validation: npm run validate:database:verbose');
    console.log('2. Check deployment logs for errors');
    console.log('3. Consider re-running deployment script');
    console.log('4. Verify environment variables are correct');
    return false;
  }
}

// Run verification
verifyDeployment()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('💥 Verification failed:', error.message);
    process.exit(1);
  });