# Database Migration Journal

This file tracks all database schema changes for the Briefly Cloud project.

## Format
```
YYYY-MM-DD – Description of change
```

---

## 2024-10-19 – Schema Recovery & OAuth Restoration

### Changes Applied

1. **2024-10-19** – Create canonical `public.v_user_access` view (sources `app.v_user_access`)
   - Purpose: Provide consistent billing/plan access interface for API routes
   - File: `database/migrations/001-public-user-access-view.sql`

2. **2024-10-19** – Ensure `public.{get,save}_oauth_token` RPCs + grants; `private.oauth_tokens` table present
   - Purpose: Restore OAuth token storage and retrieval functions
   - File: `database/migrations/002-oauth-token-rpcs.sql`

3. **2024-10-19** – Add `test_pgvector_extension` RPC for diagnostics
   - Purpose: Allow application to verify pgvector extension availability
   - File: `database/migrations/003-test-pgvector-extension.sql`

### Verification Steps

After applying migrations:
- [ ] Run discovery queries in `docs/db/schema-snapshot.md`
- [ ] Verify `/api/plan/status` returns correct data
- [ ] Test OAuth flow: `/api/storage/google/start` → callback → `/api/storage/status`
- [ ] Test file upload → ingest → vectorization
- [ ] Test chat API with uploaded documents

---

## Previous Changes

[Add historical changes here as discovered]

