-- Create user access view for plan gating
-- This view normalizes "who may enter" the app based on subscription status and trials

CREATE OR REPLACE VIEW public.v_user_access AS
SELECT 
  u.id                                                    AS user_id,
  u.subscription_tier                                     AS plan_tier,
  u.subscription_status                                   AS plan_status,
  u.trial_end_date                                        AS trial_ends_at,
  (u.subscription_status = 'trialing' AND u.trial_end_date > NOW())  AS trial_active,
  (u.subscription_status IN ('active', 'trialing') AND u.subscription_tier IN ('pro', 'pro_byok'))  AS paid_active
FROM app.users u;

-- Grant access to authenticated users (views don't support RLS, rely on underlying table RLS)
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.v_user_access TO authenticated;