# RPC Functions Deployment Summary

This document summarizes the deployment of RPC functions for the post-migration API fixes.

## Overview

Task 17 involves deploying RPC functions to the database to enable secure access to private schema operations and vector similarity search functionality.

## RPC Functions to Deploy

### 1. OAuth Token RPC Functions (`11-oauth-token-rpc-functions.sql`)

**Core Functions:**
- `public.save_oauth_token()` - Securely saves OAuth tokens with encryption
- `public.get_oauth_token()` - Retrieves OAuth tokens with decryption  
- `public.delete_oauth_token()` - Removes OAuth tokens securely

**Helper Functions:**
- `public.oauth_token_exists()` - Checks if token exists
- `public.get_oauth_token_status()` - Gets token status and expiry info
- `public.update_connection_status()` - Updates connection status

**Security Features:**
- SECURITY DEFINER for controlled access
- Input validation (only 'google' and 'microsoft' providers)
- Base64 encoding for token obfuscation
- Comprehensive audit logging
- Proper search_path configuration

### 2. Vector Similarity RPC Function (`vector-similarity-rpc.sql`)

**Function:**
- `public.search_document_chunks_by_similarity()` - Vector similarity search for document chunks

**Features:**
- User isolation (only returns user's own chunks)
- Configurable similarity threshold
- File filtering support
- Cosine distance similarity scoring
- SECURITY DEFINER for controlled access

## Deployment Methods

### Method 1: Manual Deployment via Supabase Dashboard (Recommended)

1. **Open Supabase Dashboard**
   - Navigate to SQL Editor
   - Copy and paste SQL file contents
   - Execute each file separately

2. **Deploy OAuth RPC Functions**
   - Execute `database/11-oauth-token-rpc-functions.sql`
   - Verify 6 functions are created

3. **Deploy Vector Similarity RPC Function**
   - Execute `database/vector-similarity-rpc.sql`
   - Verify 1 function is created

### Method 2: Automated Deployment Script

```bash
# Deploy all RPC functions
npm run deploy:rpc

# Verify deployment only
npm run deploy:rpc:verify
```

### Method 3: Command Line (psql)

```bash
# Connect to database
psql "your-database-connection-string"

# Execute SQL files
\i database/11-oauth-token-rpc-functions.sql
\i database/vector-similarity-rpc.sql
```

## Validation and Testing

### Pre-Deployment Validation

```bash
# Validate OAuth RPC functions structure
npm run validate:oauth-rpc
```

### Staging Environment Testing

```bash
# Test in staging environment
npm run test:staging
```

### Production Verification

```bash
# Verify production deployment
npm run verify:production

# Test OAuth RPC functionality
npm run test:oauth-rpc
```

## Deployment Checklist

### Pre-Deployment
- [ ] Multi-tenant schema migration completed (app and private schemas exist)
- [ ] Environment variables configured (SUPABASE_URL, SERVICE_ROLE_KEY)
- [ ] SQL files validated with `npm run validate:oauth-rpc`
- [ ] Staging environment tested (if available)

### Deployment Steps
- [ ] Deploy OAuth RPC functions (`11-oauth-token-rpc-functions.sql`)
- [ ] Deploy Vector Similarity RPC function (`vector-similarity-rpc.sql`)
- [ ] Verify function creation in database
- [ ] Check function permissions are set correctly

### Post-Deployment Verification
- [ ] Run `npm run verify:production` to check deployment
- [ ] Test OAuth token lifecycle with `npm run test:oauth-rpc`
- [ ] Verify security settings (SECURITY DEFINER, proper permissions)
- [ ] Check audit logging is working
- [ ] Test vector similarity function (if vector extension available)

### Application Integration
- [ ] Update OAuth callback routes to use RPC functions
- [ ] Update document chunks repository to use vector similarity RPC
- [ ] Remove direct table access where RPC functions are available
- [ ] Test all OAuth flows in application
- [ ] Test document search functionality

## Security Verification

### Function Security
- ✅ All functions use SECURITY DEFINER
- ✅ Proper search_path configuration prevents schema confusion
- ✅ Input validation prevents invalid providers
- ✅ No public access - only authenticated and service_role

### Permissions
- ✅ EXECUTE granted to authenticated role
- ✅ EXECUTE granted to service_role
- ✅ EXECUTE granted to custom roles (briefly_service, briefly_authenticated)
- ✅ No public access to functions

### Audit Logging
- ✅ All OAuth operations logged to private.audit_logs
- ✅ Includes user ID, action, and metadata
- ✅ IP address and user agent tracking
- ✅ Migration completion logged

## Troubleshooting

### Common Issues

1. **Permission Denied**
   - Ensure using service role key, not anon key
   - Check function permissions are granted correctly

2. **Function Not Found**
   - Verify SQL was executed successfully
   - Check function names are correct in application code

3. **Schema Access Error**
   - Ensure multi-tenant migration completed
   - Verify app and private schemas exist

4. **Vector Extension Missing**
   - Enable vector extension: `CREATE EXTENSION IF NOT EXISTS vector;`
   - Vector similarity function will fail without this extension

### Debug Commands

```sql
-- Check if functions exist
SELECT routine_name, security_type 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name LIKE '%oauth%';

-- Check function permissions
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges 
WHERE routine_schema = 'public' 
  AND routine_name = 'save_oauth_token';

-- Check audit logs
SELECT * FROM private.audit_logs 
WHERE action LIKE '%OAUTH%' 
ORDER BY created_at DESC 
LIMIT 10;
```

## Performance Considerations

### OAuth RPC Functions
- Functions are lightweight with minimal processing
- Base64 encoding/decoding is fast
- Audit logging adds minimal overhead
- Connection pooling works efficiently

### Vector Similarity RPC Function
- Requires proper vector indexes for performance
- Uses cosine distance for similarity calculation
- Results are ordered by similarity for optimal performance
- Consider HNSW index for large datasets

## Monitoring

### Health Checks
- Functions are included in application health checks
- Monitor function execution times
- Track error rates for RPC operations
- Monitor audit log growth

### Alerts
- Set up alerts for function failures
- Monitor for permission errors
- Track unusual access patterns
- Alert on audit log anomalies

## Rollback Plan

If issues occur, functions can be removed:

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
```

## Success Criteria

Deployment is considered successful when:

1. ✅ All 7 RPC functions are created and accessible
2. ✅ Functions use SECURITY DEFINER and proper permissions
3. ✅ OAuth token lifecycle works (save/retrieve/delete)
4. ✅ Vector similarity search function is callable
5. ✅ Audit logging captures all operations
6. ✅ Security validation prevents invalid operations
7. ✅ Application can use RPC functions instead of direct table access

## Next Steps

After successful deployment:

1. **Update Application Code**
   - Replace direct table access with RPC calls in OAuth callback routes
   - Update document chunks repository to use vector similarity RPC
   - Test all OAuth flows and document search functionality

2. **Monitor Performance**
   - Track function execution times
   - Monitor error rates and audit logs
   - Optimize if performance issues arise

3. **Documentation Updates**
   - Update API documentation with RPC function usage
   - Update development guides with new patterns
   - Train team on RPC function usage

This completes the deployment of RPC functions for secure private schema operations and vector similarity search functionality.