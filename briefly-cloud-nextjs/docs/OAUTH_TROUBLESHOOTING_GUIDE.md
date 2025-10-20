# OAuth Troubleshooting Guide

This comprehensive guide helps diagnose and resolve common OAuth issues in Briefly Cloud, including debugging procedures, correlation ID usage, and step-by-step solutions for various failure scenarios.

## Quick Diagnosis

### Immediate Checks
1. **Check authentication status**: `await oauthSmokeTests.testAuth()`
2. **Verify OAuth endpoints**: `await oauthSmokeTests.testOAuthStart()`
3. **Check server logs** for error patterns
4. **Verify environment variables** are properly configured

### Common Error Patterns
- **401 Unauthorized**: Authentication issues
- **State mismatch**: Security/CSRF protection triggered
- **Missing code**: OAuth flow interrupted or cancelled
- **Token exchange failed**: Provider communication issues

## Authentication Issues (401 Errors)

### Symptoms
- OAuth start endpoints return 401 Unauthorized
- `/api/dev/whoami` returns 401
- User appears signed out unexpectedly

### Debugging Steps

#### 1. Verify User Authentication
```javascript
// Browser console
await oauthSmokeTests.testAuth()
```

**Expected Success**:
```
✅ Auth working: User ID abc123-def456-ghi789
   Email: user@example.com
```

**If Failed**:
```
❌ Auth failed: 401
```

#### 2. Check Session Cookies
```javascript
// Browser console - check for auth cookies
document.cookie.split(';').filter(c => c.includes('sb-'))
```

**Expected**: Should show Supabase session cookies

#### 3. Verify Middleware Configuration
Check that `middleware.ts` is at project root and properly configured:
```typescript
// middleware.ts should exclude OAuth callbacks
const excludedPaths = [
  '/_next',
  '/api/storage/google/callback',
  '/api/storage/microsoft/callback',
  '/api/health'
]
```

### Solutions

#### Authentication Expired
1. **Sign out and sign back in**
2. **Clear browser cookies** for the domain
3. **Check token expiration** in Supabase dashboard

#### Middleware Issues
1. **Verify middleware.ts location** (must be at project root)
2. **Check middleware matcher** includes protected paths
3. **Ensure OAuth callbacks are excluded** from middleware

#### Environment Configuration
1. **Verify Supabase environment variables**:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

## OAuth Callback Failures

### State Mismatch Errors

#### Symptoms
- Redirect to: `/briefly/app/dashboard?tab=storage&error=state_mismatch`
- Security logs show HIGH severity events
- OAuth flow completes but connection fails

#### Log Patterns
```
[oauth:security] {
  provider: 'google',
  event: 'state_mismatch',
  expected: 'abc123-def456-ghi789',
  received: 'wrong-user-id',
  severity: 'HIGH'
}
```

#### Debugging Steps

1. **Check state parameter generation**:
   ```javascript
   // Browser console - get OAuth URL and extract state
   const result = await oauthSmokeTests.quickOAuthTest('google')
   const url = new URL(result.url)
   const state = url.searchParams.get('state')
   console.log('Generated state:', state)
   
   // Compare with current user ID
   const auth = await oauthSmokeTests.testAuth()
   console.log('Current user ID:', auth.data.userId)
   console.log('State matches user ID:', state === auth.data.userId)
   ```

2. **Verify callback URL parameters**:
   - Check browser network tab for callback request
   - Verify `state` parameter in callback URL matches user ID

#### Solutions

1. **User switched accounts during OAuth**:
   - Sign out and sign back in with correct account
   - Retry OAuth flow with consistent user session

2. **Session expired during OAuth**:
   - Refresh the page to get new session
   - Retry OAuth flow immediately after sign-in

3. **Multiple browser tabs/sessions**:
   - Close other tabs with the application
   - Use single tab for OAuth flow

### Missing Authorization Code

#### Symptoms
- Redirect to: `/briefly/app/dashboard?tab=storage&error=missing_code`
- OAuth provider redirects without `code` parameter

#### Log Patterns
```
[oauth:callback] {
  provider: 'google',
  success: false,
  error: 'missing_code'
}
```

#### Debugging Steps

1. **Check callback URL structure**:
   ```
   # Expected callback URL
   /api/storage/google/callback?code=4/0AX4XfWh...&state=user-id
   
   # Missing code callback URL
   /api/storage/google/callback?error=access_denied&state=user-id
   ```

2. **Verify OAuth provider configuration**:
   - Check redirect URI matches exactly
   - Verify client ID and secret are correct
   - Ensure OAuth consent screen is approved

#### Solutions

1. **User denied permissions**:
   - Retry OAuth flow and grant all requested permissions
   - Check that required scopes are reasonable and necessary

2. **OAuth provider configuration issues**:
   - Verify redirect URI in provider console matches exactly
   - Check that OAuth app is approved for production use
   - Ensure client credentials are valid and not expired

3. **Network or browser issues**:
   - Try OAuth flow in incognito window
   - Check for browser extensions blocking OAuth
   - Verify network connectivity to OAuth provider

