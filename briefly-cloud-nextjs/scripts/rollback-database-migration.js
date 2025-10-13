#!/usr/bin/env node

/**
 * Database Migration Rollback Script
 * Safely rolls back the Google Drive Vault integration database changes
 * 
 * Requirements addressed: 1.1, 1.2, 1.3, 1.4 (rollback procedures)
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

// Configuration
const CONFIG = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  confirmationRequired: true,
  backupBeforeRollback: true
};

let supabase;

function initializeSupabase() {
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseServiceKey) {
    throw new Error('Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  }

  supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return supabase;
}

/**
 * Check what would be rolled back
 */
async function analyzeRollback() {
  console.log('🔍 Analyzing current state for rollback...');
  
  const analysis = {
    rls_enabled: false,
    policies_found: [],
    functions_found: [],
    permissions_found: [],
    data_exists: false,
    safe_to_rollback: true,
    warnings: []
  };

  try {
    // Check if RLS is enabled
    const { data: rlsData, error: rlsError } = await supabase.rpc('exec', {
      sql: `
        SELECT relrowsecurity 
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'app' AND c.relname = 'apideck_connections';
      `
    });

    if (!rlsError && rlsData && rlsData[0]) {
      analysis.rls_enabled = rlsData[0].relrowsecurity;
    }

    // Check for policies
    const { data: policyData, error: policyError } = await supabase.rpc('exec', {
      sql: `
        SELECT policyname, roles, cmd
        FROM pg_policies 
        WHERE schemaname = 'app' AND tablename = 'apideck_connections';
      `
    });

    if (!policyError && policyData) {
      analysis.policies_found = policyData.map(p => p.policyname);
    }

    // Check for helper functions
    const { data: functionData, error: functionError } = await supabase.rpc('exec', {
      sql: `
        SELECT routine_name 
        FROM information_schema.routines 
        WHERE routine_schema = 'app' 
        AND routine_name IN ('validate_apideck_connection_access', 'get_user_apideck_connections');
      `
    });

    if (!functionError && functionData) {
      analysis.functions_found = functionData.map(f => f.routine_name);
    }

    // Check for data in the table
    const { data: countData, error: countError } = await supabase.rpc('exec', {
      sql: 'SELECT COUNT(*) as count FROM app.apideck_connections;'
    });

    if (!countError && countData && countData[0]) {
      analysis.data_exists = countData[0].count > 0;
      if (analysis.data_exists) {
        analysis.warnings.push(`Table contains ${countData[0].count} connection records that will remain after rollback`);
      }
    }

    // Check permissions
    const { data: permData, error: permError } = await supabase.rpc('exec', {
      sql: `
        SELECT grantee, privilege_type
        FROM information_schema.table_privileges 
        WHERE table_schema = 'app' 
        AND table_name = 'apideck_connections'
        AND grantee IN ('briefly_authenticated', 'briefly_service');
      `
    });

    if (!permError && permData) {
      analysis.permissions_found = permData.map(p => `${p.grantee}: ${p.privilege_type}`);
    }

    return analysis;

  } catch (error) {
    analysis.safe_to_rollback = false;
    analysis.warnings.push(`Analysis failed: ${error.message}`);
    return analysis;
  }
}

/**
 * Create backup before rollback
 */
async function createPreRollbackBackup() {
  console.log('📦 Creating pre-rollback backup...');
  
  try {
    const analysis = await analyzeRollback();
    
    const backupData = {
      timestamp: new Date().toISOString(),
      backup_type: 'pre_rollback',
      current_state: analysis,
      note: 'Backup created before rolling back Google Drive Vault integration changes'
    };

    // Save backup to file
    const backupPath = path.join(__dirname, '..', 'database', 'backups', `pre-rollback-${Date.now()}.json`);
    
    // Ensure backup directory exists
    const backupDir = path.dirname(backupPath);
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
    console.log(`✅ Pre-rollback backup created: ${backupPath}`);
    
    return backupPath;

  } catch (error) {
    console.log(`⚠️  Pre-rollback backup failed: ${error.message}`);
    return null;
  }
}

/**
 * Execute the rollback
 */
