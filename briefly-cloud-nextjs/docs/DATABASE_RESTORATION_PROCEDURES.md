# Database Restoration Procedures

## Overview

This document provides detailed procedures for restoring the Supabase PostgreSQL database in various disaster scenarios. It covers Point-in-Time Recovery (PITR), full backups, and selective data restoration.

## Prerequisites

### Required Access
- Supabase project admin access
- Service role key with admin privileges
- Database connection credentials
- Backup storage access

### Required Tools
```bash
# Install required tools
npm install -g @supabase/cli
pip install psycopg2-binary
```

### Environment Setup
```bash
# Set environment variables
export SUPABASE_PROJECT_ID="your-project-id"
export SUPABASE_DB_PASSWORD="your-db-password"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
export BACKUP_STORAGE_URL="your-backup-storage-url"
```

## Restoration Scenarios

### 1. Point-in-Time Recovery (PITR)

#### When to Use
- Recent data corruption (within 7 days)
- Accidental data deletion
- Need to restore to specific timestamp
- Minimal data loss acceptable

#### Procedure

1. **Identify Target Recovery Time**
   ```bash
   # Check available recovery points
   supabase db branches list --project-ref $SUPABASE_PROJECT_ID
   
   # Verify data integrity at specific time
   node scripts/verify-data-integrity.js --timestamp "2024-01-15T10:30:00Z"
   ```

2. **Prepare for Recovery**
   ```bash
   # Enable maintenance mode
   curl -X POST "https://your-app.vercel.app/api/admin/maintenance" \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -d '{"enabled": true, "message": "Database maintenance in progress"}'
   
   # Stop all background jobs
   node scripts/stop-background-jobs.js
   ```

3. **Execute PITR**
   ```bash
   # Create recovery branch
   supabase db branches create recovery-$(date +%Y%m%d-%H%M%S) \
     --project-ref $SUPABASE_PROJECT_ID \
     --recovery-time "2024-01-15T10:30:00Z"
   
   # Wait for branch creation
   supabase db branches list --project-ref $SUPABASE_PROJECT_ID
   ```

4. **Validate Recovery**
   ```bash
   # Connect to recovery branch
   export RECOVERY_DB_URL="postgresql://postgres:$SUPABASE_DB_PASSWORD@db.recovery-branch.supabase.co:5432/postgres"
   
   # Verify data integrity
   node scripts/validate-recovery.js --db-url $RECOVERY_DB_URL
   
   # Check critical data
   psql $RECOVERY_DB_URL -c "SELECT COUNT(*) FROM app.users;"
   psql $RECOVERY_DB_URL -c "SELECT COUNT(*) FROM app.files;"
   psql $RECOVERY_DB_URL -c "SELECT COUNT(*) FROM app.document_chunks;"
   ```

5. **Promote Recovery Branch**
   ```bash
   # Promote recovery branch to main
   supabase db branches promote recovery-$(date +%Y%m%d-%H%M%S) \
     --project-ref $SUPABASE_PROJECT_ID
   ```

6. **Post-Recovery Validation**
   ```bash
   # Update application connection
   # (Connection strings remain the same after promotion)
   
   # Verify application functionality
   npm run test:integration:database
   
   # Disable maintenance mode
   curl -X POST "https://your-app.vercel.app/api/admin/maintenance" \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -d '{"enabled": false}'
   ```

### 2. Full Database Restore from Backup

#### When to Use
- Complete database loss
- Corruption beyond PITR window
- Migration to new Supabase project
- Security incident requiring clean restore

#### Procedure

1. **Prepare New Database Instance**
   ```bash
   # Create new Supabase project (if needed)
   supabase projects create "briefly-cloud-recovery" \
     --org-id $SUPABASE_ORG_ID \
     --plan pro
   
   # Get new project details
   export NEW_PROJECT_ID="new-project-id"
   export NEW_DB_PASSWORD="new-db-password"
   ```

2. **Download Latest Backup**
   ```bash
   # List available backups
   node scripts/list-backups.js --format json
   
   # Download latest valid backup
   node scripts/download-backup.js \
     --backup-id "backup-20240115-103000" \
     --output-path "./recovery/backup.sql"
   ```

3. **Restore Database Schema**
   ```bash
   # Connect to new database
   export NEW_DB_URL="postgresql://postgres:$NEW_DB_PASSWORD@db.$NEW_PROJECT_ID.supabase.co:5432/postgres"
   
   # Restore schema first
   psql $NEW_DB_URL -f database/01-multi-tenant-schema-migration.sql
   psql $NEW_DB_URL -f database/02-role-permissions-setup.sql
   psql $NEW_DB_URL -f database/03-tenant-context-functions.sql
   psql $NEW_DB_URL -f database/04-usage-tracking-functions.sql
   psql $NEW_DB_URL -f database/05-rate-limiting-functions.sql
   psql $NEW_DB_URL -f database/06-audit-logging-functions.sql
   psql $NEW_DB_URL -f database/07-storage-security-policies.sql
   psql $NEW_DB_URL -f database/08-backup-disaster-recovery.sql
   ```

