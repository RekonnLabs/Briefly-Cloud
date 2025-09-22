# Google Picker Authentication Recovery System

This document describes the comprehensive authentication recovery system for Google Picker integration in Briefly Cloud.

## Overview

The authentication recovery system provides guided recovery flows for users when Google Drive authentication fails. It includes:

- **Automatic error detection and categorization**
- **Step-by-step recovery guidance**
- **Multiple recovery scenarios**
- **User-friendly interfaces**
- **Progress tracking**

## Key Components

### 1. Error Handling (`error-handling.ts`)

Categorizes and handles different types of Google Picker errors:

```typescript
import { handleTokenError, handlePickerError, PickerErrorInfo } from './error-handling'

// Handle token-specific errors
const tokenErrorInfo = handleTokenError(tokenError, context)

// Handle picker API errors  
const pickerErrorInfo = handlePickerError(error, context)
```

### 2. Authentication Recovery (`auth-recovery.ts`)

Provides recovery flows and guidance:

```typescript
import { 
  getRecoveryFlow, 
  startRecovery, 
  requiresImmediateReauth,
  getConnectionStatusMessage 
} from './auth-recovery'

// Get recovery flow for an error
const flow = getRecoveryFlow(errorInfo)

// Start recovery process
const progress = startRecovery(userId, errorInfo)

// Check if immediate re-auth is needed
const needsReauth = requiresImmediateReauth(errorInfo)
```

### 3. Recovery Components

#### GooglePickerRecovery Component
Shows detailed recovery steps with progress tracking:

```tsx
<GooglePickerRecovery
  errorInfo={errorInfo}
  userId={userId}
  onRecoveryComplete={() => console.log('Recovery complete')}
  onRetry={() => console.log('Retry requested')}
/>
```

#### GoogleDriveConnectionStatus Component
Shows connection status and quick recovery actions:

```tsx
<GoogleDriveConnectionStatus
  isConnected={isConnected}
  lastError={lastError}
  onReconnect={() => window.location.href = '/api/storage/google/start'}
  onShowRecovery={() => setShowRecovery(true)}
/>
```

#### GoogleDriveAuthGuide Component
Provides step-by-step authentication guidance:

```tsx
<GoogleDriveAuthGuide
  scenario="expired" // 'first_time' | 'expired' | 'revoked' | 'failed' | 'network_issue'
  onStartConnection={() => window.location.href = '/api/storage/google/start'}
  onContactSupport={() => window.open('/help/contact-support')}
/>
```

## Recovery Scenarios

### 1. Token Expired
**When:** Access token has expired
**Flow:** Disconnect → Reconnect → Verify
**User Action:** Reconnect Google Drive account

### 2. Token Not Found  
**When:** No Google Drive connection exists
**Flow:** Navigate to settings → Connect → Confirm
**User Action:** Connect Google Drive for first time

### 3. Refresh Failed
**When:** Token refresh fails
**Flow:** Check Google account → Disconnect/Reconnect → Test
**User Action:** Verify Google account and reconnect

### 4. Permission Denied
**When:** Permissions revoked or insufficient
**Flow:** Check Google permissions → Revoke old → Reconnect fresh
**User Action:** Review and restore permissions

### 5. Connection Lost
**When:** Network or service issues
**Flow:** Check internet → Retry → Refresh if needed
**User Action:** Verify connection and retry

### 6. Scope Insufficient
**When:** OAuth scope is insufficient
**Flow:** Understand permissions → Disconnect → Reconnect with full permissions
**User Action:** Grant all required permissions

## Usage Examples

### Basic Integration

```tsx
import { GooglePicker } from '@/app/components/GooglePicker'
import { GooglePickerRecovery } from '@/app/components/GooglePickerRecovery'

function MyComponent() {
  const [error, setError] = useState<PickerErrorInfo | null>(null)
  const [showRecovery, setShowRecovery] = useState(false)

  const handlePickerError = (errorMessage: string) => {
    // Convert error to PickerErrorInfo (implementation specific)
    const errorInfo = convertToErrorInfo(errorMessage)
    setError(errorInfo)
    
    if (requiresImmediateReauth(errorInfo)) {
      setShowRecovery(true)
    }
  }

  return (
    <div>
      <GooglePicker
        onFilesSelected={handleFiles}
        onError={handlePickerError}
        userId={userId}
      />
      
      {showRecovery && error && (
        <GooglePickerRecovery
          errorInfo={error}
          userId={userId}
          onRecoveryComplete={() => {
            setError(null)
            setShowRecovery(false)
          }}
        />
      )}
    </div>
  )
}
```

