# Feature Flags and Staged Rollout System

This document describes the comprehensive feature flag system implemented for Briefly Cloud, which supports gradual feature rollouts, A/B testing, and user tier-based feature management.

## Overview

The feature flag system provides:

- **Gradual Rollouts**: Control feature availability with percentage-based rollouts
- **User Tier Management**: Enable features based on subscription tiers (free, pro, pro_byok)
- **Beta User Groups**: Give early access to specific users
- **A/B Testing**: Run experiments with multiple variants and traffic splitting
- **Real-time Configuration**: Update feature flags without code deployments
- **Analytics Tracking**: Monitor feature usage and performance

## Architecture

### Core Components

1. **Feature Flag Service** (`/app/lib/feature-flags.ts`)
   - Core business logic for feature flag evaluation
   - Database operations and caching
   - A/B test variant selection

2. **API Routes** (`/app/api/feature-flags/`)
   - REST endpoints for managing feature flags
   - Admin interface for creating and updating flags
   - Beta user management

3. **React Hooks** (`/app/lib/hooks/useFeatureFlag.ts`)
   - Client-side feature flag checking
   - Caching and performance optimization
   - Multiple flag support

4. **Middleware** (`/app/lib/feature-flag-middleware.ts`)
   - Server-side feature flag integration
   - API route protection
   - Request context enhancement

5. **UI Components** (`/app/components/FeatureGate.tsx`)
   - Conditional rendering based on feature flags
   - A/B test variant handling
   - Debug utilities

## Database Schema

The system uses the following database tables:

### `feature_flags`
```sql
CREATE TABLE feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    enabled BOOLEAN DEFAULT FALSE,
    rollout_percentage INTEGER DEFAULT 0,
    user_tiers TEXT[] DEFAULT '{}',
    beta_users TEXT[] DEFAULT '{}',
    ab_test_config JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### `feature_flag_usage`
```sql
CREATE TABLE feature_flag_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feature_name VARCHAR(100) NOT NULL,
    user_id UUID,
    enabled BOOLEAN NOT NULL,
    variant VARCHAR(50),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### `users` (enhanced)
```sql
ALTER TABLE users 
ADD COLUMN is_beta_user BOOLEAN DEFAULT FALSE;
```

## Usage Examples

### 1. Basic Feature Flag Check

#### Server-side (API Route)
```typescript
import { isFeatureEnabled, UserContext } from '@/app/lib/feature-flags';

const userContext: UserContext = {
  user_id: user.id,
  email: user.email,
  subscription_tier: user.subscription_tier,
  is_beta_user: user.is_beta_user,
  created_at: user.created_at
};

const result = await isFeatureEnabled('new_dashboard', userContext);

if (result.enabled) {
  // Feature is enabled for this user
  console.log(`Feature enabled: ${result.reason}`);
}
```

#### Client-side (React Component)
```typescript
import { useFeatureFlag } from '@/app/lib/hooks/useFeatureFlag';

function MyComponent() {
  const { enabled, loading, variant } = useFeatureFlag('new_dashboard');

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      {enabled ? (
        <NewDashboard variant={variant} />
      ) : (
        <OldDashboard />
      )}
    </div>
  );
}
```

### 2. Feature Gate Component

```typescript
import { FeatureGate } from '@/app/components/FeatureGate';

function App() {
  return (
    <div>
      <FeatureGate 
        feature="new_dashboard" 
        fallback={<OldDashboard />}
        loadingComponent={<DashboardSkeleton />}
      >
        <NewDashboard />
      </FeatureGate>
    </div>
  );
}
```

### 3. Multiple Feature Flags

```typescript
import { useFeatureFlags } from '@/app/lib/hooks/useFeatureFlag';

function AdvancedComponent() {
  const flags = useFeatureFlags([
    'advanced_chunking',
    'real_time_chat',
    'function_calling'
  ]);

  return (
    <div>
      {flags.advanced_chunking?.enabled && <AdvancedChunking />}
      {flags.real_time_chat?.enabled && <RealTimeChat />}
      {flags.function_calling?.enabled && <FunctionCalling />}
    </div>
  );
}
```

### 4. A/B Testing

```typescript
import { useABTest } from '@/app/lib/hooks/useFeatureFlag';

function DashboardComponent() {
  const { variant, config, isEnabled } = useABTest('dashboard_redesign_v1');

  if (!isEnabled) return <CurrentDashboard />;

  switch (variant) {
    case 'variant_a':
      return <DashboardWithTopNav config={config} />;
    case 'variant_b':
      return <DashboardWithCards config={config} />;
    default:
      return <CurrentDashboard />;
  }
}
```

### 5. API Route Protection

```typescript
import { withFeatureFlagAPI } from '@/app/lib/feature-flag-middleware';
import { FEATURE_FLAGS } from '@/app/lib/feature-flags';

async function advancedSearchHandler(req: NextRequest) {
  // This handler only runs if the feature is enabled
  return NextResponse.json({ message: 'Advanced search enabled!' });
}

export const POST = withFeatureFlagAPI(
  FEATURE_FLAGS.VECTOR_SEARCH_V2,
  advancedSearchHandler,
  {
    requireAuth: true,
    fallbackMessage: 'Advanced search is not available for your account tier.'
  }
);
```

## Admin Interface

### Creating Feature Flags

```typescript
// POST /api/feature-flags
{
  "name": "new_feature",
  "description": "Description of the new feature",
  "enabled": false,
  "rollout_percentage": 0,
  "user_tiers": ["pro", "pro_byok"],
  "beta_users": ["user-id-1", "user-id-2"]
}
```

