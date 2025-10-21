-- Migration 001: Fix public.v_user_access View (CORRECTED)
-- Purpose: Add email column to the view using app.profiles table
-- Date: 2024-10-20
-- Status: Idempotent (safe to run multiple times)

-- Update the view to include email (idempotent)
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
  'Updated 2024-10-20 to include email column and use app.profiles.';

-- Verification query
SELECT 'Migration 001 completed successfully' AS status,
       COUNT(*) AS total_users,
       COUNT(CASE WHEN paid_active THEN 1 END) AS paid_users
FROM public.v_user_access;
