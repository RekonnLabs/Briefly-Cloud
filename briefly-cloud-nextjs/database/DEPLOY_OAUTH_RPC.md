# OAuth RPC Functions Deployment Guide

This guide explains how to deploy the OAuth RPC functions for private schema operations.

## Overview

The OAuth RPC functions provide secure access to OAuth tokens stored in the private schema. These functions replace direct table access with secure RPC calls that include proper validation, encryption, and audit logging.

## Functions Included

### Core Functions
- `public.save_oauth_token()` - Securely saves OAuth tokens
- `public.get_oauth_token()` - Retrieves OAuth tokens with decryption
- `public.delete_oauth_token()` - Removes OAuth tokens

### Helper Functions
- `public.oauth_token_exists()` - Checks if token exists
- `public.get_oauth_token_status()` - Gets token status and expiry info
- `public.update_connection_status()` - Updates connection status

## Prerequisites

1. **Multi-tenant schema migration completed**
   - `app` schema exists with user tables
   - `private` schema exists with oauth_tokens table
   - Proper roles and permissions are set up

2. **Database access**
   - Supabase service role key or direct database access
   - Permission to create functions and grant permissions

## Deployment Steps

### Option 1: Supabase Dashboard (Recommended)

1. **Open Supabase Dashboard**
   - Go to your project dashboard
   - Navigate to SQL Editor

2. **Execute the migration**
   - Copy the contents of `database/11-oauth-token-rpc-functions.sql`
   - Paste into the SQL Editor
   - Click "Run" to execute

3. **Verify deployment**
   - Check that functions were created successfully
   - No error messages should appear

### Option 2: Command Line (psql)

```bash
# Connect to your database
psql -h your-host -U postgres -d postgres

# Execute the migration file
\i database/11-oauth-token-rpc-functions.sql

# Verify functions were created
\df public.save_oauth_token
\df public.get_oauth_token
\df public.delete_oauth_token
```

### Option 3: Programmatic Deployment

```javascript
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const sql = fs.readFileSync('database/11-oauth-token-rpc-functions.sql', 'utf8');
const { error } = await supabase.rpc('exec', { sql });

if (error) {
  console.error('Deployment failed:', error);
} else {
  console.log('RPC functions deployed successfully');
}
```

## Verification

After deployment, verify the functions work correctly:

### 1. Check Function Existence

```sql
-- List all OAuth-related functions
SELECT 
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name LIKE '%oauth%'
ORDER BY routine_name;
```

### 2. Test Basic Functionality

```sql
-- Test with a sample user (replace with actual user ID)
SELECT public.save_oauth_token(
  'your-user-id'::uuid,
  'google',
  'test-access-token',
  'test-refresh-token',
  NOW() + INTERVAL '1 hour',
  'https://www.googleapis.com/auth/drive.file'
);

-- Retrieve the token
SELECT * FROM public.get_oauth_token(
  'your-user-id'::uuid,
  'google'
);

-- Clean up test data
SELECT public.delete_oauth_token(
  'your-user-id'::uuid,
  'google'
);
```

### 3. Verify Permissions

```sql
-- Check function permissions
SELECT 
  routine_name,
  grantee,
  privilege_type
FROM information_schema.routine_privileges 
WHERE routine_schema = 'public' 
  AND routine_name LIKE '%oauth%'
ORDER BY routine_name, grantee;
```

## Security Features

### 1. SECURITY DEFINER
- Functions run with elevated privileges
- Users can't directly access private schema
- Controlled access through function interface

### 2. Input Validation
- Provider validation (only 'google' and 'microsoft')
- Parameter sanitization
- SQL injection prevention

### 3. Encryption
- Tokens are base64 encoded for basic obfuscation
- Can be enhanced with proper encryption later
- Encryption key management in place

### 4. Audit Logging
- All operations logged to private.audit_logs
- Includes user ID, action, and metadata
- IP address and user agent tracking

