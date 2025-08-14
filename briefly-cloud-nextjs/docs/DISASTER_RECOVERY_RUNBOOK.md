# Disaster Recovery Runbook

## Overview

This runbook provides step-by-step procedures for recovering from various disaster scenarios affecting Briefly Cloud. It covers database restoration, application redeployment, and security incident response.

## Emergency Contacts

- **Primary On-Call**: [Contact Information]
- **Secondary On-Call**: [Contact Information]
- **Security Team**: [Contact Information]
- **Infrastructure Team**: [Contact Information]

## Recovery Time Objectives (RTO) and Recovery Point Objectives (RPO)

- **RTO**: 4 hours (maximum acceptable downtime)
- **RPO**: 1 hour (maximum acceptable data loss)
- **Critical Systems RTO**: 1 hour
- **Critical Systems RPO**: 15 minutes

## Disaster Scenarios

### 1. Database Corruption or Loss

#### Symptoms
- Database connection failures
- Data integrity errors
- Complete database unavailability

#### Immediate Response (0-15 minutes)
1. **Assess the situation**
   ```bash
   # Check database status
   curl -X GET "https://api.supabase.com/v1/projects/{project_id}/database/status" \
     -H "Authorization: Bearer {service_role_key}"
   ```

2. **Activate incident response**
   - Notify stakeholders
   - Enable maintenance mode
   - Document incident start time

3. **Verify backup availability**
   ```bash
   # List available backups
   node scripts/validate-backups.js --list-recent
   ```

#### Recovery Procedure (15-60 minutes)

1. **Stop application traffic**
   ```bash
   # Update Vercel deployment to maintenance mode
   vercel --prod --env MAINTENANCE_MODE=true
   ```

2. **Identify recovery point**
   ```bash
   # Find the latest valid backup
   node scripts/validate-backups.js --find-latest-valid
   ```

3. **Restore from Point-in-Time Recovery (PITR)**
   ```bash
   # Restore to specific timestamp
   curl -X POST "https://api.supabase.com/v1/projects/{project_id}/database/backups/restore" \
     -H "Authorization: Bearer {service_role_key}" \
     -H "Content-Type: application/json" \
     -d '{
       "recovery_time": "2024-01-15T10:30:00Z",
       "recovery_method": "pitr"
     }'
   ```

4. **Verify database integrity**
   ```bash
   # Run integrity checks
   node scripts/validate-backups.js --verify-integrity
   ```

5. **Test critical functions**
   ```bash
   # Test authentication
   curl -X POST "https://your-app.vercel.app/api/auth/test"
   
   # Test database connectivity
   curl -X GET "https://your-app.vercel.app/api/health/database"
   ```

6. **Resume normal operations**
   ```bash
   # Disable maintenance mode
   vercel --prod --env MAINTENANCE_MODE=false
   ```

### 2. Application Infrastructure Failure

#### Symptoms
- Vercel deployment failures
- API endpoint unavailability
- Frontend application errors

#### Immediate Response (0-15 minutes)
1. **Check Vercel status**
   ```bash
   # Check deployment status
   vercel ls --prod
   ```

2. **Verify external dependencies**
   - Supabase status
   - OpenAI API status
   - Third-party integrations

#### Recovery Procedure (15-120 minutes)

1. **Redeploy from last known good state**
   ```bash
   # Deploy from main branch
   git checkout main
   git pull origin main
   vercel --prod
   ```

2. **If deployment fails, rollback**
   ```bash
   # Rollback to previous deployment
   vercel rollback --prod
   ```

3. **Environment variable verification**
   ```bash
   # Validate all required environment variables
   node scripts/validate-security.js --check-env
   ```

4. **Database connection test**
   ```bash
   # Test database connectivity
   npm run test:db-connection
   ```

### 3. Security Incident Response

#### Symptoms
- Unauthorized access detected
- Data breach indicators
- Suspicious activity patterns
- Compromised credentials

#### Immediate Response (0-30 minutes)

1. **Contain the incident**
   ```bash
   # Enable emergency lockdown mode
   node scripts/emergency-lockdown.js
   ```

2. **Rotate all secrets immediately**
   ```bash
   # Emergency secret rotation
   node scripts/rotate-secrets.js --emergency
   ```

3. **Revoke all active sessions**
   ```bash
   # Revoke all user sessions
   curl -X POST "https://your-supabase-url/auth/v1/admin/users/revoke-sessions" \
     -H "Authorization: Bearer {service_role_key}"
   ```

#### Investigation and Recovery (30-240 minutes)

1. **Preserve evidence**
   ```bash
   # Export audit logs
   node scripts/export-audit-logs.js --incident-mode
   ```

2. **Assess damage scope**
   ```bash
   # Run security assessment
   node scripts/security-assessment.js --full-scan
   ```

3. **Restore from clean backup if needed**
   ```bash
   # Restore from pre-incident backup
   node scripts/restore-clean-backup.js --timestamp "2024-01-15T09:00:00Z"
   ```

4. **Implement additional security measures**
   ```bash
   # Enable enhanced monitoring
   node scripts/enable-enhanced-monitoring.js
   ```

## Recovery Procedures by Component

### Database Recovery

