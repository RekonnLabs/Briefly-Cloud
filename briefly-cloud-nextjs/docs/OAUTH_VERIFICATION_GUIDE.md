# OAuth Verification Guide

This guide provides comprehensive procedures for validating the OAuth implementation in Briefly Cloud, including smoke tests, browser console commands, and expected log entries for successful and failed OAuth flows.

## Overview

The OAuth verification guide covers:
- **Smoke Test Procedures**: Automated testing for OAuth implementation validation
- **Browser Console Commands**: Quick testing commands for development and debugging
- **Expected Log Entries**: Detailed logging patterns for successful and failed OAuth flows
- **Manual Testing Procedures**: Step-by-step validation of complete OAuth flows
- **Troubleshooting**: Common issues and debugging techniques

## Quick Start

### Prerequisites
- Authenticated user session (signed in to Briefly Cloud)
- Access to browser developer tools
- Node.js environment for running smoke tests
- Valid OAuth provider credentials configured

### Browser Console Quick Test
1. Open browser developer tools (F12)
2. Navigate to Console tab
3. Load the OAuth console helpers:
   ```javascript
   await import('/oauth-console-helpers.js')
   ```
4. Run a quick authentication test:
   ```javascript
   await oauthSmokeTests.testAuth()
   ```

### Environment Setup Verification
Before running tests, verify your environment:
```javascript
// Check if OAuth console helpers are loaded
console.log('OAuth helpers available:', typeof window.oauthSmokeTests !== 'undefined')

// Verify authentication status
await oauthSmokeTests.testAuth()
```

## Smoke Test Procedures

This section provides detailed procedures for validating the OAuth implementation using both browser console commands and Node.js scripts.

### Prerequisites for Smoke Testing

#### Browser Testing Prerequisites
- Active user session (signed in to Briefly Cloud)
- Browser developer tools access
- OAuth console helpers loaded

#### Node.js Testing Prerequisites
- Node.js environment with npm
- Valid session cookie for authenticated tests
- Environment variables configured

#### Getting Session Cookie for Node.js Tests
1. Sign in to Briefly Cloud in your browser
2. Open Developer Tools (F12) → Application/Storage tab
3. Find the Supabase session cookie (usually `sb-*-auth-token`)
4. Copy the cookie value for use in `SMOKE_AUTH_COOKIE` environment variable

### 1. Authentication Verification

**Purpose**: Verify that user authentication is working correctly and user context is available.

**Browser Console Command**:
```javascript
await oauthSmokeTests.testAuth()
```

**Node.js Command**:
```bash
cd briefly-cloud-nextjs
SMOKE_AUTH_COOKIE="your-session-cookie" node scripts/oauth-smoke-tests.mjs
```

**Alternative Node.js Command (specific test)**:
```bash
cd briefly-cloud-nextjs
SMOKE_AUTH_COOKIE="your-session-cookie" npm run oauth:smoke-test -- --test=auth
```

**Expected Success Output**:
```
✅ Auth working: User ID abc123-def456-ghi789
   Email: user@example.com
   Environment: development
   Correlation ID: req_1706123456789_abc123def
```

**Expected Failure Output**:
```
❌ Auth failed: 401
```

**Validation Checklist**:
- [ ] Returns valid user ID
- [ ] Includes user email
- [ ] Shows correct environment
- [ ] Provides correlation ID for tracing

### 2. OAuth Start Endpoint Testing

**Purpose**: Validate that OAuth start endpoints return consistent JSON structure and generate valid OAuth URLs.

**Browser Console Command**:
```javascript
await oauthSmokeTests.testOAuthStart()
```

**Node.js Command**:
```bash
cd briefly-cloud-nextjs
SMOKE_AUTH_COOKIE="your-session-cookie" node scripts/oauth-smoke-tests.mjs
```

**Expected Success Output**:
```
✅ google start: 200
   OAuth URL: https://accounts.google.com/o/oauth2/v2/auth
   State: abc123-def456-ghi789
   Correlation ID: req_1706123456789_xyz789abc

✅ microsoft start: 200
   OAuth URL: https://login.microsoftonline.com/common/oauth2/v2.0/authorize
   State: abc123-def456-ghi789
   Correlation ID: req_1706123456790_def456ghi
```

**Response Structure Validation**:
Each OAuth start endpoint should return:
```json
{
  "success": true,
  "data": {
    "url": "https://provider-oauth-url-with-parameters"
  },
  "message": "OAuth URL generated",
  "correlationId": "req_1706123456789_abc123def",
  "timestamp": "2025-01-27T10:30:00.000Z"
}
```

**Detailed Validation Steps**:
1. **JSON Structure Consistency**: Both providers return identical schema
2. **OAuth URL Validation**: URLs contain required parameters (client_id, state, scope, redirect_uri)
3. **State Parameter**: State matches authenticated user ID
4. **Correlation ID**: Unique identifier for request tracing
5. **Timestamp**: ISO 8601 formatted timestamp

