# Profitability Schema Audit & Implementation Plan

**Date:** November 3, 2025  
**Goal:** Implement cost-effective indexing guardrails to ensure sustainable operations

---

## 1. Current State Analysis

### ✅ Existing Infrastructure

| Component | Status | Details |
|-----------|--------|---------|
| **Embedding Provider** | ✅ Configured | OpenAI `text-embedding-3-small` @ $0.00002/1k tokens |
| **Vector Storage** | ✅ Configured | Supabase pgvector (1536 dimensions) |
| **Document Chunking** | ✅ Implemented | `src/app/lib/document-chunker.ts` |
| **Batch Processing** | ✅ Implemented | `ImportJobManager` with job tracking |
| **Usage Tracking (Basic)** | ✅ Implemented | Columns in `app.users` table |
| **Duplicate Detection** | ⚠️ Partial | Content hash in ImportJobManager, but not persisted |
| **RLS Policies** | ✅ Configured | Row-level security on all app schema tables |

### ❌ Missing Components (Critical for Profitability)

| Component | Priority | Impact |
|-----------|----------|--------|
| **Checksum Column** | 🔴 High | Prevents duplicate vectorization costs |
| **Last Accessed Tracking** | 🔴 High | Enables retention cleanup |
| **Tier Limits Enforcement** | 🔴 High | Prevents abuse and cost overruns |
| **Embedding Token Tracking** | 🟡 Medium | Cost attribution and analytics |
| **BYOK Feature** | 🟢 Low | Revenue opportunity (Pro tier) |
| **User Usage Table** | 🟡 Medium | Granular usage analytics |
| **Quota Middleware** | 🔴 High | Prevents exceeding limits |

---

## 2. Tier Limits Comparison

### Current Limits (Database)
```sql
-- app.users table defaults
documents_limit: 25 files
storage_limit_bytes: 104857600 (100 MB)
chat_messages_limit: 100
api_calls_limit: 1000
```

### Spec Requirements (Profitability-Driven)

| Tier | Files | Storage | Trial | Retention | Monthly Cost |
|------|-------|---------|-------|-----------|--------------|
| **Free/Trial** | 5 | 25 MB | 14 days | 30 days inactive | $0 |
| **Pro (BYOK)** | 50 | 150 MB | N/A | 60 days inactive | $15/mo |
| **Pro (LLM)** | 50 | 150 MB | N/A | 60 days inactive | $25/mo |

**Action Required:** Update default limits in database migration

---

## 3. Schema Changes Required

### 3.1 Add Columns to `app.files`

```sql
ALTER TABLE app.files 
  ADD COLUMN IF NOT EXISTS checksum TEXT,
  ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS retention_expires_at TIMESTAMPTZ;

-- Create index for duplicate detection
CREATE INDEX IF NOT EXISTS idx_files_checksum_user 
  ON app.files(user_id, checksum) 
  WHERE checksum IS NOT NULL;

-- Create index for retention cleanup
CREATE INDEX IF NOT EXISTS idx_files_retention_expires 
  ON app.files(retention_expires_at) 
  WHERE retention_expires_at IS NOT NULL;
```

**Purpose:**
- `checksum`: SHA-256 hash for duplicate detection
- `last_accessed_at`: Track when file was last used in chat
- `retention_expires_at`: Calculated expiry date based on tier

### 3.2 Create `app.user_usage` Table

```sql
CREATE TABLE app.user_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  
  -- File usage
  files_used INTEGER DEFAULT 0,
  storage_used_mb NUMERIC(10,2) DEFAULT 0,
  
  -- Embedding usage
  embedding_tokens_used INTEGER DEFAULT 0,
  embedding_cost_usd NUMERIC(10,4) DEFAULT 0,
  
  -- Chat usage
  chat_messages_used INTEGER DEFAULT 0,
  chat_tokens_used INTEGER DEFAULT 0,
  chat_cost_usd NUMERIC(10,4) DEFAULT 0,
  
  -- Metadata
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, period_start)
);

-- Enable RLS
ALTER TABLE app.user_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own usage
CREATE POLICY "Users can view own usage"
  ON app.user_usage FOR SELECT
  USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX idx_user_usage_user_period 
  ON app.user_usage(user_id, period_start DESC);
```

