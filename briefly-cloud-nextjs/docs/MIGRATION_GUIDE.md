# Data Migration Guide

This guide covers the data migration system for the Next.js unified migration from the Python FastAPI backend to the new Next.js architecture.

## Overview

The migration system provides a safe, validated, and reversible way to migrate existing user data, documents, conversations, and settings to the new Next.js application structure. It includes comprehensive validation, backup creation, and rollback capabilities.

## Architecture

### Core Components

1. **Migration Manager** (`src/app/lib/migration.ts`)
   - Handles data validation, migration execution, and rollback operations
   - Provides comprehensive error handling and progress tracking
   - Supports configurable batch processing and retry logic

2. **Migration API** (`src/app/api/migration/route.ts`)
   - RESTful endpoints for migration operations
   - Admin-only access with proper authentication
   - Real-time status tracking and validation

3. **Rollback API** (`src/app/api/migration/rollback/route.ts`)
   - Safe rollback operations with explicit confirmation
   - Backup management and restoration
   - Audit trail for rollback operations

4. **Admin Interface** (`src/app/components/admin/MigrationManager.tsx`)
   - React component for migration management
   - Real-time status monitoring and configuration
   - User-friendly interface for migration operations

## Data Schema

### Migration Schemas

The system validates data against strict Zod schemas:

```typescript
// User data validation
UserMigrationSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  subscription_tier: z.enum(['free', 'pro', 'pro_byok']),
  subscription_status: z.enum(['active', 'canceled', 'past_due', 'trialing']),
  // ... additional fields
})

// File metadata validation
FileMetadataMigrationSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  filename: z.string(),
  processing_status: z.enum(['pending', 'processing', 'completed', 'failed']),
  // ... additional fields
})
```

### Supported Tables

- `users` - User profiles and subscription data
- `file_metadata` - Document file information
- `document_chunks` - Text chunks for vector search
- `conversations` - Chat conversation metadata
- `chat_messages` - Individual chat messages
- `oauth_tokens` - OAuth provider tokens
- `usage_logs` - User activity tracking
- `user_settings` - User preferences and settings

## Migration Process

### 1. Pre-Migration Validation

Before running the migration, the system validates:

- Data integrity and schema compliance
- Foreign key relationships
- Required field presence
- Data type validation

```bash
# Validate data before migration
curl -X POST /api/migration \
  -H "Content-Type: application/json" \
  -d '{"action": "validate"}'
```

### 2. Backup Creation

The system automatically creates a complete backup of all data:

- All tables backed up to cache storage
- Backup ID generated for tracking
- 24-hour retention period
- Rollback capability maintained

### 3. Migration Execution

The migration process:

1. **User Data Migration**
   - Ensures subscription tier defaults
   - Validates usage counters
   - Updates user settings

2. **File Metadata Migration**
   - Validates processing status
   - Ensures chunk and embedding counts
   - Updates storage paths if needed

3. **Document Chunks Migration**
   - Validates chunk indexing
   - Ensures embedding relationships
   - Updates chunk metadata

4. **Conversation Migration**
   - Validates message counts
   - Ensures conversation relationships
   - Updates conversation metadata

5. **Schema Updates**
   - Creates performance indexes
   - Adds missing constraints
   - Optimizes query performance

### 4. Post-Migration Validation

After migration, the system validates:

- Data completeness
- Relationship integrity
- Performance metrics
- Error reporting

## Configuration Options

### Migration Configuration

```typescript
interface MigrationConfig {
  batchSize: number        // Records per batch (default: 100)
  maxRetries: number       // Retry attempts (default: 3)
  retryDelay: number       // Delay between retries (default: 1000ms)
  validateData: boolean    // Enable validation (default: true)
  createBackup: boolean    // Create backup (default: true)
  dryRun: boolean         // Test run without changes (default: false)
}
```

### Environment Variables

```bash
# Required for migration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXTAUTH_URL=https://rekonnlabs.com/briefly/app
NEXTAUTH_SECRET=your_nextauth_secret

# Optional configuration
MIGRATION_BATCH_SIZE=100
MIGRATION_MAX_RETRIES=3
MIGRATION_RETRY_DELAY=1000
```

## API Endpoints

### Migration Management

```typescript
// Run migration
POST /api/migration
{
  "action": "run",
  "config": {
    "batchSize": 100,
    "validateData": true,
    "createBackup": true,
    "dryRun": false
  }
}

// Validate data
POST /api/migration
{
  "action": "validate"
}

// Get migration status
GET /api/migration
```

### Rollback Operations

