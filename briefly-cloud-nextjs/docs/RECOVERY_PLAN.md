# Briefly Cloud - Recovery & Patch Plan

**Branch**: `fix/schema-oauth-ingest`  
**Goal**: Restore the full login → storage OAuth → upload → ingest/vectorize → chat flow  
**Date**: 2024-10-19

## Overview

This recovery plan addresses two critical issues:
1. **App Authentication (Supabase Auth)** - Broken by schema changes
2. **Cloud Storage OAuth (Apideck + Legacy)** - Not working properly

The plan is designed to be **idempotent** (no data loss), **research-friendly** (discover what exists first), and produce a **clear paper trail** in the repository.

---

## Prerequisites

- Access to Supabase SQL Editor: https://supabase.com/dashboard/project/aeeumarwdxepqibjbkaf
- Access to Vercel project for environment variables
- Test account: `rekonnlabs@gmail.com` (on allowlist)

---

## Step 0: Working Branch ✅

**Status**: COMPLETED

Branch `fix/schema-oauth-ingest` has been created. All changes go through PRs to this branch.

---

## Step 1: Discovery (No Changes)

**Status**: IN PROGRESS

### Instructions

1. Open Supabase SQL Editor
2. Run each query from `docs/db/schema-snapshot.md`
3. Paste results back into that file
4. Commit the completed snapshot

### Queries to Run

The following queries are documented in `docs/db/schema-snapshot.md`:

1. **Tables & Columns** - List all tables and their structure
2. **Indexes** - List all indexes
3. **RLS Status & Policies** - Check Row Level Security configuration
4. **RPC Functions** - Find OAuth and vector-related functions

### What We're Looking For

- [ ] Does `public.v_user_access` view exist?
- [ ] Does `app.v_user_access` view/table exist?
- [ ] Do OAuth token functions exist in `public` schema?
- [ ] Does `private.oauth_tokens` table exist?
- [ ] Is `pgvector` extension installed?
- [ ] Does `test_pgvector_extension()` function exist?

---

## Step 2: Canonical Plan View

**Status**: READY TO APPLY

### Purpose

The app expects `public.v_user_access` with columns:
- `user_id uuid`
- `email text`
- `trial_active bool`
- `paid_active bool`

This view is used by:
- `/api/plan/status` - Check user's plan status
- Storage OAuth gates - Verify user has access to cloud storage features

### Migration File

`database/migrations/001-public-user-access-view.sql`

### How to Apply

1. Open Supabase SQL Editor
2. Copy contents of `database/migrations/001-public-user-access-view.sql`
3. Execute the SQL
4. Verify with: `SELECT * FROM public.v_user_access LIMIT 5;`

### Expected Result

Query returns user records with `user_id`, `email`, `trial_active`, `paid_active`

### If It Fails

Check the error message. Most likely:
- `app.v_user_access` doesn't exist → Need to create it first
- Column names don't match → Need to adjust the SELECT statement

---

## Step 3: OAuth Token RPCs & Grants

**Status**: READY TO APPLY

### Purpose

The code calls `get_oauth_token()` and `save_oauth_token()` functions to store and retrieve OAuth tokens for Google Drive and OneDrive.

These functions must exist in the `public` schema and have proper grants.

### Migration File

`database/migrations/002-oauth-token-rpcs.sql`

### What It Creates

1. **Table**: `private.oauth_tokens` - Stores encrypted OAuth tokens
2. **Function**: `public.get_oauth_token(user_id, provider)` - Retrieves tokens
3. **Function**: `public.save_oauth_token(...)` - Saves tokens
4. **Grants**: Allows `anon` and `authenticated` roles to execute functions

### How to Apply

1. Open Supabase SQL Editor
2. Copy contents of `database/migrations/002-oauth-token-rpcs.sql`
3. Execute the SQL
4. Verify with the test queries in the file comments

### Expected Result

- Table `private.oauth_tokens` exists
- Functions can be called successfully
- Test save and retrieve works

---

## Step 4: Vector Extension Probe

**Status**: READY TO APPLY

### Purpose

The application needs to verify that the `pgvector` extension is installed before attempting vector operations (document embeddings).

### Migration File

`database/migrations/003-test-pgvector-extension.sql`

### What It Creates

1. **Extension**: `vector` (if not already installed)
2. **Function**: `public.test_pgvector_extension()` - Returns true if pgvector is available

### How to Apply

1. Open Supabase SQL Editor
2. Copy contents of `database/migrations/003-test-pgvector-extension.sql`
3. Execute the SQL
4. Verify with: `SELECT public.test_pgvector_extension();`

### Expected Result

Function returns `true`

---

## Step 5: Vercel Environment Variables

**Status**: NEEDS VERIFICATION

### Required Variables

Open Vercel → Project → Settings → Environment Variables and verify:

#### Supabase
```
NEXT_PUBLIC_SUPABASE_URL=https://aeeumarwdxepqibjbkaf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[from Supabase dashboard]
SUPABASE_SERVICE_ROLE_KEY=[from Supabase dashboard]
```

#### OpenAI & Models
```
OPENAI_API_KEY=[your key]
EMBEDDING_MODEL=text-embedding-3-small
CHAT_MODEL_FREE=[model name]
CHAT_MODEL_PRO=[model name]
```

#### OAuth Providers
```
GOOGLE_CLIENT_ID=[from Google Cloud Console]
GOOGLE_CLIENT_SECRET=[from Google Cloud Console]
MICROSOFT_CLIENT_ID=[from Azure Portal]
MICROSOFT_CLIENT_SECRET=[from Azure Portal]
```

