#!/usr/bin/env node

/**
 * Production Deployment Verification Script
 * Verifies RPC functions are properly deployed and working in production
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Use production environment variables
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

async function verifyProductionDeployment() {
  console.log('🔍 Verifying RPC Functions in Production Environment');
  console.log('===================================================');
  console.log(`🔗 Database URL: ${supabaseUrl}`);
  console.log(`🔑 Using Service Key: ${supabaseServiceKey.substring(0, 20)}...`);

  let checksTotal = 0;
  let checksPassed = 0;
  const issues = [];

  // Helper function to run a verification check
  async function runCheck(checkName, checkFn, critical = true) {
    checksTotal++;
    try {
      console.log(`\n🔍 Check ${checksTotal}: ${checkName}`);
      const result = await checkFn();
      
      if (result === true || result === undefined) {
        console.log(`✅ PASSED: ${checkName}`);
        checksPassed++;
      } else {
        console.log(`⚠️  WARNING: ${checkName} - ${result}`);
        if (critical) {
          issues.push({ type: 'error', check: checkName, message: result });
        } else {
          issues.push({ type: 'warning', check: checkName, message: result });
          checksPassed++; // Count warnings as passed for non-critical checks
        }
      }
    } catch (error) {
      console.log(`❌ FAILED: ${checkName}`);
      console.log(`   Error: ${error.message}`);
      issues.push({ type: 'error', check: checkName, message: error.message });
    }
  }

  // Check 1: Database Connectivity
  await runCheck('Database connectivity', async () => {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .limit(1);

    if (error && !error.message.includes('relation "users" does not exist')) {
      throw error;
    }
  });

  // Check 2: Schema Structure
  await runCheck('Multi-tenant schema structure', async () => {
    const { data, error } = await supabase
      .from('information_schema.schemata')
      .select('schema_name')
      .in('schema_name', ['app', 'private', 'public']);

    if (error) throw error;
    
    const schemas = data.map(s => s.schema_name).sort();
    const expectedSchemas = ['app', 'private', 'public'];
    
    if (!expectedSchemas.every(schema => schemas.includes(schema))) {
      return `Missing schemas. Found: ${schemas.join(', ')}, Expected: ${expectedSchemas.join(', ')}`;
    }
  });

  // Check 3: OAuth RPC Functions
  await runCheck('OAuth RPC functions deployment', async () => {
    const expectedFunctions = [
      'save_oauth_token',
      'get_oauth_token',
      'delete_oauth_token',
      'oauth_token_exists',
      'get_oauth_token_status',
      'update_connection_status'
    ];

    const { data, error } = await supabase
      .from('information_schema.routines')
      .select('routine_name, security_type')
      .eq('routine_schema', 'public')
      .in('routine_name', expectedFunctions);

    if (error) throw error;

    const foundFunctions = data.map(f => f.routine_name);
    const missingFunctions = expectedFunctions.filter(f => !foundFunctions.includes(f));
    
    if (missingFunctions.length > 0) {
      return `Missing functions: ${missingFunctions.join(', ')}`;
    }

    // Check all functions use SECURITY DEFINER
    const nonDefinerFunctions = data.filter(f => f.security_type !== 'DEFINER');
    if (nonDefinerFunctions.length > 0) {
      return `Functions not using SECURITY DEFINER: ${nonDefinerFunctions.map(f => f.routine_name).join(', ')}`;
    }
  });

  // Check 4: Vector Similarity RPC Function
  await runCheck('Vector similarity RPC function deployment', async () => {
    const { data, error } = await supabase
      .from('information_schema.routines')
      .select('routine_name, security_type')
      .eq('routine_schema', 'public')
      .eq('routine_name', 'search_document_chunks_by_similarity')
      .single();

    if (error && error.message.includes('No rows')) {
      return 'Vector similarity function not found';
    }
    if (error) throw error;

    if (data.security_type !== 'DEFINER') {
      return 'Vector similarity function not using SECURITY DEFINER';
    }
  });

  // Check 5: Function Permissions
  await runCheck('Function permissions', async () => {
    const { data, error } = await supabase
      .from('information_schema.routine_privileges')
      .select('routine_name, grantee, privilege_type')
      .eq('routine_schema', 'public')
      .eq('privilege_type', 'EXECUTE')
      .in('routine_name', ['save_oauth_token', 'get_oauth_token']);

    if (error) throw error;

    const requiredRoles = ['authenticated', 'service_role'];
    const grantees = [...new Set(data.map(p => p.grantee))];
    
    const missingRoles = requiredRoles.filter(role => !grantees.includes(role));
    if (missingRoles.length > 0) {
      return `Missing permissions for roles: ${missingRoles.join(', ')}`;
    }
  });

  // Check 6: Required Tables Exist
  await runCheck('Required tables exist', async () => {
    const requiredTables = [
      { schema: 'app', table: 'users' },
      { schema: 'app', table: 'files' },
      { schema: 'app', table: 'document_chunks' },
      { schema: 'app', table: 'connection_status' },
      { schema: 'private', table: 'oauth_tokens' },
      { schema: 'private', table: 'audit_logs' }
    ];

    for (const { schema, table } of requiredTables) {
      const { data, error } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', schema)
        .eq('table_name', table)
        .single();

      if (error && error.message.includes('No rows')) {
        return `Missing table: ${schema}.${table}`;
      }
      if (error) throw error;
    }
  });

  // Check 7: RLS Policies
  await runCheck('Row Level Security policies', async () => {
    const { data, error } = await supabase
      .from('pg_policies')
      .select('schemaname, tablename, policyname')
      .in('schemaname', ['app', 'private']);

    if (error) throw error;

    if (data.length === 0) {
      return 'No RLS policies found - this may be expected depending on your setup';
    }

    console.log(`   Found ${data.length} RLS policies`);
  }, false); // Non-critical check

  // Check 8: Vector Extension (if needed)
  await runCheck('Vector extension availability', async () => {
    const { data, error } = await supabase
      .from('pg_extension')
      .select('extname')
      .eq('extname', 'vector')
      .single();

    if (error && error.message.includes('No rows')) {
      return 'Vector extension not installed - vector similarity search will not work';
    }
    if (error) throw error;
  }, false); // Non-critical check

  // Check 9: Audit Logging
  await runCheck('Audit logging functionality', async () => {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('id')
      .limit(1);

    if (error && error.message.includes('relation "audit_logs" does not exist')) {
      // Try private schema
      const { data: privateData, error: privateError } = await supabase
        .from('private.audit_logs')
        .select('id')
        .limit(1);

      if (privateError && privateError.message.includes('relation')) {
        return 'Audit logs table not accessible';
      }
    } else if (error) {
      throw error;
    }
  }, false); // Non-critical check

  // Check 10: Health Check Endpoint
  await runCheck('Health check endpoint', async () => {
    try {
      const response = await fetch(`${supabaseUrl.replace('/rest/v1', '')}/rest/v1/health`);
      if (!response.ok) {
        return `Health check endpoint returned ${response.status}`;
      }
    } catch (error) {
      return `Health check endpoint not accessible: ${error.message}`;
    }
  }, false); // Non-critical check

  // Summary
  console.log('\n📊 Production Verification Summary');
  console.log('==================================');
  console.log(`Checks Passed: ${checksPassed}/${checksTotal}`);
  
  if (issues.length > 0) {
    console.log('\n⚠️  Issues Found:');
    issues.forEach((issue, index) => {
      const icon = issue.type === 'error' ? '❌' : '⚠️';
      console.log(`${icon} ${index + 1}. ${issue.check}: ${issue.message}`);
    });
  }

  const criticalIssues = issues.filter(i => i.type === 'error');
  const warnings = issues.filter(i => i.type === 'warning');

  if (criticalIssues.length === 0) {
    console.log('\n🎉 Production verification completed successfully!');
    
    if (warnings.length > 0) {
      console.log(`⚠️  Note: ${warnings.length} non-critical warnings found.`);
    }
    
    console.log('\n✅ RPC functions are properly deployed and ready for use.');
    console.log('\n📝 Deployment Status:');
    console.log('- OAuth RPC functions: ✅ Deployed');
    console.log('- Vector similarity RPC: ✅ Deployed');
    console.log('- Security settings: ✅ Configured');
    console.log('- Permissions: ✅ Set correctly');
    
    console.log('\n🚀 Next steps:');
    console.log('1. Update application code to use RPC functions');
    console.log('2. Monitor function performance and error rates');
    console.log('3. Set up alerts for function failures');
    console.log('4. Review audit logs regularly');
    
    return true;
  } else {
    console.log('\n❌ Production verification failed.');
    console.log(`Found ${criticalIssues.length} critical issues that must be resolved.`);
    console.log('\n🔧 Recommended actions:');
    console.log('1. Fix the critical issues listed above');
    console.log('2. Re-run this verification script');
    console.log('3. Consider rolling back if issues cannot be resolved quickly');
    
    return false;
  }
}

// Handle script arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Production Deployment Verification Script');
  console.log('========================================');
  console.log('');
  console.log('Usage: node scripts/verify-production-deployment.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --help, -h     Show this help message');
  console.log('  --quiet        Reduce output verbosity');
  console.log('');
  console.log('Environment Variables Required:');
  console.log('  NEXT_PUBLIC_SUPABASE_URL     - Your Supabase project URL');
  console.log('  SUPABASE_SERVICE_ROLE_KEY    - Your Supabase service role key');
  console.log('');
  console.log('This script verifies that RPC functions are properly deployed');
  console.log('and configured in your production environment.');
  process.exit(0);
}

// Run the verification
verifyProductionDeployment()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('💥 Production verification failed:', error.message);
    process.exit(1);
  });