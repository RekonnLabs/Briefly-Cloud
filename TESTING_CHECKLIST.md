# Testing Checklist - Black Screen Fix

## Issues Fixed ✅

### 1. Auth Profile Endpoint (Critical)
- **Problem**: `/api/auth/profile` returning 422 Unprocessable Entity
- **Fix**: Updated endpoint to extract user ID from JWT token
- **Status**: ✅ Fixed

### 2. Missing UI Components
- **Problem**: `Cannot find module './ui/alert'`
- **Fix**: Created Alert component with proper variants
- **Status**: ✅ Fixed

### 3. Token Storage Key
- **Problem**: UsageLimits using wrong token key
- **Fix**: Changed from `'token'` to `'supabase_token'`
- **Status**: ✅ Fixed

## Testing Steps

### Step 1: Test Auth Flow
1. Go to `http://localhost:5173/?test=1`
2. Should show "Simple Auth Test" page
3. Login should work and show user profile data
4. Check browser console for "SimpleTest:" logs

### Step 2: Test Main App
1. Go to `http://localhost:5173/`
2. Login with valid credentials
3. Should show chat interface (not black screen)
4. Check for Debug Panel button in bottom-right

### Step 3: Test UsageLimits Component
1. After successful login, look for usage information in UI
2. Should show progress bars for documents, chat, API calls, storage
3. No console errors about missing Alert component

## Expected Server Logs
```
POST /api/auth/login HTTP/1.1" 200 OK
GET /api/auth/profile HTTP/1.1" 200 OK  ← Should be 200, not 422
GET /api/storage/status HTTP/1.1" 200 OK
GET /api/chat/history HTTP/1.1" 200 OK
GET /api/embed/status HTTP/1.1" 200 OK
```

## Expected Browser Behavior
1. **Login Page**: Shows email/password form
2. **After Login**: Shows chat interface with:
   - User profile in header
   - Chat window in center
   - Usage information (if UsageLimits component is used)
   - No black screen
   - No console errors

## Debugging Tools Available
1. **Test Mode**: `?test=1` URL parameter
2. **Debug Panel**: Click button after login
3. **Browser Console**: Check for detailed logs
4. **Network Tab**: Verify API responses

## Common Issues & Solutions

### Still seeing black screen?
- Check browser console for JavaScript errors
- Use test mode (`?test=1`) to isolate auth issue
- Verify server is running on port 3001

### Auth still failing?
- Check if token is being stored: `localStorage.getItem('supabase_token')`
- Verify server logs show 200 OK for profile endpoint
- Use Debug Panel to see exact API responses

### UI components not rendering?
- Check for missing dependencies in console
- Verify all UI components exist in `client/src/components/ui/`
- Check Tailwind CSS is loading properly

## Success Criteria
- ✅ Login works without errors
- ✅ Chat interface renders after login
- ✅ No 422 errors in server logs
- ✅ User profile data loads correctly
- ✅ No missing module errors in console
- ✅ UsageLimits component renders (if used)

## Next Steps After Testing
1. Remove debug components (SimpleTest, DebugPanel) from production
2. Add proper error boundaries for better error handling
3. Implement proper loading states throughout the app
4. Add user feedback for API errors