### Token Exchange Failures

#### Symptoms
- Redirect to: `/briefly/app/dashboard?tab=storage&error=token_exchange_failed`
- OAuth callback receives code but fails to exchange for tokens

#### Log Patterns
```
[oauth:callback] {
  provider: 'google',
  success: false,
  error: 'token_exchange_failed',
  status: 400,
  details: { error: 'invalid_grant' }
}
```

#### Debugging Steps

1. **Check token exchange request**:
   - Monitor network tab during callback
   - Look for POST request to provider token endpoint
   - Check request parameters and response

2. **Verify OAuth configuration**:
   ```javascript
   // Check environment variables
   console.log('Google Client ID:', process.env.GOOGLE_DRIVE_CLIENT_ID?.substring(0, 20) + '...')
   console.log('Redirect URI:', process.env.GOOGLE_DRIVE_REDIRECT_URI)
   ```

#### Solutions

1. **Invalid authorization code**:
   - Authorization codes expire quickly (usually 10 minutes)
   - Retry OAuth flow immediately
   - Check for clock synchronization issues

2. **Redirect URI mismatch**:
   - Verify redirect URI in token exchange matches OAuth initiation
   - Check environment variable configuration
   - Ensure exact match in provider console

3. **Client credential issues**:
   - Verify client secret is correct and not expired
   - Check that client ID matches the one used in OAuth initiation
   - Rotate client credentials if suspected compromise

## Provider-Specific Issues

### Google Drive OAuth Issues

#### Common Error Codes
- `access_denied`: User denied permissions
- `invalid_client`: Client ID/secret issues
- `redirect_uri_mismatch`: URI configuration mismatch
- `invalid_scope`: Requested scopes not approved

#### Debugging Google OAuth

1. **Check Google Cloud Console configuration**:
   - Verify OAuth 2.0 client ID configuration
   - Check authorized redirect URIs
   - Ensure OAuth consent screen is approved

2. **Verify required scopes**:
   ```
   openid
   email
   profile
   https://www.googleapis.com/auth/drive.readonly
   ```