**Purpose:** Track granular usage per billing period for analytics and cost attribution

### 3.3 Create `v_user_limits` View

```sql
CREATE OR REPLACE VIEW app.v_user_limits AS
SELECT 
  u.id AS user_id,
  u.subscription_tier,
  u.subscription_status,
  u.trial_end_date,
  
  -- Current usage
  u.documents_uploaded AS files_used,
  u.storage_used_bytes / (1024 * 1024) AS storage_used_mb,
  u.chat_messages_count AS chat_messages_used,
  
  -- Tier limits
  CASE u.subscription_tier
    WHEN 'free' THEN 5
    WHEN 'pro' THEN 50
    WHEN 'pro_byok' THEN 50
    ELSE 5
  END AS files_limit,
  
  CASE u.subscription_tier
    WHEN 'free' THEN 25
    WHEN 'pro' THEN 150
    WHEN 'pro_byok' THEN 150
    ELSE 25
  END AS storage_limit_mb,
  
  CASE u.subscription_tier
    WHEN 'free' THEN 100
    WHEN 'pro' THEN 1000
    WHEN 'pro_byok' THEN 1000
    ELSE 100
  END AS chat_messages_limit,
  
  -- Retention period (days)
  CASE u.subscription_tier
    WHEN 'free' THEN 30
    WHEN 'pro' THEN 60
    WHEN 'pro_byok' THEN 60
    ELSE 30
  END AS retention_days,
  
  -- Trial status
  CASE 
    WHEN u.trial_end_date IS NULL THEN FALSE
    WHEN u.trial_end_date > NOW() THEN TRUE
    ELSE FALSE
  END AS is_trial_active,
  
  -- Days remaining in trial
  CASE 
    WHEN u.trial_end_date IS NULL THEN 0
    WHEN u.trial_end_date > NOW() THEN 
      EXTRACT(DAY FROM (u.trial_end_date - NOW()))::INTEGER
    ELSE 0
  END AS trial_days_remaining,
  
  -- Quota checks
  u.documents_uploaded >= CASE u.subscription_tier
    WHEN 'free' THEN 5
    WHEN 'pro' THEN 50
    WHEN 'pro_byok' THEN 50
    ELSE 5
  END AS files_limit_reached,
  
  u.storage_used_bytes >= CASE u.subscription_tier
    WHEN 'free' THEN 25 * 1024 * 1024
    WHEN 'pro' THEN 150 * 1024 * 1024
    WHEN 'pro_byok' THEN 150 * 1024 * 1024
    ELSE 25 * 1024 * 1024
  END AS storage_limit_reached,
  
  u.chat_messages_count >= CASE u.subscription_tier
    WHEN 'free' THEN 100
    WHEN 'pro' THEN 1000
    WHEN 'pro_byok' THEN 1000
    ELSE 100
  END AS chat_limit_reached
  
FROM app.users u;

-- Grant access to authenticated users
GRANT SELECT ON app.v_user_limits TO authenticated;
```

**Purpose:** Centralized view for quota enforcement and UI display

### 3.4 Update `app.users` Default Limits

```sql
-- Update default limits to match Free tier spec
ALTER TABLE app.users 
  ALTER COLUMN documents_limit SET DEFAULT 5,
  ALTER COLUMN storage_limit_bytes SET DEFAULT 26214400; -- 25 MB

-- Update existing free tier users (optional, discuss first)
-- UPDATE app.users 
-- SET 
--   documents_limit = 5,
--   storage_limit_bytes = 26214400
-- WHERE subscription_tier = 'free';
```

---

## 4. Middleware & Enforcement Logic

### 4.1 Quota Enforcement Middleware

**File:** `src/app/lib/middleware/quota-enforcement.ts`