**OAuth URL Parameter Validation**:
```javascript
// Validate OAuth URL parameters
const result = await oauthSmokeTests.testOAuthStart()
result.forEach(provider => {
  if (provider.success) {
    const url = new URL(provider.url)
    console.log(`${provider.provider} URL validation:`)
    console.log('  ✓ Has client_id:', url.searchParams.has('client_id'))
    console.log('  ✓ Has state:', url.searchParams.has('state'))
    console.log('  ✓ Has scope:', url.searchParams.has('scope'))
    console.log('  ✓ Has redirect_uri:', url.searchParams.has('redirect_uri'))
    console.log('  ✓ State matches user ID:', url.searchParams.get('state') === 'user-id')
  }
})
```

**Validation Checklist**:
- [ ] Both providers return 200 status
- [ ] Response structure matches expected JSON schema
- [ ] OAuth URLs are valid HTTPS URLs
- [ ] State parameter matches authenticated user ID
- [ ] All required OAuth parameters are present
- [ ] Correlation IDs are unique and properly formatted

### 3. Unauthenticated Access Testing

**Purpose**: Verify that OAuth endpoints properly reject unauthenticated requests.

**Browser Console Command** (run in incognito window):
```javascript
await oauthSmokeTests.testUnauthenticated()
```

**Node.js Command** (without auth cookie):
```bash
cd briefly-cloud-nextjs
node scripts/oauth-smoke-tests.mjs
```

**Expected Success Output**:
```
✅ /api/storage/google/start: Correctly blocked (401)
✅ /api/storage/microsoft/start: Correctly blocked (401)
✅ /api/dev/whoami: Correctly blocked (401)
```

**Security Validation Steps**:
1. **Incognito Testing**: Use incognito/private browsing mode to ensure no cached sessions
2. **Multiple Endpoints**: Test all protected OAuth endpoints
3. **Consistent Behavior**: All endpoints should return 401 Unauthorized
4. **No Data Leakage**: Error responses should not expose sensitive information

**Manual Security Testing**:
```javascript
// Test individual endpoints without authentication
const securityTests = [
  '/api/storage/google/start',
  '/api/storage/microsoft/start', 
  '/api/dev/whoami',
  '/api/storage/status'
]

for (const endpoint of securityTests) {
  const response = await fetch(endpoint)
  console.log(`${endpoint}: ${response.status} ${response.status === 401 ? '✅ SECURE' : '❌ SECURITY ISSUE'}`)
}
```

**Validation Checklist**:
- [ ] All protected endpoints return 401 when unauthenticated
- [ ] No sensitive data exposed in error responses
- [ ] Consistent error handling across all endpoints
- [ ] Proper CORS headers in responses

### 4. Storage Status Testing

**Purpose**: Verify that storage connection status endpoint works correctly.

**Browser Console Command**:
```javascript
await oauthSmokeTests.testStorageStatus()
```

**Node.js Command**:
```bash
cd briefly-cloud-nextjs
SMOKE_AUTH_COOKIE="your-session-cookie" node scripts/oauth-smoke-tests.mjs
```

**Expected Success Output**:
```
✅ Storage status: 200
   Google Drive: Not connected
   Microsoft OneDrive: Not connected
```

**Response Structure Validation**:
```json
{
  "success": true,
  "data": {
    "google": false,
    "microsoft": false
  },
  "correlationId": "req_1706123456789_abc123def",
  "timestamp": "2025-01-27T10:30:00.000Z"
}
```

**Connection Status Scenarios**:
1. **No Connections**: Both providers show `false`
2. **Partial Connections**: One provider `true`, other `false`
3. **Full Connections**: Both providers show `true`

**Validation Checklist**:
- [ ] Endpoint returns 200 status when authenticated
- [ ] Response includes both Google and Microsoft status
- [ ] Boolean values correctly represent connection state
- [ ] Correlation ID present for tracing

### 5. Quick OAuth Flow Test

**Purpose**: Generate OAuth URLs for manual testing of the complete flow.

**Browser Console Commands**:
```javascript
// Test Google OAuth
await oauthSmokeTests.quickOAuthTest('google')

// Test Microsoft OAuth
await oauthSmokeTests.quickOAuthTest('microsoft')
```

**Expected Output**:
```
✅ OAuth URL generated for google
🔗 OAuth URL: https://accounts.google.com/o/oauth2/v2/auth?client_id=...&state=user-id
💡 You can copy this URL to test the OAuth flow
```

**Manual Flow Testing Steps**:
1. **Generate OAuth URL**: Use `quickOAuthTest()` to get OAuth URL
2. **Copy URL**: Copy the generated OAuth URL
3. **Open in New Tab**: Paste URL in new browser tab
4. **Complete Authorization**: Follow provider's OAuth flow
5. **Monitor Callback**: Watch for redirect to dashboard
6. **Verify Success**: Check for success indicator in URL

**OAuth URL Analysis**:
```javascript
// Analyze generated OAuth URL
const result = await oauthSmokeTests.quickOAuthTest('google')
if (result.success) {
  const url = new URL(result.url)
  console.log('OAuth Analysis:')
  console.log('  Provider:', url.hostname)
  console.log('  Client ID:', url.searchParams.get('client_id'))
  console.log('  Scopes:', url.searchParams.get('scope'))
  console.log('  State:', url.searchParams.get('state'))
  console.log('  Redirect URI:', url.searchParams.get('redirect_uri'))
}
```

