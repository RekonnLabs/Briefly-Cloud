# Users Repository

The Users Repository provides schema-aware database operations for user profile management in the Briefly Cloud application. It handles user profiles, subscription tiers, usage tracking, and tier management using the `app.users` table.

## Features

- ✅ **Schema-aware operations** - Uses app schema for tenant-scoped data
- ✅ **Subscription tier management** - Handles free, pro, pro_byok, team, enterprise tiers
- ✅ **Usage tracking** - Tracks document uploads and storage usage
- ✅ **Limit enforcement** - Checks and enforces tier-based limits
- ✅ **Metadata management** - Flexible user metadata storage
- ✅ **Comprehensive error handling** - Proper error handling with context
- ✅ **TypeScript support** - Full type safety with interfaces
- ✅ **Bulk operations** - Support for multiple user operations

## Quick Start

```typescript
import { usersRepo } from '@/app/lib/repos'

// Create a new user
const user = await usersRepo.create({
  id: 'user-123',
  email: 'user@example.com',
  subscription_tier: 'free'
})

// Get user profile
const profile = await usersRepo.getById('user-123')

// Update usage after file upload
await usersRepo.incrementUsage('user-123', 1, 1024000) // +1 doc, +1MB

// Check usage limits
const limits = await usersRepo.checkUsageLimits('user-123')
console.log('Can upload:', limits.canUploadFiles)
```

## Core Methods

### Profile Management

#### `getById(userId: string): Promise<UserProfile | null>`
Retrieve user profile by ID.

```typescript
const user = await usersRepo.getById('user-123')
if (user) {
  console.log(`User: ${user.email}, Tier: ${user.subscription_tier}`)
}
```

#### `getByEmail(email: string): Promise<UserProfile | null>`
Retrieve user profile by email address.

```typescript
const user = await usersRepo.getByEmail('user@example.com')
```

#### `create(input: CreateUserInput): Promise<UserProfile>`
Create a new user profile with tier-based limits.

```typescript
const newUser = await usersRepo.create({
  id: 'user-123',
  email: 'user@example.com',
  subscription_tier: 'pro', // Optional, defaults to 'free'
  metadata: { source: 'signup' } // Optional
})
```

### Usage Tracking

#### `updateUsage(userId: string, updates: UpdateUserUsageInput): Promise<void>`
Update user usage statistics.

```typescript
await usersRepo.updateUsage('user-123', {
  documents_uploaded: 10,
  storage_used_bytes: 5242880, // 5MB
  last_login_at: new Date().toISOString()
})
```

#### `incrementUsage(userId: string, documentCount: number, storageBytes: number): Promise<void>`
Increment document count and storage usage.

```typescript
// After successful file upload
await usersRepo.incrementUsage('user-123', 1, fileSize)
```

#### `getUsageStats(userId: string): Promise<UserUsageStats | null>`
Get current usage statistics.

```typescript
const stats = await usersRepo.getUsageStats('user-123')
console.log(`Documents: ${stats.documents_uploaded}/${stats.documents_limit}`)
console.log(`Storage: ${stats.storage_used_bytes}/${stats.storage_limit_bytes} bytes`)
```

### Tier Management

#### `updateTier(userId: string, tier: SubscriptionTier): Promise<void>`
Update user subscription tier and associated limits.

```typescript
// Upgrade user to pro tier
await usersRepo.updateTier('user-123', 'pro')

// User now has pro tier limits automatically applied
const user = await usersRepo.getById('user-123')
console.log(`New limits: ${user.documents_limit} docs, ${user.storage_limit_bytes} bytes`)
```

#### `checkUsageLimits(userId: string): Promise<UsageLimitsResult>`
Check if user has reached usage limits.

```typescript
const limits = await usersRepo.checkUsageLimits('user-123')

if (!limits.canUploadFiles) {
  throw new Error('Document limit reached')
}

if (!limits.canUseStorage) {
  throw new Error('Storage limit reached')
}

console.log(`Remaining: ${limits.documentsRemaining} docs, ${limits.storageRemaining} bytes`)
```

