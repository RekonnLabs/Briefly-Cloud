# Apideck Integration Troubleshooting Guide

This guide provides solutions for common issues with the Apideck Vault integration for Google Drive and other cloud storage providers.

## Quick Diagnosis

### 1. Check Integration Status

```bash
# Validate environment configuration
npm run validate:environment

# Check database connection and RLS policies
node scripts/validate-database-state.js

# Test Apideck API connectivity
curl -H "Authorization: Bearer $APIDECK_API_KEY" \
     -H "X-APIDECK-APP-ID: $APIDECK_APP_ID" \
     https://unify.apideck.com/vault/sessions
```

### 2. Check Application Health

```bash
# Test connection health endpoint
curl https://your-domain.com/api/storage/health

# Check storage status
curl -H "Cookie: your-auth-cookie" \
     https://your-domain.com/api/storage/status
```

## Common Error Scenarios

### OAuth Flow Errors

#### Error: "Invalid redirect URI"

**Symptoms:**
- User gets error during Google OAuth
- OAuth flow fails to start
- Apideck returns 400 error

**Diagnosis:**
```bash
# Check redirect URL configuration
echo "Configured: $APIDECK_REDIRECT_URL"
echo "Expected: https://your-domain.com/api/integrations/apideck/callback"

# Verify in Apideck dashboard
curl -H "Authorization: Bearer $APIDECK_API_KEY" \
     -H "X-APIDECK-APP-ID: $APIDECK_APP_ID" \
     https://unify.apideck.com/vault/applications/$APIDECK_APP_ID
```

**Solutions:**
1. **Update Environment Variable:**
   ```bash
   APIDECK_REDIRECT_URL=https://your-domain.com/api/integrations/apideck/callback
   ```

2. **Update Apideck Dashboard:**
   - Log into Apideck dashboard
   - Go to your application settings
   - Update OAuth redirect URI to match exactly
   - Save changes and wait for propagation (up to 5 minutes)

3. **Verify Domain Match:**
   ```bash
   # Both should have the same domain
   echo $APIDECK_REDIRECT_URL
   echo $NEXT_PUBLIC_SITE_URL
   ```

#### Error: "State parameter mismatch"

**Symptoms:**
- OAuth completes but callback fails
- Error: "Invalid state parameter"
- User redirected to error page

**Diagnosis:**
```javascript
// Check session storage in browser dev tools
console.log(sessionStorage.getItem('oauth_state'));
console.log(sessionStorage.getItem('oauth_correlation_id'));

// Check server logs for state validation
grep "state validation" /var/log/app.log
```

**Solutions:**
1. **Clear Browser Session:**
   ```javascript
   // In browser console
   sessionStorage.clear();
   localStorage.clear();
   ```

2. **Check Session Configuration:**
   ```bash
   # Verify session domain matches
   echo $SESSION_DOMAIN
   echo $NEXT_PUBLIC_SITE_URL
   ```

3. **Restart OAuth Flow:**
   - Clear browser data for your domain
   - Start fresh OAuth flow
   - Check that state parameter is properly generated

#### Error: "Connection timeout during callback"

**Symptoms:**
- OAuth completes but callback takes too long
- 504 Gateway Timeout error
- Partial connection data stored

**Diagnosis:**
```bash
# Check callback processing time
grep "callback processing" /var/log/app.log | tail -10

# Check database connection pool
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"
```

**Solutions:**
1. **Optimize Database Queries:**
   ```sql
   -- Check for slow queries
   SELECT query, mean_exec_time, calls 
   FROM pg_stat_statements 
   WHERE query LIKE '%apideck_connections%' 
   ORDER BY mean_exec_time DESC;
   ```

2. **Increase Timeout:**
   ```javascript
   // In API route
   export const maxDuration = 30; // Increase from default 10s
   ```

3. **Add Retry Logic:**
   ```javascript
   // Implement exponential backoff for database operations
   const retryOperation = async (operation, maxRetries = 3) => {
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await operation();
       } catch (error) {
         if (i === maxRetries - 1) throw error;
         await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
       }
     }
   };
   ```

### Database Permission Errors

#### Error: "permission denied for table apideck_connections"

