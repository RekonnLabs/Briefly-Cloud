#!/usr/bin/env node

/**
 * Google Drive Scopes Verification Script
 * Verifies that the OAuth start route returns the correct drive.file scope
 */

import { getOAuthScopes } from '../src/app/lib/oauth/security-config.js'

console.log('🔍 Verifying Google Drive OAuth Scopes...\n')

try {
  // Get the scopes from the security configuration
  const scopes = getOAuthScopes('google')
  console.log('📋 Current Google OAuth Scopes:')
  console.log(`   ${scopes}\n`)
  
  // Check for the expected drive.file scope
  const expectedScope = 'https://www.googleapis.com/auth/drive.file'
  const hasCorrectScope = scopes.includes(expectedScope)
  
  console.log('✅ Scope Verification:')
  console.log(`   Expected: ${expectedScope}`)
  console.log(`   Present: ${hasCorrectScope ? '✅ YES' : '❌ NO'}\n`)
  
  // Check that old readonly scope is not present
  const oldScope = 'https://www.googleapis.com/auth/drive.readonly'
  const hasOldScope = scopes.includes(oldScope)
  
  console.log('🚫 Old Scope Check:')
  console.log(`   Old scope: ${oldScope}`)
  console.log(`   Present: ${hasOldScope ? '❌ YES (should be removed)' : '✅ NO (correct)'}\n`)
  
  // Parse individual scopes
  const scopeList = scopes.split(' ')
  console.log('📝 All Scopes:')
  scopeList.forEach((scope, index) => {
    const isTarget = scope === expectedScope
    const isOld = scope === oldScope
    const status = isTarget ? '🎯' : isOld ? '⚠️' : '✅'
    console.log(`   ${index + 1}. ${status} ${scope}`)
  })
  
  console.log('\n' + '='.repeat(60))
  
  if (hasCorrectScope && !hasOldScope) {
    console.log('🎉 SUCCESS: Google Drive scopes are correctly configured!')
    console.log('   ✅ Uses drive.file scope (file-specific access)')
    console.log('   ✅ Removed drive.readonly scope')
    console.log('   ✅ Follows principle of least privilege')
  } else {
    console.log('❌ ISSUES FOUND:')
    if (!hasCorrectScope) {
      console.log('   ❌ Missing drive.file scope')
    }
    if (hasOldScope) {
      console.log('   ❌ Still has old drive.readonly scope')
    }
    process.exit(1)
  }
  
  console.log('\n📖 Scope Meanings:')
  console.log('   • drive.file: Access only to files opened/created by the app')
  console.log('   • drive.readonly: Read access to ALL Drive files (too broad)')
  console.log('\n🔒 Security Benefits:')
  console.log('   • Users only grant access to specific files they choose')
  console.log('   • Reduces consent screen warnings')
  console.log('   • Follows Google\'s recommended practices')
  console.log('   • Minimizes data access surface area')
  
} catch (error) {
  console.error('❌ Error verifying scopes:', error.message)
  process.exit(1)
}