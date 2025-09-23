# Manual RPC Functions Deployment Guide

This guide provides step-by-step instructions for manually deploying RPC functions to your Supabase database.

## Overview

We need to deploy two sets of RPC functions:
1. **OAuth Token RPC Functions** - For secure OAuth token management
2. **Vector Similarity RPC Function** - For semantic search in document chunks

## Prerequisites

- Access to your Supabase project dashboard
- Service role key with database admin permissions
- Completed multi-tenant schema migration (app and private schemas exist)

## Deployment Methods

### Method 1: Supabase Dashboard (Recommended)

#### Step 1: Deploy OAuth Token RPC Functions

1. **Open Supabase Dashboard**
   - Go to your project at https://supabase.com/dashboard
   - Navigate to **SQL Editor**

2. **Execute OAuth RPC Functions**
   - Copy the entire contents of `database/11-oauth-token-rpc-functions.sql`
   - Paste into the SQL Editor
   - Click **Run** to execute
   - Wait for completion (should show "Success. No rows returned")

3. **Verify OAuth Functions**
   - Run this verification query:
   ```sql
   SELECT routine_name, routine_type, security_type
   FROM information_schema.routines 
   WHERE routine_schema = 'public' 
     AND routine_name LIKE '%oauth%'
   ORDER BY routine_name;
   ```
   - Should return 6 functions: save_oauth_token, get_oauth_token, delete_oauth_token, oauth_token_exists, get_oauth_token_status, update_connection_status

#### Step 2: Deploy Vector Similarity RPC Function

1. **Execute Vector Similarity Function**
   - Copy the entire contents of `database/vector-similarity-rpc.sql`
   - Paste into the SQL Editor
   - Click **Run** to execute

2. **Verify Vector Function**
   - Run this verification query:
   ```sql
   SELECT routine_name, routine_type, security_type
   FROM information_schema.routines 
   WHERE routine_schema = 'public' 
     AND routine_name = 'search_document_chunks_by_similarity';
   ```
   - Should return 1 function with SECURITY DEFINER

### Method 2: Command Line (psql)

If you have direct database access:

```bash
# Connect to your database
psql "postgresql://postgres:[password]@[host]:5432/postgres"

# Deploy OAuth RPC functions
\i database/11-oauth-token-rpc-functions.sql

# Deploy Vector Similarity RPC function
\i database/vector-similarity-rpc.sql

# Verify deployment
\df public.*oauth*
\df public.search_document_chunks_by_similarity
```

### Method 3: Programmatic Deployment

Use the deployment script (may have limitations):

```bash
# Run the deployment script
node scripts/deploy-rpc-functions.js

# Or just verify existing deployment
node scripts/deploy-rpc-functions.js --verify-only
```

## Verification Steps

### 1. Check Function Existence

Run this query to verify all functions were created:

```sql
SELECT 
  routine_name,
  routine_type,
  security_type,
  routine_definition IS NOT NULL as has_definition
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND (routine_name LIKE '%oauth%' OR routine_name LIKE '%similarity%')
ORDER BY routine_name;
```

Expected results:
- `delete_oauth_token` - FUNCTION - DEFINER
- `get_oauth_token` - FUNCTION - DEFINER  
- `get_oauth_token_status` - FUNCTION - DEFINER
- `oauth_token_exists` - FUNCTION - DEFINER
- `save_oauth_token` - FUNCTION - DEFINER
- `search_document_chunks_by_similarity` - FUNCTION - DEFINER
- `update_connection_status` - FUNCTION - DEFINER

### 2. Check Function Permissions

Verify permissions are set correctly:

```sql
SELECT 
  routine_name,
  grantee,
  privilege_type
FROM information_schema.routine_privileges 
WHERE routine_schema = 'public' 
  AND (routine_name LIKE '%oauth%' OR routine_name LIKE '%similarity%')
ORDER BY routine_name, grantee;
```

Should show EXECUTE permissions for:
- `authenticated` role
- `service_role` role
- `briefly_service` role (if exists)
- `briefly_authenticated` role (if exists)

### 3. Test OAuth Functions

Run a basic test of the OAuth functions:

