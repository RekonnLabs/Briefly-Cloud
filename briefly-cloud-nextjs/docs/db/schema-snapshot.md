# Database Schema Snapshot

**Generated**: 2024-10-19  
**Purpose**: Discovery phase for schema-oauth-ingest recovery  
**Supabase Project**: aeeumarwdxepqibjbkaf

## Instructions

Run each query below in the Supabase SQL Editor and paste the results in the corresponding section.

---

## 1.1 Tables & Columns

**Query**:
```sql
select table_schema, table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema not in ('pg_catalog','information_schema','extensions','storage')
order by table_schema, table_name, ordinal_position;
```

**Results**:
```
[PASTE RESULTS HERE]
```

---

## 1.2 Indexes

**Query**:
```sql
select n.nspname as schema, c.relname as tbl, i.relname as index_name,
       pg_get_indexdef(i.oid) as definition
from pg_class c
join pg_index x on x.indrelid = c.oid
join pg_class i on i.oid = x.indexrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname not in ('pg_catalog','information_schema','extensions','storage')
order by 1,2;
```

**Results**:
```
[PASTE RESULTS HERE]
```

---

## 1.3 RLS Status & Policies

**Query - RLS Enabled**:
```sql
select n.nspname as schema, c.relname as table_name, c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
  and n.nspname not in ('pg_catalog','information_schema','storage','extensions')
order by 1,2;
```

**Results**:
```
[PASTE RESULTS HERE]
```

**Query - Policies**:
```sql
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname not in ('pg_catalog','information_schema','storage','extensions')
order by 1,2,3;
```

**Results**:
```
[PASTE RESULTS HERE]
```

---

## 1.4 RPC Functions (OAuth + Vector)

**Query**:
```sql
select n.nspname as schema, p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname ilike any (array[
  '%oauth_token%', '%test_pgvector_extension%', '%get_oauth_token%', '%save_oauth_token%'
])
order by 1,2;
```

**Results**:
```
[PASTE RESULTS HERE]
```

---

## Analysis

### Current State
- [ ] `public.v_user_access` view exists
- [ ] `app.v_user_access` view exists  
- [ ] OAuth token functions exist in `public` schema
- [ ] `private.oauth_tokens` table exists
- [ ] `pgvector` extension installed
- [ ] `test_pgvector_extension()` function exists

### Issues Found
1. 
2. 
3. 

### Required Fixes
1. 
2. 
3. 