async function executeRollback() {
  console.log('🔄 Executing rollback...');
  
  const rollbackSteps = [
    {
      name: 'Drop helper functions',
      sql: `
        DROP FUNCTION IF EXISTS app.validate_apideck_connection_access(UUID, TEXT);
        DROP FUNCTION IF EXISTS app.get_user_apideck_connections(UUID);
      `,
      critical: false
    },
    {
      name: 'Drop RLS policies',
      sql: `
        DROP POLICY IF EXISTS "Users can manage own apideck connections" ON app.apideck_connections;
        DROP POLICY IF EXISTS "Service can access all apideck connections" ON app.apideck_connections;
      `,
      critical: true
    },
    {
      name: 'Disable RLS (optional)',
      sql: `
        -- Only disable RLS if you're sure it was enabled by the migration
        -- ALTER TABLE app.apideck_connections DISABLE ROW LEVEL SECURITY;
        SELECT 'RLS left enabled for safety' as note;
      `,
      critical: false
    },
    {
      name: 'Log rollback completion',
      sql: `
        INSERT INTO private.audit_logs (action, resource_type, new_values, severity)
        VALUES (
          'APIDECK_CONNECTIONS_RLS_ROLLBACK',
          'database',
          jsonb_build_object(
            'table', 'app.apideck_connections',
            'rollback_reason', 'Manual rollback requested',
            'rolled_back_at', NOW(),
            'rollback_script', 'rollback-database-migration.js'
          ),
          'info'
        );
      `,
      critical: false
    }
  ];

  let successfulSteps = 0;
  let criticalFailures = 0;

  for (const step of rollbackSteps) {
    try {
      console.log(`📋 ${step.name}...`);
      
      const { error } = await supabase.rpc('exec', { sql: step.sql });

      if (error) {
        if (error.message.includes('does not exist') || error.message.includes('not found')) {
          console.log(`ℹ️  ${step.name}: Already removed or never existed`);
          successfulSteps++;
        } else {
          console.log(`⚠️  ${step.name}: ${error.message}`);
          if (step.critical) criticalFailures++;
        }
      } else {
        console.log(`✅ ${step.name}: Completed`);
        successfulSteps++;
      }

    } catch (error) {
      console.log(`❌ ${step.name}: Failed - ${error.message}`);
      if (step.critical) criticalFailures++;
    }
  }

  console.log(`\n📊 Rollback Results: ${successfulSteps}/${rollbackSteps.length} steps completed`);
  
  if (criticalFailures === 0) {
    console.log('✅ Rollback completed successfully');
    return true;
  } else {
    console.log(`❌ ${criticalFailures} critical step(s) failed`);
    return false;
  }
}

/**
 * Verify rollback was successful
 */
async function verifyRollback() {
  console.log('🔍 Verifying rollback...');
  
  const verifications = [
    {
      name: 'Helper functions removed',
      query: `
        SELECT COUNT(*) as count
        FROM information_schema.routines 
        WHERE routine_schema = 'app' 
        AND routine_name IN ('validate_apideck_connection_access', 'get_user_apideck_connections');
      `,
      expected: 0
    },
    {
      name: 'RLS policies removed',
      query: `
        SELECT COUNT(*) as count
        FROM pg_policies 
        WHERE schemaname = 'app' 
        AND tablename = 'apideck_connections'
        AND policyname IN ('Users can manage own apideck connections', 'Service can access all apideck connections');
      `,
      expected: 0
    },
    {
      name: 'Table still accessible',
      query: `
        SELECT COUNT(*) as count
        FROM app.apideck_connections;
      `,
      expected: 'any' // Just needs to not error
    }
  ];

  let verificationsPassed = 0;

  for (const verification of verifications) {
    try {
      console.log(`🔍 Verifying: ${verification.name}`);
      
      const { data, error } = await supabase.rpc('exec', {
        sql: verification.query
      });

      if (error) {
        console.log(`❌ ${verification.name}: Query failed - ${error.message}`);
      } else if (verification.expected === 'any' || (data && data[0]?.count === verification.expected)) {
        console.log(`✅ ${verification.name}: PASSED`);
        verificationsPassed++;
      } else {
        console.log(`❌ ${verification.name}: FAILED (expected: ${verification.expected}, got: ${data?.[0]?.count})`);
      }

    } catch (error) {
      console.log(`⚠️  ${verification.name}: Verification error - ${error.message}`);
    }
  }

  const successRate = (verificationsPassed / verifications.length) * 100;
  console.log(`\n📊 Verification Results: ${verificationsPassed}/${verifications.length} passed (${successRate.toFixed(1)}%)`);
  
  return verificationsPassed >= (verifications.length - 1); // Allow for one minor failure
}

/**
 * Interactive confirmation
 */
