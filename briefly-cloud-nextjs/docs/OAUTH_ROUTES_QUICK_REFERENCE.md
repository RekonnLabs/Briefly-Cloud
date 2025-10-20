# OAuth Routes Quick Reference

## Route Types

### 🔐 Main Authentication Routes (Supabase Auth)
**Purpose**: User login/signup
```
/auth/start?provider=google    → User login with Google
/auth/start?provider=azure     → User login with Microsoft
/auth/callback                 → Authentication callback
```

### 📁 Storage OAuth Routes (Custom Implementation)
**Purpose**: Cloud storage connections
```
/api/storage/google/start      → Connect Google Drive
/api/storage/google/callback   → Google Drive callback
/api/storage/microsoft/start   → Connect OneDrive  
/api/storage/microsoft/callback → OneDrive callback
```

## Component Usage Matrix

| Component | Main Auth Routes | Storage OAuth Routes | Purpose |
|-----------|:----------------:|:-------------------:|---------|
| `SupabaseAuthProvider.tsx` | ✅ | ❌ | User authentication |
| `auth/signin/page.tsx` | ✅ | ❌ | Login page |
| `CloudStorage.tsx` | ❌ | ✅ | Storage connections |
| `GooglePicker.tsx` | ❌ | ✅ | File selection |

## Quick Decision Tree

```
Need to authenticate a user?
├─ YES → Use /auth/start?provider=...
└─ NO → Need to connect cloud storage?
    ├─ YES → Use /api/storage/{provider}/start
    └─ NO → Neither OAuth flow needed
```

## Code Examples

### ✅ Correct Usage

```typescript
// User authentication
const signIn = (provider: 'google' | 'microsoft') => {
  const authProvider = provider === 'microsoft' ? 'azure' : provider
  window.location.href = `/auth/start?provider=${authProvider}`
}

// Storage connection (requires authenticated user)
const connectStorage = async (provider: 'google' | 'microsoft') => {
  // Check auth first
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    window.location.href = '/auth/signin'
    return
  }
  
  window.location.href = `/api/storage/${provider}/start`
}
```

### ❌ Common Mistakes

```typescript
// ❌ Using auth routes for storage
window.location.href = '/auth/start?provider=google' // For storage connection

// ❌ Using storage routes for auth  
window.location.href = '/api/storage/google/start' // For user login

// ❌ Missing auth check for storage
window.location.href = '/api/storage/google/start' // Without checking if user is logged in
```

## Authentication Requirements

| Route Type | Authentication Required | Redirect if Not Authenticated |
|------------|:----------------------:|------------------------------|
| Main Auth Routes | ❌ | N/A (these routes provide auth) |
| Storage OAuth Routes | ✅ | `/auth/signin?next=...` |

## Error Handling

```typescript
// Main auth errors
if (error.type === 'auth_error') {
  showError('Login failed', 'Please try signing in again')
  // Redirect to login
}

// Storage connection errors  
if (error.type === 'storage_oauth_error') {
  showError('Storage connection failed', 'Please try connecting again')
  // Stay on page, allow retry
}
```

## Testing Checklist

- [ ] Component uses correct route type for its purpose
- [ ] No mixing of auth and storage routes in same component
- [ ] Storage routes check authentication first
- [ ] Error handling appropriate for route type
- [ ] Tests verify correct route usage