**Validation Checklist**:
- [ ] OAuth URL generated successfully
- [ ] URL contains all required parameters
- [ ] State parameter matches user ID
- [ ] Redirect URI points to correct callback endpoint
- [ ] Scopes include required permissions

## Comprehensive Testing

### Run All Smoke Tests

**Browser Console Command**:
```javascript
await oauthSmokeTests.runAllTests()
```

**Node.js Command**:
```bash
cd briefly-cloud-nextjs
SMOKE_AUTH_COOKIE="your-session-cookie" node scripts/oauth-smoke-tests.mjs
```

**Alternative npm Script**:
```bash
cd briefly-cloud-nextjs
SMOKE_AUTH_COOKIE="your-session-cookie" npm run oauth:smoke-test
```

**Expected Success Summary**:
```
📊 Test Results Summary:
========================
Auth Test: ✅ PASS
OAuth Start Tests: 2/2 passed
  google: ✅ PASS
  microsoft: ✅ PASS
Storage Status Test: ✅ PASS

🎯 Overall Result: ✅ ALL TESTS PASSED
```

### Automated Test Execution

#### Continuous Integration Testing
```bash
#!/bin/bash
# CI/CD smoke test script

echo "🚀 Starting OAuth smoke tests..."

# Set base URL for testing
export SMOKE_BASE_URL="${SMOKE_BASE_URL:-http://localhost:3000}"

# Run smoke tests
cd briefly-cloud-nextjs
if SMOKE_AUTH_COOKIE="$CI_AUTH_COOKIE" node scripts/oauth-smoke-tests.mjs; then
  echo "✅ All OAuth smoke tests passed"
  exit 0
else
  echo "❌ OAuth smoke tests failed"
  exit 1
fi
```

#### Local Development Testing
```bash
# Quick local test script
cd briefly-cloud-nextjs

# Start development server if not running
if ! curl -s http://localhost:3000/api/health > /dev/null; then
  echo "Starting development server..."
  npm run dev &
  DEV_PID=$!
  sleep 5
fi

# Run smoke tests
echo "Running OAuth smoke tests..."
SMOKE_AUTH_COOKIE="your-session-cookie" node scripts/oauth-smoke-tests.mjs

# Cleanup
if [ ! -z "$DEV_PID" ]; then
  kill $DEV_PID
fi
```

### Test Result Analysis

#### Interpreting Test Results
```javascript
// Analyze comprehensive test results
const results = await oauthSmokeTests.runAllTests()

// Check individual test categories
console.log('Authentication:', results.auth.success ? 'WORKING' : 'FAILED')
console.log('OAuth Providers:', results.oauthStart.filter(r => r.success).length + '/' + results.oauthStart.length)
console.log('Storage Status:', results.storageStatus.success ? 'WORKING' : 'FAILED')

// Identify specific failures
if (!results.auth.success) {
  console.log('Auth failure reason:', results.auth.error)
}

results.oauthStart.forEach(provider => {
  if (!provider.success) {
    console.log(`${provider.provider} OAuth failure:`, provider.error)
  }
})

if (!results.storageStatus.success) {
  console.log('Storage status failure:', results.storageStatus.error)
}
```

#### Performance Metrics
```javascript
// Measure OAuth endpoint performance
async function measureOAuthPerformance() {
  const providers = ['google', 'microsoft']
  const results = {}
  
  for (const provider of providers) {
    const start = performance.now()
    const result = await oauthSmokeTests.quickOAuthTest(provider)
    const end = performance.now()
    
    results[provider] = {
      success: result.success,
      responseTime: Math.round(end - start),
      url: result.url
    }
  }
  
  console.log('OAuth Performance Results:')
  Object.entries(results).forEach(([provider, data]) => {
    console.log(`  ${provider}: ${data.responseTime}ms ${data.success ? '✅' : '❌'}`)
  })
  
  return results
}

// Run performance test
await measureOAuthPerformance()
```

### Validation Checklist

#### Pre-Test Validation
- [ ] Development server is running
- [ ] User is authenticated (for authenticated tests)
- [ ] Environment variables are configured
- [ ] OAuth provider credentials are valid
- [ ] Network connectivity is available

#### Post-Test Validation
- [ ] All smoke tests pass
- [ ] No console errors during test execution
- [ ] OAuth URLs are generated correctly
- [ ] Response times are within acceptable limits (< 2 seconds)
- [ ] Security tests properly block unauthenticated access
- [ ] Log entries match expected patterns

#### Failure Investigation
If tests fail, investigate in this order:
1. **Authentication Issues**: Check user session and cookies
2. **Environment Configuration**: Verify OAuth credentials and URLs
3. **Network Issues**: Test basic connectivity to OAuth providers
4. **Server Issues**: Check application logs for errors
5. **Provider Issues**: Verify OAuth provider service status

## Expected Log Entries

This section documents the structured logging patterns used throughout the OAuth implementation. All log entries include timestamps and correlation IDs for tracing.