**Symptoms:**
- 42501 PostgreSQL error
- Cannot read/write connection data
- RLS policy violations

**Diagnosis:**
```sql
-- Check if RLS is enabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'apideck_connections';

-- Check existing policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'apideck_connections';

-- Check role permissions
SELECT grantee, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name = 'apideck_connections';
```

**Solutions:**
1. **Deploy RLS Fix:**
   ```bash
   node scripts/deploy-apideck-rls-fix.js
   ```

2. **Manual RLS Setup:**
   ```sql
   -- Enable RLS
   ALTER TABLE app.apideck_connections ENABLE ROW LEVEL SECURITY;
   
   -- Create policy
   CREATE POLICY "Users can manage their own apideck connections" 
   ON app.apideck_connections 
   FOR ALL 
   TO authenticated 
   USING (auth.uid() = user_id) 
   WITH CHECK (auth.uid() = user_id);
   
   -- Grant permissions
   GRANT USAGE ON SCHEMA app TO authenticated;
   GRANT ALL ON app.apideck_connections TO authenticated;
   ```

3. **Verify User Context:**
   ```javascript
   // In API route, check user authentication
   const user = await getUser(request);
   console.log('User context:', user?.id);
   
   // Verify JWT token extraction
   const token = request.cookies.get('sb-access-token');
   console.log('Token present:', !!token);
   ```

#### Error: "relation 'app.apideck_connections' does not exist"

**Symptoms:**
- Table not found error
- Schema reference issues
- Migration not applied

**Diagnosis:**
```sql
-- Check if table exists
SELECT schemaname, tablename 
FROM pg_tables 
WHERE tablename LIKE '%apideck%';

-- Check schema
SELECT schema_name 
FROM information_schema.schemata 
WHERE schema_name = 'app';

-- Check migration status
SELECT * FROM schema_migrations 
WHERE version LIKE '%apideck%';
```

**Solutions:**
1. **Run Database Migration:**
   ```bash
   node scripts/deploy-database-migration.js
   ```

2. **Create Table Manually:**
   ```sql
   CREATE TABLE IF NOT EXISTS app.apideck_connections (
     user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
     provider TEXT NOT NULL,
     consumer_id TEXT NOT NULL,
     connection_id TEXT NOT NULL,
     status TEXT DEFAULT 'connected',
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW(),
     PRIMARY KEY (user_id, provider)
   );
   ```

3. **Fix Schema References:**
   ```javascript
   // In API code, use correct schema reference
   const { data } = await supabase
     .from('apideck_connections') // Not 'app.apideck_connections'
     .select('*')
     .eq('user_id', userId);
   ```

### Authentication Context Issues

#### Error: "User context not found"

**Symptoms:**
- API calls fail with authentication errors
- JWT token not properly extracted
- User ID is null or undefined

**Diagnosis:**
```javascript
// Check cookie extraction
const cookies = request.cookies;
console.log('Available cookies:', Object.keys(cookies));
console.log('Auth cookie:', cookies.get('sb-access-token'));

// Check JWT decoding
const jwt = require('jsonwebtoken');
const token = cookies.get('sb-access-token');
try {
  const decoded = jwt.decode(token);
  console.log('JWT payload:', decoded);
} catch (error) {
  console.log('JWT decode error:', error);
}
```

**Solutions:**
1. **Fix Cookie Extraction:**
   ```javascript
   // In API middleware
   const token = request.cookies.get('sb-access-token')?.value || 
                 request.headers.get('authorization')?.replace('Bearer ', '');
   ```

2. **Update Supabase Client:**
   ```javascript
   // Set auth context properly
   const supabase = createClient(
     process.env.NEXT_PUBLIC_SUPABASE_URL,
     process.env.SUPABASE_SERVICE_ROLE_KEY,
     {
       auth: {
         autoRefreshToken: false,
         persistSession: false
       }
     }
   );
   
   // Set user context
   await supabase.auth.setSession({
     access_token: token,
     refresh_token: refreshToken
   });
   ```

3. **Verify Authentication Flow:**
   ```javascript
   // Check authentication in API route
   const { data: { user }, error } = await supabase.auth.getUser(token);
   if (error || !user) {
     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   }
   ```