4. **Restore Data**
   ```bash
   # Restore data from backup
   psql $NEW_DB_URL -f ./recovery/backup.sql
   
   # Verify data restoration
   psql $NEW_DB_URL -c "SELECT schemaname, tablename, n_tup_ins FROM pg_stat_user_tables ORDER BY n_tup_ins DESC;"
   ```

5. **Update Application Configuration**
   ```bash
   # Update Vercel environment variables
   vercel env rm NEXT_PUBLIC_SUPABASE_URL
   vercel env rm NEXT_PUBLIC_SUPABASE_ANON_KEY
   vercel env rm SUPABASE_SERVICE_ROLE_KEY
   
   vercel env add NEXT_PUBLIC_SUPABASE_URL "https://$NEW_PROJECT_ID.supabase.co"
   vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY "$NEW_ANON_KEY"
   vercel env add SUPABASE_SERVICE_ROLE_KEY "$NEW_SERVICE_ROLE_KEY"
   
   # Redeploy application
   vercel --prod
   ```

### 3. Selective Data Restoration

#### When to Use
- Specific table corruption
- Partial data loss
- User data recovery requests
- Targeted rollback needs

#### Procedure

1. **Identify Affected Data**
   ```bash
   # Analyze corruption scope
   node scripts/analyze-data-corruption.js \
     --table "app.files" \
     --user-id "user-uuid" \
     --start-time "2024-01-15T09:00:00Z"
   ```

2. **Extract Specific Data from Backup**
   ```bash
   # Create temporary restoration database
   createdb -h db.$SUPABASE_PROJECT_ID.supabase.co -U postgres temp_restore
   
   # Restore only needed tables
   pg_restore -h db.$SUPABASE_PROJECT_ID.supabase.co -U postgres \
     -d temp_restore \
     -t app.files \
     -t app.document_chunks \
     ./recovery/backup.dump
   ```

3. **Selective Data Migration**
   ```bash
   # Export specific user data
   psql -h db.$SUPABASE_PROJECT_ID.supabase.co -U postgres -d temp_restore \
     -c "COPY (SELECT * FROM app.files WHERE user_id = 'target-user-id' AND created_at >= '2024-01-15T09:00:00Z') TO STDOUT WITH CSV HEADER;" \
     > user_files_recovery.csv
   
   # Import to main database
   psql -h db.$SUPABASE_PROJECT_ID.supabase.co -U postgres -d postgres \
     -c "\COPY app.files FROM 'user_files_recovery.csv' WITH CSV HEADER;"
   ```

4. **Verify Selective Restoration**
   ```bash
   # Verify restored data
   node scripts/verify-selective-restore.js \
     --user-id "target-user-id" \
     --table "app.files" \
     --expected-count 150
   ```

## Advanced Recovery Scenarios

### Cross-Region Recovery

#### Procedure
```bash
# 1. Create new project in different region
supabase projects create "briefly-cloud-dr" \
  --org-id $SUPABASE_ORG_ID \
  --region us-west-1

# 2. Set up cross-region replication
node scripts/setup-cross-region-replication.js \
  --source-project $SUPABASE_PROJECT_ID \
  --target-project $DR_PROJECT_ID

# 3. Activate DR site
node scripts/activate-dr-site.js --project-id $DR_PROJECT_ID
```

### Encryption Key Recovery

#### When Encryption Keys are Compromised
```bash
# 1. Generate new encryption keys
node scripts/generate-new-encryption-keys.js --emergency

# 2. Restore data with old keys
node scripts/restore-with-old-keys.js --backup-path ./recovery/

# 3. Re-encrypt with new keys
node scripts/re-encrypt-all-data.js --new-key-set emergency-keys

# 4. Update application configuration
node scripts/update-encryption-config.js --key-set emergency-keys
```

## Validation and Testing

### Post-Restoration Validation Checklist

1. **Database Integrity**
   ```bash
   # Check table counts
   node scripts/validate-table-counts.js --compare-with-baseline
   
   # Verify foreign key constraints
   psql $DB_URL -c "SELECT conname, conrelid::regclass FROM pg_constraint WHERE contype = 'f';"
   
   # Check for data corruption
   node scripts/check-data-integrity.js --full-scan
   ```

