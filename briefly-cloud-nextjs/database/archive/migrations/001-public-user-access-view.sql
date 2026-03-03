-- ============================================================================
-- Migration: 001 - Public User Access View (Fix)
-- Date: 2024-10-19
-- Purpose: Update public.v_user_access view to include email column
-- ============================================================================

-- The app expects public.v_user_access with columns:
-- user_id uuid, email text, trial_active bool, paid_active bool
--
-- The view already exists but is missing the email column.
-- This migration adds it without breaking existing code.

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
  'Updated 2024-10-19 to include email column.';

-- ============================================================================
-- Verification
-- ============================================================================

-- After running this migration, verify with:
-- SELECT user_id, email, trial_active, paid_active FROM public.v_user_access LIMIT 5;
--
-- Expected: Returns user_id, email, trial_active, paid_active for users
-- The email column should now be present