### Apideck API Errors

#### Error: "40301 - Unauthorized"

**Symptoms:**
- Apideck API calls fail
- Invalid API key or app credentials
- Authentication errors from Apideck

**Diagnosis:**
```bash
# Test API key
curl -H "Authorization: Bearer $APIDECK_API_KEY" \
     -H "X-APIDECK-APP-ID: $APIDECK_APP_ID" \
     https://unify.apideck.com/vault/sessions

# Check credential format
echo "API Key format: $(echo $APIDECK_API_KEY | cut -c1-3)..."
echo "App ID format: $(echo $APIDECK_APP_ID | cut -c1-4)..."
```

**Solutions:**
1. **Verify Credentials:**
   ```bash
   # Check environment variables
   env | grep APIDECK
   
   # Verify in Apideck dashboard
   # - API key should start with 'sk_'
   # - App ID should start with 'app_'
   # - App UID should start with 'app_uid_'
   ```

2. **Regenerate Credentials:**
   - Log into Apideck dashboard
   - Go to API Keys section
   - Generate new API key
   - Update environment variables
   - Restart application

3. **Check Rate Limits:**
   ```bash
   # Monitor rate limit headers
   curl -I -H "Authorization: Bearer $APIDECK_API_KEY" \
        -H "X-APIDECK-APP-ID: $APIDECK_APP_ID" \
        https://unify.apideck.com/vault/sessions
   ```

#### Error: "Connection not found in Apideck"

**Symptoms:**
- User completed OAuth but connection missing
- Apideck shows no active connections
- File operations fail

**Diagnosis:**
```bash
# Check connections in Apideck
curl -H "Authorization: Bearer $APIDECK_API_KEY" \
     -H "X-APIDECK-APP-ID: $APIDECK_APP_ID" \
     -H "X-APIDECK-CONSUMER-ID: $USER_ID" \
     https://unify.apideck.com/vault/connections

# Check local database
psql $DATABASE_URL -c "SELECT * FROM app.apideck_connections WHERE user_id = '$USER_ID';"
```

**Solutions:**
1. **Retry Connection Process:**
   ```javascript
   // In callback handler, add retry logic
   const maxRetries = 3;
   for (let i = 0; i < maxRetries; i++) {
     try {
       const connections = await apideckClient.getConnections(consumerId);
       if (connections.length > 0) break;
       await new Promise(resolve => setTimeout(resolve, 2000));
     } catch (error) {
       if (i === maxRetries - 1) throw error;
     }
   }
   ```

2. **Manual Connection Sync:**
   ```bash
   # Trigger connection sync
   curl -X POST -H "Cookie: your-auth-cookie" \
        https://your-domain.com/api/storage/sync
   ```

3. **Check OAuth Scopes:**
   - Verify Google OAuth scopes include Drive access
   - Check Apideck configuration for required permissions
   - Ensure user granted all necessary permissions

## Debugging OAuth Flow

### Enable Debug Logging

```bash
# Development environment
DEBUG=apideck:*,oauth:*
LOG_LEVEL=debug

# Production environment (limited)
LOG_LEVEL=info
OAUTH_DEBUG=true
```

### Trace OAuth Flow

1. **Session Creation:**
   ```javascript
   // Check session creation logs
   console.log('Creating OAuth session:', {
     consumerId,
     redirectUri: process.env.APIDECK_REDIRECT_URL,
     state: oauthState
   });
   ```

2. **User Redirection:**
   ```javascript
   // Log redirect URL
   console.log('Redirecting user to:', sessionUri);
   ```

3. **Callback Processing:**
   ```javascript
   // Log callback parameters
   console.log('Callback received:', {
     state: searchParams.get('state'),
     code: searchParams.get('code'),
     correlationId: searchParams.get('correlation_id')
   });
   ```

4. **Connection Storage:**
   ```javascript
   // Log database operations
   console.log('Storing connections:', connections.length);
   console.log('Database result:', result);
   ```

### Common Debug Checkpoints

