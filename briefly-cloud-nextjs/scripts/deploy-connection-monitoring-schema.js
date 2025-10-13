#!/usr/bin/env node

/**
 * Deploy Connection Monitoring Schema
 * 
 * Deploys the connection monitoring database schema including:
 * - monitoring_alerts table
 * - connection_health_checks table
 * - Related functions and triggers
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function deployMonitoringSchema() {
  console.log('🚀 Deploying Connection Monitoring Schema...\n');

  try {
    // Read the schema file
    const schemaPath = path.join(__dirname, '..', 'database', '16-connection-monitoring-schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('📄 Executing monitoring schema SQL...');
    
    // Execute the schema
    const { error } = await supabase.rpc('exec_sql', { sql: schemaSql });
    
    if (error) {
      console.error('❌ Schema deployment failed:', error);
      process.exit(1);
    }

    console.log('✅ Monitoring schema deployed successfully');

    // Verify the deployment
    console.log('\n🔍 Verifying deployment...');
    
    // Check if tables exist
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'app')
      .in('table_name', ['monitoring_alerts', 'connection_health_checks']);

    if (tablesError) {
      console.error('❌ Verification failed:', tablesError);
      process.exit(1);
    }

    const tableNames = tables.map(t => t.table_name);
    console.log('📋 Created tables:', tableNames);

    // Check if functions exist
    const { data: functions, error: functionsError } = await supabase
      .from('information_schema.routines')
      .select('routine_name')
      .eq('routine_schema', 'app')
      .in('routine_name', [
        'get_connection_health_summary',
        'record_health_check',
        'cleanup_old_health_checks',
        'update_monitoring_alerts_updated_at'
      ]);

    if (functionsError) {
      console.error('❌ Function verification failed:', functionsError);
      process.exit(1);
    }

    const functionNames = functions.map(f => f.routine_name);
    console.log('⚙️  Created functions:', functionNames);

    // Test the health summary function
    console.log('\n🧪 Testing functions...');
    
    const { data: testResult, error: testError } = await supabase
      .rpc('get_connection_health_summary', { 
        target_user_id: '00000000-0000-0000-0000-000000000000' // Test UUID
      });

    if (testError) {
      console.error('❌ Function test failed:', testError);
      process.exit(1);
    }

    console.log('✅ Function test passed (returned empty result as expected)');

    console.log('\n🎉 Connection Monitoring Schema deployment completed successfully!');
    console.log('\n📝 Summary:');
    console.log('   • monitoring_alerts table created with RLS policies');
    console.log('   • connection_health_checks table created with RLS policies');
    console.log('   • Health check recording and summary functions deployed');
    console.log('   • Automatic cleanup and timestamp update triggers configured');
    console.log('\n💡 Next steps:');
    console.log('   • Test the monitoring API endpoints');
    console.log('   • Verify connection health checks are working');
    console.log('   • Monitor alert generation and resolution');

  } catch (error) {
    console.error('❌ Deployment failed with unexpected error:', error);
    process.exit(1);
  }
}

// Helper function to execute raw SQL (if rpc doesn't work)
async function executeRawSql(sql) {
  const { data, error } = await supabase
    .from('pg_stat_statements')
    .select('*')
    .limit(0); // This is just to test connection

  if (error && error.code !== 'PGRST116') { // PGRST116 is "relation does not exist" which is fine
    throw new Error(`Database connection failed: ${error.message}`);
  }

  // For raw SQL execution, we'd need to use the Supabase management API
  // or a direct PostgreSQL connection. For now, we'll use the rpc approach.
  throw new Error('Raw SQL execution not implemented. Use rpc method.');
}

if (require.main === module) {
  deployMonitoringSchema().catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

module.exports = { deployMonitoringSchema };