### A/B Test Configuration

```typescript
// PUT /api/feature-flags/{id}
{
  "ab_test_config": {
    "test_name": "checkout_flow_v2",
    "variants": [
      {
        "name": "control",
        "description": "Current checkout flow",
        "config": { "steps": 3, "theme": "current" }
      },
      {
        "name": "simplified",
        "description": "Simplified checkout flow",
        "config": { "steps": 2, "theme": "minimal" }
      }
    ],
    "traffic_split": {
      "control": 50,
      "simplified": 50
    },
    "metrics": ["conversion_rate", "completion_time"],
    "start_date": "2025-01-01T00:00:00Z",
    "end_date": "2025-02-01T00:00:00Z"
  }
}
```

### Managing Beta Users

```typescript
// POST /api/feature-flags/beta-users
{
  "user_id": "user-123",
  "action": "add"
}

// Bulk operation
{
  "user_ids": ["user-1", "user-2", "user-3"],
  "action": "add"
}
```

## Feature Flag Evaluation Logic

The system evaluates feature flags in the following order:

1. **Feature Exists**: Check if the feature flag exists in the database
2. **Global Enable**: Check if the feature is globally enabled
3. **User Tier**: Verify user's subscription tier is allowed
4. **Beta Access**: Check if user is in beta group or feature's beta user list
5. **Rollout Percentage**: Use consistent hashing to determine if user is in rollout
6. **A/B Test**: If configured, determine which variant the user should see

### Consistent Hashing

The system uses consistent hashing to ensure:
- Users always get the same experience across sessions
- Rollout percentages are evenly distributed
- A/B test assignments remain stable

```typescript
private getUserHash(userId: string, featureName: string): number {
  const input = `${userId}:${featureName}`;
  let hash = 0;
  
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return Math.abs(hash) % 100;
}
```

## Performance Considerations

### Caching Strategy

- **Client-side**: 5-minute cache for feature flag results
- **Server-side**: 5-minute cache for feature flag configurations
- **Cache Invalidation**: Automatic when flags are updated

### Database Optimization

- Indexes on frequently queried columns
- Efficient JSON queries for A/B test configurations
- Usage tracking in separate table to avoid performance impact

### Error Handling

- **Fail Open**: If feature flag service is unavailable, allow access
- **Graceful Degradation**: Fall back to default behavior on errors
- **Logging**: Comprehensive error logging for debugging

## Monitoring and Analytics

### Usage Tracking

All feature flag checks are tracked in the `feature_flag_usage` table:

```sql
SELECT 
  feature_name,
  COUNT(*) as total_checks,
  COUNT(CASE WHEN enabled THEN 1 END) as enabled_checks,
  COUNT(DISTINCT user_id) as unique_users,
  ROUND(AVG(CASE WHEN enabled THEN 1.0 ELSE 0.0 END) * 100, 2) as success_rate
FROM feature_flag_usage 
WHERE timestamp >= NOW() - INTERVAL '7 days'
GROUP BY feature_name;
```

### A/B Test Analytics

```sql
SELECT 
  variant,
  COUNT(*) as users,
  -- Add your conversion metrics here
FROM feature_flag_usage 
WHERE feature_name = 'dashboard_redesign_v1'
  AND timestamp >= '2025-01-01'
GROUP BY variant;
```

## Security Considerations

- **Admin Access**: Only users with `@rekonnlabs.com` emails can manage flags
- **API Authentication**: All endpoints require valid authentication
- **Input Validation**: Zod schemas validate all inputs
- **Rate Limiting**: Standard rate limits apply to all endpoints

## Best Practices

### Naming Conventions

- Use snake_case for feature flag names
- Include version numbers for major changes (e.g., `dashboard_v2`)
- Use descriptive names that indicate the feature's purpose

### Rollout Strategy

1. **Start Small**: Begin with 1-5% rollout to beta users
2. **Monitor Metrics**: Watch for errors, performance issues, user feedback
3. **Gradual Increase**: Increase rollout percentage in stages (5% → 25% → 50% → 100%)
4. **Full Rollout**: Once stable, enable for all users
5. **Cleanup**: Remove feature flag code after full rollout

### A/B Testing Guidelines

- **Single Variable**: Test one change at a time
- **Statistical Significance**: Run tests long enough for meaningful results
- **Success Metrics**: Define clear success criteria before starting
- **Documentation**: Document test hypotheses and results

## Troubleshooting

### Common Issues

1. **Feature Not Showing**: Check user tier, rollout percentage, and beta access
2. **Inconsistent Behavior**: Verify caching isn't causing stale data
3. **Performance Issues**: Monitor database queries and cache hit rates
4. **A/B Test Issues**: Verify traffic split percentages add up to 100%

### Debug Tools

- **FeatureFlagDebugger Component**: Shows current flag states in development
- **API Endpoints**: Use `/api/feature-flags/check` to test flag evaluation
- **Database Queries**: Check `feature_flag_usage` table for user's flag history

## Migration and Cleanup

When removing feature flags:

1. **Code Cleanup**: Remove all feature flag checks and conditional code
2. **Database Cleanup**: Archive or delete the feature flag record
3. **Usage Data**: Optionally clean up old usage tracking data
4. **Documentation**: Update documentation to reflect changes

## Future Enhancements

Potential improvements to consider:

- **Segment-based Targeting**: Target users based on behavior or demographics
- **Time-based Rollouts**: Schedule automatic rollout increases
- **Dependency Management**: Handle feature flag dependencies
- **External Integrations**: Connect with analytics platforms
- **Mobile App Support**: Extend system to mobile applications