2. **Application Functionality**
   ```bash
   # Test authentication
   npm run test:auth:integration
   
   # Test file operations
   npm run test:files:integration
   
   # Test chat functionality
   npm run test:chat:integration
   
   # Test vector search
   npm run test:vector:integration
   ```

3. **Security Controls**
   ```bash
   # Verify RLS policies
   npm run test:rls:all
   
   # Test audit logging
   npm run test:audit:integration
   
   # Verify rate limiting
   npm run test:rate-limit:integration
   ```

### Automated Validation Scripts

#### Database Integrity Validation
```javascript
// scripts/validate-database-integrity.js
const { createClient } = require('@supabase/supabase-js');

async function validateDatabaseIntegrity() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  // Check table counts
  const tables = ['app.users', 'app.files', 'app.document_chunks', 'app.conversations'];
  const results = {};
  
  for (const table of tables) {
    const { count, error } = await supabase
      .from(table.replace('app.', ''))
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.error(`Error checking ${table}:`, error);
      results[table] = { status: 'error', error: error.message };
    } else {
      results[table] = { status: 'ok', count };
    }
  }
  
  // Check RLS policies
  const { data: policies, error: policiesError } = await supabase
    .rpc('get_rls_policies');
  
  if (policiesError) {
    results.rls_policies = { status: 'error', error: policiesError.message };
  } else {
    results.rls_policies = { status: 'ok', count: policies.length };
  }
  
  return results;
}

module.exports = { validateDatabaseIntegrity };
```

## Recovery Performance Metrics

### Target Metrics
- **PITR Recovery Time**: < 30 minutes
- **Full Restore Time**: < 2 hours
- **Selective Restore Time**: < 15 minutes
- **Data Validation Time**: < 10 minutes

### Monitoring Recovery Performance
```bash
# Track recovery metrics
node scripts/track-recovery-metrics.js \
  --recovery-type "pitr" \
  --start-time "2024-01-15T10:00:00Z" \
  --end-time "2024-01-15T10:30:00Z"
```

## Troubleshooting Common Issues

### Issue: PITR Recovery Fails
```bash
# Check recovery point availability
supabase db branches list --project-ref $SUPABASE_PROJECT_ID

# Verify timestamp format
node scripts/validate-timestamp.js --timestamp "2024-01-15T10:30:00Z"

# Check project limits
curl -X GET "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_ID/usage" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"
```

### Issue: Backup Restoration Hangs
```bash
# Check connection limits
psql $DB_URL -c "SELECT count(*) FROM pg_stat_activity;"

# Monitor restoration progress
psql $DB_URL -c "SELECT pid, state, query FROM pg_stat_activity WHERE state != 'idle';"

# Kill long-running queries if needed
psql $DB_URL -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state != 'idle' AND query_start < NOW() - INTERVAL '1 hour';"
```

### Issue: Data Inconsistency After Restore
```bash
# Rebuild indexes
psql $DB_URL -c "REINDEX DATABASE postgres;"

# Update statistics
psql $DB_URL -c "ANALYZE;"

# Check for orphaned records
node scripts/check-orphaned-records.js --fix
```

## Security Considerations

### Access Control During Recovery
- Limit database access to recovery team only
- Use temporary credentials with expiration
- Log all recovery activities
- Require dual authorization for critical operations

### Data Privacy During Recovery
- Ensure backup encryption in transit and at rest
- Minimize exposure of sensitive data during recovery
- Use secure channels for all communications
- Document all data access during recovery

### Audit Trail
```bash
# Log recovery activities
node scripts/log-recovery-activity.js \
  --activity "database-restore" \
  --user "recovery-team-member" \
  --timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

## Documentation and Reporting

### Recovery Report Template
```markdown
# Database Recovery Report

**Incident ID**: DR-2024-0115-001
**Recovery Date**: 2024-01-15
**Recovery Team**: [Team Members]
**Recovery Type**: Point-in-Time Recovery

## Incident Summary
- **Start Time**: 2024-01-15 09:45:00 UTC
- **Detection Time**: 2024-01-15 09:47:00 UTC
- **Recovery Start**: 2024-01-15 10:00:00 UTC
- **Recovery Complete**: 2024-01-15 10:28:00 UTC
- **Total Downtime**: 43 minutes

## Recovery Actions Taken
1. [List of actions with timestamps]

## Data Loss Assessment
- **Recovery Point**: 2024-01-15 09:30:00 UTC
- **Data Loss Window**: 15 minutes
- **Affected Records**: ~150 user actions

## Lessons Learned
- [Key findings and improvements]

## Follow-up Actions
- [Required improvements and preventive measures]
```

This comprehensive database restoration procedure ensures reliable recovery capabilities for all disaster scenarios while maintaining security and data integrity throughout the process.