### Successful OAuth Flows

#### OAuth Start (Initiation)
**Log Pattern**: `[oauth:start]`
**Level**: `INFO`
**Example**:
```json
[oauth:start] {
  "provider": "google",
  "userId": "abc123-def456-ghi789",
  "correlationId": "req_1706123456789_abc123def",
  "timestamp": "2025-01-27T10:30:00.000Z"
}
```

#### OAuth Callback Success
**Log Pattern**: `[oauth:callback]`
**Level**: `INFO`
**Example**:
```json
[oauth:callback] {
  "provider": "google",
  "userId": "abc123-def456-ghi789",
  "success": true,
  "timestamp": "2025-01-27T10:35:00.000Z",
  "correlationId": "req_1706123456789_abc123def"
}
```

#### Token Storage Success
**Log Pattern**: `[oauth:token]`
**Level**: `INFO`
**Example**:
```json
[oauth:token] {
  "provider": "google",
  "operation": "store",
  "userId": "abc123-def456-ghi789",
  "success": true,
  "timestamp": "2025-01-27T10:35:01.000Z"
}
```

### Failed OAuth Flows

#### State Mismatch (Critical Security Event)
**Log Pattern**: `[oauth:security]`
**Level**: `ERROR`
**Severity**: `HIGH`
**Example**:
```json
[oauth:security] {
  "provider": "google",
  "event": "state_mismatch",
  "expected": "abc123-def456-ghi789",
  "received": "wrong-user-id",
  "timestamp": "2025-01-27T10:35:00.000Z",
  "severity": "HIGH",
  "userId": "abc123-def456-ghi789"
}
```

Followed by callback failure:
```json
[oauth:callback] {
  "provider": "google",
  "userId": "abc123-def456-ghi789",
  "success": false,
  "error": "state_mismatch",
  "timestamp": "2025-01-27T10:35:00.000Z"
}
```

#### Missing Authorization Code
**Log Pattern**: `[oauth:callback]`
**Level**: `ERROR`
**Example**:
```json
[oauth:callback] {
  "provider": "google",
  "success": false,
  "error": "missing_code",
  "timestamp": "2025-01-27T10:35:00.000Z"
}
```

#### Token Exchange Failure
**Log Pattern**: `[oauth:callback]`
**Level**: `ERROR`
**Example**:
```json
[oauth:callback] {
  "provider": "google",
  "userId": "abc123-def456-ghi789",
  "success": false,
  "error": "token_exchange_failed",
  "status": 400,
  "timestamp": "2025-01-27T10:35:00.000Z"
}
```

#### Authentication Failure
**Log Pattern**: `[oauth:callback]`
**Level**: `ERROR`
**Example**:
```json
[oauth:callback] {
  "provider": "google",
  "success": false,
  "error": "auth_failed",
  "authError": "JWT expired",
  "timestamp": "2025-01-27T10:35:00.000Z"
}
```

#### Provider-Specific Errors
**Log Pattern**: `[oauth:error]`
**Level**: `ERROR`
**Example**:
```json
[oauth:error] {
  "provider": "microsoft",
  "operation": "callback",
  "error": "invalid_grant",
  "timestamp": "2025-01-27T10:35:00.000Z",
  "details": {
    "providerResponse": "AADSTS70008: The provided authorization code is expired"
  }
}
```

### Security Event Patterns

#### CSRF Attack Detection
**Log Pattern**: `[oauth:security]`
**Level**: `ERROR`
**Severity**: `CRITICAL`
**Example**:
```json
[oauth:security] {
  "provider": "google",
  "event": "csrf_attack_detected",
  "timestamp": "2025-01-27T10:35:00.000Z",
  "severity": "CRITICAL",
  "details": {
    "suspiciousActivity": "Multiple state mismatches from same IP"
  }
}
```

#### Invalid State Parameter
**Log Pattern**: `[oauth:security]`
**Level**: `ERROR`
**Severity**: `HIGH`
**Example**:
```json
[oauth:security] {
  "provider": "microsoft",
  "event": "invalid_state_parameter",
  "received": "malformed-state",
  "timestamp": "2025-01-27T10:35:00.000Z",
  "severity": "HIGH"
}
```

### Log Analysis and Correlation

#### Using Correlation IDs for Debugging
Correlation IDs allow you to trace a complete OAuth flow from start to finish:

1. **Extract correlation ID from start log**:
   ```bash
   grep "req_1706123456789_abc123def" server.log
   ```

2. **Expected log sequence for successful flow**:
   ```
   [oauth:start] correlationId: "req_1706123456789_abc123def"
   [oauth:callback] correlationId: "req_1706123456789_abc123def", success: true
   [oauth:token] operation: "store", success: true
   ```

3. **Expected log sequence for failed flow**:
   ```
   [oauth:start] correlationId: "req_1706123456789_abc123def"
   [oauth:security] event: "state_mismatch", severity: "HIGH"
   [oauth:callback] correlationId: "req_1706123456789_abc123def", success: false
   ```

