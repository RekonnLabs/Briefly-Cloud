#!/usr/bin/env node

/**
 * Database State Validation Script
 * Validates the current state of the Google Drive Vault integration database setup
 * 
 * Requirements addressed: 1.1, 1.2, 1.3, 1.4 (validation queries)
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Configuration
const CONFIG = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  verbose: false,
  exportResults: false
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
 * Comprehensive validation checks
 */
const VALIDATION_CHECKS = [
  {
    category: 'Database Connectivity',
    checks: [
      {
        name: 'Basic Connection',
        query: 'SELECT NOW() as current_time, version() as pg_version;',
        validator: (result) => result && result[0] && result[0].current_time,
        critical: true,
        description: 'Tests basic database connectivity'
      },
      {
        name: 'Schema Access',
        query: 'SELECT schema_name FROM information_schema.schemata WHERE schema_name = \'app\';',
        validator: (result) => result && result.length > 0,
        critical: true,
        description: 'Verifies access to the app schema'
      }
    ]
  },
  {
    category: 'Table Structure',
    checks: [
      {
        name: 'Table Exists',
        query: `
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'app' AND table_name = 'apideck_connections';
        `,
        validator: (result) => result && result.length > 0,
        critical: true,
        description: 'Verifies the apideck_connections table exists'
      },
      {
        name: 'Table Structure',
        query: `
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns 
          WHERE table_schema = 'app' AND table_name = 'apideck_connections'
          ORDER BY ordinal_position;
        `,
        validator: (result) => result && result.length >= 6,
        critical: true,
        description: 'Validates table has expected columns'
      },
      {
        name: 'Primary Key',
        query: `
          SELECT constraint_name, column_name
          FROM information_schema.key_column_usage 
          WHERE table_schema = 'app' 
          AND table_name = 'apideck_connections'
          AND constraint_name LIKE '%pkey%';
        `,
        validator: (result) => result && result.length > 0,
        critical: false,
        description: 'Checks for primary key constraints'
      }
    ]
  },
  {
    category: 'Row Level Security',
    checks: [
      {
        name: 'RLS Enabled',
        query: `
          SELECT relrowsecurity 
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'app' AND c.relname = 'apideck_connections';
        `,
        validator: (result) => result && result[0] && result[0].relrowsecurity === true,
        critical: true,
        description: 'Verifies Row Level Security is enabled'
      },
      {
        name: 'User Access Policy',
        query: `
          SELECT policyname, roles, cmd, qual, with_check
          FROM pg_policies 
          WHERE schemaname = 'app' 
          AND tablename = 'apideck_connections'
          AND policyname = 'Users can manage own apideck connections';
        `,
        validator: (result) => result && result.length > 0,
        critical: true,
        description: 'Checks user access RLS policy exists'
      },
      {
        name: 'Service Access Policy',
        query: `
          SELECT policyname, roles, cmd, qual, with_check
          FROM pg_policies 
          WHERE schemaname = 'app' 
          AND tablename = 'apideck_connections'
          AND policyname = 'Service can access all apideck connections';
        `,
        validator: (result) => result && result.length > 0,
        critical: true,
        description: 'Checks service access RLS policy exists'
      },
      {
        name: 'All RLS Policies',
        query: `
          SELECT policyname, roles, cmd
          FROM pg_policies 
          WHERE schemaname = 'app' AND tablename = 'apideck_connections';
        `,
        validator: (result) => result && result.length >= 2,
        critical: false,
        description: 'Lists all RLS policies for the table'
      }
    ]
  },
  {
    category: 'Permissions',
    checks: [
      {
        name: 'Authenticated Role Permissions',
        query: `
          SELECT grantee, privilege_type
          FROM information_schema.table_privileges 
          WHERE table_schema = 'app' 
          AND table_name = 'apideck_connections'
          AND grantee = 'briefly_authenticated';
        `,
        validator: (result) => result && result.length > 0,
        critical: true,
        description: 'Verifies briefly_authenticated role has table permissions'
      },
      {
        name: 'Service Role Permissions',
        query: `
          SELECT grantee, privilege_type
          FROM information_schema.table_privileges 
          WHERE table_schema = 'app' 
          AND table_name = 'apideck_connections'
          AND grantee = 'briefly_service';
        `,
        validator: (result) => result && result.length > 0,
        critical: false,
        description: 'Verifies briefly_service role has table permissions'
      },
      {
        name: 'Schema Permissions',
        query: `
          SELECT grantee, privilege_type
          FROM information_schema.usage_privileges 
          WHERE object_schema = 'app'
          AND grantee IN ('briefly_authenticated', 'briefly_service', 'authenticated');
        `,
        validator: (result) => result && result.length > 0,
        critical: true,
        description: 'Checks schema usage permissions'
      }
    ]
  },
  {
    category: 'Helper Functions',
    checks: [
      {
        name: 'Connection Validation Function',
        query: `
          SELECT routine_name, routine_type, security_type
          FROM information_schema.routines 
          WHERE routine_schema = 'app' 
          AND routine_name = 'validate_apideck_connection_access';
        `,
        validator: (result) => result && result.length > 0,
        critical: false,
        description: 'Checks if connection validation function exists'
      },
      {
        name: 'User Connections Function',
        query: `
          SELECT routine_name, routine_type, security_type
          FROM information_schema.routines 
          WHERE routine_schema = 'app' 
          AND routine_name = 'get_user_apideck_connections';
        `,
        validator: (result) => result && result.length > 0,
        critical: false,
        description: 'Checks if user connections function exists'
      },
      {
        name: 'Function Permissions',
        query: `
          SELECT routine_name, grantee, privilege_type
          FROM information_schema.routine_privileges 
          WHERE routine_schema = 'app'
          AND routine_name IN ('validate_apideck_connection_access', 'get_user_apideck_connections')
          AND grantee IN ('briefly_authenticated', 'briefly_service');
        `,
        validator: (result) => result && result.length > 0,
        critical: false,
        description: 'Verifies function execution permissions'
      }
    ]
  },
  {
    category: 'Data Access',
    checks: [
      {
        name: 'Table Query Access',
        query: 'SELECT COUNT(*) as connection_count FROM app.apideck_connections;',
        validator: (result) => result && result[0] && typeof result[0].connection_count === 'number',
        critical: true,
        description: 'Tests basic table query access'
      },
      {
        name: 'Insert Test (Dry Run)',
        query: `
          EXPLAIN (FORMAT JSON) 
          INSERT INTO app.apideck_connections (user_id, provider, consumer_id, connection_id, status) 
          VALUES ('00000000-0000-0000-0000-000000000000', 'google', 'test', 'test', 'connected');
        `,
        validator: (result) => result && result.length > 0,
        critical: false,
        description: 'Tests insert query planning (does not execute)'
      }
    ]
  },
  {
    category: 'Audit and Monitoring',
    checks: [
      {
        name: 'Audit Log Table Access',
        query: `
          SELECT COUNT(*) as log_count 
          FROM private.audit_logs 
          WHERE action LIKE '%APIDECK%' 
          ORDER BY created_at DESC 
          LIMIT 5;
        `,
        validator: (result) => result && result[0] && typeof result[0].log_count === 'number',
        critical: false,
        description: 'Checks audit logging functionality'
      },
      {
        name: 'Recent Migration Logs',
        query: `
          SELECT action, resource_type, created_at
          FROM private.audit_logs 
          WHERE action IN ('APIDECK_CONNECTIONS_RLS_FIX', 'APIDECK_CONNECTIONS_RLS_ROLLBACK')
          ORDER BY created_at DESC 
          LIMIT 3;
        `,
        validator: (result) => true, // Any result is fine
        critical: false,
        description: 'Shows recent migration-related audit logs'
      }
    ]
  }
];

