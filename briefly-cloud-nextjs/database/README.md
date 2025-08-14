# Multi-Tenant Database Schema Migration

This directory contains the database migration files for implementing enterprise-grade multi-tenant security in Briefly Cloud.

## Overview

The migration transforms the existing single-schema database into a secure multi-tenant architecture with:

- **App Schema**: Tenant-scoped data with Row Level Security (RLS)
- **Private Schema**: Secrets and system data with restricted access
- **Role-based Permissions**: Service, authenticated, and anonymous roles
- **Data Isolation**: Complete user data separation through RLS policies
- **Audit Logging**: Comprehensive security event tracking

## Migration Files

### 1. `01-multi-tenant-schema-migration.sql`
- Creates `app` and `private` schemas
- Migrates all tables to appropriate schemas
- Enables pgvector extension for embeddings
- Sets up RLS policies for data isolation
- Creates indexes for performance
- Adds audit logging infrastructure

### 2. `02-role-permissions-setup.sql`
- Configures database roles and permissions
- Sets up security policies
- Grants appropriate access levels
- Creates verification functions

## Schema Structure

### App Schema (Tenant-Scoped)
```
app.users                 - User profiles and subscription data
app.files                 - Document metadata
app.document_chunks       - Text chunks with pgvector embeddings
app.conversations         - Chat conversations
app.chat_messages         - Individual chat messages
app.usage_logs           - Usage tracking for rate limiting
app.rate_limits          - Rate limiting counters
app.user_settings        - User preferences
app.feature_flags        - Feature flag configuration
app.feature_flag_usage   - Feature flag usage tracking
app.consent_records      - GDPR consent management
app.data_export_requests - Data export requests
app.data_deletion_requests - Data deletion requests
```

### Private Schema (Secrets & System)
```
private.oauth_tokens     - Encrypted OAuth tokens
private.audit_logs       - Security audit trail (admin access only)
private.encryption_keys  - Key management
private.system_config    - System configuration
```

## Row Level Security (RLS) Policies

All app schema tables have RLS enabled with policies that ensure:
- Users can only access their own data (`auth.uid() = user_id`)
- Admin users can access audit logs (`email LIKE '%@rekonnlabs.com'`)
- Service role can perform administrative operations
- Feature flags are readable by all authenticated users

## Role Permissions

### `briefly_service` (Service Role)
- Full access to all schemas and tables
- Used by API routes for administrative operations
- Can bypass RLS when needed

### `briefly_authenticated` (User Role)
- Access to app schema through RLS policies
- Can read/write own data only
- Limited access to system tables

### `briefly_anonymous` (Public Role)
- Very limited permissions
- No direct table access
- Used for unauthenticated requests

## Running the Migration

### Prerequisites
1. Ensure you have the required environment variables:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

2. Install dependencies:
   ```bash
   npm install @supabase/supabase-js
   ```

### Execute Migration
```bash
# Run the migration script
node scripts/migrate-to-multi-tenant.js
```

### Manual Execution (Alternative)
If the script fails, you can execute the SQL files manually:

1. **In Supabase Dashboard SQL Editor:**
   ```sql
   -- Execute the contents of 01-multi-tenant-schema-migration.sql
   -- Then execute the contents of 02-role-permissions-setup.sql
   ```

2. **Using psql:**
   ```bash
   psql -h your-host -U postgres -d postgres -f database/01-multi-tenant-schema-migration.sql
   psql -h your-host -U postgres -d postgres -f database/02-role-permissions-setup.sql
   ```

## Verification

After migration, verify the setup:

```sql
-- Check schemas
SELECT schema_name FROM information_schema.schemata 
WHERE schema_name IN ('app', 'private');

-- Check tables
SELECT table_schema, table_name 
FROM information_schema.tables 
WHERE table_schema IN ('app', 'private')
ORDER BY table_schema, table_name;

-- Check RLS policies
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE schemaname IN ('app', 'private');

-- Verify role permissions
SELECT * FROM private.verify_role_permissions();
```

## Backward Compatibility

The migration creates views in the `public` schema for backward compatibility:
- `public.users` → `app.users`
- `public.file_metadata` → `app.files`
- `public.document_chunks` → `app.document_chunks`
- `public.conversations` → `app.conversations`
- `public.chat_messages` → `app.chat_messages`
- `public.usage_logs` → `app.usage_logs`
- `public.user_settings` → `app.user_settings`

**Important**: These views should be removed once the application code is updated to use the new schema structure.

## Security Features

### Data Isolation
- Complete tenant isolation through RLS policies
- Users cannot access other users' data
- Admin access is restricted to RekonnLabs employees

### Encryption
- OAuth tokens are encrypted using AES-GCM
- Encryption keys are managed in `private.encryption_keys`
- Default encryption key is automatically generated

### Audit Logging
- All sensitive operations are logged
- Audit logs are accessible only to admin users
- Automatic triggers log data changes

### Rate Limiting
- Per-user rate limiting infrastructure
- Configurable time windows (minute, hour, day, month)
- Usage tracking for subscription tier enforcement

## Troubleshooting

### Common Issues

1. **Permission Denied Errors**
   - Ensure you're using the service role key
   - Check that roles exist and have proper permissions

2. **RLS Policy Violations**
   - Verify `auth.uid()` is properly set
   - Check that users exist in `app.users` table

3. **Migration Script Failures**
   - Check environment variables are set
   - Ensure network connectivity to Supabase
   - Try manual SQL execution as fallback

### Recovery

If migration fails partially:
1. Check which tables were created successfully
2. Drop incomplete tables/schemas if needed
3. Re-run the migration script
4. Use backup data if available

## Next Steps

After successful migration:

1. **Update Application Code**
   - Change imports to use new schema structure
   - Update API routes to use `app.` prefixed tables
   - Implement proper authentication middleware

2. **Test Security**
   - Verify RLS policies prevent cross-user access
   - Test admin access to audit logs
   - Validate rate limiting functionality

3. **Remove Compatibility Views**
   - Once application is updated, drop `public` schema views
   - Update any remaining references to old table names

4. **Monitor Performance**
   - Check query performance with new indexes
   - Monitor RLS policy overhead
   - Optimize as needed

## Support

For issues with the migration:
1. Check the migration logs for specific error messages
2. Verify all prerequisites are met
3. Try manual SQL execution for debugging
4. Contact the development team for assistance