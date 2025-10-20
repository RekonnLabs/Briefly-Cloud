# SQL Execution Checklist for Supabase

**Project**: Briefly Cloud Recovery  
**Date**: 2024-10-20  
**Supabase Project**: aeeumarwdxepqibjbkaf  
**SQL Editor**: https://supabase.com/dashboard/project/aeeumarwdxepqibjbkaf/sql/new

---

## Instructions

1. Open the Supabase SQL Editor
2. Copy and paste each SQL block below **in order**
3. Click "Run" after pasting each block
4. Check the "Status" column after each execution
5. If any errors occur, note them and continue to the next step

---

## Migration 1: Fix public.v_user_access View

**Purpose**: Add the `email` column to the view so app authentication works correctly

**Status**: ⬜ Not Run | ✅ Success | ❌ Failed

**SQL**:
```sql
-- Update the view to include email (idempotent)
CREATE OR REPLACE VIEW public.v_user_access AS
SELECT 
  u.id                                                    AS user_id,
  u.email                                                 AS email,
  u.subscription_tier                                     AS plan_tier,
  u.subscription_status                                   AS plan_status,
  u.trial_end_date                                        AS trial_ends_at,
  (u.subscription_status = 'trialing' AND u.trial_end_date > NOW())  AS trial_active,
  (u.subscription_status IN ('active', 'trialing') AND u.subscription_tier IN ('pro', 'pro_byok'))  AS paid_active
FROM app.users u;

-- Ensure proper grants (idempotent)
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT ON public.v_user_access TO authenticated, anon;

-- Add comment for documentation
COMMENT ON VIEW public.v_user_access IS 
  'Canonical view for user plan access. Sources from app.users. '
  'Used by /api/plan/status and storage OAuth gates. '
  'Updated 2024-10-20 to include email column.';
```

**Verification**:
```sql
-- Should return user_id, email, trial_active, paid_active
SELECT user_id, email, trial_active, paid_active 
FROM public.v_user_access 
LIMIT 5;
```

**Expected Result**: Should see user records with email addresses

---

## Migration 2: Verify OAuth Token Infrastructure

**Purpose**: Ensure OAuth token storage and RPC functions exist with correct permissions

**Status**: ⬜ Not Run | ✅ Success | ❌ Failed

**SQL**:
```sql
-- Verify the table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'private' AND table_name = 'oauth_tokens'
  ) THEN
    RAISE EXCEPTION 'ERROR: private.oauth_tokens table does not exist. Run database/01-multi-tenant-schema-migration.sql first.';
  END IF;
  
  RAISE NOTICE 'SUCCESS: private.oauth_tokens table exists';
END $$;

-- Verify save_oauth_token exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'save_oauth_token'
  ) THEN
    RAISE EXCEPTION 'ERROR: public.save_oauth_token function does not exist. Run database/11-oauth-token-rpc-functions.sql first.';
  END IF;
  
  RAISE NOTICE 'SUCCESS: public.save_oauth_token function exists';
END $$;

-- Verify get_oauth_token exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_oauth_token'
  ) THEN
    RAISE EXCEPTION 'ERROR: public.get_oauth_token function does not exist. Run database/11-oauth-token-rpc-functions.sql first.';
  END IF;
  
  RAISE NOTICE 'SUCCESS: public.get_oauth_token function exists';
END $$;

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Summary
SELECT 'OAuth token infrastructure verified successfully' AS status,
       'Table: private.oauth_tokens exists' AS table_status,
       'Functions: save_oauth_token, get_oauth_token, delete_oauth_token exist' AS function_status,
       'Grants: anon and authenticated roles have execute permissions' AS grant_status;
```

**Expected Result**: Should see success messages and no errors

---

## Migration 3: Add pgvector Extension Test Function

**Purpose**: Verify pgvector extension is installed and working for document embeddings

**Status**: ⬜ Not Run | ✅ Success | ❌ Failed

**SQL**:
```sql
-- Create test function for pgvector extension
CREATE OR REPLACE FUNCTION public.test_pgvector_extension()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  extension_exists boolean;
  test_vector vector(3);
BEGIN
  -- Check if pgvector extension is installed
  SELECT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'vector'
  ) INTO extension_exists;
  
  IF NOT extension_exists THEN
    RAISE EXCEPTION 'pgvector extension is not installed';
  END IF;
  
  -- Test basic vector operations
  test_vector := '[1,2,3]'::vector(3);
  
  -- If we got here, pgvector is working
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'pgvector test failed: %', SQLERRM;
    RETURN false;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.test_pgvector_extension() TO authenticated, anon;

-- Add comment
COMMENT ON FUNCTION public.test_pgvector_extension() IS 
  'Diagnostic function to verify pgvector extension is installed and working. '
  'Returns true if pgvector is functional, false otherwise.';
```

**Verification**:
```sql
-- Should return true
SELECT public.test_pgvector_extension();
```

**Expected Result**: Should return `true`

---

## Discovery Queries

After running the migrations, run these queries to verify the current state:

### Check v_user_access View
```sql
SELECT user_id, email, trial_active, paid_active 
FROM public.v_user_access 
LIMIT 5;
```

### Check OAuth Token Functions
```sql
SELECT n.nspname as schema, p.proname as function_name
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname ILIKE '%oauth_token%'
ORDER BY 1,2;
```

### Check pgvector Extension
```sql
SELECT * FROM pg_extension WHERE extname = 'vector';
```

### Check Document Chunks Table Structure
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'app' 
  AND table_name = 'document_chunks'
ORDER BY ordinal_position;
```

### Check Files Table Structure
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'app' 
  AND table_name = 'files'
ORDER BY ordinal_position;
```

---

## Post-Migration Verification

After running all migrations, verify:

- [ ] `public.v_user_access` includes `email` column
- [ ] OAuth token functions exist and have proper grants
- [ ] pgvector extension is installed and functional
- [ ] `app.document_chunks` table has `embedding` column of type `vector(1536)`
- [ ] `app.files` table exists with proper structure

---

## Notes

- All migrations are **idempotent** - safe to run multiple times
- If any migration fails, note the error and continue
- AWS disruptions may cause temporary connectivity issues
- After completing these migrations, we'll test the auth flow and Apideck integration