### Metadata and Login Tracking

#### `updateMetadata(userId: string, metadata: Record<string, any>): Promise<void>`
Update user metadata (preferences, settings, etc.).

```typescript
await usersRepo.updateMetadata('user-123', {
  preferences: { theme: 'dark', language: 'en' },
  settings: { notifications: true },
  customData: { onboardingCompleted: true }
})
```

#### `updateLastLogin(userId: string): Promise<void>`
Update last login timestamp.

```typescript
// Track user login
await usersRepo.updateLastLogin('user-123')
```

### Bulk Operations

#### `getByIds(userIds: string[]): Promise<UserProfile[]>`
Retrieve multiple users by IDs.

```typescript
const users = await usersRepo.getByIds(['user-1', 'user-2', 'user-3'])
console.log(`Retrieved ${users.length} users`)
```

## Subscription Tiers

The repository supports five subscription tiers with different limits:

| Tier | Documents | Storage | Description |
|------|-----------|---------|-------------|
| `free` | 25 | 100MB | Free tier with basic limits |
| `pro` | 500 | 1GB | Pro tier with increased limits |
| `pro_byok` | 5,000 | 10GB | Pro with bring-your-own-key |
| `team` | 10,000 | 50GB | Team collaboration features |
| `enterprise` | 100,000 | 500GB | Enterprise with custom features |

Limits are automatically applied when creating users or updating tiers:

```typescript
// Create user with pro tier
const proUser = await usersRepo.create({
  id: 'user-123',
  email: 'user@example.com',
  subscription_tier: 'pro'
})

console.log(proUser.documents_limit) // 500
console.log(proUser.storage_limit_bytes) // 1073741824 (1GB)
```

## TypeScript Interfaces

### UserProfile
```typescript
interface UserProfile {
  id: string
  email: string
  subscription_tier: 'free' | 'pro' | 'pro_byok' | 'team' | 'enterprise'
  documents_uploaded: number
  documents_limit: number
  storage_used_bytes: number
  storage_limit_bytes: number
  created_at: string
  updated_at: string
  last_login_at?: string
  metadata?: Record<string, any>
}
```

### CreateUserInput
```typescript
interface CreateUserInput {
  id: string
  email: string
  subscription_tier?: 'free' | 'pro' | 'pro_byok' | 'team' | 'enterprise'
  metadata?: Record<string, any>
}
```

### UpdateUserUsageInput
```typescript
interface UpdateUserUsageInput {
  documents_uploaded?: number
  storage_used_bytes?: number
  last_login_at?: string
  metadata?: Record<string, any>
}
```

### UserUsageStats
```typescript
interface UserUsageStats {
  documents_uploaded: number
  documents_limit: number
  storage_used_bytes: number
  storage_limit_bytes: number
  subscription_tier: string
}
```

## Usage in API Routes

### Upload API Route
```typescript
// src/app/api/upload/route.ts
import { usersRepo } from '@/app/lib/repos'

export async function POST(request: Request) {
  const { user } = await getAuthenticatedUser(request)
  
  // Check if user can upload
  const limits = await usersRepo.checkUsageLimits(user.id)
  if (!limits.canUploadFiles || limits.storageRemaining < fileSize) {
    return Response.json({ error: 'Usage limit exceeded' }, { status: 403 })
  }
  
  // ... perform upload ...
  
  // Update usage after successful upload
  await usersRepo.incrementUsage(user.id, 1, fileSize)
  
  return Response.json({ success: true })
}
```

### Chat API Route
```typescript
// src/app/api/chat/route.ts
import { usersRepo } from '@/app/lib/repos'

export async function POST(request: Request) {
  const { user } = await getAuthenticatedUser(request)
  
  // Get user tier for feature access
  const stats = await usersRepo.getUsageStats(user.id)
  const canUseAdvancedFeatures = ['pro', 'pro_byok', 'team', 'enterprise']
    .includes(stats?.subscription_tier || 'free')
  
  // ... handle chat based on tier ...
}
```

