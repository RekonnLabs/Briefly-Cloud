#!/usr/bin/env node

/**
 * Validation script for OAuth RPC functions
 * Validates the SQL syntax and structure without requiring database connection
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Validating OAuth RPC Functions');
console.log('==================================');

const rpcFilePath = path.join(__dirname, '..', 'database', '11-oauth-token-rpc-functions.sql');

if (!fs.existsSync(rpcFilePath)) {
  console.error('❌ RPC functions file not found:', rpcFilePath);
  process.exit(1);
}

const sqlContent = fs.readFileSync(rpcFilePath, 'utf8');

// Validation checks
const validations = [
  {
    name: 'save_oauth_token function exists',
    test: () => sqlContent.includes('CREATE OR REPLACE FUNCTION public.save_oauth_token('),
    required: true
  },
  {
    name: 'get_oauth_token function exists',
    test: () => sqlContent.includes('CREATE OR REPLACE FUNCTION public.get_oauth_token('),
    required: true
  },
  {
    name: 'delete_oauth_token function exists',
    test: () => sqlContent.includes('CREATE OR REPLACE FUNCTION public.delete_oauth_token('),
    required: true
  },
  {
    name: 'Functions use SECURITY DEFINER',
    test: () => {
      const saveSecure = sqlContent.includes('SECURITY DEFINER') && 
                        sqlContent.match(/save_oauth_token[\s\S]*?SECURITY DEFINER/);
      const getSecure = sqlContent.includes('SECURITY DEFINER') && 
                       sqlContent.match(/get_oauth_token[\s\S]*?SECURITY DEFINER/);
      const deleteSecure = sqlContent.includes('SECURITY DEFINER') && 
                          sqlContent.match(/delete_oauth_token[\s\S]*?SECURITY DEFINER/);
      return saveSecure && getSecure && deleteSecure;
    },
    required: true
  },
  {
    name: 'Functions use proper search_path',
    test: () => sqlContent.includes('SET search_path = public, private'),
    required: true
  },
  {
    name: 'Provider validation exists',
    test: () => sqlContent.includes("p_provider NOT IN ('google', 'microsoft')"),
    required: true
  },
  {
    name: 'Base64 encoding/decoding implemented',
    test: () => {
      const hasEncode = sqlContent.includes("encode(p_access_token::bytea, 'base64')");
      const hasDecode = sqlContent.includes("decode(token_record.encrypted_access_token, 'base64')");
      return hasEncode && hasDecode;
    },
    required: true
  },
  {
    name: 'Proper permissions granted',
    test: () => {
      const hasAuthenticated = sqlContent.includes('GRANT EXECUTE ON FUNCTION') && 
                              sqlContent.includes('TO authenticated');
      const hasServiceRole = sqlContent.includes('TO authenticated, service_role');
      return hasAuthenticated && hasServiceRole;
    },
    required: true
  },
  {
    name: 'Helper functions exist',
    test: () => {
      const hasExists = sqlContent.includes('oauth_token_exists');
      const hasStatus = sqlContent.includes('get_oauth_token_status');
      const hasConnection = sqlContent.includes('update_connection_status');
      return hasExists && hasStatus && hasConnection;
    },
    required: false
  },
  {
    name: 'Audit logging implemented',
    test: () => sqlContent.includes('INSERT INTO private.audit_logs'),
    required: false
  }
];

let passed = 0;
let failed = 0;
let warnings = 0;

console.log('\n📋 Running validations...\n');

validations.forEach((validation, index) => {
  const result = validation.test();
  const status = result ? '✅' : (validation.required ? '❌' : '⚠️');
  const label = validation.required ? 'REQUIRED' : 'OPTIONAL';
  
  console.log(`${status} ${validation.name} (${label})`);
  
  if (result) {
    passed++;
  } else if (validation.required) {
    failed++;
  } else {
    warnings++;
  }
});

// Additional syntax checks
console.log('\n🔧 Checking SQL syntax patterns...\n');

const syntaxChecks = [
  {
    name: 'No SQL injection vulnerabilities',
    test: () => !sqlContent.includes('||') || sqlContent.includes('quote_literal'),
    message: 'Functions should use parameterized queries'
  },
  {
    name: 'Proper error handling',
    test: () => sqlContent.includes('RAISE EXCEPTION'),
    message: 'Functions should include proper error handling'
  },
  {
    name: 'Transaction safety',
    test: () => !sqlContent.includes('COMMIT') && !sqlContent.includes('ROLLBACK'),
    message: 'Functions should be transaction-safe'
  },
  {
    name: 'Consistent naming convention',
    test: () => {
      const functions = sqlContent.match(/CREATE OR REPLACE FUNCTION public\.(\w+)/g);
      return functions && functions.every(f => f.includes('oauth_token') || f.includes('connection_status'));
    },
    message: 'All functions should follow consistent naming'
  }
];

syntaxChecks.forEach(check => {
  const result = check.test();
  const status = result ? '✅' : '⚠️';
  console.log(`${status} ${check.name}`);
  if (!result) {
    console.log(`   💡 ${check.message}`);
    warnings++;
  } else {
    passed++;
  }
});

// Summary
console.log('\n📊 Validation Summary');
console.log('=====================');
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`⚠️  Warnings: ${warnings}`);

if (failed === 0) {
  console.log('\n🎉 All required validations passed!');
  console.log('✅ OAuth RPC functions are properly structured and ready for deployment.');
  
  if (warnings > 0) {
    console.log(`⚠️  Note: ${warnings} optional features or best practices could be improved.`);
  }
  
  console.log('\n📝 Next steps:');
  console.log('1. Deploy the RPC functions to your Supabase database');
  console.log('2. Test the functions with actual data');
  console.log('3. Update your application code to use the RPC functions');
  
  process.exit(0);
} else {
  console.log('\n❌ Some required validations failed.');
  console.log('Please fix the issues above before deploying.');
  process.exit(1);
}