```sql
-- Test with a sample user ID (replace with actual user ID from your app.users table)
DO $
DECLARE
  test_user_id UUID := 'your-user-id-here';
BEGIN
  -- Save a test token
  PERFORM public.save_oauth_token(
    test_user_id,
    'google',
    'test-access-token',
    'test-refresh-token',
    NOW() + INTERVAL '1 hour',
    'https://www.googleapis.com/auth/drive.file'
  );
  
  -- Retrieve the token
  IF EXISTS (
    SELECT 1 FROM public.get_oauth_token(test_user_id, 'google')
  ) THEN
    RAISE NOTICE 'OAuth functions working correctly';
  ELSE
    RAISE EXCEPTION 'OAuth functions not working';
  END IF;
  
  -- Clean up
  PERFORM public.delete_oauth_token(test_user_id, 'google');
END;
$;
```

### 4. Test Vector Similarity Function

Test the vector similarity function (requires vector extension):

```sql
-- Check if vector extension is enabled
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Test vector similarity function (if you have document chunks)
SELECT COUNT(*) as chunk_count
FROM public.search_document_chunks_by_similarity(
  array_fill(0.1, ARRAY[1536])::vector(1536),  -- Dummy embedding
  'your-user-id-here'::UUID,                   -- Replace with actual user ID
  0.0,                                          -- Low threshold for testing
  5,                                            -- Limit results
  NULL                                          -- All files
);
```

## Troubleshooting

### Common Issues

1. **Permission Denied**
   ```
   ERROR: permission denied for schema private
   ```
   **Solution**: Ensure you're using the service role key, not the anon key

2. **Function Already Exists**
   ```
   ERROR: function "save_oauth_token" already exists
   ```
   **Solution**: This is normal with `CREATE OR REPLACE FUNCTION` - the function was updated

3. **Vector Extension Missing**
   ```
   ERROR: type "vector" does not exist
   ```
   **Solution**: Enable the vector extension:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

4. **Schema Not Found**
   ```
   ERROR: schema "private" does not exist
   ```
   **Solution**: Run the multi-tenant schema migration first

5. **Table Not Found**
   ```
   ERROR: relation "private.oauth_tokens" does not exist
   ```
   **Solution**: Ensure the schema migration created all required tables

### Debug Queries

```sql
-- Check if schemas exist
SELECT schema_name FROM information_schema.schemata 
WHERE schema_name IN ('app', 'private');

-- Check if required tables exist
SELECT schemaname, tablename 
FROM pg_tables 
WHERE schemaname IN ('app', 'private')
ORDER BY schemaname, tablename;

-- Check function definitions
SELECT routine_name, routine_definition
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name = 'save_oauth_token';
```

## Post-Deployment Testing

After successful deployment, run the comprehensive test suite:

```bash
# Test OAuth RPC functions
node scripts/test-oauth-rpc.js

# Test application integration
npm run test:integration
```

## Security Verification

Verify security settings are correct:

1. **Functions use SECURITY DEFINER**: ✅
2. **Proper search_path set**: ✅  
3. **No public access**: ✅
4. **Audit logging enabled**: ✅
5. **Input validation**: ✅

## Next Steps

After successful deployment:

1. **Update Application Code**
   - OAuth callback routes should use RPC functions
   - Document chunks repository should use vector similarity RPC
   - Remove direct table access where RPC functions are available

2. **Monitor Performance**
   - Check function execution times
   - Monitor audit log growth
   - Verify vector search performance

3. **Production Deployment**
   - Deploy to staging environment first
   - Test all OAuth flows
   - Test document search functionality
   - Deploy to production with monitoring

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review Supabase logs in the dashboard
3. Run the test scripts to verify functionality
4. Check the audit logs for detailed error information

## Rollback

If you need to rollback the deployment:

```sql
-- Remove OAuth RPC functions
DROP FUNCTION IF EXISTS public.save_oauth_token(UUID,TEXT,TEXT,TEXT,TIMESTAMPTZ,TEXT);
DROP FUNCTION IF EXISTS public.get_oauth_token(UUID,TEXT);
DROP FUNCTION IF EXISTS public.delete_oauth_token(UUID,TEXT);
DROP FUNCTION IF EXISTS public.oauth_token_exists(UUID,TEXT);
DROP FUNCTION IF EXISTS public.get_oauth_token_status(UUID,TEXT);
DROP FUNCTION IF EXISTS public.update_connection_status(UUID,TEXT,BOOLEAN,TEXT);

-- Remove Vector Similarity RPC function
DROP FUNCTION IF EXISTS public.search_document_chunks_by_similarity(vector(1536),UUID,FLOAT,INT,UUID[]);

-- Remove connection status table if needed
DROP TABLE IF EXISTS app.connection_status;
```

This completes the manual deployment guide for RPC functions.