### Dashboard API Route
```typescript
// src/app/api/user/dashboard/route.ts
import { usersRepo } from '@/app/lib/repos'

export async function GET(request: Request) {
  const { user } = await getAuthenticatedUser(request)
  
  const profile = await usersRepo.getById(user.id)
  const limits = await usersRepo.checkUsageLimits(user.id)
  
  return Response.json({
    user: profile,
    usage: {
      documents: {
        used: profile.documents_uploaded,
        limit: profile.documents_limit,
        remaining: limits.documentsRemaining
      },
      storage: {
        used: profile.storage_used_bytes,
        limit: profile.storage_limit_bytes,
        remaining: limits.storageRemaining
      }
    },
    canUpload: limits.canUploadFiles && limits.canUseStorage
  })
}
```

## Error Handling

The repository provides comprehensive error handling with context:

```typescript
try {
  await usersRepo.updateUsage('user-123', { documents_uploaded: 10 })
} catch (error) {
  // Error includes schema context and operation details
  console.error('Usage update failed:', error.message)
  // Handle error appropriately
}
```

Common error scenarios:
- **Validation errors**: Missing required fields
- **Database errors**: Connection issues, constraint violations
- **Schema errors**: Table not found, permission issues
- **Not found errors**: User doesn't exist

## Testing

The repository includes comprehensive unit and integration tests:

```bash
# Run unit tests
npm test -- src/app/lib/repos/__tests__/users-repo.test.ts

# Run integration tests (requires database)
npm test -- src/app/lib/repos/__tests__/users-repo.integration.test.ts

# Validate repository functionality
node scripts/validate-users-repo.js
```

## Schema Requirements

The repository requires the following table structure in the `app` schema:

```sql
-- app.users table
CREATE TABLE app.users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  subscription_tier TEXT DEFAULT 'free',
  documents_uploaded INTEGER DEFAULT 0,
  documents_limit INTEGER DEFAULT 25,
  storage_used_bytes BIGINT DEFAULT 0,
  storage_limit_bytes BIGINT DEFAULT 104857600, -- 100MB
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);
```

## Best Practices

1. **Always check limits before operations**:
   ```typescript
   const limits = await usersRepo.checkUsageLimits(userId)
   if (!limits.canUploadFiles) {
     throw new Error('Document limit reached')
   }
   ```

2. **Update usage after successful operations**:
   ```typescript
   // After file upload succeeds
   await usersRepo.incrementUsage(userId, 1, fileSize)
   ```

3. **Use tier-appropriate features**:
   ```typescript
   const stats = await usersRepo.getUsageStats(userId)
   const isPremium = ['pro', 'pro_byok', 'team', 'enterprise']
     .includes(stats?.subscription_tier || 'free')
   ```

4. **Handle errors gracefully**:
   ```typescript
   try {
     await usersRepo.updateTier(userId, 'pro')
   } catch (error) {
     console.error('Tier update failed:', error)
     // Provide user-friendly error message
   }
   ```

5. **Use metadata for flexible data**:
   ```typescript
   await usersRepo.updateMetadata(userId, {
     preferences: { theme: 'dark' },
     onboarding: { completed: true, step: 'finished' }
   })
   ```

## Migration from Direct Database Calls

If you're migrating from direct Supabase calls, replace:

```typescript
// Old: Direct supabase call
const { data } = await supabase
  .from('users')
  .select('*')
  .eq('id', userId)
  .single()

// New: Repository method
const user = await usersRepo.getById(userId)
```

```typescript
// Old: Manual usage update
await supabase
  .from('users')
  .update({
    documents_uploaded: currentCount + 1,
    storage_used_bytes: currentStorage + fileSize
  })
  .eq('id', userId)

// New: Repository method
await usersRepo.incrementUsage(userId, 1, fileSize)
```

The repository provides better error handling, type safety, and schema awareness compared to direct database calls.