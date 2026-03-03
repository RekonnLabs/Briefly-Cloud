-- ============================================================================
-- Migration: 003 - pgvector Extension Test Function
-- Date: 2024-10-19
-- Purpose: Add diagnostic function to verify pgvector extension availability
-- ============================================================================

-- The application needs to verify that the pgvector extension is installed
-- before attempting to use vector operations. This function provides that check.

-- ============================================================================
-- Step 1: Ensure pgvector extension is installed
-- ============================================================================

create extension if not exists vector;

-- ============================================================================
-- Step 2: Create test function
-- ============================================================================

create or replace function public.test_pgvector_extension()
returns boolean 
language sql 
stable as $$
  select exists (select 1 from pg_extension where extname='vector');
$$;

comment on function public.test_pgvector_extension() is
  'Returns true if the pgvector extension is installed and available. '
  'Used by the application to verify vector operations are supported.';

-- ============================================================================
-- Step 3: Grant permissions
-- ============================================================================

grant execute on function public.test_pgvector_extension() to anon, authenticated;

-- ============================================================================
-- Verification
-- ============================================================================

-- After running this migration, verify with:
--
-- SELECT public.test_pgvector_extension();
--
-- Expected: Returns true
-- If false: The pgvector extension is not installed
-- Fix: Run `CREATE EXTENSION vector;` with superuser privileges

