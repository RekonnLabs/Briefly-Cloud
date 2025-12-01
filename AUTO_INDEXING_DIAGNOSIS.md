# Auto-Indexing After OAuth - Root Cause Analysis

**Date:** November 29, 2025  
**Issue:** APIDeck OAuth completes successfully, but no automatic file indexing occurs

---

## 🔍 Flow Analysis

### Current OAuth → Indexing Flow

```
1. User clicks "Connect Google Drive" 
   ↓
2. APIDeck Vault modal opens
   ↓
3. User completes OAuth with Google
   ↓
4. Redirects to /api/integrations/apideck/callback
   ↓
5. Callback saves connection to `apideck_connections` table
   ↓
6. Redirects to /briefly/app/dashboard?tab=storage&connected=1
   ↓
7. CloudStorage component detects `connected=1` parameter
   ↓
8. Waits 1 second, calls refreshConnectionStatus()
   ↓
9. refreshConnectionStatus() → checkConnectionStatus()
   ↓
10. Fetches /api/storage/status
   ↓
11. /api/storage/status calls getConnectionStatus(userId)
   ↓
12. getConnectionStatus() queries `apideck_connections` table
   ↓
13. Checks if status === 'healthy' || status === 'connected'
   ↓
14. Returns { google: { connected: true/false } }
   ↓
15. CloudStorage updates providers state
   ↓
16. Waits 2 more seconds
   ↓
17. Checks if googleProvider?.connected === true
   ↓
18. If true, calls startBatchImport('google', 'root')
   ↓
19. startBatchImport() → POST /api/storage/google/import/batch
   ↓
20. Import job created and polling begins
```

---

## ❌ IDENTIFIED BREAK POINTS

### Issue #1: Status Field Mismatch

**Location:** `/api/integrations/apideck/callback/route.ts` line 309

**Problem:**
```typescript
await supabaseAdmin.from('apideck_connections').upsert({
  user_id: params.user,
  provider: params.provider,
  consumer_id: params.consumer,
  connection_id: params.conn,
  status: params.status,  // ← This comes from APIDeck API
  updated_at: new Date().toISOString()
});
```

The `status` field is set to whatever APIDeck returns (likely `"connected"` or `"authorized"`).

**But the health check expects:**
```typescript
// src/app/lib/integrations/apideck-health-check.ts line 538
connected: google.status === 'healthy' || google.status === 'connected',
```

**Mismatch:** If APIDeck returns a status other than `'healthy'` or `'connected'`, the connection won't be detected as connected!

---

### Issue #2: Timing Race Condition

**Location:** `src/app/components/CloudStorage.tsx` lines 242-261

**Problem:**
```typescript
setTimeout(() => {
  refreshConnectionStatus();  // Takes ~200-500ms
  
  setTimeout(() => {
    // Check if connected - but state may not be updated yet!
    if (googleProvider?.connected) {
      startBatchImport('google', 'root');
    }
  }, 2000);
}, 1000);
```

**Race Condition:**
1. `refreshConnectionStatus()` is async but not awaited
2. It updates state via `setProviders()`
3. React state updates are not immediate
4. The second setTimeout checks `googleProvider?.connected` which may still be the OLD state
5. Auto-import doesn't trigger because `connected` is still `false`

---

### Issue #3: No Error Logging

**Problem:** If auto-import fails to trigger, there's no console log or error message indicating why.

**Missing Logs:**
- No log when `connected=1` parameter is detected
- No log showing the result of `refreshConnectionStatus()`
- No log showing whether `googleProvider?.connected` is true/false
- No log when auto-import is skipped

---

## 🛠️ RECOMMENDED FIXES

### Fix #1: Normalize Status Field (Critical)

**File:** `src/app/api/integrations/apideck/callback/route.ts`

**Change:**
```typescript
// Line 309 - Normalize status to 'connected'
await supabaseAdmin.from('apideck_connections').upsert({
  user_id: params.user,
  provider: params.provider,
  consumer_id: params.consumer,
  connection_id: params.conn,
  status: 'connected',  // ← Always use 'connected' for successful OAuth
  updated_at: new Date().toISOString()
});
```

