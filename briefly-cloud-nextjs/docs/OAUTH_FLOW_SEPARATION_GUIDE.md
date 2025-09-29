# OAuth Flow Separation Developer Guide

## Overview

This document provides comprehensive guidelines for maintaining proper separation between main authentication flows and cloud storage connection flows in the Briefly Cloud application.

## OAuth Flow Types

### 1. Main Authentication Flow (Supabase Auth)

**Purpose**: User login/signup to the application
**Routes**: `/auth/start?provider={google|azure}` → `/auth/callback`
**Handler**: Supabase Auth with PKCE flow
**Scope**: User identity and basic profile information

**When to use**:
- User needs to sign in to the application
- User needs to create a new account
- User needs to authenticate their identity

**Components that should use this flow**:
- `SupabaseAuthProvider.tsx`
- Authentication pages (`auth/signin/page.tsx`)
- Login/signup forms
- Any component handling user authentication

### 2. Storage Connection Flow (Custom OAuth)

**Purpose**: Connect cloud storage accounts for authenticated users
**Routes**: `/api/storage/{provider}/start` → `/api/storage/{provider}/callback`
**Handler**: Custom OAuth implementation with token storage
**Scope**: Cloud storage access (Google Drive, OneDrive)

**When to use**:
- User wants to connect Google Drive or OneDrive
- User needs to access files from cloud storage
- User wants to import documents from cloud storage

**Components that should use this flow**:
- `CloudStorage.tsx`
- `GooglePicker.tsx` (uses stored tokens)
- Any component handling cloud storage integration

## Route Reference Guide

### ✅ Correct Usage

#### Main Authentication Routes
```typescript
// User login/signup
const signInUrl = `/auth/start?provider=google&next=${encodeURIComponent('/dashboard')}`
const signInUrl = `/auth/start?provider=azure&next=${encodeURIComponent('/dashboard')}`

// Used in: SupabaseAuthProvider.tsx, auth pages
```

#### Storage OAuth Routes
```typescript
// Cloud storage connection
const googleStorageUrl = '/api/storage/google/start'
const microsoftStorageUrl = '/api/storage/microsoft/start'

// Used in: CloudStorage.tsx, storage-related components
```

### ❌ Incorrect Usage

#### DON'T Mix Routes
```typescript
// ❌ WRONG: Using auth routes for storage
const wrongStorageUrl = '/auth/start?provider=google' // This is for user auth, not storage!

// ❌ WRONG: Using storage routes for auth
const wrongAuthUrl = '/api/storage/google/start' // This is for storage, not user auth!
```

## Component Guidelines

### Authentication Components

**File**: `src/app/components/auth/SupabaseAuthProvider.tsx`
**Responsibility**: Handle user authentication only
**Allowed Routes**: `/auth/start?provider=...`
**Forbidden Routes**: `/api/storage/{provider}/start`

```typescript
// ✅ Correct
const signIn = async (provider: 'google' | 'microsoft') => {
  const authProvider = provider === 'microsoft' ? 'azure' : provider
  const startUrl = `/auth/start?provider=${authProvider}&next=${next}`
  window.location.href = startUrl
}

// ❌ Wrong
const signIn = async (provider: 'google' | 'microsoft') => {
  const startUrl = `/api/storage/${provider}/start` // This is for storage, not auth!
  window.location.href = startUrl
}
```

### Storage Components

**File**: `src/app/components/CloudStorage.tsx`
**Responsibility**: Handle cloud storage connections only
**Allowed Routes**: `/api/storage/{provider}/start`
**Forbidden Routes**: `/auth/start?provider=...`

```typescript
// ✅ Correct
const connectProvider = async (providerId: 'google' | 'microsoft') => {
  const startUrl = providerId === 'google' 
    ? '/api/storage/google/start'
    : '/api/storage/microsoft/start'
  // ... rest of implementation
}

// ❌ Wrong
const connectProvider = async (providerId: 'google' | 'microsoft') => {
  const startUrl = `/auth/start?provider=${providerId}` // This is for user auth, not storage!
  // ... rest of implementation
}
```

