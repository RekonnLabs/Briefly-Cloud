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
-
- Stable document counter that reads app.files
-- Auto-detects likely owner/status/delete columns for defensive programming
create or replace function public.bc_count_documents()
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  uid uuid := auth.uid();
  col_owner   text;
  col_deleted text;
  col_state   text;
  sql         text;
  cnt         integer;
begin
  -- Pick the most likely "owner" column
  select column_name into col_owner
  from information_schema.columns
  where table_schema = 'app' and table_name = 'files'
    and column_name in ('user_id','owner_id','created_by')
  order by case column_name when 'user_id' then 1 when 'owner_id' then 2 else 3 end
  limit 1;

  if col_owner is null then
    -- fall back to zero if we can't find an owner column
    return 0;
  end if;

  -- Optional "soft delete" column
  select column_name into col_deleted
  from information_schema.columns
  where table_schema = 'app' and table_name = 'files'
    and column_name in ('deleted_at','is_deleted')
  limit 1;

  -- Optional processing state column
  select column_name into col_state
  from information_schema.columns
  where table_schema = 'app' and table_name = 'files'
    and column_name in ('status','state')
  limit 1;

  sql := format('select count(*) from app.files where %I = $1', col_owner);

  if col_deleted is not null then
    -- treat null/false as "not deleted"
    sql := sql || format(' and (%I is null or %I = false)', col_deleted, col_deleted);
  end if;

  if col_state is not null then
    -- count only ready/processed/complete if such a column exists
    sql := sql || format(' and %I in (''ready'',''processed'',''complete'')', col_state);
  end if;

  execute sql using uid into cnt;
  return coalesce(cnt, 0);
end;
$$;

grant execute on function public.bc_count_documents() to authenticated;

-- Updated usage summary RPC with real document count
create or replace function public.bc_get_usage_summary()
returns table(
  documents_uploaded integer,
  ai_messages integer,
  storage_bytes bigint
)
language sql
security definer
set search_path = public, app
as $$
  select
    public.bc_count_documents()                         as documents_uploaded,
    coalesce(sum(query_count),   0)::int               as ai_messages,
    coalesce(sum(storage_bytes), 0)::bigint            as storage_bytes
  from public.usage
  where user_id = auth.uid()
$$;

grant execute on function public.bc_get_usage_summary() to authenticated;

-- Make PostgREST reload schema
select pg_notify('pgrst', 'reload schema');-- Use
r profile RPC to replace phantom users.name queries
create or replace function public.bc_get_user_profile()
returns table(
  id uuid,
  email text,
  full_name text,
  subscription_tier text,
  subscription_status text,
  trial_ends_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, app
as $$
  select
    u.id,
    u.email,
    u.full_name,
    u.subscription_tier,
    u.subscription_status,
    u.trial_ends_at,
    u.created_at,
    u.updated_at
  from app.users u
  where u.id = auth.uid()
$$;

grant execute on function public.bc_get_user_profile() to authenticated;