```typescript
import { createClient } from '@supabase/supabase-js'
import { createError } from '@/app/lib/api-errors'

export interface QuotaCheckResult {
  allowed: boolean
  reason?: string
  limits: {
    files_used: number
    files_limit: number
    storage_used_mb: number
    storage_limit_mb: number
    chat_messages_used: number
    chat_messages_limit: number
  }
}

export async function checkFileUploadQuota(
  userId: string,
  fileSizeBytes: number
): Promise<QuotaCheckResult> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: limits, error } = await supabase
    .from('v_user_limits')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error || !limits) {
    throw createError.internal('Failed to check quota')
  }

  // Check file count limit
  if (limits.files_limit_reached) {
    return {
      allowed: false,
      reason: `File limit reached (${limits.files_limit} files)`,
      limits
    }
  }

  // Check storage limit
  const newStorageUsedMb = limits.storage_used_mb + (fileSizeBytes / (1024 * 1024))
  if (newStorageUsedMb > limits.storage_limit_mb) {
    return {
      allowed: false,
      reason: `Storage limit exceeded (${limits.storage_limit_mb} MB)`,
      limits
    }
  }

  return {
    allowed: true,
    limits
  }
}

export async function checkChatMessageQuota(userId: string): Promise<QuotaCheckResult> {
  // Similar implementation for chat messages
  // ...
}
```

### 4.2 Hash-Based Deduplication

**File:** `src/app/lib/deduplication.ts`

```typescript
import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'

export async function calculateFileChecksum(
  fileBuffer: Buffer
): Promise<string> {
  return createHash('sha256').update(fileBuffer).digest('hex')
}

export async function checkDuplicateFile(
  userId: string,
  checksum: string
): Promise<{ isDuplicate: boolean; existingFileId?: string }> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase
    .from('files')
    .select('id')
    .eq('user_id', userId)
    .eq('checksum', checksum)
    .limit(1)
    .single()

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
    throw new Error('Failed to check for duplicates')
  }

  return {
    isDuplicate: !!data,
    existingFileId: data?.id
  }
}
```

---

## 5. Retention & Cleanup Jobs

### 5.1 Retention Calculation Trigger

```sql
CREATE OR REPLACE FUNCTION app.calculate_retention_expiry()
RETURNS TRIGGER AS $$
DECLARE
  retention_days INTEGER;
BEGIN
  -- Get retention period based on user's tier
  SELECT 
    CASE subscription_tier
      WHEN 'free' THEN 30
      WHEN 'pro' THEN 60
      WHEN 'pro_byok' THEN 60
      ELSE 30
    END INTO retention_days
  FROM app.users
  WHERE id = NEW.user_id;
  
  -- Set retention expiry date
  NEW.retention_expires_at := NEW.last_accessed_at + (retention_days || ' days')::INTERVAL;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER set_file_retention_expiry
  BEFORE INSERT OR UPDATE OF last_accessed_at ON app.files
  FOR EACH ROW
  EXECUTE FUNCTION app.calculate_retention_expiry();
```

### 5.2 Cleanup Job (Cron or Manual)

