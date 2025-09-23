# Remove Public Schema Views Deployment Guide

This guide provides instructions for safely removing the public schema compatibility views that were created during the multi-tenant schema migration.

## Overview

The public schema views were created as a compatibility layer during the migration from `public` to `app` and `private` schemas. Now that all code has been successfully migrated to use the `app` schema directly, these views are no longer needed and can be safely removed.

## Pre-Deployment Verification

Before removing the public schema views, verify that:

1. **No Active Usage**: Confirm no code is using the public schema views
2. **Migration Complete**: All API routes and repositories are using `app` schema
3. **Health Checks Updated**: Health check endpoint no longer tests public schema

### Verification Commands

```bash
# Search for any remaining public schema usage
grep -r "supabasePublic" src/
grep -r "public\." src/ --include="*.ts" --include="*.tsx"
grep -r "from.*public\." src/ --include="*.ts" --include="*.tsx"

# Verify no results should be returned
```

## Deployment Steps

### Step 1: Deploy Code Changes

Deploy the updated application code that removes public schema client references:

1. **Supabase Client Configuration**: Removed `supabasePublic` client
2. **Base Repository**: Removed public schema support methods
3. **Health Check**: Removed public schema connectivity tests
4. **Integration Tests**: Updated to remove public schema test cases

### Step 2: Execute Database Migration

Execute the SQL migration to remove the public schema views:

```sql
-- Execute in staging first
\i database/21-remove-public-schema-views.sql

-- Verify views are removed
SELECT schemaname, viewname 
FROM pg_views 
WHERE schemaname = 'public' 
AND viewname IN ('users', 'file_metadata', 'document_chunks', 'conversations', 'chat_messages', 'usage_logs', 'user_settings');
-- Should return no rows
```

### Step 3: Verify Deployment

After deployment, verify the system is working correctly:

1. **Health Check**: Verify `/api/health` returns healthy status for app and private schemas
2. **API Functionality**: Test upload, chat, and OAuth functionality
3. **Error Monitoring**: Monitor for any schema-related errors

## Views Being Removed

The following public schema views will be removed:

- `public.users` → `app.users`
- `public.file_metadata` → `app.files`
- `public.document_chunks` → `app.document_chunks`
- `public.conversations` → `app.conversations`
- `public.chat_messages` → `app.chat_messages`
- `public.usage_logs` → `app.usage_logs`
- `public.user_settings` → `app.user_settings`

## Benefits of Removal

1. **Performance**: Eliminates unnecessary database objects
2. **Maintenance**: Reduces database complexity
3. **Security**: Removes potential confusion about schema usage
4. **Clarity**: Makes it clear that only app and private schemas are in use

## Rollback Plan

If issues arise after removing the views, they can be recreated using the original migration:

```sql
-- Recreate views if needed (from 01-multi-tenant-schema-migration.sql)
CREATE OR REPLACE VIEW public.users AS SELECT * FROM app.users;
CREATE OR REPLACE VIEW public.file_metadata AS SELECT * FROM app.files;
CREATE OR REPLACE VIEW public.document_chunks AS SELECT * FROM app.document_chunks;
CREATE OR REPLACE VIEW public.conversations AS SELECT * FROM app.conversations;
CREATE OR REPLACE VIEW public.chat_messages AS SELECT * FROM app.chat_messages;
CREATE OR REPLACE VIEW public.usage_logs AS SELECT * FROM app.usage_logs;
CREATE OR REPLACE VIEW public.user_settings AS SELECT * FROM app.user_settings;

-- Restore permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO briefly_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_metadata TO briefly_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_chunks TO briefly_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO briefly_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO briefly_authenticated;
GRANT SELECT ON public.usage_logs TO briefly_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO briefly_authenticated;
```

## Post-Deployment Monitoring

Monitor the following after deployment:

1. **Error Rates**: Watch for any increase in database errors
2. **Performance**: Monitor query performance (should improve slightly)
3. **Health Checks**: Ensure health endpoint reports correct schema status
4. **User Experience**: Verify all functionality works as expected

## Success Criteria

The deployment is successful when:

- [ ] Health check endpoint returns healthy status for app and private schemas only
- [ ] All API endpoints function correctly (upload, chat, OAuth)
- [ ] No schema-related errors in logs
- [ ] Database contains no public schema views for the removed tables
- [ ] Application performance is maintained or improved

This cleanup completes the migration to the multi-tenant schema architecture by removing the temporary compatibility layer.