## Authentication Requirements

### Storage OAuth Routes Require Authentication AND Subscription

All storage OAuth routes require the user to be authenticated AND have an active subscription:

```typescript
// ✅ Correct: Check authentication before storage connection
const connectProvider = async (providerId: 'google' | 'microsoft') => {
  // Verify user is authenticated
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    // Redirect to login with return URL
    window.location.href = `/auth/signin?next=${encodeURIComponent('/dashboard?tab=storage')}`
    return
  }
  
  // Proceed with storage connection (server will check subscription)
  const startUrl = `/api/storage/${providerId}/start`
  // ... rest of implementation
}
```

### Business Logic Requirements

Storage OAuth routes also enforce business logic requirements:

```typescript
// Server-side subscription check in storage OAuth routes
const { data: access } = await supabase
  .from('v_user_access')
  .select('trial_active, paid_active')
  .eq('user_id', user.id)
  .single()

if (!(access?.trial_active || access?.paid_active)) {
  return ApiResponse.forbidden('Plan required', 'PLAN_REQUIRED')
}
```

**Important**: This is NOT an OAuth flow separation issue - it's a legitimate business requirement. Storage connections require subscription access.

## Error Handling Guidelines

### Authentication Errors vs Storage Errors

Handle errors appropriately based on the OAuth flow type:

```typescript
// Main authentication errors
if (authError.code === 'auth_failed') {
  showError('Login failed', 'Please try signing in again')
  // Redirect to login page
}

// Storage connection errors
if (storageError.code === 'oauth_failed') {
  showError('Storage connection failed', 'Please try connecting your cloud storage again')
  // Stay on current page, allow retry
}
```

## Testing Guidelines

### Unit Tests

Test that components use the correct routes:

```typescript
describe('CloudStorage component', () => {
  it('should use storage OAuth routes for connection', () => {
    // Test that connectProvider uses /api/storage/{provider}/start
    expect(mockFetch).toHaveBeenCalledWith('/api/storage/google/start')
  })
  
  it('should not use main auth routes', () => {
    // Test that component never calls /auth/start?provider=...
    expect(mockFetch).not.toHaveBeenCalledWith(expect.stringContaining('/auth/start'))
  })
})

describe('SupabaseAuthProvider', () => {
  it('should use main auth routes for sign in', () => {
    // Test that signIn uses /auth/start?provider=...
    expect(window.location.href).toContain('/auth/start?provider=google')
  })
  
  it('should not use storage OAuth routes', () => {
    // Test that component never calls /api/storage/{provider}/start
    expect(window.location.href).not.toContain('/api/storage/')
  })
})
```

### Integration Tests

Test complete OAuth flows:

```typescript
describe('OAuth flow separation', () => {
  it('should handle user authentication flow correctly', async () => {
    // Test complete main auth flow
    // /auth/start → /auth/callback → dashboard
  })
  
  it('should handle storage connection flow correctly', async () => {
    // Test complete storage OAuth flow
    // /api/storage/google/start → /api/storage/google/callback → storage connected
  })
  
  it('should require authentication for storage connections', async () => {
    // Test that storage OAuth requires authenticated user
  })
})
```

## Common Mistakes to Avoid

### 1. Route Confusion
```typescript
// ❌ Using auth routes for storage
window.location.href = '/auth/start?provider=google' // For storage connection

// ✅ Use storage routes for storage
window.location.href = '/api/storage/google/start'
```

### 2. Missing Authentication Check
```typescript
// ❌ Allowing unauthenticated storage connections
const connectStorage = () => {
  window.location.href = '/api/storage/google/start' // No auth check!
}

// ✅ Check authentication first
const connectStorage = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    window.location.href = '/auth/signin'
    return
  }
  window.location.href = '/api/storage/google/start'
}
```

