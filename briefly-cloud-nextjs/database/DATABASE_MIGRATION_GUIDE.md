# Database Migration and Deployment Guide

## Overview

This guide covers the comprehensive database migration and deployment system for the Google Drive Vault integration fix. The system includes automated deployment, validation, rollback procedures, and safety checks.

## Requirements Addressed

- **1.1**: Database schema support for Apideck connections with proper structure
- **1.2**: RLS policies allowing authenticated users to access their own connection records  
- **1.3**: Proper authentication context to avoid permission denied errors
- **1.4**: Table creation with appropriate columns for connection metadata

## Scripts Overview

### 1. Main Deployment Script
**File**: `scripts/deploy-database-migration.js`
**Purpose**: Comprehensive deployment with backup, validation, and rollback capabilities

```bash
# Full deployment with all safety checks
npm run deploy:database

# Validation only (no changes)
npm run deploy:database:validate

# Connectivity test only
npm run deploy:database:test
```

**Features**:
- ✅ Pre-deployment backup creation
- ✅ Sectioned migration execution for better error handling
- ✅ Comprehensive validation with critical/non-critical checks
- ✅ Automatic rollback on validation failure
- ✅ Detailed reporting and logging
- ✅ Export results to JSON files

### 2. Rollback Script
**File**: `scripts/rollback-database-migration.js`
**Purpose**: Safe rollback of migration changes with confirmation

```bash
# Interactive rollback with confirmation
npm run rollback:database

# Analyze what would be rolled back (no changes)
npm run rollback:database:analyze
```

**Features**:
- ✅ Pre-rollback state analysis
- ✅ Interactive confirmation prompts
- ✅ Pre-rollback backup creation
- ✅ Selective rollback (preserves data and table structure)
- ✅ Post-rollback verification

### 3. Validation Script
**File**: `scripts/validate-database-state.js`
**Purpose**: Independent validation of database state

```bash
# Standard validation
npm run validate:database

# Verbose output with data details
npm run validate:database:verbose

# Export results to JSON file
npm run validate:database:export
```

**Features**:
- ✅ 25+ comprehensive validation checks
- ✅ Categorized validation (connectivity, structure, RLS, permissions, etc.)
- ✅ Critical vs non-critical issue classification
- ✅ Health scoring and recommendations
- ✅ Export capabilities for reporting

## Migration Components

### Database Changes Applied

1. **Row Level Security (RLS)**
   ```sql
   ALTER TABLE app.apideck_connections ENABLE ROW LEVEL SECURITY;
   ```

2. **User Access Policy**
   ```sql
   CREATE POLICY "Users can manage own apideck connections" ON app.apideck_connections
     FOR ALL TO authenticated
     USING (auth.uid() = user_id)
     WITH CHECK (auth.uid() = user_id);
   ```

3. **Service Access Policy**
   ```sql
   CREATE POLICY "Service can access all apideck connections" ON app.apideck_connections
     FOR ALL TO service_role
     USING (true) WITH CHECK (true);
   ```

4. **Permissions**
   ```sql
   GRANT SELECT, INSERT, UPDATE, DELETE ON app.apideck_connections TO briefly_authenticated;
   GRANT ALL PRIVILEGES ON app.apideck_connections TO briefly_service;
   ```

5. **Helper Functions**
   - `app.validate_apideck_connection_access(UUID, TEXT)` - Connection validation
   - `app.get_user_apideck_connections(UUID)` - User connection retrieval

### Validation Categories

1. **Database Connectivity** (2 checks)
   - Basic connection test
   - Schema access verification

2. **Table Structure** (3 checks)
   - Table existence
   - Column structure validation
   - Primary key constraints

3. **Row Level Security** (4 checks)
   - RLS enabled status
   - User access policy
   - Service access policy
   - Policy enumeration

4. **Permissions** (3 checks)
   - Authenticated role permissions
   - Service role permissions
   - Schema usage permissions

5. **Helper Functions** (3 checks)
   - Function existence
   - Function permissions
   - Function accessibility

6. **Data Access** (2 checks)
   - Table query access
   - Insert operation planning

7. **Audit and Monitoring** (2 checks)
   - Audit log access
   - Migration history

## Usage Examples

### Standard Deployment
```bash
# Deploy with all safety features
npm run deploy:database

# Expected output:
# ✅ Database connected
# ✅ Backup created
# ✅ Migration applied: 6/6 sections processed
# ✅ All critical validations passed
# 📋 Report saved: database/deployment-reports/migration-*.json
```

### Validation Only
```bash
# Check current state without changes
npm run validate:database

# Expected output:
# ✅ Overall Health: HEALTHY
# ✅ Success Rate: 95.0% (19/20)
# ✅ Critical Failures: 0
```

### Rollback if Needed
```bash
# Analyze rollback impact
npm run rollback:database:analyze

# Perform rollback with confirmation
npm run rollback:database
```