**Rationale:** Ensure consistent status value that matches the health check logic.

---

### Fix #2: Await Connection Status Refresh (Critical)

**File:** `src/app/components/CloudStorage.tsx`

**Change:**
```typescript
// Lines 242-273 - Await the refresh before checking status
setTimeout(async () => {
  // Await the refresh to ensure state is updated
  await refreshConnectionStatus();
  
  // Wait a bit for React state to propagate
  setTimeout(() => {
    const googleProvider = providers.find(p => p.id === 'google');
    const msProvider = providers.find(p => p.id === 'microsoft');
    
    console.log('[auto-import] Connection status after refresh:', {
      google: googleProvider?.connected,
      microsoft: msProvider?.connected
    });
    
    if (googleProvider?.connected) {
      console.log('[auto-import] Triggering automatic import for Google Drive');
      startBatchImport('google', 'root');
    }
    if (msProvider?.connected) {
      console.log('[auto-import] Triggering automatic import for OneDrive');
      startBatchImport('microsoft', 'root');
    }
    
    if (!googleProvider?.connected && !msProvider?.connected) {
      console.warn('[auto-import] No providers connected after OAuth - auto-import skipped');
    }
  }, 1000);  // Reduced from 2000ms since we already awaited
}, 1000);
```

**Rationale:** 
- Await the async refresh operation
- Add comprehensive logging
- Reduce total wait time since we're awaiting

---

### Fix #3: Add Comprehensive Logging (Important)

**File:** `src/app/components/CloudStorage.tsx`

**Add logging throughout the flow:**

```typescript
// Line 225 - Log when connected parameter is detected
const connectedProvider = urlParams.get('connected');

if (connectedProvider) {
  console.log('[oauth-callback] Detected successful OAuth connection:', {
    provider: connectedProvider,
    timestamp: new Date().toISOString()
  });
  
  // ... existing code
}
```

```typescript
// In refreshConnectionStatus function
const refreshConnectionStatus = useCallback(async () => {
  console.log('[refresh-status] Starting connection status refresh');
  await checkConnectionStatus();
  console.log('[refresh-status] Connection status refresh complete');
}, []);
```

```typescript
// In checkConnectionStatus function
const checkConnectionStatus = async () => {
  try {
    console.log('[check-status] Fetching connection status from API');
    const response = await fetch('/api/storage/status');
    
    if (response.ok) {
      const data = await response.json();
      const statusData = data.data;
      
      console.log('[check-status] Received status:', statusData);
      
      setProviders(prev => prev.map(provider => {
        const providerKey = provider.id === 'google' ? 'google' : 'microsoft';
        const status = statusData[providerKey];
        
        console.log(`[check-status] ${provider.name}:`, {
          connected: status?.connected || false,
          status: status?.status,
          lastSync: status?.lastSync
        });
        
        return {
          ...provider,
          connected: status?.connected || false,
          lastSync: status?.lastSync,
          errorMessage: status?.errorMessage
        };
      }));
    }
  } catch (error) {
    console.error('[check-status] Error:', error);
  }
};
```

---

### Fix #4: Alternative Approach - Trigger Import from Callback (Alternative)

Instead of relying on client-side timing, trigger the import directly from the server callback.

**File:** `src/app/api/integrations/apideck/callback/route.ts`

**Add after successful connection save (line 350):**

