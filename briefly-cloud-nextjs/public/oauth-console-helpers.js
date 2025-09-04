/**
 * OAuth Browser Console Helpers
 * 
 * Usage in browser console:
 * 1. Load this script: await import('/oauth-console-helpers.js')
 * 2. Run tests: await window.oauthSmokeTests.testAuth()
 * 3. Run all tests: await window.oauthSmokeTests.runAllTests()
 * 
 * Available functions:
 * - testAuth(): Test authentication status
 * - testOAuthStart(): Test OAuth start endpoints
 * - testUnauthenticated(): Test unauthenticated access (run in incognito)
 * - testStorageStatus(): Test storage connection status
 * - runAllTests(): Run all tests sequentially
 */

(function() {
  'use strict';

  /**
   * Test 1: Authentication check
   */
  async function testAuth() {
    console.log('🔍 Testing authentication...');
    
    try {
      const response = await fetch('/api/dev/whoami', { 
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data.userId) {
          console.log('✅ Auth working:', data.data.userId);
          console.log('   Email:', data.data.email || 'N/A');
          console.log('   Environment:', data.data.environment);
          console.log('   Correlation ID:', data.data.correlationId);
          return { success: true, data: data.data };
        } else {
          console.log('❌ Auth failed: Invalid response structure');
          return { success: false, error: 'Invalid response structure' };
        }
      } else {
        console.log('❌ Auth failed:', response.status);
        const errorData = await response.json().catch(() => ({}));
        return { success: false, status: response.status, error: errorData };
      }
    } catch (error) {
      console.log('❌ Auth failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Test 2: OAuth start endpoints
   */
  async function testOAuthStart() {
    console.log('🔍 Testing OAuth start endpoints...');
    
    const providers = ['google', 'microsoft'];
    const results = [];
    
    for (const provider of providers) {
      try {
        console.log(`  Testing ${provider} start endpoint...`);
        
        const response = await fetch(`/api/storage/${provider}/start`, { 
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          
          // Validate response structure
          if (data.success && data.data && data.data.url) {
            const url = new URL(data.data.url);
            
            console.log(`✅ ${provider} start: ${response.status}`);
            console.log(`   OAuth URL: ${url.origin}${url.pathname}`);
            console.log(`   State: ${url.searchParams.get('state')}`);
            console.log(`   Correlation ID: ${data.correlationId}`);
            
            results.push({ 
              provider, 
              success: true, 
              url: data.data.url,
              correlationId: data.correlationId,
              state: url.searchParams.get('state')
            });
          } else {
            console.log(`❌ ${provider} start: Invalid response structure`);
            results.push({ 
              provider, 
              success: false, 
              error: 'Invalid response structure'
            });
          }
        } else {
          console.log(`❌ ${provider} start: ${response.status}`);
          const errorData = await response.json().catch(() => ({}));
          results.push({ 
            provider, 
            success: false, 
            status: response.status,
            error: errorData
          });
        }
      } catch (error) {
        console.log(`❌ ${provider} start failed:`, error.message);
        results.push({ 
          provider, 
          success: false, 
          error: error.message 
        });
      }
    }
    
    return results;
  }

  /**
   * Test 3: Unauthenticated access (run in incognito window)
   */
  async function testUnauthenticated() {
    console.log('🔍 Testing unauthenticated access...');
    console.log('💡 Tip: Run this in an incognito window for accurate results');
    
    const endpoints = [
      '/api/storage/google/start',
      '/api/storage/microsoft/start',
      '/api/dev/whoami'
    ];
    
    const results = [];
    
    for (const endpoint of endpoints) {
      try {
        console.log(`  Testing ${endpoint} without auth...`);
        
        const response = await fetch(endpoint);
        
        if (response.status === 401) {
          console.log(`✅ ${endpoint}: Correctly blocked (401)`);
          results.push({ endpoint, success: true, status: 401 });
        } else {
          console.log(`❌ ${endpoint}: Should return 401, got ${response.status}`);
          results.push({ endpoint, success: false, status: response.status });
        }
      } catch (error) {
        console.log(`❌ ${endpoint}: Error -`, error.message);
        results.push({ endpoint, success: false, error: error.message });
      }
    }
    
    return results;
  }

  /**
   * Test 4: Storage status
   */
  async function testStorageStatus() {
    console.log('🔍 Testing storage status...');
    
    try {
      const response = await fetch('/api/storage/status', { 
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.success && data.data) {
          console.log('✅ Storage status:', response.status);
          console.log('   Google Drive:', data.data.google ? 'Connected' : 'Not connected');
          console.log('   Microsoft OneDrive:', data.data.microsoft ? 'Connected' : 'Not connected');
          
          return { 
            success: true, 
            status: data.data,
            correlationId: data.correlationId
          };
        } else {
          console.log('❌ Storage status: Invalid response structure');
          return { success: false, error: 'Invalid response structure' };
        }
      } else {
        console.log('❌ Storage status:', response.status);
        const errorData = await response.json().catch(() => ({}));
        return { success: false, status: response.status, error: errorData };
      }
    } catch (error) {
      console.log('❌ Storage status failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Quick OAuth flow test - attempts to start OAuth for a provider
   */
  async function quickOAuthTest(provider = 'google') {
    console.log(`🚀 Quick OAuth test for ${provider}...`);
    
    try {
      const response = await fetch(`/api/storage/${provider}/start`, { 
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data && data.data.url) {
          console.log(`✅ OAuth URL generated for ${provider}`);
          console.log('🔗 OAuth URL:', data.data.url);
          console.log('💡 You can copy this URL to test the OAuth flow');
          return { success: true, url: data.data.url };
        }
      }
      
      console.log(`❌ Failed to generate OAuth URL for ${provider}`);
      return { success: false, status: response.status };
    } catch (error) {
      console.log(`❌ Error testing ${provider} OAuth:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Run all smoke tests
   */
  async function runAllTests() {
    console.log('🚀 Running all OAuth smoke tests...');
    console.log('=====================================');
    
    const results = {
      auth: await testAuth(),
      oauthStart: await testOAuthStart(),
      storageStatus: await testStorageStatus()
    };
    
    console.log('\n📊 Test Results Summary:');
    console.log('========================');
    
    // Auth test summary
    console.log(`Auth Test: ${results.auth.success ? '✅ PASS' : '❌ FAIL'}`);
    if (!results.auth.success) {
      console.log(`  Error: ${results.auth.error}`);
    }
    
    // OAuth start tests summary
    const oauthPassed = results.oauthStart.filter(r => r.success).length;
    const oauthTotal = results.oauthStart.length;
    console.log(`OAuth Start Tests: ${oauthPassed}/${oauthTotal} passed`);
    results.oauthStart.forEach(r => {
      console.log(`  ${r.provider}: ${r.success ? '✅ PASS' : '❌ FAIL'}`);
    });
    
    // Storage status test summary
    console.log(`Storage Status Test: ${results.storageStatus.success ? '✅ PASS' : '❌ FAIL'}`);
    
    // Overall result
    const allPassed = results.auth.success && 
                     oauthPassed === oauthTotal && 
                     results.storageStatus.success;
    
    console.log(`\n🎯 Overall Result: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    
    return results;
  }

  /**
   * Show help information
   */
  function help() {
    console.log(`
🔧 OAuth Console Helpers - Available Commands:
==============================================

Authentication:
  testAuth()                    - Test current authentication status
  
OAuth Flow Testing:
  testOAuthStart()             - Test both Google and Microsoft OAuth start endpoints
  quickOAuthTest('google')     - Quick test for Google OAuth (generates URL)
  quickOAuthTest('microsoft')  - Quick test for Microsoft OAuth (generates URL)
  
Storage:
  testStorageStatus()          - Check cloud storage connection status
  
Security Testing:
  testUnauthenticated()        - Test that endpoints properly reject unauthenticated requests
                                 (run this in an incognito window)
  
Comprehensive Testing:
  runAllTests()                - Run all smoke tests sequentially
  
Utilities:
  help()                       - Show this help message

💡 Tips:
- All functions return promises, use 'await' when calling them
- For unauthenticated tests, open an incognito window and run testUnauthenticated()
- OAuth URLs can be copied and tested manually in a new tab
- Check the Network tab in DevTools to see detailed request/response data

Example usage:
  await testAuth()
  await quickOAuthTest('google')
  await runAllTests()
`);
  }

  // Create the smokeTests object
  const smokeTests = {
    testAuth,
    testOAuthStart,
    testUnauthenticated,
    testStorageStatus,
    quickOAuthTest,
    runAllTests,
    help
  };

  // Expose to window for browser console access
  if (typeof window !== 'undefined') {
    window.oauthSmokeTests = smokeTests;
    
    // Auto-show help on first load
    console.log('🔧 OAuth Console Helpers loaded!');
    console.log('💡 Type "oauthSmokeTests.help()" for available commands');
    console.log('🚀 Quick start: await oauthSmokeTests.testAuth()');
  }

  // Also support module exports for Node.js environments
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = smokeTests;
  }

})();