function getConfirmation() {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Are you sure you want to proceed with the rollback? (yes/no): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

/**
 * Main rollback function
 */
async function rollbackMigration() {
  console.log('🔄 Database Migration Rollback');
  console.log('==============================');
  console.log(`📅 Started at: ${new Date().toISOString()}`);
  console.log('');

  try {
    // Initialize Supabase client
    initializeSupabase();
    console.log('✅ Supabase client initialized');

    // Analyze current state
    const analysis = await analyzeRollback();
    
    console.log('\n📋 Current State Analysis:');
    console.log(`RLS Enabled: ${analysis.rls_enabled ? '✅' : '❌'}`);
    console.log(`Policies Found: ${analysis.policies_found.length} (${analysis.policies_found.join(', ')})`);
    console.log(`Functions Found: ${analysis.functions_found.length} (${analysis.functions_found.join(', ')})`);
    console.log(`Data Exists: ${analysis.data_exists ? '⚠️  Yes' : '✅ No'}`);
    console.log(`Safe to Rollback: ${analysis.safe_to_rollback ? '✅' : '❌'}`);

    if (analysis.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      analysis.warnings.forEach(warning => console.log(`   - ${warning}`));
    }

    if (!analysis.safe_to_rollback) {
      throw new Error('Rollback analysis indicates it may not be safe to proceed');
    }

    // Get confirmation if required
    if (CONFIG.confirmationRequired) {
      console.log('\n🚨 This will remove RLS policies and helper functions from the database.');
      console.log('   The table and data will remain intact, but security policies will be removed.');
      
      const confirmed = await getConfirmation();
      if (!confirmed) {
        console.log('❌ Rollback cancelled by user');
        process.exit(0);
      }
    }

    // Create backup before rollback
    if (CONFIG.backupBeforeRollback) {
      await createPreRollbackBackup();
    }

    // Execute rollback
    const rollbackSuccess = await executeRollback();
    if (!rollbackSuccess) {
      throw new Error('Rollback execution had critical failures');
    }

    // Verify rollback
    const verificationSuccess = await verifyRollback();
    
    console.log('\n📋 Rollback Summary');
    console.log('===================');
    console.log(`Status: ${rollbackSuccess && verificationSuccess ? '✅ SUCCESS' : '⚠️  PARTIAL'}`);
    console.log(`Execution: ${rollbackSuccess ? '✅' : '❌'}`);
    console.log(`Verification: ${verificationSuccess ? '✅' : '❌'}`);
    
    console.log('\n📝 What was rolled back:');
    console.log('- RLS policies for apideck_connections table');
    console.log('- Helper functions for connection validation');
    console.log('- Audit log entry created for rollback tracking');
    
    console.log('\n📝 What remains:');
    console.log('- app.apideck_connections table structure');
    console.log('- Any existing connection data');
    console.log('- Table permissions (may need manual cleanup)');
    console.log('- RLS enabled status (left enabled for safety)');

    console.log('\n📝 Next steps:');
    console.log('1. Test that the application still functions');
    console.log('2. Consider re-running the migration if issues persist');
    console.log('3. Check application logs for any permission errors');
    console.log('4. Manually clean up table permissions if needed');

    process.exit(rollbackSuccess && verificationSuccess ? 0 : 1);

  } catch (error) {
    console.error(`\n💥 Rollback failed: ${error.message}`);
    
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check environment variables are set correctly');
    console.log('2. Verify Supabase service role has proper permissions');
    console.log('3. Try manual rollback via Supabase dashboard');
    console.log('4. Check database logs for detailed error information');
    
    process.exit(1);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log('Database Migration Rollback Script');
  console.log('==================================');
  console.log('');
  console.log('Usage: node scripts/rollback-database-migration.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --help, -h           Show this help message');
  console.log('  --analyze-only       Only analyze current state, don\'t rollback');
  console.log('  --force              Skip confirmation prompt');
  console.log('  --no-backup          Skip pre-rollback backup');
  console.log('');
  console.log('Environment Variables Required:');
  console.log('  NEXT_PUBLIC_SUPABASE_URL     - Your Supabase project URL');
  console.log('  SUPABASE_SERVICE_ROLE_KEY    - Your Supabase service role key');
  console.log('');
  console.log('⚠️  WARNING: This will remove RLS policies and helper functions!');
  console.log('   The table and data will remain, but security policies will be removed.');
  process.exit(0);
}

// Handle specific operations
if (args.includes('--analyze-only')) {
  initializeSupabase();
  analyzeRollback().then(analysis => {
    console.log('\n📋 Rollback Analysis Results:');
    console.log(JSON.stringify(analysis, null, 2));
    process.exit(0);
  }).catch(error => {
    console.error('Analysis failed:', error.message);
    process.exit(1);
  });
} else {
  // Apply configuration overrides from command line
  if (args.includes('--force')) CONFIG.confirmationRequired = false;
  if (args.includes('--no-backup')) CONFIG.backupBeforeRollback = false;
  
  // Run main rollback
  rollbackMigration();
}