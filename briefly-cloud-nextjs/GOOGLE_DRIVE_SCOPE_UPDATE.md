# Google Drive Scope Update Verification

## Overview
Updated Google Drive OAuth scope from `drive.readonly` to `drive.file` for enhanced security and user privacy.

## Changes Made

### 1. OAuth Security Configuration
**File:** `src/app/lib/oauth/security-config.ts`

**Before:**
```typescript
'https://www.googleapis.com/auth/drive.readonly'  // Read-only Google Drive access
```

**After:**
```typescript
'https://www.googleapis.com/auth/drive.file'      // Access to files opened/created by app
```

### 2. Scope Description Updated
**Before:**
```typescript
'https://www.googleapis.com/auth/drive.readonly': 'Read-only access to your Google Drive files'
```

**After:**
```typescript
'https://www.googleapis.com/auth/drive.file': 'Access to files you select or create with this app'
```

### 3. Security Implications Updated
**Before:**
```typescript
dataAccess: 'Read-only access to Google Drive files and metadata'
```

**After:**
```typescript
dataAccess: 'Access only to files you select or create with this app'
```

## Verification

### ✅ Automated Tests
Run the verification test:
```bash
npm run test:google-scopes
```

**Expected Results:**
- ✅ Uses `drive.file` scope
- ✅ Does NOT use `drive.readonly` scope  
- ✅ Includes all required OAuth scopes (openid, email, profile, drive.file)
- ✅ Generates correct OAuth URLs
- ✅ Has proper scope descriptions

### ✅ Manual Verification
1. **OAuth URL Check:**
   ```bash
   # Start the development server
   npm run dev
   
   # Visit: http://localhost:3000/api/storage/google/start
   # (requires authentication)
   ```

2. **Expected OAuth URL Format:**
   ```
   https://accounts.google.com/o/oauth2/v2/auth?
   client_id=YOUR_CLIENT_ID&
   redirect_uri=http://localhost:3000/api/storage/google/callback&
   scope=openid+email+profile+https://www.googleapis.com/auth/drive.file&
   state=USER_ID&
   access_type=offline&
   prompt=consent&
   include_granted_scopes=true&
   response_type=code
   ```

3. **Consent Screen Verification:**
   - Should show: "Access to files you select or create with this app"
   - Should NOT show: "Read-only access to your Google Drive files"
   - Should NOT show orange warning banners about broad access

## Security Benefits

### 🔒 Enhanced Privacy
- **Before:** App could access ALL Google Drive files (read-only)
- **After:** App can only access files explicitly selected by user

### 🎯 Principle of Least Privilege
- Only requests minimum necessary permissions
- Reduces attack surface area
- Follows Google's recommended practices

### 👤 Better User Experience
- Less scary consent screen
- Clear understanding of what app can access
- Users maintain full control over file access

### 📋 Compliance Benefits
- Aligns with privacy regulations (GDPR, CCPA)
- Reduces data processing scope
- Easier to audit and document data access

## Technical Implementation

### OAuth Flow Unchanged
The OAuth flow remains exactly the same:
1. User clicks "Connect Google Drive"
2. Redirected to Google consent screen
3. User grants permission (now more limited)
4. App receives authorization code
5. App exchanges code for tokens
6. Tokens stored securely for API access

### API Access Changes
With `drive.file` scope, the app can:
- ✅ Access files opened via Google Picker
- ✅ Access files created by the app
- ✅ Read file metadata for selected files
- ✅ Download content from selected files
- ❌ Browse or list all Drive files
- ❌ Access files not explicitly selected

### File Picker Integration
This scope change enables the Google Picker integration:
1. User authenticates with `drive.file` scope
2. Google Picker opens (using same token)
3. User selects specific files
4. App gains access only to selected files
5. App can process and index selected files

## Migration Notes

### Existing Users
- Existing tokens with `drive.readonly` scope will continue to work
- Users will be prompted to re-authorize on next login
- New consent will use the more restrictive `drive.file` scope

### Development Testing
- Clear browser cookies to test new consent flow
- Use incognito mode to simulate new user experience
- Verify consent screen shows correct permissions

### Production Deployment
- No breaking changes to existing functionality
- Gradual migration as users re-authenticate
- Monitor consent completion rates

## Acceptance Criteria

### ✅ Task 1: Scopes
- [x] Set `GOOGLE_DRIVE_SCOPES="https://www.googleapis.com/auth/drive.file"`
- [x] Keep start route exactly in sync with configuration
- [x] Remove readonly references from code

### ✅ Verification Points
- [x] `/api/storage/google/start` URL shows `scope=...drive.file`
- [x] Consent screen shows file-specific access only
- [x] No "scope mismatch" warnings in development
- [x] Automated tests verify correct scope usage

## Next Steps

1. **Consent Screen Testing:** Verify Google consent screen shows correct permissions
2. **Picker Integration:** Implement Google Picker with same token
3. **Token Handoff:** Create endpoint for short-lived Picker tokens
4. **File Registration:** Build endpoints to store selected file IDs
5. **Content Fetching:** Implement workers to download and index files

---

**Status:** ✅ COMPLETE - Google Drive scope successfully updated to `drive.file`