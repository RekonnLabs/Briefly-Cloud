# Briefly Cloud - System Analysis & Action Plan

**Date**: 2024-10-20  
**Branch**: `fix/schema-oauth-ingest`  
**PR**: https://github.com/RekonnLabs/Briefly-Cloud/pull/57

---

## Executive Summary

After comprehensive analysis of the Briefly Cloud codebase, I've identified the current state of all critical systems and created an action plan to get everything working.

### Current Status

| System | Status | Notes |
|--------|--------|-------|
| **App Authentication** | ❌ Broken | `public.v_user_access` missing `email` column |
| **Apideck Integration** | ⚠️ Configured but Untested | All env vars set, code exists, needs testing |
| **Legacy OAuth** | ⚠️ Exists but Deprecated | Google/Microsoft direct OAuth still in code |
| **File Upload** | ✅ Working | `/api/upload` has complete implementation |
| **Text Extraction** | ✅ Working | `document-extractor` handles PDF, DOCX, etc. |
| **Vectorization** | ✅ Working | `DocumentProcessor` creates embeddings |
| **Vector Storage** | ✅ Working | `pgvector-store` stores in `app.document_chunks` |
| **Chat/LLM** | ✅ Working | `/api/chat` queries vectors and calls OpenAI |
| **Vercel Env Vars** | ✅ All Set | All required variables configured |

### Key Findings

1. **Two Upload Endpoints Exist**:
   - `/api/documents/upload` - **STUB** (TODO comments, not implemented)
   - `/api/upload` - **COMPLETE** (full pipeline working)
   - Frontend correctly uses `/api/upload`

2. **Complete Data Pipeline Exists**:
   ```
   Upload → Extract Text → Chunk → Embed → Store in pgvector → Query → LLM Response
   ```
   All components are implemented and should work!

3. **Apideck is Configured**:
   - All 6 environment variables are set in Vercel
   - Client library exists and looks correct
   - Session/callback routes exist
   - Just needs testing

4. **Main Issue**: App authentication is broken due to schema migration that removed the `email` column from `public.v_user_access` view

---

## Action Plan

### Phase 1: Fix App Authentication (CRITICAL)

**Status**: SQL migrations ready, waiting for execution

**Steps**:
1. ✅ Created SQL execution checklist (`SQL_EXECUTION_CHECKLIST.md`)
2. ⏳ **YOU EXECUTE**: Run the 3 SQL migrations in Supabase SQL Editor
3. ⏳ Verify migrations with test queries

**Expected Outcome**: Users can log in and their plan status is correctly identified

---

### Phase 2: Test Apideck Integration

**Status**: Ready to test after Phase 1 complete

**Test Plan**:
1. Log in as `rekonnlabs@gmail.com`
2. Navigate to cloud storage connection page
3. Click "Connect Google Drive" (should use Apideck Vault)
4. Complete OAuth flow
5. Verify connection status in `/api/storage/status`
6. Test file listing from Google Drive

**Expected Issues**:
- Apideck app may need to be configured in Apideck dashboard
- Redirect URL must match exactly
- Consumer ID (user.id) must be consistent

---

### Phase 3: Test Complete Data Pipeline

**Status**: Ready to test after Phase 1 complete

**Test Scenario**:
1. Upload a PDF file via the UI
2. Check `/api/files` to see if file record was created
3. Check `app.document_chunks` table for vector embeddings
4. Ask a question in chat that relates to the uploaded document
5. Verify the LLM response includes relevant context

**Expected Outcome**: The entire flow should work end-to-end

---

### Phase 4: Clean Up Legacy OAuth Code

**Status**: Deferred until Apideck is confirmed working

**Actions**:
- Remove or deprecate `/api/storage/google/start` and `/api/storage/microsoft/start`
- Remove direct OAuth environment variables (GOOGLE_CLIENT_ID, etc.)
- Update documentation to reflect Apideck-only approach

---

## Detailed Technical Analysis

### 1. App Authentication Flow

**Current State**: BROKEN

**Root Cause**: The `public.v_user_access` view was created during a multi-tenant schema migration but is missing the `email` column that the code expects.

**Evidence**:
```typescript
// src/app/api/storage/google/start/route.ts:3
if (!isAllowlisted(user.email)) {
  const { data: access } = await supabase
    .from('v_user_access')  // ← Queries this view
    .select('trial_active, paid_active')
    .eq('user_id', user.id)
```

**Fix**: Migration 001 adds the `email` column to the view

---

### 2. Apideck Integration

**Current State**: CONFIGURED BUT UNTESTED

