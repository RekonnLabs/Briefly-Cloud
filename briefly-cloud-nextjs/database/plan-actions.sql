-- Table this writes to. If yours is named differently, change here.
-- Expected columns: user_id uuid PK/unique, plan_tier text, plan_status text,
-- trial_ends_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now().

-- create table if not exists public.user_plans (
--   user_id uuid primary key,
--   plan_tier text not null default 'free',
--   plan_status text not null default 'inactive',
--   trial_ends_at timestamptz,
--   created_at timestamptz not null default now(),
--   updated_at timestamptz not null default now()
-- );

-- RLS should already be owner-only; keep it that way.

create or replace function public.bc_start_trial()
returns public.v_user_access
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  insert into public.user_plans as p (user_id, plan_tier, plan_status, trial_ends_at, updated_at)
  values (uid, 'trial', 'active', now() + interval '14 days', now())
  on conflict (user_id) do update
    set plan_tier    = 'trial',
        plan_status  = 'active',
        trial_ends_at= excluded.trial_ends_at,
        updated_at   = now();

  return (select u.* from public.v_user_access u where u.user_id = uid);
end
$$;

create or replace function public.bc_upgrade_to_pro()
returns public.v_user_access
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  insert into public.user_plans as p (user_id, plan_tier, plan_status, trial_ends_at, updated_at)
  values (uid, 'pro', 'active', null, now())
  on conflict (user_id) do update
    set plan_tier     = 'pro',
        plan_status   = 'active',
        trial_ends_at = null,
        updated_at    = now();

  return (select u.* from public.v_user_access u where u.user_id = uid);
end
$$;

revoke all on function public.bc_start_trial() from public;
revoke all on function public.bc_upgrade_to_pro() from public;
grant execute on function public.bc_start_trial() to authenticated;
grant execute on function public.bc_upgrade_to_pro() to authenticated;