```javascript
// 1. Environment validation
console.log('Apideck enabled:', process.env.APIDECK_ENABLED);
console.log('API key present:', !!process.env.APIDECK_API_KEY);

// 2. User authentication
console.log('User authenticated:', !!user);
console.log('User ID:', user?.id);

// 3. Session state
console.log('OAuth state:', oauthState);
console.log('Correlation ID:', correlationId);

// 4. API responses
console.log('Apideck response:', apiResponse);
console.log('Database operation:', dbResult);

// 5. Error handling
console.log('Error details:', {
  message: error.message,
  stack: error.stack,
  apiResponse: error.response?.data
});
```

## Monitoring and Alerting

### Health Check Endpoints

```bash
# Application health
curl https://your-domain.com/api/health

# Storage integration health
curl https://your-domain.com/api/storage/health

# Database connectivity
curl https://your-domain.com/api/storage/monitoring
```

### Key Metrics to Monitor

1. **OAuth Success Rate:**
   ```sql
   SELECT 
     DATE(created_at) as date,
     COUNT(*) as total_attempts,
     COUNT(CASE WHEN status = 'connected' THEN 1 END) as successful,
     ROUND(COUNT(CASE WHEN status = 'connected' THEN 1 END) * 100.0 / COUNT(*), 2) as success_rate
   FROM app.apideck_connections 
   WHERE created_at >= NOW() - INTERVAL '7 days'
   GROUP BY DATE(created_at)
   ORDER BY date DESC;
   ```

2. **API Response Times:**
   ```javascript
   // Log API call duration
   const startTime = Date.now();
   const response = await apideckClient.getConnections(consumerId);
   const duration = Date.now() - startTime;
   console.log(`Apideck API call took ${duration}ms`);
   ```

3. **Error Rates:**
   ```sql
   SELECT 
     error_type,
     COUNT(*) as error_count,
     DATE(created_at) as date
   FROM app.error_logs 
   WHERE component = 'apideck' 
     AND created_at >= NOW() - INTERVAL '24 hours'
   GROUP BY error_type, DATE(created_at)
   ORDER BY error_count DESC;
   ```

### Alerting Setup

1. **Database Alerts:**
   ```sql
   -- Create function to check connection health
   CREATE OR REPLACE FUNCTION check_apideck_health()
   RETURNS TABLE(status TEXT, message TEXT) AS $$
   BEGIN
     -- Check recent connection attempts
     IF (SELECT COUNT(*) FROM app.apideck_connections WHERE created_at >= NOW() - INTERVAL '1 hour') = 0 THEN
       RETURN QUERY SELECT 'warning'::TEXT, 'No new connections in the last hour'::TEXT;
     END IF;
     
     -- Check error rate
     IF (SELECT COUNT(*) FROM app.error_logs WHERE component = 'apideck' AND created_at >= NOW() - INTERVAL '1 hour') > 10 THEN
       RETURN QUERY SELECT 'critical'::TEXT, 'High error rate detected'::TEXT;
     END IF;
     
     RETURN QUERY SELECT 'healthy'::TEXT, 'All systems operational'::TEXT;
   END;
   $$ LANGUAGE plpgsql;
   ```

2. **Application Monitoring:**
   ```javascript
   // In monitoring script
   const checkApideckHealth = async () => {
     try {
       const response = await fetch('/api/storage/health');
       const health = await response.json();
       
       if (!health.apideck?.healthy) {
         await sendAlert('Apideck integration unhealthy', health);
       }
     } catch (error) {
       await sendAlert('Apideck health check failed', error);
     }
   };
   
   // Run every 5 minutes
   setInterval(checkApideckHealth, 5 * 60 * 1000);
   ```

3. **External Monitoring:**
   ```bash
   # Uptime monitoring
   curl -f https://your-domain.com/api/storage/health || echo "Health check failed"
   
   # OAuth flow monitoring
   curl -f https://your-domain.com/api/integrations/apideck/session || echo "OAuth session creation failed"
   ```

## Performance Optimization

### Database Optimization

```sql
-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_apideck_connections_user_provider 
ON app.apideck_connections(user_id, provider);

CREATE INDEX IF NOT EXISTS idx_apideck_connections_status 
ON app.apideck_connections(status) WHERE status != 'connected';

-- Optimize connection lookup
CREATE INDEX IF NOT EXISTS idx_apideck_connections_consumer_id 
ON app.apideck_connections(consumer_id);
```