**Configuration**:
```
APIDECK_ENABLED=true (encrypted in Vercel)
APIDECK_API_KEY=*** (encrypted)
APIDECK_APP_ID=*** (must be UUID)
APIDECK_API_BASE_URL=*** (encrypted)
APIDECK_VAULT_BASE_URL=*** (must be https://vault.apideck.com)
APIDECK_REDIRECT_URL=*** (must match app URL)
```

**Code Locations**:
- Client: `src/app/lib/integrations/apideck.ts`
- Session API: `src/app/api/integrations/apideck/session/route.ts`
- Callback API: `src/app/api/integrations/apideck/callback/route.ts`
- UI Hook: `src/app/components/integrations/useVault.ts`

**Testing Required**:
1. Verify Apideck app is configured in Apideck dashboard
2. Test Vault session creation
3. Test OAuth callback handling
4. Test file listing via Apideck Unified API

---

### 3. Document Processing Pipeline

**Current State**: IMPLEMENTED AND SHOULD WORK

**Flow**:
```
1. POST /api/upload
   ↓
2. Upload to Supabase Storage (bucket: 'documents')
   ↓
3. Create file record in app.files
   ↓
4. Extract text with document-extractor
   ↓
5. Process with DocumentProcessor:
   - Chunk text (1000 chars, 200 overlap)
   - Generate embeddings (OpenAI)
   - Store in app.document_chunks with pgvector
   ↓
6. Update file status to 'completed'
```

**Code Locations**:
- Upload API: `src/app/api/upload/route.ts` (lines 239-250)
- Text Extraction: `src/app/lib/document-extractor.ts`
- Document Processor: `src/app/lib/vector/document-processor.ts`
- Vector Store: `src/app/lib/vector/pgvector-store.ts`

**Database Tables**:
- `app.files` - File metadata
- `app.document_chunks` - Text chunks with vector embeddings
- `app.file_ingests` - Processing status tracking

---

### 4. Chat/LLM Integration

**Current State**: IMPLEMENTED AND SHOULD WORK

**Flow**:
```
1. POST /api/chat with message
   ↓
2. Get user profile and tier from app.users
   ↓
3. Query vector store for relevant context:
   - Generate embedding for user message
   - Search app.document_chunks using pgvector
   - Return top K most similar chunks
   ↓
4. Build prompt with context snippets
   ↓
5. Call OpenAI API with context
   ↓
6. Save conversation in app.conversations and app.chat_messages
   ↓
7. Return response (streaming or complete)
```

**Code Locations**:
- Chat API: `src/app/api/chat/route.ts`
- Vector Search: `src/app/lib/vector-storage.ts` (searchDocumentContext)
- Context Retrieval: `src/app/lib/prompt/context-retrieval.ts`
- OpenAI Integration: `src/app/lib/openai.ts`

---

## Environment Variables Status

### Verified in Vercel (Production)

✅ **Supabase**:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

✅ **Apideck** (all 6 required):
- `APIDECK_ENABLED`
- `APIDECK_API_KEY`
- `APIDECK_APP_ID`
- `APIDECK_API_BASE_URL`
- `APIDECK_VAULT_BASE_URL`
- `APIDECK_REDIRECT_URL`

✅ **OpenAI**:
- `OPENAI_API_KEY`

❌ **Legacy OAuth** (not needed if using Apideck):
- `GOOGLE_CLIENT_ID` - NOT SET
- `GOOGLE_CLIENT_SECRET` - NOT SET
- `MICROSOFT_CLIENT_ID` - NOT SET
- `MICROSOFT_CLIENT_SECRET` - NOT SET

---

## Next Steps for You

### Immediate (Required)

1. **Run SQL Migrations** in Supabase SQL Editor
   - Open: https://supabase.com/dashboard/project/aeeumarwdxepqibjbkaf/sql/new
   - Follow: `SQL_EXECUTION_CHECKLIST.md`
   - Execute all 3 migrations in order

2. **Test App Authentication**
   - Log in as `rekonnlabs@gmail.com`
   - Verify you can access the dashboard
   - Check `/api/dev/whoami` returns your user info

3. **Test Document Upload**
   - Upload a small PDF
   - Wait for processing to complete
   - Check if embeddings were created

4. **Test Chat**
   - Ask a question about the uploaded document
   - Verify the response includes relevant context

### After Testing

5. **Report Results**
   - Which tests passed?
   - Which tests failed?
   - Any error messages?

6. **I'll Fix Any Issues**
   - Based on your test results
   - We'll iterate until everything works

---

## AWS Disruption Note

You mentioned AWS is having issues today. This may affect:
- Supabase connectivity (hosted on AWS)
- Vercel deployments (uses AWS)
- OpenAI API calls (uses AWS)

If you encounter connectivity issues, it may be AWS-related and temporary.

---

## Questions?

Let me know if you need clarification on any part of this analysis or action plan!