#### Log Filtering Commands
```bash
# Filter by provider
grep '\[oauth:' server.log | grep '"provider": "google"'

# Filter by error events
grep '\[oauth:' server.log | grep '"success": false'

# Filter security events
grep '\[oauth:security\]' server.log

# Filter by user ID
grep '\[oauth:' server.log | grep '"userId": "abc123-def456-ghi789"'

# Filter by correlation ID
grep 'req_1706123456789_abc123def' server.log
```

## Manual OAuth Flow Testing

### Complete Flow Validation

1. **Start OAuth Flow**:
   ```javascript
   const result = await oauthSmokeTests.quickOAuthTest('google')
   console.log('OAuth URL:', result.url)
   ```

2. **Copy the OAuth URL** and open it in a new tab

3. **Complete OAuth authorization** in the provider's interface

4. **Monitor callback logs** in the server console for success/failure

5. **Verify redirect** to dashboard with success indicator:
   ```
   /briefly/app/dashboard?tab=storage&connected=google
   ```

### State Parameter Validation

1. **Extract state from OAuth URL**:
   ```javascript
   const result = await oauthSmokeTests.quickOAuthTest('google')
   const url = new URL(result.url)
   const state = url.searchParams.get('state')
   console.log('State parameter:', state)
   ```

2. **Verify state matches user ID**:
   ```javascript
   const authResult = await oauthSmokeTests.testAuth()
   console.log('User ID:', authResult.data.userId)
   console.log('State matches user ID:', state === authResult.data.userId)
   ```

## Cache Prevention Validation

### Verify No-Cache Headers

**Browser Network Tab**:
1. Open Developer Tools → Network tab
2. Navigate to OAuth start endpoint: `/api/storage/google/start`
3. Check response headers for:
   ```
   Cache-Control: no-cache, no-store, must-revalidate
   Pragma: no-cache
   Expires: 0
   ```

**Browser Console Command**:
```javascript
const response = await fetch('/api/storage/google/start', { credentials: 'include' })
console.log('Cache-Control:', response.headers.get('cache-control'))
console.log('Pragma:', response.headers.get('pragma'))
console.log('Expires:', response.headers.get('expires'))
```

## Error Scenario Testing

### Test State Mismatch Protection

**Note**: This requires manual manipulation and should only be done in development.

1. **Generate OAuth URL**:
   ```javascript
   const result = await oauthSmokeTests.quickOAuthTest('google')
   ```

2. **Manually modify state parameter** in the OAuth URL

3. **Complete OAuth flow** with modified state

4. **Verify error redirect**:
   ```
   /briefly/app/dashboard?tab=storage&error=state_mismatch
   ```

5. **Check security logs** for HIGH severity event

### Test Missing Code Handling

1. **Navigate directly to callback** without authorization:
   ```
   /api/storage/google/callback
   ```

2. **Verify error redirect**:
   ```
   /briefly/app/dashboard?tab=storage&error=missing_code
   ```

## Correlation ID Tracking

### Using Correlation IDs for Debugging

1. **Extract correlation ID** from OAuth start:
   ```javascript
   const result = await oauthSmokeTests.testOAuthStart()
   const correlationId = result[0].correlationId
   console.log('Correlation ID:', correlationId)
   ```

2. **Search server logs** for the correlation ID to trace the complete request flow

3. **Match correlation IDs** between start and callback events for end-to-end tracing

## Browser Console Commands Reference

### Quick Start Commands

Load OAuth console helpers and run basic tests:
```javascript
// Load the OAuth console helpers
await import('/oauth-console-helpers.js')

// Quick authentication check
await oauthSmokeTests.testAuth()

// Test both OAuth providers
await oauthSmokeTests.testOAuthStart()

// Run all tests
await oauthSmokeTests.runAllTests()
```

### Authentication Testing Commands

#### Basic Authentication Check
```javascript
// Test current authentication status
await oauthSmokeTests.testAuth()

// Expected output:
// ✅ Auth working: abc123-def456-ghi789
//    Email: user@example.com
//    Environment: development
//    Correlation ID: req_1706123456789_abc123def
```

#### Debug Authentication Details
```javascript
// Get detailed authentication information
const authResult = await oauthSmokeTests.testAuth()
console.log('User ID:', authResult.data?.userId)
console.log('Email:', authResult.data?.email)
console.log('Environment:', authResult.data?.environment)
```

### OAuth Flow Testing Commands

#### Test OAuth Start Endpoints
```javascript
// Test both Google and Microsoft OAuth start endpoints
const results = await oauthSmokeTests.testOAuthStart()

// Check results for each provider
results.forEach(result => {
  console.log(`${result.provider}: ${result.success ? 'PASS' : 'FAIL'}`)
  if (result.success) {
    console.log(`  OAuth URL: ${result.url}`)
    console.log(`  State: ${result.state}`)
    console.log(`  Correlation ID: ${result.correlationId}`)
  }
})
```

#### Quick OAuth URL Generation
```javascript
// Generate OAuth URL for Google
const googleResult = await oauthSmokeTests.quickOAuthTest('google')
console.log('Google OAuth URL:', googleResult.url)

// Generate OAuth URL for Microsoft
const microsoftResult = await oauthSmokeTests.quickOAuthTest('microsoft')
console.log('Microsoft OAuth URL:', microsoftResult.url)
```