3. **Test with Google OAuth Playground**:
   - Use [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
   - Test with same client ID and scopes
   - Verify token exchange works independently

#### Google-Specific Solutions

1. **Consent screen not approved**:
   - Submit OAuth consent screen for review
   - Use test users during development
   - Ensure all required information is provided

2. **Domain verification required**:
   - Verify domain ownership in Google Search Console
   - Add domain to authorized domains list
   - Update OAuth consent screen with verified domain

### Microsoft OneDrive OAuth Issues

#### Common Error Codes
- `invalid_client`: Application not found or client secret expired
- `invalid_scope`: Requested permissions not configured
- `consent_required`: User consent needed for requested scopes
- `interaction_required`: Additional user interaction needed

#### Debugging Microsoft OAuth

1. **Check Azure Portal configuration**:
   - Verify app registration settings
   - Check API permissions are granted
   - Ensure redirect URIs are configured

2. **Verify required scopes**:
   ```
   offline_access
   Files.Read
   User.Read
   openid
   profile
   email
   ```

3. **Test with Microsoft Graph Explorer**:
   - Use [Graph Explorer](https://developer.microsoft.com/en-us/graph/graph-explorer)
   - Test API access with same permissions
   - Verify token works for file access

#### Microsoft-Specific Solutions

1. **Admin consent required**:
   - Request admin consent for organizational accounts
   - Configure app for multi-tenant access
   - Use appropriate consent URLs

2. **Client secret expired**:
   - Generate new client secret in Azure Portal
   - Update environment variables
   - Rotate secrets before expiration

## Correlation ID Usage for Production Debugging

### Understanding Correlation IDs

Correlation IDs are unique identifiers that track requests across the entire OAuth flow, enabling end-to-end debugging in production environments.

#### Correlation ID Format
```
req_1706123456789_abc123def
│   │             │
│   │             └── Random suffix (9 chars)
│   └── Timestamp (milliseconds)
└── Prefix
```

### Using Correlation IDs for Debugging

#### 1. Extract Correlation ID from OAuth Start
```javascript
// Browser console
const result = await oauthSmokeTests.testOAuthStart()
const correlationId = result[0].correlationId
console.log('Correlation ID:', correlationId)
```

#### 2. Search Server Logs
```bash
# Search logs for specific correlation ID
grep "req_1706123456789_abc123def" /var/log/app.log

# Or in cloud logging systems
correlationId:"req_1706123456789_abc123def"
```

#### 3. Trace Complete OAuth Flow
```
# Expected log sequence for successful flow
[oauth:start] correlationId: req_1706123456789_abc123def
[oauth:callback] correlationId: req_1706123456789_abc123def success: true
```

### Production Debugging Workflow

#### 1. Identify the Issue
- User reports OAuth connection failure
- Extract correlation ID from user's browser or support ticket
- Search logs for the correlation ID

#### 2. Analyze Log Sequence
```bash
# Find all log entries for the correlation ID
grep "correlationId.*req_1706123456789_abc123def" logs/

# Expected successful sequence:
# 1. [oauth:start] - OAuth initiation
# 2. [oauth:callback] success:true - Successful callback
# 3. [oauth:token] success:true - Token storage

# Failed sequence examples:
# 1. [oauth:start] - OAuth initiation
# 2. [oauth:security] event:state_mismatch - Security violation
# 3. [oauth:callback] success:false error:state_mismatch
```

#### 3. Root Cause Analysis
Based on log patterns, identify the failure point:

- **No callback logs**: User didn't complete OAuth or provider issue
- **Security logs**: State mismatch or CSRF attack
- **Token exchange failure**: Provider communication issue
- **Storage failure**: Database or internal system issue

## Debugging Checklist

### Environment Validation
- [ ] All required environment variables present
- [ ] OAuth provider credentials valid
- [ ] Redirect URIs match exactly
- [ ] Domain SSL certificate valid
- [ ] Middleware configuration correct

### Authentication Flow
- [ ] User can sign in successfully
- [ ] `/api/dev/whoami` returns user information
- [ ] Session cookies present and valid
- [ ] Middleware allows authenticated requests

### OAuth Start Flow
- [ ] OAuth start endpoints return 200 status
- [ ] Response structure matches expected format
- [ ] OAuth URLs contain required parameters
- [ ] State parameter matches user ID
- [ ] Correlation IDs generated and logged

### OAuth Callback Flow
- [ ] Callback receives authorization code
- [ ] State parameter verification passes
- [ ] Token exchange completes successfully
- [ ] Tokens stored securely
- [ ] Success redirect works correctly

### Error Handling
- [ ] Unauthenticated requests return 401
- [ ] Invalid state triggers security event
- [ ] Missing code handled gracefully
- [ ] Token failures redirect with error code
- [ ] All errors logged with correlation ID

## Emergency Procedures

### OAuth Service Outage

#### Immediate Response
1. **Verify scope of issue**:
   ```bash
   # Check if OAuth providers are accessible
   curl -I https://accounts.google.com/o/oauth2/v2/auth
   curl -I https://login.microsoftonline.com/common/oauth2/v2.0/authorize
   ```

2. **Disable OAuth features temporarily** if needed:
   ```typescript
   // Feature flag to disable OAuth
   const OAUTH_ENABLED = process.env.OAUTH_ENABLED !== 'false'
   ```

3. **Communicate with users** about service availability

#### Recovery Steps
1. **Monitor provider status pages**:
   - [Google Cloud Status](https://status.cloud.google.com/)
   - [Microsoft 365 Status](https://status.office365.com/)

2. **Test OAuth functionality** once providers are restored
3. **Gradually re-enable features** and monitor error rates

### Security Incident Response

#### Suspected CSRF Attack
1. **Immediately investigate** high-severity security logs:
   ```bash
   grep "oauth:security.*severity:HIGH" logs/
   ```

2. **Analyze patterns** for coordinated attacks:
   - Multiple state mismatches from same IP
   - Unusual user agent patterns
   - Rapid-fire OAuth attempts

3. **Implement additional protections** if needed:
   - Rate limiting on OAuth endpoints
   - IP-based blocking for suspicious activity
   - Enhanced logging and monitoring

#### Token Compromise
1. **Revoke affected tokens** immediately:
   ```sql
   -- Revoke tokens for affected user
   DELETE FROM oauth_tokens WHERE user_id = 'affected-user-id';
   ```

2. **Rotate OAuth client secrets**:
   - Generate new secrets in provider consoles
   - Update environment variables
   - Deploy updated configuration

3. **Audit and notify**:
   - Review access logs for unauthorized activity
   - Notify affected users if data access occurred
   - Document incident for compliance reporting

## Performance Issues

### Slow OAuth Response Times

#### Symptoms
- OAuth start endpoints take >2 seconds to respond
- Token exchange timeouts
- User complaints about slow connection process

#### Debugging Steps
1. **Measure response times**:
   ```javascript
   // Browser console timing test
   console.time('oauth-start')
   await oauthSmokeTests.quickOAuthTest('google')
   console.timeEnd('oauth-start')
   ```

2. **Check provider response times**:
   ```bash
   # Test provider endpoint response times
   curl -w "@curl-format.txt" -o /dev/null -s "https://accounts.google.com/o/oauth2/v2/auth"
   ```

3. **Monitor database performance** for token storage operations

#### Solutions
1. **Optimize OAuth URL generation**:
   - Cache OAuth configuration
   - Pre-compute static parameters
   - Use connection pooling for database operations

2. **Implement timeout handling**:
   ```typescript
   // Add timeouts to OAuth requests
   const controller = new AbortController()
   setTimeout(() => controller.abort(), 10000) // 10 second timeout
   
   const response = await fetch(tokenUrl, {
     signal: controller.signal,
     // ... other options
   })
   ```

3. **Add performance monitoring**:
   - Track OAuth flow completion times
   - Monitor provider response times
   - Set up alerts for performance degradation

This troubleshooting guide provides comprehensive solutions for diagnosing and resolving OAuth issues in production environments, ensuring reliable and secure OAuth functionality.