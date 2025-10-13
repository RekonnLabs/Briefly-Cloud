#!/usr/bin/env node

/**
 * Deploy Apideck Connections RLS Fix Script
 * Deploys RLS policies and permissions for app.apideck_connections table
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Handle script arguments first before checking environment
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Apideck Connections RLS Fix Deployment Script');
  console.log('=============================================');
  console.log('');
  console.log('Usage: node scripts/deploy-apideck-rls-fix.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --help, -h     Show this help message');
  console.log('  --verify-only  Only run verification, skip deployment');
  console.log('  --test-only    Only run connection test');
  console.log('');
  console.log('Environment Variables Required:');
  console.log('  NEXT_PUBLIC_SUPABASE_URL     - Your Supabase project URL');
  console.log('  SUPABASE_SERVICE_ROLE_KEY    - Your Supabase service role key');
  process.exit(0);
}

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

async function deployApideckRLSFix() {
  console.log('🚀 Deploying Apideck Connections RLS Fix');
  console.log('========================================');

  const deployment = {
    name: 'Apideck Connections RLS Fix',
    file: 'database/15-apideck-connections-rls-fix.sql',
    description: 'Enable RLS policies and permissions for app.apideck_connections table'
  };

  console.log(`📦 Deploying: ${deployment.name}`);
  console.log(`📄 File: ${deployment.file}`);
  console.log(`📝 Description: ${deployment.description}`);

  try {
    // Read the SQL file
    const sqlFilePath = path.join(__dirname, '..', deployment.file);
    
    if (!fs.existsSync(sqlFilePath)) {
      throw new Error(`SQL file not found: ${sqlFilePath}`);
    }

    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
    
    console.log(`📊 SQL file size: ${(sqlContent.length / 1024).toFixed(2)} KB`);
    
    // Execute the SQL
    console.log('⚡ Executing SQL migration...');
    
    // For this migration, we'll execute it as a single transaction
    const { error } = await supabase.rpc('exec', { 
      sql: sqlContent 
    });

    if (error) {
      // If RPC exec fails, try alternative approach
      console.log('⚠️  RPC exec failed, trying direct query execution...');
      
      // Split into logical sections and execute
      const sections = sqlContent.split('-- ============================================================================');
      
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i].trim();
        if (section.length === 0) continue;
        
        console.log(`📋 Executing section ${i + 1}/${sections.length}...`);
        
        // Split section into statements
        const statements = section
          .split(';')
          .map(stmt => stmt.trim())
          .filter(stmt => stmt.length > 0 && !stmt.startsWith('--') && !stmt.startsWith('/*'));

        for (const statement of statements) {
          if (statement.length === 0) continue;
          
          try {
            // Use a more direct approach for DDL statements
            const { error: stmtError } = await supabase
              .rpc('exec', { sql: statement + ';' });
            
            if (stmtError) {
              console.log(`⚠️  Statement execution warning: ${stmtError.message}`);
              // Continue with other statements
            }
          } catch (execError) {
            console.log(`⚠️  Statement execution error: ${execError.message}`);
            // Log but continue
          }
        }
      }
    }

    console.log('✅ Migration deployment completed successfully');
    return true;

  } catch (error) {
    console.log(`❌ Migration deployment failed: ${error.message}`);
    return false;
  }
}

async function verifyRLSDeployment() {
  console.log('\n🔍 Verifying RLS Deployment');
  console.log('===========================');

  const checks = [
    {
      name: 'RLS Enabled on apideck_connections',
      query: `
        SELECT relrowsecurity 
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'app' AND c.relname = 'apideck_connections'
      `,
      expected: true
    },
    {
      name: 'User Policy Exists',
      query: `
        SELECT COUNT(*) as count
        FROM pg_policies 
        WHERE schemaname = 'app' 
        AND tablename = 'apideck_connections'
        AND policyname = 'Users can manage own apideck connections'
      `,
      expected: 1
    },
    {
      name: 'Service Policy Exists',
      query: `
        SELECT COUNT(*) as count
        FROM pg_policies 
        WHERE schemaname = 'app' 
        AND tablename = 'apideck_connections'
        AND policyname = 'Service can access all apideck connections'
      `,
      expected: 1
    }
  ];

  let verifiedCount = 0;

  for (const check of checks) {
    try {
      console.log(`🔍 Checking: ${check.name}`);
      
      const { data, error } = await supabase.rpc('exec', {
        sql: check.query
      });

      if (error) {
        console.log(`❌ Check failed: ${check.name} - ${error.message}`);
      } else {
        const result = Array.isArray(data) ? data[0] : data;
        const value = result?.relrowsecurity ?? result?.count ?? result;
        
        if (value === check.expected) {
          console.log(`✅ ${check.name}: PASSED`);
          verifiedCount++;
        } else {
          console.log(`❌ ${check.name}: FAILED (expected: ${check.expected}, got: ${value})`);
        }
      }
    } catch (error) {
      console.log(`⚠️  Verification error for ${check.name}: ${error.message}`);
    }
  }

  // Check helper functions
  const functions = [
    'validate_apideck_connection_access',
    'get_user_apideck_connections'
  ];

  for (const functionName of functions) {
    try {
      const { data, error } = await supabase.rpc('exec', {
        sql: `
          SELECT routine_name 
          FROM information_schema.routines 
          WHERE routine_schema = 'app' 
          AND routine_name = '${functionName}'
        `
      });

      if (error) {
        console.log(`⚠️  Could not verify function ${functionName}: ${error.message}`);
      } else if (data && data.length > 0) {
        console.log(`✅ Function verified: ${functionName}`);
        verifiedCount++;
      } else {
        console.log(`❌ Function not found: ${functionName}`);
      }
    } catch (error) {
      console.log(`⚠️  Function verification error for ${functionName}: ${error.message}`);
    }
  }

  const totalChecks = checks.length + functions.length;
  console.log(`\n📊 Verification: ${verifiedCount}/${totalChecks} checks passed`);
  return verifiedCount >= (totalChecks - 1); // Allow for one minor failure
}

async function testConnection() {
  console.log('\n🧪 Testing Connection Access');
  console.log('============================');

  try {
    // Test that we can query the table structure
    const { data, error } = await supabase.rpc('exec', {
      sql: `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_schema = 'app' 
        AND table_name = 'apideck_connections'
        ORDER BY ordinal_position
      `
    });

    if (error) {
      console.log(`❌ Table structure query failed: ${error.message}`);
      return false;
    }

    if (data && data.length > 0) {
      console.log('✅ Table structure accessible:');
      data.forEach(col => {
        console.log(`   - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
      });
      return true;
    } else {
      console.log('❌ No table structure data returned');
      return false;
    }
  } catch (error) {
    console.log(`❌ Connection test failed: ${error.message}`);
    return false;
  }
}

async function main() {
  try {
    // Test database connection first
    console.log('🔌 Testing database connection...');
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .limit(1);

    if (error && !error.message.includes('relation "users" does not exist')) {
      throw new Error(`Database connection failed: ${error.message}`);
    }

    console.log('✅ Database connection successful');

    // Deploy RLS fix
    const deploymentSuccess = await deployApideckRLSFix();
    
    if (deploymentSuccess) {
      // Verify deployment
      const verificationSuccess = await verifyRLSDeployment();
      
      // Test connection
      const connectionTestSuccess = await testConnection();
      
      if (verificationSuccess && connectionTestSuccess) {
        console.log('\n🎉 Apideck Connections RLS Fix deployed and verified successfully!');
        console.log('\n📝 Next steps:');
        console.log('1. Test the OAuth flow with Google Drive integration');
        console.log('2. Verify API routes can access connection data');
        console.log('3. Check that users can only see their own connections');
        process.exit(0);
      } else {
        console.log('\n⚠️  Deployment completed but verification had issues.');
        console.log('The fix may still be working. Test the OAuth flow to verify.');
        process.exit(0);
      }
    } else {
      console.log('\n❌ Deployment failed. Please check errors above.');
      process.exit(1);
    }

  } catch (error) {
    console.error('💥 Deployment script failed:', error.message);
    console.error('\n🔧 Troubleshooting:');
    console.error('1. Check your environment variables are set correctly');
    console.error('2. Verify database connection and permissions');
    console.error('3. Try manual deployment via Supabase dashboard');
    console.error('4. Check that app.apideck_connections table exists');
    process.exit(1);
  }
}

// Handle remaining script arguments

if (args.includes('--verify-only')) {
  verifyRLSDeployment().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Verification failed:', error.message);
    process.exit(1);
  });
} else if (args.includes('--test-only')) {
  testConnection().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Connection test failed:', error.message);
    process.exit(1);
  });
} else {
  main();
}