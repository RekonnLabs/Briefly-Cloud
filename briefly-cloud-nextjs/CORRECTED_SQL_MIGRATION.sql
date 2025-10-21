-- CORRECTED SQL MIGRATION
-- Based on actual schema inspection from Supabase Table Editor
-- Date: 2024-10-20
-- 
-- IMPORTANT: Run this in Supabase SQL Editor
-- URL: https://supabase.com/dashboard/project/aeeumarwdxepqibjbkaf/sql/new

-- ============================================================================
-- Migration 001: Fix public.v_user_access View
-- ============================================================================
-- Purpose: Update the view to include email column using app.profiles table
-- The view currently exists but references app.users which doesn't exist
-- The correct table is app.profiles

CREATE OR REPLACE VIEW public.v_user_access AS
SELECT 
  p.uuid                                                    AS user_id,
  p.email                                                   AS email,
  p.plan                                                    AS plan_tier,
  'active'                                                  AS plan_status,
  NULL                                                      AS trial_ends_at,
  FALSE                                                     AS trial_active,
  (p.plan IN ('pro', 'pro_byok'))                          AS paid_active
FROM app.profiles p;

-- Ensure proper grants (idempotent)
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT ON public.v_user_access TO authenticated, anon;

-- Add comment for documentation
COMMENT ON VIEW public.v_user_access IS 
  'Canonical view for user plan access. Sources from app.profiles. '
  'Used by /api/plan/status and storage OAuth gates. '
  'Updated 2024-10-20 to include email column and use correct table.';

-- Verification: Check the view works
SELECT 
  user_id, 
  email, 
  plan_tier, 
  trial_active, 
  paid_active 
FROM public.v_user_access 
LIMIT 5;

-- Expected result: Should show your rekonnlabs@gmail.com user with plan='free'

-- ============================================================================
-- Migration 002: Verify OAuth Token Infrastructure
-- ============================================================================
-- Purpose: Ensure OAuth token storage exists and has correct permissions

-- Check if oauth_tokens table exists in private schema
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'private' AND table_name = 'oauth_tokens'
  ) THEN
    RAISE NOTICE 'WARNING: private.oauth_tokens table does not exist';
    RAISE NOTICE 'This table should have been created by a previous migration';
    RAISE NOTICE 'Check if you need to run the multi-tenant schema migration first';
  ELSE
    RAISE NOTICE 'SUCCESS: private.oauth_tokens table exists';
  END IF;
END $$;

-- Check if RPC functions exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'save_oauth_token'
  ) THEN
    RAISE NOTICE 'WARNING: public.save_oauth_token function does not exist';
  ELSE
    RAISE NOTICE 'SUCCESS: public.save_oauth_token function exists';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_oauth_token'
  ) THEN
    RAISE NOTICE 'WARNING: public.get_oauth_token function does not exist';
  ELSE
    RAISE NOTICE 'SUCCESS: public.get_oauth_token function exists';
  END IF;
END $$;

-- ============================================================================
-- Migration 003: Verify pgvector Extension
-- ============================================================================
-- Purpose: Ensure pgvector extension is installed for document embeddings

-- Check if pgvector extension exists
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') 
    THEN 'SUCCESS: pgvector extension is installed'
    ELSE 'ERROR: pgvector extension is NOT installed - contact Supabase support'
  END AS pgvector_status;

-- Create test function for pgvector
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

-- Test the function
SELECT public.test_pgvector_extension() AS pgvector_test_result;
-- Expected: true

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these to verify everything is working

-- 1. Check v_user_access view
SELECT 'v_user_access check' AS test,
       COUNT(*) AS user_count,
       COUNT(CASE WHEN email IS NOT NULL THEN 1 END) AS users_with_email
FROM public.v_user_access;

-- 2. Check your specific user
SELECT 
  user_id,
  email,
  plan_tier,
  paid_active
FROM public.v_user_access
WHERE email = 'rekonnlabs@gmail.com';
-- Expected: Should return your user record

-- 3. Check document_chunks table structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'app' 
  AND table_name = 'document_chunks'
ORDER BY ordinal_position;
-- Expected: Should include 'embedding' column of type 'USER-DEFINED' (vector)

-- 4. Check files table structure  
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'app' 
  AND table_name = 'files'
ORDER BY ordinal_position;
-- Expected: Should show file metadata columns

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- After running this migration:
-- 1. The v_user_access view should include email column
-- 2. OAuth token infrastructure should be verified
-- 3. pgvector extension should be confirmed working
-- 4. You should be able to log in and access the app