#### Validate OAuth URL Structure
```javascript
// Test and validate OAuth URL structure
const result = await oauthSmokeTests.quickOAuthTest('google')
if (result.success) {
  const url = new URL(result.url)
  console.log('OAuth Provider:', url.hostname)
  console.log('Client ID:', url.searchParams.get('client_id'))
  console.log('State Parameter:', url.searchParams.get('state'))
  console.log('Scopes:', url.searchParams.get('scope'))
  console.log('Redirect URI:', url.searchParams.get('redirect_uri'))
}
```

### Storage Status Commands

#### Check Connection Status
```javascript
// Check current cloud storage connection status
const status = await oauthSmokeTests.testStorageStatus()
console.log('Google Drive:', status.status?.google ? 'Connected' : 'Not connected')
console.log('Microsoft OneDrive:', status.status?.microsoft ? 'Connected' : 'Not connected')
```

### Security Testing Commands

#### Test Unauthenticated Access (Run in Incognito)
```javascript
// Test that endpoints properly reject unauthenticated requests
// NOTE: Run this in an incognito window for accurate results
const unauthResults = await oauthSmokeTests.testUnauthenticated()

unauthResults.forEach(result => {
  console.log(`${result.endpoint}: ${result.success ? 'Properly blocked' : 'Security issue!'}`)
})
```

#### Manual Security Testing
```javascript
// Test specific endpoints without authentication
const endpoints = [
  '/api/storage/google/start',
  '/api/storage/microsoft/start',
  '/api/dev/whoami'
]

for (const endpoint of endpoints) {
  const response = await fetch(endpoint)
  console.log(`${endpoint}: ${response.status} ${response.status === 401 ? '✅' : '❌'}`)
}
```

### Response Structure Validation Commands

#### Validate JSON Response Structure
```javascript
// Test and validate response structure consistency
const googleResponse = await fetch('/api/storage/google/start', { credentials: 'include' })
const microsoftResponse = await fetch('/api/storage/microsoft/start', { credentials: 'include' })

const googleData = await googleResponse.json()
const microsoftData = await microsoftResponse.json()

// Validate required fields
const requiredFields = ['success', 'data', 'message', 'correlationId', 'timestamp']
requiredFields.forEach(field => {
  console.log(`Google has ${field}:`, field in googleData)
  console.log(`Microsoft has ${field}:`, field in microsoftData)
})

// Validate data.url structure
console.log('Google URL valid:', googleData.data?.url?.startsWith('https://'))
console.log('Microsoft URL valid:', microsoftData.data?.url?.startsWith('https://'))
```

#### Check Cache Prevention Headers
```javascript
// Verify no-cache headers are present
const response = await fetch('/api/storage/google/start', { credentials: 'include' })

console.log('Cache-Control:', response.headers.get('cache-control'))
console.log('Pragma:', response.headers.get('pragma'))
console.log('Expires:', response.headers.get('expires'))

// Expected values:
// Cache-Control: no-cache, no-store, must-revalidate
// Pragma: no-cache
// Expires: 0
```

### Comprehensive Testing Commands

#### Run All Tests with Detailed Output
```javascript
// Run complete test suite
const results = await oauthSmokeTests.runAllTests()

// Analyze results
console.log('Auth Test:', results.auth.success ? '✅ PASS' : '❌ FAIL')
console.log('OAuth Start Tests:', results.oauthStart.filter(r => r.success).length + '/' + results.oauthStart.length + ' passed')
console.log('Storage Status:', results.storageStatus.success ? '✅ PASS' : '❌ FAIL')
```

#### Custom Test Sequences
```javascript
// Custom test sequence for debugging specific issues
async function debugOAuthFlow(provider = 'google') {
  console.log(`🔍 Debugging ${provider} OAuth flow...`)
  
  // Step 1: Check authentication
  const auth = await oauthSmokeTests.testAuth()
  if (!auth.success) {
    console.log('❌ Authentication failed - cannot proceed')
    return
  }
  
  // Step 2: Test OAuth start
  const start = await oauthSmokeTests.quickOAuthTest(provider)
  if (!start.success) {
    console.log('❌ OAuth start failed')
    return
  }
  
  // Step 3: Analyze OAuth URL
  const url = new URL(start.url)
  console.log('✅ OAuth URL generated')
  console.log('   Provider:', url.hostname)
  console.log('   State:', url.searchParams.get('state'))
  console.log('   Client ID:', url.searchParams.get('client_id')?.substring(0, 20) + '...')
  
  // Step 4: Check storage status
  const storage = await oauthSmokeTests.testStorageStatus()
  console.log('✅ Storage status checked')
  console.log('   Current connection:', storage.status?.[provider] ? 'Connected' : 'Not connected')
  
  return { auth, start, storage }
}

// Run debug sequence
await debugOAuthFlow('google')
await debugOAuthFlow('microsoft')
```

### Error Debugging Commands