### 5. Search Path Security
- Explicit search_path setting
- Prevents schema confusion attacks
- Controlled access to private schema

## Usage in Application Code

### Save Token
```javascript
const { error } = await supabase.rpc('save_oauth_token', {
  p_user_id: userId,
  p_provider: 'google',
  p_access_token: accessToken,
  p_refresh_token: refreshToken,
  p_expires_at: expiresAt,
  p_scope: scope
});
```

### Get Token
```javascript
const { data, error } = await supabase.rpc('get_oauth_token', {
  p_user_id: userId,
  p_provider: 'google'
});

if (data && data.length > 0) {
  const token = data[0];
  console.log('Access token:', token.access_token);
}
```

### Delete Token
```javascript
const { error } = await supabase.rpc('delete_oauth_token', {
  p_user_id: userId,
  p_provider: 'google'
});
```

### Check Token Status
```javascript
const { data, error } = await supabase.rpc('get_oauth_token_status', {
  p_user_id: userId,
  p_provider: 'google'
});

if (data && data.length > 0) {
  const status = data[0];
  if (status.is_expired) {
    // Token needs refresh
  }
}
```

## Troubleshooting

### Common Issues

1. **Permission Denied**
   ```
   Error: permission denied for function save_oauth_token
   ```
   - Ensure you're using service role key
   - Check function permissions were granted correctly

2. **Function Not Found**
   ```
   Error: function public.save_oauth_token does not exist
   ```
   - Verify the migration was executed successfully
   - Check function names are correct

3. **Invalid Provider Error**
   ```
   Error: Invalid provider: xyz. Must be google or microsoft
   ```
   - Only 'google' and 'microsoft' are supported
   - Check provider parameter spelling

4. **Schema Access Error**
   ```
   Error: permission denied for schema private
   ```
   - Functions should use SECURITY DEFINER
   - Check search_path is set correctly

### Debug Commands

```sql
-- Check if functions exist
\df public.*oauth*

-- Check function definitions
\sf public.save_oauth_token

-- Check permissions
SELECT * FROM information_schema.routine_privileges 
WHERE routine_name = 'save_oauth_token';

-- Check audit logs
SELECT * FROM private.audit_logs 
WHERE action LIKE '%OAUTH%' 
ORDER BY created_at DESC 
LIMIT 10;
```

## Rollback

If you need to rollback the deployment:

```sql
-- Drop all OAuth RPC functions
DROP FUNCTION IF EXISTS public.save_oauth_token(UUID,TEXT,TEXT,TEXT,TIMESTAMPTZ,TEXT);
DROP FUNCTION IF EXISTS public.get_oauth_token(UUID,TEXT);
DROP FUNCTION IF EXISTS public.delete_oauth_token(UUID,TEXT);
DROP FUNCTION IF EXISTS public.oauth_token_exists(UUID,TEXT);
DROP FUNCTION IF EXISTS public.get_oauth_token_status(UUID,TEXT);
DROP FUNCTION IF EXISTS public.update_connection_status(UUID,TEXT,BOOLEAN,TEXT);

-- Drop connection status table if needed
DROP TABLE IF EXISTS app.connection_status;
```

## Next Steps

After successful deployment:

1. **Update Application Code**
   - Replace direct table access with RPC calls
   - Update OAuth token repositories
   - Test all OAuth flows

2. **Monitor Performance**
   - Check function execution times
   - Monitor audit log growth
   - Optimize if needed

3. **Enhance Security**
   - Implement proper encryption (replace base64)
   - Add rate limiting if needed
   - Review audit logs regularly

4. **Documentation**
   - Update API documentation
   - Train team on new patterns
   - Create troubleshooting guides

## Support

For issues with deployment or usage:
1. Check the troubleshooting section above
2. Review audit logs for detailed error information
3. Test with the validation script: `node scripts/validate-oauth-rpc.js`
4. Contact the development team for assistance