/**
 * Run a single validation check
 */
async function runValidationCheck(check) {
  const result = {
    name: check.name,
    description: check.description,
    critical: check.critical,
    status: 'unknown',
    error: null,
    data: null,
    details: null
  };

  try {
    if (CONFIG.verbose) {
      console.log(`  🔍 Running: ${check.name}`);
    }

    const { data, error } = await supabase.rpc('exec', {
      sql: check.query
    });

    if (error) {
      result.status = 'error';
      result.error = error.message;
    } else if (check.validator(data)) {
      result.status = 'passed';
      result.data = data;
    } else {
      result.status = 'failed';
      result.data = data;
      result.details = 'Validation condition not met';
    }

  } catch (error) {
    result.status = 'error';
    result.error = error.message;
  }

  return result;
}

/**
 * Run all validation checks
 */
async function runAllValidations() {
  console.log('🔍 Running Database State Validation');
  console.log('====================================');
  console.log(`📅 Started at: ${new Date().toISOString()}`);
  console.log('');

  const results = {
    timestamp: new Date().toISOString(),
    categories: {},
    summary: {
      total_checks: 0,
      passed: 0,
      failed: 0,
      errors: 0,
      critical_failures: 0
    }
  };

  for (const category of VALIDATION_CHECKS) {
    console.log(`📋 ${category.category}`);
    console.log('─'.repeat(category.category.length + 2));

    const categoryResults = {
      checks: [],
      summary: { total: 0, passed: 0, failed: 0, errors: 0, critical_failures: 0 }
    };

    for (const check of category.checks) {
      const checkResult = await runValidationCheck(check);
      categoryResults.checks.push(checkResult);
      categoryResults.summary.total++;
      results.summary.total_checks++;

      // Update counters
      switch (checkResult.status) {
        case 'passed':
          categoryResults.summary.passed++;
          results.summary.passed++;
          console.log(`✅ ${checkResult.name}`);
          break;
        case 'failed':
          categoryResults.summary.failed++;
          results.summary.failed++;
          if (checkResult.critical) {
            categoryResults.summary.critical_failures++;
            results.summary.critical_failures++;
            console.log(`❌ ${checkResult.name} (CRITICAL)`);
          } else {
            console.log(`⚠️  ${checkResult.name}`);
          }
          if (CONFIG.verbose && checkResult.details) {
            console.log(`   Details: ${checkResult.details}`);
          }
          break;
        case 'error':
          categoryResults.summary.errors++;
          results.summary.errors++;
          if (checkResult.critical) {
            categoryResults.summary.critical_failures++;
            results.summary.critical_failures++;
            console.log(`💥 ${checkResult.name} (CRITICAL ERROR)`);
          } else {
            console.log(`⚠️  ${checkResult.name} (ERROR)`);
          }
          if (CONFIG.verbose && checkResult.error) {
            console.log(`   Error: ${checkResult.error}`);
          }
          break;
      }

      // Show data in verbose mode
      if (CONFIG.verbose && checkResult.data && checkResult.status === 'passed') {
        console.log(`   Data: ${JSON.stringify(checkResult.data, null, 2)}`);
      }
    }

    results.categories[category.category] = categoryResults;
    
    // Category summary
    const catSummary = categoryResults.summary;
    const catSuccessRate = catSummary.total > 0 ? (catSummary.passed / catSummary.total * 100).toFixed(1) : 0;
    console.log(`📊 Category: ${catSummary.passed}/${catSummary.total} passed (${catSuccessRate}%)`);
    
    if (catSummary.critical_failures > 0) {
      console.log(`🚨 Critical failures: ${catSummary.critical_failures}`);
    }
    
    console.log('');
  }

  return results;
}