#### Analyze Failed Requests
```javascript
// Debug failed OAuth requests
async function debugFailedRequest(endpoint) {
  try {
    const response = await fetch(endpoint, { credentials: 'include' })
    const data = await response.json()
    
    console.log(`Status: ${response.status}`)
    console.log('Headers:', Object.fromEntries(response.headers.entries()))
    console.log('Response:', data)
    
    if (!response.ok) {
      console.log('❌ Request failed')
      console.log('Error details:', data.error || data.message)
    }
  } catch (error) {
    console.log('❌ Network error:', error.message)
  }
}

// Debug specific endpoints
await debugFailedRequest('/api/storage/google/start')
await debugFailedRequest('/api/dev/whoami')
```

### Available Helper Functions

```javascript
// All available OAuth console helper functions:

// Authentication
oauthSmokeTests.testAuth()                    // Test current authentication status

// OAuth Flow Testing  
oauthSmokeTests.testOAuthStart()             // Test both provider start endpoints
oauthSmokeTests.quickOAuthTest('google')     // Quick test for Google OAuth
oauthSmokeTests.quickOAuthTest('microsoft')  // Quick test for Microsoft OAuth

// Storage
oauthSmokeTests.testStorageStatus()          // Check cloud storage connection status

// Security Testing (run in incognito)
oauthSmokeTests.testUnauthenticated()        // Test unauthenticated access rejection

// Comprehensive Testing
oauthSmokeTests.runAllTests()                // Run all smoke tests sequentially

// Utilities
oauthSmokeTests.help()                       // Show help message
```

### Tips for Effective Testing

1. **Use incognito windows** for unauthenticated testing to avoid cached sessions
2. **Check Network tab** in DevTools for detailed request/response data
3. **Monitor Console tab** for real-time log entries during OAuth flows
4. **Copy OAuth URLs** for manual testing in new tabs
5. **Use correlation IDs** to trace requests across server logs
6. **Test both providers** (Google and Microsoft) to ensure consistency
7. **Verify response structure** matches expected JSON schema
8. **Check cache headers** to ensure no-cache policies are working
9. **Test error scenarios** by manipulating URLs or using incognito mode
10. **Use custom debug functions** for systematic troubleshooting

## Troubleshooting Common Issues

### Authentication Test Failures

#### Issue: `❌ Auth failed: 401`
**Possible Causes**:
- User not signed in to Briefly Cloud
- Session cookie expired or invalid
- Middleware blocking request

**Solutions**:
1. **Verify Authentication**:
   ```javascript
   // Check if user is signed in
   console.log('Current URL:', window.location.href)
   console.log('Cookies:', document.cookie)
   ```

2. **Refresh Session**:
   - Sign out and sign back in
   - Clear browser cookies and re-authenticate
   - Check for session expiration

3. **Debug Session Cookie**:
   ```bash
   # Extract session cookie from browser
   # Look for sb-*-auth-token in Application → Cookies
   SMOKE_AUTH_COOKIE="extracted-cookie-value" node scripts/oauth-smoke-tests.mjs
   ```

#### Issue: `❌ Auth failed: Invalid response structure`
**Possible Causes**:
- API endpoint returning unexpected format
- Server error or misconfiguration

**Solutions**:
1. **Check API Response**:
   ```javascript
   const response = await fetch('/api/dev/whoami', { credentials: 'include' })
   console.log('Status:', response.status)
   console.log('Response:', await response.json())
   ```

2. **Verify Endpoint Availability**:
   ```bash
   curl -i http://localhost:3000/api/dev/whoami
   ```

### OAuth Start Test Failures

#### Issue: `❌ google start: 500` or `❌ microsoft start: 500`
**Possible Causes**:
- Missing environment variables
- Invalid OAuth credentials
- Provider service issues

**Solutions**:
1. **Verify Environment Variables**:
   ```javascript
   // Check if OAuth credentials are configured
   console.log('Google Client ID configured:', !!process.env.GOOGLE_DRIVE_CLIENT_ID)
   console.log('Microsoft Client ID configured:', !!process.env.MS_DRIVE_CLIENT_ID)
   ```

2. **Test Provider Connectivity**:
   ```bash
   # Test Google OAuth endpoint
   curl -i "https://accounts.google.com/o/oauth2/v2/auth"
   
   # Test Microsoft OAuth endpoint  
   curl -i "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
   ```

3. **Check Server Logs**:
   ```bash
   # Look for OAuth-related errors in server logs
   grep -i "oauth\|error" server.log
   ```

#### Issue: OAuth URL Missing Required Parameters
**Possible Causes**:
- Incorrect OAuth configuration
- Missing redirect URI configuration

**Solutions**:
1. **Validate OAuth URL Structure**:
   ```javascript
   const result = await oauthSmokeTests.quickOAuthTest('google')
   const url = new URL(result.url)
   
   const requiredParams = ['client_id', 'response_type', 'redirect_uri', 'scope', 'state']
   requiredParams.forEach(param => {
     console.log(`${param}:`, url.searchParams.get(param) ? '✅' : '❌ MISSING')
   })
   ```

2. **Check Redirect URI Configuration**:
   - Verify redirect URIs in OAuth provider console
   - Ensure URIs match exactly (including protocol and port)

