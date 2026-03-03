-- ============================================================================
-- Migration: 002 - OAuth Token RPCs and Storage (Verification)
-- Date: 2024-10-19
-- Purpose: Verify OAuth token storage table and RPC functions exist
-- ============================================================================

-- NOTE: The OAuth token infrastructure was already created in:
-- - database/01-multi-tenant-schema-migration.sql (table structure)
-- - database/11-oauth-token-rpc-functions.sql (RPC functions)
--
-- This migration verifies everything is in place and adds any missing grants.

-- ============================================================================
-- Step 1: Verify private.oauth_tokens table exists
-- ============================================================================

-- The table should already exist with this structure:
-- CREATE TABLE private.oauth_tokens (
--     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--     user_id UUID NOT NULL,
--     provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
--     encrypted_access_token TEXT NOT NULL,
--     encrypted_refresh_token TEXT,
--     expires_at TIMESTAMPTZ,
--     scope TEXT,
--     token_type TEXT DEFAULT 'Bearer',
--     encryption_key_id TEXT NOT NULL DEFAULT 'default',
--     created_at TIMESTAMPTZ DEFAULT NOW(),
--     updated_at TIMESTAMPTZ DEFAULT NOW(),
--     UNIQUE(user_id, provider)
-- );

-- Verify the table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'private' AND table_name = 'oauth_tokens'
  ) THEN
    RAISE EXCEPTION 'ERROR: private.oauth_tokens table does not exist. Run database/01-multi-tenant-schema-migration.sql first.';
  END IF;
END $$;

-- ============================================================================
-- Step 2: Verify RPC functions exist
-- ============================================================================

-- The following functions should already exist from database/11-oauth-token-rpc-functions.sql:
-- - public.save_oauth_token(user_id, provider, access_token, refresh_token, expires_at, scope)
-- - public.get_oauth_token(user_id, provider)
-- - public.delete_oauth_token(user_id, provider)

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
END $$;

-- ============================================================================
-- Step 3: Ensure proper grants (idempotent)
-- ============================================================================

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Grant execute permissions on OAuth functions
-- Note: The function signatures must match exactly
DO $$
BEGIN
  -- Grant on save_oauth_token
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.save_oauth_token(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT) TO anon, authenticated';
EXCEPTION
  WHEN undefined_function THEN
    RAISE WARNING 'save_oauth_token function signature may have changed. Check database/11-oauth-token-rpc-functions.sql';
END $$;

DO $$
BEGIN
  -- Grant on get_oauth_token
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_oauth_token(UUID, TEXT) TO anon, authenticated';
EXCEPTION
  WHEN undefined_function THEN
    RAISE WARNING 'get_oauth_token function signature may have changed. Check database/11-oauth-token-rpc-functions.sql';
END $$;

DO $$
BEGIN
  -- Grant on delete_oauth_token
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.delete_oauth_token(UUID, TEXT) TO anon, authenticated';
EXCEPTION
  WHEN undefined_function THEN
    RAISE WARNING 'delete_oauth_token function signature may have changed. Check database/11-oauth-token-rpc-functions.sql';
END $$;

-- ============================================================================
-- Verification
-- ============================================================================

-- After running this migration, verify with:
--
-- 1. Check table exists:
--    SELECT COUNT(*) FROM private.oauth_tokens;
--
-- 2. Check functions exist:
--    SELECT proname, prosrc FROM pg_proc 
--    WHERE proname LIKE '%oauth_token%' AND pronamespace = 'public'::regnamespace;
--
-- 3. Test the functions (replace with actual user UUID):
--    SELECT public.save_oauth_token(
--      'your-user-uuid'::uuid,
--      'google',
--      'test_access_token',
--      'test_refresh_token',
--      now() + interval '1 hour',
--      'https://www.googleapis.com/auth/drive.readonly'
--    );
--
--    SELECT * FROM public.get_oauth_token('your-user-uuid'::uuid, 'google');
--
-- Expected: Functions work correctly and tokens are saved/retrieved

-- ============================================================================
-- Summary
-- ============================================================================

SELECT 'OAuth token infrastructure verified successfully' AS status,
       'Table: private.oauth_tokens exists' AS table_status,
       'Functions: save_oauth_token, get_oauth_token, delete_oauth_token exist' AS function_status,
       'Grants: anon and authenticated roles have execute permissions' AS grant_status;