```typescript
// Rollback migration
POST /api/migration/rollback
{
  "backupId": "backup_1234567890",
  "confirm": true
}

// List available backups
GET /api/migration/rollback
```

## Testing

### Test Script

Use the provided test script to validate the migration system:

```bash
# Run full test suite
node scripts/test-migration.js

# Create test data only
node scripts/test-migration.js create-data

# Test validation
node scripts/test-migration.js test-validation

# Test migration execution
node scripts/test-migration.js test-migration

# Clean up test data
node scripts/test-migration.js cleanup
```

### Test Data Generation

The test script creates realistic sample data:

- 5 test users with various subscription tiers
- 10 sample files with different types
- 50 document chunks with embeddings
- 8 conversations with 30 messages
- 6 OAuth tokens for different providers
- 25 usage log entries

## Error Handling

### Common Issues

1. **Validation Errors**
   - Missing required fields
   - Invalid data types
   - Foreign key violations

2. **Database Errors**
   - Connection timeouts
   - Constraint violations
   - Transaction failures

3. **Authentication Errors**
   - Invalid admin credentials
   - Missing permissions
   - Session expiration

### Error Recovery

1. **Automatic Retry**
   - Configurable retry attempts
   - Exponential backoff
   - Circuit breaker pattern

2. **Manual Rollback**
   - Use backup ID to restore
   - Validate rollback data
   - Audit trail maintenance

3. **Partial Recovery**
   - Resume from last successful batch
   - Skip failed records
   - Manual data correction

## Security Considerations

### Access Control

- Admin-only migration operations
- Session-based authentication
- Role-based permissions
- Audit logging

### Data Protection

- Encrypted backup storage
- Secure token handling
- Data sanitization
- Privacy compliance

### Backup Security

- Encrypted backup data
- Secure backup storage
- Access-controlled backups
- Backup retention policies

## Monitoring and Logging

### Migration Monitoring

```typescript
// Migration status tracking
interface MigrationStatus {
  id: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'rolled_back'
  started_at: string
  completed_at?: string
  error?: string
  records_processed: number
  records_total: number
  backup_created: boolean
  rollback_available: boolean
}
```

### Logging

- Structured logging with context
- Error tracking and reporting
- Performance metrics
- Audit trail maintenance

## Best Practices

### Pre-Migration Checklist

1. **Environment Setup**
   - Verify all environment variables
   - Test database connectivity
   - Validate API endpoints

2. **Data Validation**
   - Run validation tests
   - Check data integrity
   - Verify backup creation

3. **Testing**
   - Test with sample data
   - Validate rollback procedures
   - Performance testing

### Migration Execution

1. **Production Preparation**
   - Schedule maintenance window
   - Notify users of downtime
   - Prepare rollback plan

2. **Execution Steps**
   - Run validation first
   - Execute migration in batches
   - Monitor progress closely
   - Verify results immediately

3. **Post-Migration**
   - Validate all data
   - Test application functionality
   - Monitor for issues
   - Document results

### Rollback Procedures

1. **When to Rollback**
   - Critical data corruption
   - Application failures
   - Performance degradation
   - User complaints

2. **Rollback Process**
   - Stop application services
   - Execute rollback operation
   - Verify data restoration
   - Restart services

## Troubleshooting

### Common Problems

1. **Validation Failures**
   ```bash
   # Check specific validation errors
   curl -X POST /api/migration \
     -H "Content-Type: application/json" \
     -d '{"action": "validate"}'
   ```

2. **Migration Timeouts**
   ```bash
   # Increase batch size and retry delay
   {
     "batchSize": 50,
     "retryDelay": 2000,
     "maxRetries": 5
   }
   ```

3. **Database Connection Issues**
   ```bash
   # Check database connectivity
   # Verify environment variables
   # Test Supabase connection
   ```

### Debug Mode

Enable debug logging for detailed troubleshooting:

```typescript
// Enable debug mode
const config = {
  ...migrationConfig,
  debug: true,
  logLevel: 'debug'
}
```

## Support and Maintenance

### Regular Maintenance

- Monitor migration logs
- Clean up old backups
- Update migration scripts
- Test rollback procedures

### Documentation Updates

- Keep migration guide current
- Update troubleshooting section
- Document new features
- Maintain API documentation

### Community Support

- GitHub issues for bugs
- Documentation improvements
- Feature requests
- Community contributions

## Conclusion

The data migration system provides a robust, secure, and user-friendly way to migrate from the Python FastAPI backend to the new Next.js architecture. With comprehensive validation, backup capabilities, and rollback procedures, the migration process is designed to be safe and reliable for production use.

For additional support or questions, please refer to the project documentation or contact the development team.