```typescript
// After successful connection processing
if (processingStats.failedConnections === 0) {
  // Complete success - trigger automatic import
  logger.logRedirectDecision('success', 'All connections processed successfully', base + '&connected=1');
  
  // Trigger automatic import for each connected provider
  for (const connection of connections) {
    if (connection?.connection_id && connection?.service_id) {
      const provider = mapServiceIdToProvider(connection.service_id);
      
      try {
        // Trigger batch import job (fire and forget)
        const importEndpoint = provider === 'google' 
          ? `${process.env.NEXT_PUBLIC_SITE_URL}/api/storage/google/import/batch`
          : `${process.env.NEXT_PUBLIC_SITE_URL}/api/storage/microsoft/import/batch`;
        
        fetch(importEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${/* need to pass user session token */}`
          },
          body: JSON.stringify({
            folderId: 'root',
            batchSize: 5,
            maxRetries: 3
          })
        }).catch(err => {
          console.error('[auto-import] Failed to trigger import:', err);
        });
        
        console.log('[auto-import] Triggered automatic import for', provider);
      } catch (error) {
        console.error('[auto-import] Error triggering import:', error);
      }
    }
  }
  
  return NextResponse.redirect(base + '&connected=1&importing=1');
}
```

**Pros:**
- No timing issues
- Guaranteed to run after connection is saved
- More reliable

**Cons:**
- Requires passing authentication token to fetch
- More complex error handling
- Harder to debug

---

## 🧪 TESTING PLAN

### Test Scenario 1: Fresh OAuth Connection

1. Disconnect Google Drive (if connected)
2. Clear browser console
3. Click "Connect Google Drive"
4. Complete OAuth flow
5. **Expected:**
   - Console shows `[oauth-callback] Detected successful OAuth connection`
   - Console shows `[refresh-status] Starting connection status refresh`
   - Console shows `[check-status] google: { connected: true }`
   - Console shows `[auto-import] Triggering automatic import for Google Drive`
   - Import job starts and shows progress
6. **Actual (current):**
   - Auto-import doesn't trigger
   - No error messages

### Test Scenario 2: Already Connected

1. Ensure Google Drive is already connected
2. Refresh dashboard
3. **Expected:**
   - Shows as connected
   - No auto-import triggered (correct)
4. **Actual:**
   - Should work correctly

### Test Scenario 3: Connection Status Check

1. After OAuth, manually check database:
   ```sql
   SELECT * FROM apideck_connections WHERE user_id = '<user_id>';
   ```
2. **Expected:**
   - Row exists with `status = 'connected'`
3. **Actual (suspected):**
   - Row exists but `status` might be different value

---

## 📊 DEBUGGING CHECKLIST

### Server-Side Checks

- [ ] Check APIDeck callback logs in Vercel
- [ ] Verify connection is saved to `apideck_connections` table
- [ ] Check what `status` value is being saved
- [ ] Verify `/api/storage/status` returns `connected: true`

### Client-Side Checks

- [ ] Check browser console for OAuth callback detection
- [ ] Check if `refreshConnectionStatus()` is called
- [ ] Check if `/api/storage/status` API call succeeds
- [ ] Check if `providers` state is updated with `connected: true`
- [ ] Check if auto-import logic is reached
- [ ] Check if `startBatchImport()` is called

### Database Checks

```sql
-- Check connection status
SELECT * FROM apideck_connections 
WHERE user_id = '<user_id>' 
ORDER BY updated_at DESC;

-- Check if import jobs are created
SELECT * FROM import_jobs 
WHERE user_id = '<user_id>' 
ORDER BY created_at DESC;

-- Check if files are being imported
SELECT * FROM app.files 
WHERE owner_id = '<user_id>' 
ORDER BY created_at DESC;
```

---

## 🎯 RECOMMENDED ACTION

**Immediate Fix (30 minutes):**

1. ✅ **Fix #1:** Normalize status to `'connected'` in callback
2. ✅ **Fix #2:** Await `refreshConnectionStatus()` before checking
3. ✅ **Fix #3:** Add comprehensive logging

**Deploy and Test:**
1. Deploy fixes to production
2. Test OAuth flow with fresh connection
3. Monitor console logs
4. Verify auto-import triggers

**If Still Broken:**
1. Check Vercel logs for server-side errors
2. Check database for status values
3. Consider **Fix #4** (server-side trigger) as fallback

---

## 📝 SUMMARY

**Root Cause:** Combination of:
1. Status field mismatch between callback and health check
2. Race condition in client-side state updates
3. Lack of error logging making diagnosis difficult

**Solution:** Normalize status values, await async operations, add logging

**Confidence:** 🟢 **HIGH** - These are clear bugs that would prevent auto-import from working

**Estimated Fix Time:** 30-60 minutes including testing