#### Full Database Restore
```bash
# 1. Create new Supabase project (if current is compromised)
# 2. Restore schema
psql -h db.{new-project-id}.supabase.co -U postgres -d postgres -f database/full-schema.sql

# 3. Restore data from backup
pg_restore -h db.{new-project-id}.supabase.co -U postgres -d postgres backup.dump

# 4. Update application configuration
# Update NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
```

#### Partial Data Recovery
```bash
# Restore specific tables
pg_restore -h db.{project-id}.supabase.co -U postgres -d postgres -t app.users backup.dump
pg_restore -h db.{project-id}.supabase.co -U postgres -d postgres -t app.files backup.dump
```

### Application Redeployment

#### Complete Application Rebuild
```bash
# 1. Clone repository
git clone https://github.com/your-org/briefly-cloud.git
cd briefly-cloud/Briefly_Cloud/briefly-cloud-nextjs

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.local
# Update all environment variables

# 4. Run security validation
npm run validate:security

# 5. Deploy to Vercel
vercel --prod

# 6. Verify deployment
npm run test:e2e:prod
```

#### Configuration Recovery
```bash
# Restore Vercel environment variables
vercel env pull .env.vercel
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
# ... add all required variables

# Redeploy with new configuration
vercel --prod
```

### Encryption Key Rotation

#### Emergency Key Rotation
```bash
# 1. Generate new encryption keys
node scripts/generate-encryption-keys.js --emergency

# 2. Update key storage
node scripts/update-encryption-keys.js --rotate-all

# 3. Re-encrypt sensitive data
node scripts/re-encrypt-data.js --use-new-keys

# 4. Update application configuration
node scripts/update-key-references.js

# 5. Verify encryption integrity
node scripts/verify-encryption.js --full-check
```

## Post-Recovery Procedures

### 1. System Validation
```bash
# Run comprehensive system tests
npm run test:system:full

# Validate security controls
npm run test:security:full

# Check performance metrics
npm run test:performance:baseline
```

### 2. Monitoring Restoration
```bash
# Re-enable all monitoring
node scripts/enable-monitoring.js --all

# Verify alert configurations
node scripts/verify-alerts.js

# Test notification systems
node scripts/test-notifications.js
```

### 3. Documentation Updates
- Update incident log
- Document lessons learned
- Update recovery procedures if needed
- Notify stakeholders of resolution

## Testing and Validation

### Monthly DR Tests
```bash
# Schedule: First Saturday of each month
# Duration: 2-4 hours
# Scope: Full disaster recovery simulation

# 1. Create test environment
node scripts/create-dr-test-env.js

# 2. Simulate disaster
node scripts/simulate-disaster.js --type database-corruption

# 3. Execute recovery procedures
# Follow procedures in this runbook

# 4. Validate recovery
node scripts/validate-dr-recovery.js

# 5. Document results
node scripts/generate-dr-report.js
```

### Quarterly Security Incident Simulations
```bash
# Schedule: Last Friday of each quarter
# Duration: 4-6 hours
# Scope: Security incident response

# 1. Simulate security incident
node scripts/simulate-security-incident.js

# 2. Execute incident response
# Follow security incident procedures

# 3. Validate response effectiveness
node scripts/validate-incident-response.js

# 4. Update procedures based on findings
```

## Escalation Procedures

### Level 1: Automated Response
- Automated failover systems
- Basic monitoring alerts
- Self-healing mechanisms

### Level 2: On-Call Engineer
- Manual intervention required
- Complex troubleshooting
- Coordination with external services

### Level 3: Management Escalation
- Extended outage (>2 hours)
- Security incidents
- Data loss scenarios

### Level 4: Executive Escalation
- Critical business impact
- Legal/compliance implications
- Public relations concerns

## Communication Templates

### Internal Incident Notification
```
Subject: [INCIDENT] Briefly Cloud Service Disruption - Severity: {HIGH/MEDIUM/LOW}

Incident ID: {incident-id}
Start Time: {timestamp}
Affected Services: {list}
Current Status: {investigating/mitigating/resolved}
Estimated Resolution: {time}

Impact:
- {description of user impact}

Actions Taken:
- {list of actions}

Next Steps:
- {planned actions}

Updates will be provided every 30 minutes.
```

### Customer Communication
```
Subject: Service Update - Briefly Cloud

We are currently experiencing technical difficulties that may affect your ability to access Briefly Cloud services.

What happened: {brief description}
When: {start time}
Impact: {what users might experience}
Resolution: {expected timeline}

We sincerely apologize for any inconvenience and are working to resolve this as quickly as possible.

Updates: {where to find updates}
```

## Recovery Metrics and KPIs

### Key Metrics to Track
- **Mean Time to Detection (MTTD)**: Target < 5 minutes
- **Mean Time to Response (MTTR)**: Target < 15 minutes
- **Mean Time to Recovery (MTTR)**: Target < 4 hours
- **Recovery Success Rate**: Target > 99%
- **Data Loss**: Target < 1 hour of data

### Performance Baselines
- Database query response time: < 100ms
- API endpoint response time: < 500ms
- File upload success rate: > 99.9%
- Authentication success rate: > 99.9%

## Appendices

### A. Emergency Contact Information
[Detailed contact information for all stakeholders]

### B. Service Dependencies
[Complete list of external dependencies and their contact information]

### C. Recovery Scripts Reference
[Detailed documentation of all recovery scripts and their usage]

### D. Compliance Requirements
[Specific recovery requirements for regulatory compliance]