### Security Test Issues

#### Issue: Unauthenticated Tests Pass When They Should Fail
**Possible Causes**:
- Running tests in authenticated browser session
- Cached authentication state
- Middleware not properly configured

**Solutions**:
1. **Use Incognito Mode**:
   ```javascript
   // Always run unauthenticated tests in incognito/private browsing
   await oauthSmokeTests.testUnauthenticated()
   ```

2. **Clear All Browser Data**:
   - Clear cookies, localStorage, sessionStorage
   - Disable browser extensions
   - Use different browser for testing

3. **Verify Middleware Configuration**:
   ```bash
   # Check middleware.ts configuration
   grep -A 10 -B 5 "middleware" middleware.ts
   ```

#### Issue: State Mismatch Not Detected
**Possible Causes**:
- State verification logic not implemented
- User ID not properly set as state
- Callback route not validating state

**Solutions**:
1. **Test State Parameter**:
   ```javascript
   // Verify state matches user ID
   const authResult = await oauthSmokeTests.testAuth()
   const oauthResult = await oauthSmokeTests.quickOAuthTest('google')
   const url = new URL(oauthResult.url)
   
   console.log('User ID:', authResult.data.userId)
   console.log('OAuth State:', url.searchParams.get('state'))
   console.log('Match:', authResult.data.userId === url.searchParams.get('state'))
   ```

2. **Check Callback Implementation**:
   ```bash
   # Verify state verification in callback routes
   grep -n "state" src/app/api/storage/*/callback/route.ts
   ```

### Performance Issues

#### Issue: Slow OAuth Response Times
**Possible Causes**:
- Network latency to OAuth providers
- Server performance issues
- Database connection problems

**Solutions**:
1. **Measure Response Times**:
   ```javascript
   async function measureResponseTimes() {
     const start = performance.now()
     await oauthSmokeTests.testOAuthStart()
     const end = performance.now()
     console.log('OAuth start response time:', Math.round(end - start), 'ms')
   }
   
   await measureResponseTimes()
   ```

2. **Test Network Connectivity**:
   ```bash
   # Test latency to OAuth providers
   ping accounts.google.com
   ping login.microsoftonline.com
   ```

### Environment-Specific Issues

#### Issue: Tests Work Locally But Fail in Production
**Possible Causes**:
- Environment variable differences
- CORS configuration issues
- Domain/URL mismatches

**Solutions**:
1. **Compare Environment Variables**:
   ```bash
   # Check production vs local environment
   echo "Local OAuth config:"
   grep OAUTH .env.local
   
   echo "Production OAuth config:"
   # Check production environment variables
   ```

2. **Verify CORS Configuration**:
   ```javascript
   // Test CORS headers
   const response = await fetch('/api/storage/google/start', { credentials: 'include' })
   console.log('CORS headers:', {
     'Access-Control-Allow-Origin': response.headers.get('Access-Control-Allow-Origin'),
     'Access-Control-Allow-Credentials': response.headers.get('Access-Control-Allow-Credentials')
   })
   ```

### Debugging Techniques

#### Enable Verbose Logging
```javascript
// Enable detailed logging for OAuth flows
localStorage.setItem('oauth-debug', 'true')

// Run tests with debug logging
await oauthSmokeTests.runAllTests()
```

#### Network Analysis
```javascript
// Monitor network requests during OAuth testing
console.log('Starting network monitoring...')

// Open DevTools → Network tab before running tests
await oauthSmokeTests.testOAuthStart()

// Check for:
// - Request/response headers
// - Response times
// - Error status codes
// - CORS issues
```

#### Log Analysis
```bash
# Search for OAuth-related log entries
grep -E '\[oauth:(start|callback|security|error)\]' server.log | tail -20

# Filter by correlation ID
grep "req_1706123456789_abc123def" server.log

# Filter by provider
grep '"provider": "google"' server.log

# Filter by error events
grep '"success": false' server.log
```

### Getting Help

#### Information to Collect
When reporting OAuth issues, collect:
1. **Test Results**: Output from `runAllTests()`
2. **Browser Console**: Any error messages
3. **Network Tab**: Failed requests and responses
4. **Server Logs**: OAuth-related log entries
5. **Environment**: Browser, OS, Node.js version
6. **Configuration**: OAuth provider settings (without secrets)

#### Debug Information Script
```javascript
// Collect debug information
async function collectDebugInfo() {
  const info = {
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: window.location.href,
    cookies: document.cookie.split(';').length,
    localStorage: Object.keys(localStorage).length,
    sessionStorage: Object.keys(sessionStorage).length
  }
  
  try {
    info.auth = await oauthSmokeTests.testAuth()
    info.oauthStart = await oauthSmokeTests.testOAuthStart()
    info.storageStatus = await oauthSmokeTests.testStorageStatus()
  } catch (error) {
    info.error = error.message
  }
  
  console.log('Debug Information:', JSON.stringify(info, null, 2))
  return info
}

// Run debug collection
await collectDebugInfo()
```

This comprehensive verification guide provides all the tools and procedures needed to validate your OAuth implementation and troubleshoot any issues that arise.