## Command Line Options

### Deploy Script Options
```bash
node scripts/deploy-database-migration.js [options]

--help, -h           Show help message
--validate-only      Only run validation checks
--test-only          Only run connectivity tests
--rollback           Rollback the migration
--no-backup          Skip backup creation
--no-validation      Skip validation checks
--no-rollback        Don't rollback on validation failure
```

### Rollback Script Options
```bash
node scripts/rollback-database-migration.js [options]

--help, -h           Show help message
--analyze-only       Only analyze current state
--force              Skip confirmation prompt
--no-backup          Skip pre-rollback backup
```

### Validation Script Options
```bash
node scripts/validate-database-state.js [options]

--help, -h           Show help message
--verbose, -v        Show detailed output and data
--export             Export results to JSON file
```

## Environment Variables

Required environment variables (in `.env.local`):
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## File Structure

```
database/
├── 15-apideck-connections-rls-fix.sql     # Main migration SQL
├── DATABASE_MIGRATION_GUIDE.md            # This guide
├── APIDECK_RLS_FIX_README.md             # Legacy documentation
├── backups/                               # Backup files
│   ├── apideck-backup-*.json
│   └── pre-rollback-*.json
├── deployment-reports/                    # Deployment reports
│   └── migration-*.json
└── validation-reports/                    # Validation reports
    └── validation-*.json

scripts/
├── deploy-database-migration.js           # Main deployment script
├── rollback-database-migration.js         # Rollback script
├── validate-database-state.js            # Validation script
└── deploy-apideck-rls-fix.js             # Legacy deployment script
```

## Safety Features

### Backup System
- **Pre-deployment backup**: Current policies and state
- **Pre-rollback backup**: State before rollback
- **JSON format**: Easy to inspect and restore manually

### Validation System
- **Critical checks**: Must pass for healthy status
- **Non-critical checks**: Warnings that don't block deployment
- **Comprehensive coverage**: 25+ validation points
- **Health scoring**: Overall system health assessment

### Rollback Safety
- **Analysis first**: Shows what would be changed
- **Confirmation prompts**: Prevents accidental rollbacks
- **Selective rollback**: Preserves data and table structure
- **Verification**: Confirms rollback completed successfully

### Error Handling
- **Graceful failures**: Continues with non-critical errors
- **Detailed logging**: Comprehensive error information
- **Recovery suggestions**: Actionable troubleshooting steps
- **Exit codes**: Proper success/failure indication

## Troubleshooting

### Common Issues

1. **Permission Denied (42501)**
   ```bash
   # Check service role permissions
   npm run validate:database:verbose
   
   # Verify environment variables
   echo $SUPABASE_SERVICE_ROLE_KEY
   ```

2. **Connection Failures**
   ```bash
   # Test connectivity only
   npm run deploy:database:test
   
   # Check Supabase project status
   ```

3. **Validation Failures**
   ```bash
   # Run detailed validation
   npm run validate:database:verbose
   
   # Export results for analysis
   npm run validate:database:export
   ```

4. **Migration Already Applied**
   ```bash
   # Check current state
   npm run rollback:database:analyze
   
   # Validate existing setup
   npm run validate:database
   ```

### Manual Recovery

If automated scripts fail, you can manually execute the SQL:

1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `database/15-apideck-connections-rls-fix.sql`
3. Execute the SQL script
4. Run validation: `npm run validate:database`

### Logs and Reports

- **Deployment reports**: `database/deployment-reports/`
- **Validation reports**: `database/validation-reports/`
- **Backup files**: `database/backups/`
- **Console output**: Detailed real-time information

## Integration Testing

After successful deployment, test the integration:

1. **OAuth Flow Test**
   ```bash
   # Navigate to dashboard
   # Click "Connect to Vault"
   # Complete Google OAuth
   # Verify no permission errors
   ```

2. **Connection Storage Test**
   ```bash
   # Check connections are stored
   npm run validate:database:verbose
   
   # Look for connection_count > 0
   ```

3. **API Endpoint Test**
   ```bash
   # Test storage status endpoint
   curl -X GET /api/storage/status
   
   # Should return connection status without errors
   ```

## Next Steps

After successful deployment:

1. ✅ **Test OAuth Flow**: Complete Google Drive connection
2. ✅ **Verify Indexing**: Check that document indexing begins
3. ✅ **Monitor Logs**: Watch for any permission errors
4. ✅ **User Testing**: Verify users can only see their own connections
5. ✅ **Performance**: Monitor query performance with RLS enabled

## Support

For issues with the migration system:

1. Check the troubleshooting section above
2. Review deployment and validation reports
3. Run validation with verbose output
4. Check Supabase dashboard for manual verification
5. Consider rollback and re-deployment if needed

The migration system is designed to be safe, comprehensive, and recoverable. All operations include safety checks and detailed logging to ensure successful deployment of the Google Drive Vault integration fix.