/**
 * Generate validation report
 */
function generateReport(results) {
  const summary = results.summary;
  const successRate = summary.total_checks > 0 ? (summary.passed / summary.total_checks * 100).toFixed(1) : 0;
  const isHealthy = summary.critical_failures === 0 && summary.passed >= (summary.total_checks * 0.8);

  console.log('📋 Validation Summary');
  console.log('====================');
  console.log(`Overall Health: ${isHealthy ? '✅ HEALTHY' : '⚠️  ISSUES DETECTED'}`);
  console.log(`Success Rate: ${successRate}% (${summary.passed}/${summary.total_checks})`);
  console.log(`Critical Failures: ${summary.critical_failures}`);
  console.log(`Non-Critical Issues: ${summary.failed + summary.errors - summary.critical_failures}`);

  if (summary.critical_failures > 0) {
    console.log('\n🚨 Critical Issues Found:');
    
    for (const [categoryName, category] of Object.entries(results.categories)) {
      const criticalChecks = category.checks.filter(check => 
        check.critical && (check.status === 'failed' || check.status === 'error')
      );
      
      if (criticalChecks.length > 0) {
        console.log(`\n📋 ${categoryName}:`);
        criticalChecks.forEach(check => {
          console.log(`   ❌ ${check.name}: ${check.error || check.details || 'Failed validation'}`);
        });
      }
    }
  }

  console.log('\n📝 Recommendations:');
  
  if (summary.critical_failures === 0) {
    console.log('✅ Database setup appears to be working correctly');
    console.log('✅ Google Drive OAuth flow should function properly');
    console.log('✅ Connection storage and retrieval should work');
  } else {
    console.log('❌ Critical issues detected - Google Drive integration may not work');
    console.log('🔧 Run the deployment script to fix missing components');
    console.log('🔧 Check Supabase dashboard for manual fixes if needed');
  }

  if (summary.failed > 0 || summary.errors > 0) {
    console.log('⚠️  Some non-critical checks failed - monitor for issues');
  }

  return {
    healthy: isHealthy,
    success_rate: parseFloat(successRate),
    critical_failures: summary.critical_failures,
    recommendations: isHealthy ? ['Database setup is healthy'] : ['Fix critical issues before using integration']
  };
}