### API Optimization

```javascript
// Cache Apideck API responses
const connectionCache = new Map();

const getCachedConnections = async (consumerId) => {
  const cacheKey = `connections:${consumerId}`;
  
  if (connectionCache.has(cacheKey)) {
    const cached = connectionCache.get(cacheKey);
    if (Date.now() - cached.timestamp < 5 * 60 * 1000) { // 5 minutes
      return cached.data;
    }
  }
  
  const connections = await apideckClient.getConnections(consumerId);
  connectionCache.set(cacheKey, {
    data: connections,
    timestamp: Date.now()
  });
  
  return connections;
};
```

### Connection Pool Optimization

```javascript
// Optimize Supabase client configuration
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    db: {
      schema: 'app'
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        'x-application-name': 'apideck-integration'
      }
    }
  }
);
```

## Recovery Procedures

### Connection Recovery

```javascript
// Recover failed connections
const recoverConnections = async (userId) => {
  try {
    // 1. Check Apideck for active connections
    const apideckConnections = await apideckClient.getConnections(userId);
    
    // 2. Compare with local database
    const localConnections = await supabase
      .from('apideck_connections')
      .select('*')
      .eq('user_id', userId);
    
    // 3. Sync missing connections
    for (const connection of apideckConnections) {
      const exists = localConnections.data?.find(
        local => local.connection_id === connection.id
      );
      
      if (!exists) {
        await supabase
          .from('apideck_connections')
          .insert({
            user_id: userId,
            provider: connection.service_id,
            consumer_id: userId,
            connection_id: connection.id,
            status: connection.state
          });
      }
    }
    
    console.log('Connection recovery completed');
  } catch (error) {
    console.error('Connection recovery failed:', error);
  }
};
```

### Database Recovery

```bash
# Rollback problematic migration
node scripts/rollback-database-migration.js

# Re-apply RLS policies
node scripts/deploy-apideck-rls-fix.js

# Validate database state
node scripts/validate-database-state.js
```

### OAuth State Recovery

```javascript
// Clear corrupted OAuth state
const clearOAuthState = () => {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('oauth_state');
    sessionStorage.removeItem('oauth_correlation_id');
    localStorage.removeItem('apideck_session');
  }
};

// Restart OAuth flow
const restartOAuthFlow = async () => {
  clearOAuthState();
  window.location.href = '/api/integrations/apideck/session';
};
```

## Support and Escalation

### Internal Debugging

1. **Check Recent Logs:**
   ```bash
   tail -f /var/log/app.log | grep -i apideck
   ```

2. **Database Investigation:**
   ```sql
   -- Recent connection attempts
   SELECT * FROM app.apideck_connections 
   WHERE created_at >= NOW() - INTERVAL '1 hour'
   ORDER BY created_at DESC;
   
   -- Error patterns
   SELECT error_message, COUNT(*) 
   FROM app.error_logs 
   WHERE component = 'apideck' 
   GROUP BY error_message 
   ORDER BY COUNT(*) DESC;
   ```

3. **API Testing:**
   ```bash
   # Test Apideck API directly
   curl -v -H "Authorization: Bearer $APIDECK_API_KEY" \
        -H "X-APIDECK-APP-ID: $APIDECK_APP_ID" \
        https://unify.apideck.com/vault/sessions
   ```

### External Support

1. **Apideck Support:**
   - Dashboard support chat
   - Email: support@apideck.com
   - Documentation: https://developers.apideck.com/

2. **Google OAuth Issues:**
   - Google Cloud Console
   - OAuth verification status
   - API quotas and limits

3. **Database Issues:**
   - Supabase dashboard
   - Database logs and metrics
   - Connection pool status

### Escalation Criteria

Escalate to senior engineering if:
- OAuth success rate drops below 90%
- Database errors exceed 5% of requests
- Apideck API errors persist for >30 minutes
- Multiple users report connection issues
- Security-related authentication failures

Include in escalation:
- Error logs and stack traces
- Database query performance metrics
- Apideck API response examples
- User impact assessment
- Steps already attempted