```sql
-- Function to clean up expired files
CREATE OR REPLACE FUNCTION app.cleanup_expired_files()
RETURNS TABLE(deleted_count INTEGER, freed_bytes BIGINT) AS $$
DECLARE
  total_deleted INTEGER := 0;
  total_freed BIGINT := 0;
BEGIN
  -- Delete expired files and their chunks
  WITH deleted_files AS (
    DELETE FROM app.files
    WHERE retention_expires_at < NOW()
      AND last_accessed_at < NOW() - INTERVAL '7 days' -- Safety buffer
    RETURNING id, user_id, size
  )
  SELECT COUNT(*), SUM(size) INTO total_deleted, total_freed
  FROM deleted_files;
  
  -- Update user storage usage
  UPDATE app.users u
  SET storage_used_bytes = (
    SELECT COALESCE(SUM(size), 0)
    FROM app.files f
    WHERE f.user_id = u.id
  );
  
  RETURN QUERY SELECT total_deleted, total_freed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 6. Implementation Phases

### Phase 1: Schema Updates ✅ (Current Phase)
- [ ] Add `checksum`, `last_accessed_at`, `retention_expires_at` to `app.files`
- [ ] Create `app.user_usage` table
- [ ] Create `v_user_limits` view
- [ ] Update default tier limits in `app.users`
- [ ] Add retention calculation trigger

### Phase 2: Quota Enforcement Middleware
- [ ] Create `quota-enforcement.ts` middleware
- [ ] Add quota checks to file upload API
- [ ] Add quota checks to batch import API
- [ ] Add quota checks to chat message API
- [ ] Update error responses with upgrade prompts

### Phase 3: Deduplication Logic
- [ ] Create `deduplication.ts` utility
- [ ] Update file upload flow to calculate checksums
- [ ] Update batch import to skip duplicate files
- [ ] Add "duplicate skipped" status to job tracking
- [ ] Update UI to show duplicate detection

### Phase 4: Retention & Cleanup
- [ ] Deploy retention calculation trigger
- [ ] Create cleanup job function
- [ ] Schedule daily cleanup cron job
- [ ] Add cleanup monitoring and alerts
- [ ] Update user dashboard to show retention status

### Phase 5: Usage Tracking & Analytics
- [ ] Track embedding token usage in vectorization
- [ ] Track chat token usage in LLM calls
- [ ] Populate `app.user_usage` table
- [ ] Create usage analytics dashboard
- [ ] Add cost attribution reports

### Phase 6: BYOK Feature (Future)
- [ ] Add `openai_api_key` column to `app.users` (encrypted)
- [ ] Create BYOK settings page
- [ ] Validate user-provided API keys
- [ ] Update embeddings service to use user keys
- [ ] Update chat service to use user keys

---

## 7. Cost Calculations

### Current Embedding Costs (text-embedding-3-small)
- **Cost per 1k tokens:** $0.00002
- **Average document:** ~5,000 tokens (5 pages)
- **Cost per document:** $0.0001 (0.01 cents)

### Monthly Cost Projections

| Tier | Files | Embedding Cost | Storage Cost | Total/User |
|------|-------|----------------|--------------|------------|
| **Free** | 5 | $0.0005 | ~$0.001 | **$0.0015** |
| **Pro** | 50 | $0.005 | ~$0.01 | **$0.015** |

**Margins:**
- Free tier: $0 revenue, $0.0015 cost = **Loss leader**
- Pro (BYOK): $15 revenue, $0.015 cost = **99.9% margin**
- Pro (LLM): $25 revenue, $0.015 cost + chat costs = **~95% margin**

---

## 8. Testing Checklist

### Unit Tests
- [ ] Quota enforcement logic
- [ ] Checksum calculation
- [ ] Duplicate detection
- [ ] Retention calculation

### Integration Tests
- [ ] File upload with quota exceeded
- [ ] Duplicate file upload (should skip vectorization)
- [ ] Retention expiry trigger
- [ ] Cleanup job execution

### E2E Tests
- [ ] Free tier user hits file limit
- [ ] Pro tier user uploads 50 files
- [ ] Duplicate file shows "already indexed" message
- [ ] Inactive files get cleaned up after retention period

---

## 9. Rollout Plan

### Step 1: Schema Migration (Non-Breaking)
```bash
# Run migration on production
psql $DATABASE_URL -f database/migrations/20-profitability-schema.sql
```

### Step 2: Deploy Middleware (Feature Flag)
```typescript
// Enable quota enforcement gradually
const QUOTA_ENFORCEMENT_ENABLED = process.env.ENABLE_QUOTA_ENFORCEMENT === 'true'
```

### Step 3: Monitor & Adjust
- Track quota rejection rates
- Monitor user upgrade conversions
- Adjust limits based on actual costs

### Step 4: Enable Cleanup Jobs
```bash
# Schedule daily cleanup at 2 AM UTC
0 2 * * * psql $DATABASE_URL -c "SELECT app.cleanup_expired_files();"
```

---

## 10. Next Steps

**Immediate Actions:**
1. ✅ Review this audit document
2. ⏭️ Create schema migration SQL file
3. ⏭️ Test migration on development database
4. ⏭️ Deploy to production
5. ⏭️ Implement quota enforcement middleware
6. ⏭️ Update UI to show quota status

**Questions for User:**
1. Should we update existing free tier users to new limits (5 files instead of 25)?
2. Do you want BYOK feature implemented now or later?
3. Should cleanup jobs run automatically or require manual trigger initially?
4. What should happen when trial expires - hard block or grace period?

---

**Status:** Ready for Phase 1 implementation
**Estimated Time:** 2-3 hours for complete implementation
**Risk Level:** Low (non-breaking changes with feature flags)