### Complete Integration with Status

```tsx
import { GooglePickerWithRecovery } from '@/app/components/GooglePickerWithRecovery'

function CloudStorageSection() {
  return (
    <GooglePickerWithRecovery
      onFilesSelected={handleFilesSelected}
      onError={handleError}
      userId={userId}
      isConnected={isGoogleDriveConnected}
    />
  )
}
```

## Error Types and Recovery Actions

| Error Type | Severity | Recovery Action | Requires Reauth |
|------------|----------|-----------------|-----------------|
| TOKEN_EXPIRED | Medium | Reconnect | Yes |
| TOKEN_NOT_FOUND | Medium | Connect | Yes |
| TOKEN_REFRESH_FAILED | Low/Medium | Retry/Reconnect | Conditional |
| PERMISSION_DENIED | Medium | Reconnect | Yes |
| NETWORK_ERROR | Low | Check Connection | No |
| API_LOAD_FAILED | Low | Retry | No |
| QUOTA_EXCEEDED | Low | Wait and Retry | No |

## Recovery Flow States

### Progress Tracking
```typescript
interface RecoveryProgress {
  flowType: RecoveryFlowType
  currentStepId: string
  completedSteps: string[]
  startedAt: string
  estimatedCompletion?: string
}
```

### Step Types
- **Required Steps:** Must be completed for recovery
- **Optional Steps:** Recommended but not mandatory
- **Info Steps:** Provide guidance without action
- **External Steps:** Require action outside the app

## Best Practices

### 1. Error Detection
- Always use structured error handling
- Provide context for better error categorization
- Log errors for monitoring and debugging

### 2. User Experience
- Show clear, actionable error messages
- Provide step-by-step guidance
- Allow users to skip optional steps
- Show progress indicators

### 3. Recovery Flows
- Start with the most likely solution
- Provide fallback options
- Include prevention tips
- Link to detailed help documentation

### 4. Testing
- Test all recovery scenarios
- Verify error categorization
- Ensure recovery flows work end-to-end
- Test with different user states

## Monitoring and Analytics

### Error Tracking
```typescript
// Errors are automatically logged with context
logPickerError(errorInfo, context)
```

### Recovery Statistics
```typescript
const stats = authRecoveryService.getRecoveryStats()
console.log('Active recoveries:', stats.activeRecoveries)
console.log('Flow distribution:', stats.flowTypeDistribution)
```

## Security Considerations

### Token Management
- Use short-lived tokens for picker operations
- Implement proper token cleanup
- Validate token scope and permissions

### Privacy Protection
- Only access explicitly selected files
- Minimize data collection during recovery
- Provide clear privacy explanations

### Permission Validation
- Verify OAuth scope matches requirements
- Check file access permissions
- Implement graceful permission failures

## Troubleshooting

### Common Issues

1. **Recovery not starting**
   - Check error categorization
   - Verify userId is provided
   - Ensure error requires recovery flow

2. **Steps not progressing**
   - Verify step completion logic
   - Check step ID matching
   - Ensure required steps are marked correctly

3. **Reconnection failing**
   - Check OAuth configuration
   - Verify redirect URLs
   - Test Google API credentials

### Debug Information
Enable debug logging to see detailed recovery flow information:

```typescript
// Error context includes debug information
const context = createErrorContext('operation', userId, { debug: true })
```

## Future Enhancements

### Planned Features
- Automatic retry with exponential backoff
- Smart recovery suggestions based on user history
- Integration with support ticketing system
- Recovery flow analytics and optimization

### Extensibility
The system is designed to be extensible:
- Add new recovery flow types
- Customize recovery steps
- Integrate with external services
- Add custom error handlers

## API Reference

See the TypeScript interfaces and JSDoc comments in the source files for detailed API documentation:

- `error-handling.ts` - Error categorization and handling
- `auth-recovery.ts` - Recovery flows and progress tracking
- `GooglePickerRecovery.tsx` - Recovery UI component
- `GoogleDriveConnectionStatus.tsx` - Status display component
- `GoogleDriveAuthGuide.tsx` - Step-by-step guidance component
