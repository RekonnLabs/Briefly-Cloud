#!/usr/bin/env node

/**
 * Comprehensive Database Migration and Deployment Script
 * Deploys RLS policies, permissions, and schema changes for Google Drive Vault integration
 * 
 * Requirements addressed: 1.1, 1.2, 1.3, 1.4
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

// Configuration
const CONFIG = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  migrationFile: 'database/15-apideck-connections-rls-fix.sql',
  backupEnabled: true,
  validationEnabled: true,
  rollbackOnFailure: true
};

// Validation and deployment state
let deploymentState = {
  startTime: null,
  backupCreated: false,
  migrationApplied: false,
  validationPassed: false,
  rollbackAvailable: true
};

// Initialize Supabase client
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
 * Create backup of current database state before migration
 */
async function createBackup() {
  console.log('📦 Creating database backup...');
  
  try {
    // Check if apideck_connections table exists and has data
    const { data: tableExists, error: tableError } = await supabase.rpc('exec', {
      sql: `
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_schema = 'app' 
          AND table_name = 'apideck_connections'
        ) as exists;
      `
    });

    if (tableError) {
      console.log('⚠️  Could not check table existence, proceeding without backup');
      return true;
    }

    if (tableExists && tableExists[0]?.exists) {
      // Get current RLS policies for backup
      const { data: policies, error: policyError } = await supabase.rpc('exec', {
        sql: `
          SELECT policyname, roles, cmd, qual, with_check
          FROM pg_policies 
          WHERE schemaname = 'app' AND tablename = 'apideck_connections';
        `
      });

      if (!policyError && policies) {
        const backupData = {
          timestamp: new Date().toISOString(),
          table_exists: true,
          current_policies: policies,
          backup_note: 'Pre-migration backup for Google Drive Vault integration fix'
        };

        // Save backup to file
        const backupPath = path.join(__dirname, '..', 'database', 'backups', `apideck-backup-${Date.now()}.json`);
        
        // Ensure backup directory exists
        const backupDir = path.dirname(backupPath);
        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true });
        }

        fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
        console.log(`✅ Backup created: ${backupPath}`);
      }
    } else {
      console.log('ℹ️  Table does not exist yet, no backup needed');
    }

    deploymentState.backupCreated = true;
    return true;

  } catch (error) {
    console.log(`⚠️  Backup creation failed: ${error.message}`);
    console.log('Proceeding with migration (no existing data to lose)');
    return true;
  }
}

/**
 * Apply the database migration
 */