/**
 * Export results to file
 */
function exportResults(results, report) {
  const exportData = {
    validation_results: results,
    report: report,
    exported_at: new Date().toISOString()
  };

  const exportPath = path.join(__dirname, '..', 'database', 'validation-reports', `validation-${Date.now()}.json`);
  
  // Ensure export directory exists
  const exportDir = path.dirname(exportPath);
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));
  console.log(`\n📄 Results exported: ${exportPath}`);
  
  return exportPath;
}

/**
 * Main validation function
 */
async function validateDatabaseState() {
  try {
    // Initialize Supabase client
    initializeSupabase();

    // Run all validations
    const results = await runAllValidations();

    // Generate report
    const report = generateReport(results);

    // Export results if requested
    if (CONFIG.exportResults) {
      exportResults(results, report);
    }

    // Exit with appropriate code
    process.exit(report.healthy ? 0 : 1);

  } catch (error) {
    console.error(`💥 Validation failed: ${error.message}`);
    
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check environment variables are set correctly');
    console.log('2. Verify database connection and permissions');
    console.log('3. Ensure Supabase service role has proper access');
    console.log('4. Try running the deployment script first');
    
    process.exit(1);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log('Database State Validation Script');
  console.log('===============================');
  console.log('');
  console.log('Usage: node scripts/validate-database-state.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --help, -h       Show this help message');
  console.log('  --verbose, -v    Show detailed output and data');
  console.log('  --export         Export results to JSON file');
  console.log('');
  console.log('Environment Variables Required:');
  console.log('  NEXT_PUBLIC_SUPABASE_URL     - Your Supabase project URL');
  console.log('  SUPABASE_SERVICE_ROLE_KEY    - Your Supabase service role key');
  console.log('');
  console.log('Exit Codes:');
  console.log('  0 - All critical checks passed (database healthy)');
  console.log('  1 - Critical issues found or validation failed');
  process.exit(0);
}

// Apply configuration from command line
if (args.includes('--verbose') || args.includes('-v')) CONFIG.verbose = true;
if (args.includes('--export')) CONFIG.exportResults = true;

// Run validation
validateDatabaseState();