### 3. Mixing Component Responsibilities
```typescript
// ❌ Handling both auth types in one component
const AuthAndStorageComponent = () => {
  const signIn = () => window.location.href = '/auth/start?provider=google'
  const connectStorage = () => window.location.href = '/api/storage/google/start'
  // This creates confusion and maintenance issues
}

// ✅ Separate components for separate concerns
const AuthComponent = () => {
  const signIn = () => window.location.href = '/auth/start?provider=google'
}

const StorageComponent = () => {
  const connectStorage = () => window.location.href = '/api/storage/google/start'
}
```

## Monitoring and Debugging

### Logging OAuth Route Usage

Add logging to track which routes are being used:

```typescript
// Log OAuth route usage for monitoring
const logOAuthRoute = (route: string, purpose: 'auth' | 'storage') => {
  console.log(`OAuth route used: ${route} for ${purpose}`)
  // Send to monitoring service
}

// In components
const signIn = (provider: string) => {
  const route = `/auth/start?provider=${provider}`
  logOAuthRoute(route, 'auth')
  window.location.href = route
}

const connectStorage = (provider: string) => {
  const route = `/api/storage/${provider}/start`
  logOAuthRoute(route, 'storage')
  window.location.href = route
}
```

### Debug Checklist

When debugging OAuth issues:

1. **Verify Route Usage**: Check that the correct routes are being called
2. **Check Authentication State**: Ensure user is authenticated for storage connections
3. **Validate Flow Separation**: Confirm no mixing of auth and storage flows
4. **Test Error Handling**: Verify appropriate error messages for each flow type
5. **Review Component Responsibilities**: Ensure components handle only their intended OAuth flow

## Migration Guide

If you find components using incorrect routes:

### Step 1: Identify the Component's Purpose
- Is it handling user authentication (login/signup)?
- Is it handling cloud storage connections?

### Step 2: Update Route Usage
- Authentication components: Use `/auth/start?provider=...`
- Storage components: Use `/api/storage/{provider}/start`

### Step 3: Add Authentication Checks
- Storage components must check user authentication first
- Redirect to login if not authenticated

### Step 4: Update Tests
- Test that components use correct routes
- Add tests to prevent future route mixing

### Step 5: Add Documentation
- Document the component's OAuth flow responsibility
- Add comments explaining route usage

## Troubleshooting

### Plan Required Errors

If you encounter "Plan required" errors when testing storage OAuth:

**This is NOT an OAuth flow separation issue** - it's a business requirement.

```typescript
// Error response from storage OAuth routes
{
  "success": false,
  "error": {
    "message": "Plan required",
    "code": "PLAN_REQUIRED"
  }
}
```

**Solutions**:
1. **For Development**: Use the OAuth readiness check endpoint:
   ```
   GET /api/dev/oauth-readiness
   ```
   This will show your current subscription status and OAuth readiness.

2. **For Testing**: Ensure test users have trial or paid access in the database.

3. **For Production**: Users need valid subscriptions to connect cloud storage.

**Monitoring**: Plan requirement blocks are logged with `errorType: 'business_logic_restriction'` to distinguish them from OAuth flow violations.

### OAuth Flow Separation Issues

If you encounter actual OAuth flow separation problems:

1. **Check Route Usage**: Verify components use correct routes
   - Main auth: `/auth/start?provider=...`
   - Storage OAuth: `/api/storage/{provider}/start`

2. **Check Authentication**: Ensure users are authenticated before storage connections

3. **Check Monitoring**: Review OAuth flow monitoring dashboard for violations

4. **Check Tests**: Run OAuth flow separation tests to verify compliance

## Conclusion

Maintaining proper OAuth flow separation is crucial for:
- **Security**: Ensuring appropriate scopes and permissions
- **Maintainability**: Clear separation of concerns
- **User Experience**: Consistent and predictable authentication flows
- **Debugging**: Easier troubleshooting when issues arise

Always remember:
- **Main Auth Routes** (`/auth/start`) = User login/signup
- **Storage OAuth Routes** (`/api/storage/{provider}/start`) = Cloud storage connections
- **Never mix these flows** in the same component or use case