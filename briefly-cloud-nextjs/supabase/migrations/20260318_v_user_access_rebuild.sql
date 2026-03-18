-- Migration: Rebuild v_user_access view with trial_active, paid_active, effective_tier
-- Date: 2026-03-18
-- Drops dead functions (bc_start_trial, bc_upgrade_to_pro) and rebuilds the view
-- with correct columns that the application code reads.

-- Drop dead functions that were replaced by Stripe webhook handlers
DROP FUNCTION IF EXISTS public.bc_start_trial CASCADE;
DROP FUNCTION IF EXISTS public.bc_upgrade_to_pro CASCADE;

-- Drop old views (may have wrong column names from earlier schema iterations)
DROP VIEW IF EXISTS app.v_user_access CASCADE;
DROP VIEW IF EXISTS public.v_user_access CASCADE;

-- Recreate app.v_user_access with all columns the application needs:
--   trial_active    : boolean — true if user is on free tier with active trial
--   paid_active     : boolean — true if user has active paid subscription
--   effective_tier  : text   — 'pro' for paid/trial, 'boost' for boost, 'free' otherwise
CREATE OR REPLACE VIEW app.v_user_access AS
SELECT
  id                        AS user_id,
  email,
  subscription_tier,
  subscription_status,
  trial_end_date,
  -- trial_active: free tier user with a non-expired trial_end_date
  CASE
    WHEN subscription_tier = 'free'
     AND trial_end_date IS NOT NULL
     AND trial_end_date > NOW()
    THEN true
    ELSE false
  END                       AS trial_active,
  -- paid_active: subscription is active and tier is a paid plan
  (subscription_status = 'active'
   AND subscription_tier IN ('pro', 'pro_byok')) AS paid_active,
  -- effective_tier: what the user actually gets (trial users get 'pro')
  CASE
    WHEN subscription_tier IN ('pro', 'pro_byok')
     AND subscription_status = 'active'                   THEN 'pro'
    WHEN subscription_tier = 'free'
     AND trial_end_date IS NOT NULL
     AND trial_end_date > NOW()                           THEN 'pro'
    WHEN subscription_tier = 'boost'
     AND subscription_status = 'active'                   THEN 'boost'
    ELSE 'free'
  END                       AS effective_tier
FROM app.profiles;

GRANT SELECT ON app.v_user_access TO service_role, authenticated;

-- Public mirror for convenience (some code paths use public schema)
CREATE OR REPLACE VIEW public.v_user_access AS
SELECT * FROM app.v_user_access;

GRANT SELECT ON public.v_user_access TO service_role, authenticated;