#### Apideck (if using)
```
APIDECK_ENABLED=true
APIDECK_API_KEY=[from Apideck dashboard]
APIDECK_APP_ID=[from Apideck dashboard]
APIDECK_API_BASE_URL=https://unify.apideck.com
APIDECK_VAULT_BASE_URL=https://unify.apideck.com/vault
APIDECK_REDIRECT_URL=https://briefly.rekonnlabs.com/api/integrations/apideck/callback
```

#### Site URL
```
NEXT_PUBLIC_SITE_URL=https://briefly.rekonnlabs.com
```

#### Testing Allowlist
```
STORAGE_OAUTH_TEST_EMAILS=rekonnlabs@gmail.com
```

### Action

After verifying/updating variables, trigger a redeploy in Vercel.

---

## Step 6: Smoke Tests

**Status**: PENDING (after migrations applied)

### 6.1 Auth & Plan

**Test 1**: Visit `/api/dev/whoami`
- **Expected**: Shows current user information

**Test 2**: Visit `/api/plan/status`
- **Expected**: Returns JSON with `trial_active` and `paid_active` booleans
- **For rekonnlabs@gmail.com**: OAuth is allowed via allowlist regardless of plan

### 6.2 Storage OAuth (Google Drive)

**Test 3**: Connect Google Drive
1. Go to dashboard → Storage tab
2. Click "Connect Google Drive"
3. Complete OAuth consent
4. Return to `/api/storage/google/callback`

**Check Vercel Logs** for:
- `oauth_start` - OAuth flow initiated
- `oauth_success` - OAuth completed successfully
- RPC `save_oauth_token` call - Token saved to database

**Test 4**: Visit `/api/storage/status`
- **Expected**: `{"google":{"connected":true,"expiresAt":"..."}}`

**If not connected**: Copy the callback log line (contains error reason) and add to PR.

### 6.3 Upload → Ingest → Chunks

**Test 5**: Upload a PDF
1. Use dashboard uploader
2. Upload a small PDF file

**SQL Checks**:
```sql
-- Check file was created
select id, owner_id, original_name, created_at
from app.files order by created_at desc limit 3;

-- Check ingest status
select file_id, status, error_code, meta, updated_at
from app.file_ingest order by updated_at desc limit 3;

-- Check chunks were created
select file_id, count(*) chunks
from app.document_chunks group by file_id
order by 2 desc limit 3;
```

**Expected**:
- New file row exists
- Ingest status = `'processed'`
- Chunks count > 0

### 6.4 Chat (Non-Stream)

**Test 6**: Test chat API

Open DevTools console on dashboard:
```javascript
fetch('/api/chat',{
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({message:'Ping',stream:false})
}).then(r=>r.json()).then(console.log)
```

**Expected**: JSON reply from the model

**If 500 error**: Grab the Vercel log line and paste into PR.

---

## Step 7: Documentation Trail

**Status**: IN PROGRESS

Files to maintain:

1. **`docs/db/schema-snapshot.md`** - Database discovery results
2. **`docs/db/migration-journal.md`** - One-line entries for each change
3. **`docs/RECOVERY_PLAN.md`** - This file

Update after any structural change to prevent losing state.

---

## Step 8: Optional - Elevate Test User

**Status**: OPTIONAL

If you want `rekonnlabs@gmail.com` to appear as paid in the UI (without Stripe):

```sql
-- If app.v_user_access is a TABLE:
update app.v_user_access
set paid_active = true, trial_active = true
where email = 'rekonnlabs@gmail.com';

-- If it's a VIEW, update the underlying table:
-- (Adjust table/columns to your reality)
update public.user_plans
set status = 'active', trial_end_at = now() + interval '365 days'
where user_id = '<rekonnlabs-user-uuid>';
```

**Safer default**: Keep the allowlist (already in place) and let plan flags reflect real billing later.

---

## Step 9: Deliverables Checklist

Before creating the PR, ensure:

- [ ] `docs/db/schema-snapshot.md` populated with query results
- [ ] `docs/db/migration-journal.md` updated with entries
- [ ] All 3 SQL migrations executed in Supabase:
  - [ ] `001-public-user-access-view.sql`
  - [ ] `002-oauth-token-rpcs.sql`
  - [ ] `003-test-pgvector-extension.sql`
- [ ] Vercel environment variables verified
- [ ] Screenshots or log excerpts proving:
  - [ ] `/api/plan/status` works
  - [ ] `/api/storage/status` shows Google connected after OAuth
  - [ ] Upload → ingest → chunks present
  - [ ] `/api/chat` "Ping" works

---

## Important Notes

### Do Not Drop Tables

All scripts use `create if not exists` or `create or replace view`. No data will be lost.

### If Mismatches Found

If a view can't read source tables, note the exact error in the PR and we'll adjust the SQL.

### "Plan Required" Error During OAuth

If you see this error:
1. Confirm `public.v_user_access` exists
2. Verify it returns expected booleans
3. Remember: allowlist bypasses the check for `rekonnlabs@gmail.com`

---

## Next Steps

1. **Run Discovery Queries** (Step 1)
2. **Apply Migrations** (Steps 2-4)
3. **Verify Environment** (Step 5)
4. **Run Smoke Tests** (Step 6)
5. **Create PR** with all documentation and test results

---

## Support

If you encounter issues:
1. Check the error message carefully
2. Review the verification steps in each migration file
3. Document the exact error in the PR
4. We'll adjust the approach based on your findings

