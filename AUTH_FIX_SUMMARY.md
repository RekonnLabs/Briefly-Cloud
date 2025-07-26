# Critical Auth Fix - Black Screen Issue

## Problem Identified
The black screen after login was caused by the `/api/auth/profile` endpoint returning **422 Unprocessable Entity**. 

From the server logs:
```
INFO:     127.0.0.1:51269 - "GET /api/auth/profile HTTP/1.1" 422 Unprocessable Entity
```

## Root Cause
The auth profile endpoint was expecting a `user_id` parameter:
```python
@router.get("/profile")
async def get_profile(user_id: str):  # ❌ This expects a query parameter
```

But the frontend was calling it as a simple authenticated GET request:
```javascript
fetch('/api/auth/profile', {
  headers: { 'Authorization': `Bearer ${token}` }
})
```

## Fix Applied
Updated the profile endpoint to extract user ID from the JWT token in the Authorization header:

```python
@router.get("/profile")
async def get_profile(request: Request):
    # Extract token from Authorization header
    auth_header = request.headers.get("Authorization")
    token = auth_header.split(" ")[1]
    
    # Verify token with Supabase and get user ID
    user_response = supabase.auth.get_user(token)
    user_id = user_response.user.id
    
    # Return user profile data
```

## Additional Fixes
1. **Login Response Format**: Updated to return `token` instead of `access_token` to match frontend expectations
2. **User Profile Format**: Added `usage_count` and `usage_limit` fields for compatibility
3. **Error Handling**: Better error messages and logging
4. **Test Mode**: Added `?test=1` URL parameter to test auth in isolation

## Testing Instructions

### Option 1: Test Mode (Recommended)
1. Go to `http://localhost:5173/?test=1`
2. This loads a simple test component that isolates the auth flow
3. Check browser console for detailed logs
4. Should show user profile data if auth works

### Option 2: Normal App
1. Go to `http://localhost:5173/`
2. Login with valid credentials
3. Should now show the chat interface instead of black screen

### Option 3: Debug Panel
1. Login normally
2. Look for "Debug Panel" button in bottom-right
3. Click to see detailed API status and user data

## Expected Result
After this fix, the login flow should work as follows:
1. User enters credentials → Login successful (200 OK)
2. Frontend calls `/api/auth/profile` → Returns user data (200 OK)
3. App renders chat interface with user profile loaded

## Verification
Check server logs - you should see:
```
INFO: POST /api/auth/login HTTP/1.1" 200 OK
INFO: GET /api/auth/profile HTTP/1.1" 200 OK  # ✅ Should be 200, not 422
```

If you still see 422 errors, the auth route changes may not have been applied correctly.