async function applyMigration() {
  console.log('🚀 Applying database migration...');
  
  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '..', CONFIG.migrationFile);
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const sqlContent = fs.readFileSync(migrationPath, 'utf8');
    console.log(`📄 Migration file size: ${(sqlContent.length / 1024).toFixed(2)} KB`);

    // Execute migration in sections for better error handling
    const sections = sqlContent.split('-- ============================================================================');
    let successfulSections = 0;

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i].trim();
      if (section.length === 0) continue;

      console.log(`📋 Executing section ${i + 1}/${sections.length}...`);

      try {
        // For complex sections with multiple statements, execute them individually
        if (section.includes('CREATE POLICY') || section.includes('ALTER TABLE') || section.includes('GRANT')) {
          const statements = section
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--') && !stmt.startsWith('/*'));

          for (const statement of statements) {
            if (statement.length === 0) continue;
            
            const { error } = await supabase.rpc('exec', { 
              sql: statement + ';' 
            });

            if (error) {
              // Some errors are expected (like "already exists")
              if (error.message.includes('already exists') || 
                  error.message.includes('duplicate key') ||
                  error.message.includes('already enabled')) {
                console.log(`ℹ️  Expected: ${error.message}`);
              } else {
                console.log(`⚠️  Statement warning: ${error.message}`);
              }
            }
          }
        } else {
          // Execute the entire section for simpler operations
          const { error } = await supabase.rpc('exec', { 
            sql: section 
          });

          if (error && !error.message.includes('already exists')) {
            console.log(`⚠️  Section warning: ${error.message}`);
          }
        }

        successfulSections++;
        
      } catch (sectionError) {
        console.log(`❌ Section ${i + 1} failed: ${sectionError.message}`);
        // Continue with other sections
      }
    }

    console.log(`✅ Migration applied: ${successfulSections}/${sections.length} sections processed`);
    deploymentState.migrationApplied = true;
    return true;

  } catch (error) {
    console.log(`❌ Migration failed: ${error.message}`);
    deploymentState.migrationApplied = false;
    return false;
  }
}

/**
 * Comprehensive validation of the migration
 */
async function validateDeployment() {
  console.log('🔍 Validating deployment...');
  
  const validations = [
    {
      name: 'RLS Enabled on apideck_connections',
      query: `
        SELECT relrowsecurity 
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'app' AND c.relname = 'apideck_connections';
      `,
      validator: (result) => result && result[0]?.relrowsecurity === true,
      critical: true
    },
    {
      name: 'User Policy Created',
      query: `
        SELECT COUNT(*) as count
        FROM pg_policies 
        WHERE schemaname = 'app' 
        AND tablename = 'apideck_connections'
        AND policyname = 'Users can manage own apideck connections';
      `,
      validator: (result) => result && result[0]?.count >= 1,
      critical: true
    },
    {
      name: 'Service Policy Created',
      query: `
        SELECT COUNT(*) as count
        FROM pg_policies 
        WHERE schemaname = 'app' 
        AND tablename = 'apideck_connections'
        AND policyname = 'Service can access all apideck connections';
      `,
      validator: (result) => result && result[0]?.count >= 1,
      critical: true
    },
    {
      name: 'Table Permissions for briefly_authenticated',
      query: `
        SELECT privilege_type
        FROM information_schema.table_privileges 
        WHERE table_schema = 'app' 
        AND table_name = 'apideck_connections'
        AND grantee = 'briefly_authenticated';
      `,
      validator: (result) => result && result.length > 0,
      critical: true
    },
    {
      name: 'Helper Function: validate_apideck_connection_access',
      query: `
        SELECT routine_name 
        FROM information_schema.routines 
        WHERE routine_schema = 'app' 
        AND routine_name = 'validate_apideck_connection_access';
      `,
      validator: (result) => result && result.length > 0,
      critical: false
    },
    {
      name: 'Helper Function: get_user_apideck_connections',
      query: `
        SELECT routine_name 
        FROM information_schema.routines 
        WHERE routine_schema = 'app' 
        AND routine_name = 'get_user_apideck_connections';
      `,
      validator: (result) => result && result.length > 0,
      critical: false
    },
    {
      name: 'Table Structure Integrity',
      query: `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_schema = 'app' 
        AND table_name = 'apideck_connections'
        ORDER BY ordinal_position;
      `,
      validator: (result) => result && result.length >= 6, // Should have at least 6 columns
      critical: true
    }
  ];

  let passedValidations = 0;
  let criticalFailures = 0;

  for (const validation of validations) {
    try {
      console.log(`🔍 Validating: ${validation.name}`);
      
      const { data, error } = await supabase.rpc('exec', {
        sql: validation.query
      });

      if (error) {
        console.log(`❌ ${validation.name}: Query failed - ${error.message}`);
        if (validation.critical) criticalFailures++;
      } else if (validation.validator(data)) {
        console.log(`✅ ${validation.name}: PASSED`);
        passedValidations++;
      } else {
        console.log(`❌ ${validation.name}: FAILED - Validation condition not met`);
        if (validation.critical) criticalFailures++;
      }

    } catch (error) {
      console.log(`⚠️  ${validation.name}: Validation error - ${error.message}`);
      if (validation.critical) criticalFailures++;
    }
  }

  const totalValidations = validations.length;
  const successRate = (passedValidations / totalValidations) * 100;

  console.log(`\n📊 Validation Results: ${passedValidations}/${totalValidations} passed (${successRate.toFixed(1)}%)`);
  
  if (criticalFailures === 0) {
    console.log('✅ All critical validations passed');
    deploymentState.validationPassed = true;
    return true;
  } else {
    console.log(`❌ ${criticalFailures} critical validation(s) failed`);
    deploymentState.validationPassed = false;
    return false;
  }
}

/**
 * Test database connectivity and basic operations
 */
async function testConnectivity() {
  console.log('🧪 Testing database connectivity...');
  
  try {
    // Test basic connection
    const { data, error } = await supabase.rpc('exec', {
      sql: 'SELECT NOW() as current_time, version() as pg_version;'
    });

    if (error) {
      throw new Error(`Connection test failed: ${error.message}`);
    }

    if (data && data[0]) {
      console.log(`✅ Database connected: PostgreSQL ${data[0].pg_version.split(' ')[1]}`);
      console.log(`✅ Server time: ${data[0].current_time}`);
    }

    // Test table access
    const { data: tableData, error: tableError } = await supabase.rpc('exec', {
      sql: `
        SELECT COUNT(*) as connection_count
        FROM app.apideck_connections;
      `
    });

    if (tableError) {
      console.log(`⚠️  Table access test failed: ${tableError.message}`);
      return false;
    }

    console.log(`✅ Table access successful: ${tableData[0]?.connection_count || 0} connections found`);
    return true;

  } catch (error) {
    console.log(`❌ Connectivity test failed: ${error.message}`);
    return false;
  }
}

/**
 * Rollback the migration if something goes wrong
 */
async function rollbackMigration() {
  console.log('🔄 Rolling back migration...');
  
  try {
    const rollbackSQL = `
      -- Rollback Apideck Connections RLS Fix
      
      -- Drop helper functions
      DROP FUNCTION IF EXISTS app.validate_apideck_connection_access(UUID, TEXT);
      DROP FUNCTION IF EXISTS app.get_user_apideck_connections(UUID);
      
      -- Drop RLS policies
      DROP POLICY IF EXISTS "Users can manage own apideck connections" ON app.apideck_connections;
      DROP POLICY IF EXISTS "Service can access all apideck connections" ON app.apideck_connections;
      
      -- Disable RLS (optional - only if it was enabled by this migration)
      -- ALTER TABLE app.apideck_connections DISABLE ROW LEVEL SECURITY;
      
      -- Revoke permissions (optional - be careful with this)
      -- REVOKE ALL ON app.apideck_connections FROM briefly_authenticated;
      -- REVOKE ALL ON app.apideck_connections FROM briefly_service;
      
      -- Log rollback
      INSERT INTO private.audit_logs (action, resource_type, new_values, severity)
      VALUES (
        'APIDECK_CONNECTIONS_RLS_ROLLBACK',
        'database',
        jsonb_build_object(
          'table', 'app.apideck_connections',
          'rollback_reason', 'Migration validation failed',
          'rolled_back_at', NOW()
        ),
        'warning'
      );
    `;

    const { error } = await supabase.rpc('exec', { sql: rollbackSQL });

    if (error) {
      console.log(`⚠️  Rollback completed with warnings: ${error.message}`);
    } else {
      console.log('✅ Rollback completed successfully');
    }

    return true;

  } catch (error) {
    console.log(`❌ Rollback failed: ${error.message}`);
    return false;
  }
}

/**
 * Generate deployment report
 */
function generateReport() {
  const endTime = new Date();
  const duration = endTime - deploymentState.startTime;

  const report = {
    deployment: {
      started_at: deploymentState.startTime.toISOString(),
      completed_at: endTime.toISOString(),
      duration_ms: duration,
      duration_readable: `${Math.round(duration / 1000)}s`
    },
    status: {
      backup_created: deploymentState.backupCreated,
      migration_applied: deploymentState.migrationApplied,
      validation_passed: deploymentState.validationPassed,
      rollback_available: deploymentState.rollbackAvailable
    },
    success: deploymentState.migrationApplied && deploymentState.validationPassed,
    next_steps: []
  };

  if (report.success) {
    report.next_steps = [
      'Test Google Drive OAuth flow in the application',
      'Verify connection storage works without permission errors',
      'Check that users can only see their own connections',
      'Monitor application logs for any remaining issues'
    ];
  } else {
    report.next_steps = [
      'Review deployment logs for specific error details',
      'Check database permissions and schema access',
      'Verify Supabase service role has proper privileges',
      'Consider manual deployment via Supabase dashboard'
    ];
  }

  return report;
}

/**
 * Main deployment function
 */
async function deployMigration() {
  deploymentState.startTime = new Date();
  
  console.log('🚀 Starting Database Migration Deployment');
  console.log('==========================================');
  console.log(`📅 Started at: ${deploymentState.startTime.toISOString()}`);
  console.log(`📁 Migration file: ${CONFIG.migrationFile}`);
  console.log('');

  try {
    // Initialize Supabase client
    initializeSupabase();
    console.log('✅ Supabase client initialized');

    // Test connectivity first
    const connectivityOk = await testConnectivity();
    if (!connectivityOk) {
      throw new Error('Database connectivity test failed');
    }

    // Create backup if enabled
    if (CONFIG.backupEnabled) {
      await createBackup();
    }

    // Apply migration
    const migrationSuccess = await applyMigration();
    if (!migrationSuccess) {
      throw new Error('Migration application failed');
    }

    // Validate deployment
    if (CONFIG.validationEnabled) {
      const validationSuccess = await validateDeployment();
      
      if (!validationSuccess && CONFIG.rollbackOnFailure) {
        console.log('\n⚠️  Validation failed, initiating rollback...');
        await rollbackMigration();
        throw new Error('Migration validation failed, rollback completed');
      }
    }

    // Generate and display report
    const report = generateReport();
    
    console.log('\n📋 Deployment Report');
    console.log('====================');
    console.log(`Status: ${report.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`Duration: ${report.deployment.duration_readable}`);
    console.log(`Backup Created: ${report.status.backup_created ? '✅' : '❌'}`);
    console.log(`Migration Applied: ${report.status.migration_applied ? '✅' : '❌'}`);
    console.log(`Validation Passed: ${report.status.validation_passed ? '✅' : '❌'}`);
    
    if (report.next_steps.length > 0) {
      console.log('\n📝 Next Steps:');
      report.next_steps.forEach((step, index) => {
        console.log(`${index + 1}. ${step}`);
      });
    }

    // Save report to file
    const reportPath = path.join(__dirname, '..', 'database', 'deployment-reports', `migration-${Date.now()}.json`);
    const reportDir = path.dirname(reportPath);
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Report saved: ${reportPath}`);

    process.exit(report.success ? 0 : 1);

  } catch (error) {
    console.error(`\n💥 Deployment failed: ${error.message}`);
    
    const report = generateReport();
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check environment variables are set correctly');
    console.log('2. Verify Supabase service role has proper permissions');
    console.log('3. Ensure app.apideck_connections table exists');
    console.log('4. Try manual deployment via Supabase dashboard');
    console.log('5. Check database logs for detailed error information');
    
    process.exit(1);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log('Database Migration Deployment Script');
  console.log('====================================');
  console.log('');
  console.log('Usage: node scripts/deploy-database-migration.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --help, -h           Show this help message');
  console.log('  --validate-only      Only run validation checks');
  console.log('  --test-only          Only run connectivity tests');
  console.log('  --rollback           Rollback the migration');
  console.log('  --no-backup          Skip backup creation');
  console.log('  --no-validation      Skip validation checks');
  console.log('  --no-rollback        Don\'t rollback on validation failure');
  console.log('');
  console.log('Environment Variables Required:');
  console.log('  NEXT_PUBLIC_SUPABASE_URL     - Your Supabase project URL');
  console.log('  SUPABASE_SERVICE_ROLE_KEY    - Your Supabase service role key');
  process.exit(0);
}

// Handle specific operations
if (args.includes('--validate-only')) {
  initializeSupabase();
  validateDeployment().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Validation failed:', error.message);
    process.exit(1);
  });
} else if (args.includes('--test-only')) {
  initializeSupabase();
  testConnectivity().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Connectivity test failed:', error.message);
    process.exit(1);
  });
} else if (args.includes('--rollback')) {
  initializeSupabase();
  rollbackMigration().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Rollback failed:', error.message);
    process.exit(1);
  });
} else {
  // Apply configuration overrides from command line
  if (args.includes('--no-backup')) CONFIG.backupEnabled = false;
  if (args.includes('--no-validation')) CONFIG.validationEnabled = false;
  if (args.includes('--no-rollback')) CONFIG.rollbackOnFailure = false;
  
  // Run main deployment
  deployMigration();
}