# Application Redeployment Procedures

## Overview

This document provides comprehensive procedures for redeploying the Briefly Cloud application in disaster scenarios, including complete infrastructure rebuilds, configuration recovery, and security incident response deployments.

## Prerequisites

### Required Access
- GitHub repository access with admin privileges
- Vercel account with deployment permissions
- Supabase project access
- Environment variable management access
- Domain and DNS management access

### Required Tools
```bash
# Install required tools
npm install -g vercel
npm install -g @supabase/cli
git --version  # Ensure Git is installed
node --version # Ensure Node.js 18+ is installed
```

### Environment Setup
```bash
# Set up Vercel CLI
vercel login

# Set up Supabase CLI
supabase login

# Clone repository (if needed)
git clone https://github.com/your-org/briefly-cloud.git
cd briefly-cloud/Briefly_Cloud/briefly-cloud-nextjs
```

## Redeployment Scenarios

### 1. Complete Infrastructure Rebuild

#### When to Use
- Total Vercel project corruption
- Security incident requiring clean deployment
- Migration to new Vercel account
- Complete environment compromise

#### Procedure

1. **Prepare Clean Environment**
   ```bash
   # Create new directory for clean deployment
   mkdir -p ~/recovery/briefly-cloud-clean
   cd ~/recovery/briefly-cloud-clean
   
   # Clone repository fresh
   git clone https://github.com/your-org/briefly-cloud.git .
   cd Briefly_Cloud/briefly-cloud-nextjs
   
   # Verify repository integrity
   git log --oneline -10
   git status
   ```

2. **Create New Vercel Project**
   ```bash
   # Remove existing Vercel configuration
   rm -f .vercel/project.json
   
   # Initialize new Vercel project
   vercel --confirm
   
   # Note the new project ID and deployment URL
   vercel ls
   ```

3. **Configure Environment Variables**
   ```bash
   # Set production environment variables
   vercel env add NEXT_PUBLIC_SUPABASE_URL production
   vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
   vercel env add SUPABASE_SERVICE_ROLE_KEY production
   vercel env add OPENAI_API_KEY production
   vercel env add NEXTAUTH_SECRET production
   vercel env add NEXTAUTH_URL production
   vercel env add STRIPE_SECRET_KEY production
   vercel env add STRIPE_WEBHOOK_SECRET production
   
   # Set development environment variables
   vercel env add NEXT_PUBLIC_SUPABASE_URL development
   vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY development
   # ... repeat for all required variables
   
   # Verify environment variables
   vercel env ls
   ```

4. **Deploy Application**
   ```bash
   # Install dependencies
   npm ci
   
   # Run security validation
   npm run validate:security
   
   # Build and deploy to production
   vercel --prod
   
   # Verify deployment
   vercel ls --prod
   ```

5. **Update DNS and Domain Configuration**
   ```bash
   # Add custom domain (if needed)
   vercel domains add briefly.cloud
   
   # Verify domain configuration
   vercel domains ls
   
   # Update DNS records if necessary
   # (This step requires access to your DNS provider)
   ```

6. **Post-Deployment Validation**
   ```bash
   # Test application endpoints
   curl -f https://briefly.cloud/api/health
   curl -f https://briefly.cloud/api/auth/session
   
   # Run integration tests
   npm run test:integration:prod
   
   # Verify security headers
   curl -I https://briefly.cloud
   ```

### 2. Configuration Recovery

#### When to Use
- Environment variable corruption
- Deployment configuration issues
- Partial infrastructure problems
- Configuration drift correction

#### Procedure

1. **Backup Current Configuration**
   ```bash
   # Export current environment variables
   vercel env pull .env.backup
   
   # Save current deployment configuration
   cp .vercel/project.json .vercel/project.json.backup
   
   # Document current deployment state
   vercel ls > deployment-state-backup.txt
   ```

2. **Restore Environment Variables from Secure Storage**
   ```bash
   # Load environment variables from secure backup
   node scripts/restore-env-variables.js --source secure-backup
   
   # Verify critical variables are set
   node scripts/validate-env-variables.js --critical-only
   
   # Update Vercel environment variables
   node scripts/sync-env-to-vercel.js
   ```

3. **Update Application Configuration**
   ```bash
   # Update next.config.js if needed
   cp config/next.config.prod.js next.config.js
   
   # Update middleware configuration
   cp config/middleware.prod.ts middleware.ts
   
   # Verify configuration syntax
   npm run build:check
   ```

4. **Redeploy with Updated Configuration**
   ```bash
   # Deploy with updated configuration
   vercel --prod
   
   # Monitor deployment progress
   vercel logs --follow
   
   # Verify successful deployment
   vercel inspect --prod
   ```

### 3. Security Incident Response Deployment

#### When to Use
- Security breach detected
- Compromised credentials
- Malicious code injection
- Unauthorized access incidents

#### Procedure

1. **Immediate Security Lockdown**
   ```bash
   # Enable maintenance mode immediately
   vercel env add MAINTENANCE_MODE true production
   vercel --prod
   
   # Revoke all active sessions
   node scripts/revoke-all-sessions.js
   
   # Rotate all secrets immediately
   node scripts/emergency-secret-rotation.js
   ```

2. **Clean Code Deployment**
   ```bash
   # Create clean working directory
   mkdir -p ~/security-recovery/clean-deploy
   cd ~/security-recovery/clean-deploy
   
   # Clone from last known good commit
   git clone https://github.com/your-org/briefly-cloud.git .
   git checkout $(git log --format="%H" --before="2024-01-15 09:00:00" -1)
   
   # Verify code integrity
   node scripts/verify-code-integrity.js --full-scan
   ```

3. **Security Hardening**
   ```bash
   # Apply additional security measures
   node scripts/apply-emergency-security.js
   
   # Update security headers
   cp config/security-headers.emergency.ts src/app/lib/security/security-headers.ts
   
   # Enable enhanced monitoring
   cp config/monitoring.enhanced.js monitoring.config.js
   ```

4. **Secure Redeployment**
   ```bash
   # Deploy with enhanced security
   vercel --prod
   
   # Verify security controls
   npm run test:security:enhanced
   
   # Monitor for suspicious activity
   node scripts/monitor-security-events.js --enhanced
   ```

5. **Gradual Service Restoration**
   ```bash
   # Disable maintenance mode gradually
   vercel env add MAINTENANCE_MODE false production
   
   # Monitor system behavior
   node scripts/monitor-post-incident.js --duration 3600
   
   # Verify normal operations
   npm run test:e2e:security-focused
   ```

### 4. Database Migration Deployment

#### When to Use
- Database schema changes
- Migration to new Supabase project
- Data structure updates
- Performance optimization deployments

#### Procedure

1. **Prepare Migration Environment**
   ```bash
   # Create migration branch
   git checkout -b migration-$(date +%Y%m%d-%H%M%S)
   
   # Backup current database state
   node scripts/backup-database-state.js
   
   # Prepare migration scripts
   ls -la database/migrations/
   ```

2. **Deploy Database Changes**
   ```bash
   # Run database migrations
   node scripts/run-migrations.js --environment production
   
   # Verify migration success
   node scripts/verify-migrations.js --check-all
   
   # Update application schema references
   node scripts/update-schema-references.js
   ```

3. **Deploy Application Updates**
   ```bash
   # Update application code for new schema
   npm run build
   
   # Deploy with database compatibility
   vercel --prod
   
   # Verify database connectivity
   npm run test:database:integration
   ```

## Advanced Redeployment Scenarios

### Blue-Green Deployment

#### Setup Blue-Green Environment
```bash
# Create green environment
vercel --name briefly-cloud-green
vercel env add ENVIRONMENT_COLOR green production

# Deploy to green environment
vercel --prod --name briefly-cloud-green

# Test green environment
npm run test:e2e --base-url https://briefly-cloud-green.vercel.app

# Switch traffic to green
vercel alias briefly-cloud-green.vercel.app briefly.cloud
```

### Canary Deployment

#### Gradual Traffic Migration
```bash
# Deploy canary version
vercel --name briefly-cloud-canary
vercel env add CANARY_DEPLOYMENT true production

# Configure traffic splitting (10% to canary)
node scripts/configure-traffic-split.js --canary 10

# Monitor canary performance
node scripts/monitor-canary.js --duration 1800

# Increase traffic gradually
node scripts/configure-traffic-split.js --canary 50
node scripts/configure-traffic-split.js --canary 100
```

### Multi-Region Deployment

#### Deploy to Multiple Regions
```bash
# Deploy to US East
vercel --prod --regions iad1

# Deploy to Europe
vercel --prod --regions fra1

# Deploy to Asia Pacific
vercel --prod --regions sin1

# Configure global load balancing
node scripts/configure-global-lb.js
```

## Rollback Procedures

### Immediate Rollback

#### Quick Rollback to Previous Version
```bash
# List recent deployments
vercel ls --prod

# Rollback to previous deployment
vercel rollback https://briefly-cloud-abc123.vercel.app --prod

# Verify rollback success
curl -f https://briefly.cloud/api/health
```

### Selective Rollback

#### Rollback Specific Components
```bash
# Rollback only API routes
vercel rollback --prod --scope api

# Rollback only frontend
vercel rollback --prod --scope frontend

# Rollback specific environment variables
vercel env rm FEATURE_FLAG_NEW_UI production
vercel env add FEATURE_FLAG_NEW_UI false production
```

## Monitoring and Validation

### Deployment Health Checks

#### Automated Health Validation
```javascript
// scripts/validate-deployment-health.js
const axios = require('axios');

async function validateDeploymentHealth(baseUrl) {
  const checks = [
    { name: 'Health Check', url: `${baseUrl}/api/health` },
    { name: 'Auth Check', url: `${baseUrl}/api/auth/session` },
    { name: 'Database Check', url: `${baseUrl}/api/health/database` },
    { name: 'Storage Check', url: `${baseUrl}/api/health/storage` }
  ];

  const results = [];
  
  for (const check of checks) {
    try {
      const response = await axios.get(check.url, { timeout: 10000 });
      results.push({
        name: check.name,
        status: 'pass',
        responseTime: response.headers['x-response-time'],
        statusCode: response.status
      });
    } catch (error) {
      results.push({
        name: check.name,
        status: 'fail',
        error: error.message,
        statusCode: error.response?.status
      });
    }
  }
  
  return results;
}

module.exports = { validateDeploymentHealth };
```

### Performance Validation

#### Performance Baseline Checks
```bash
# Run performance tests
npm run test:performance:baseline

# Check Core Web Vitals
node scripts/check-core-web-vitals.js --url https://briefly.cloud

# Validate API response times
node scripts/validate-api-performance.js --threshold 500ms
```

### Security Validation

#### Post-Deployment Security Checks
```bash
# Verify security headers
node scripts/check-security-headers.js --url https://briefly.cloud

# Test authentication flows
npm run test:auth:security

# Verify RLS policies
npm run test:rls:validation

# Check for security vulnerabilities
npm audit --audit-level moderate
```

## Troubleshooting Common Issues

### Deployment Failures

#### Build Failures
```bash
# Check build logs
vercel logs --prod

# Local build test
npm run build

# Check for dependency issues
npm ci --production
npm run build:check
```

#### Environment Variable Issues
```bash
# Verify environment variables
vercel env ls

# Test environment variable access
node -e "console.log(process.env.NEXT_PUBLIC_SUPABASE_URL)"

# Validate environment configuration
node scripts/validate-env-config.js
```

### Performance Issues

#### Slow Deployment
```bash
# Check deployment size
du -sh .next/

# Optimize bundle size
npm run analyze

# Check for large dependencies
npx bundle-analyzer .next/static/chunks/
```

#### Runtime Performance Issues
```bash
# Monitor memory usage
vercel logs --prod | grep "Memory"

# Check function execution times
vercel logs --prod | grep "Duration"

# Analyze cold start performance
node scripts/analyze-cold-starts.js
```

## Documentation and Reporting

### Deployment Report Template

```markdown
# Application Redeployment Report

**Deployment ID**: DEPLOY-2024-0115-001
**Deployment Date**: 2024-01-15
**Deployment Team**: [Team Members]
**Deployment Type**: Emergency Security Response

## Deployment Summary
- **Start Time**: 2024-01-15 10:00:00 UTC
- **Completion Time**: 2024-01-15 10:45:00 UTC
- **Total Duration**: 45 minutes
- **Deployment URL**: https://briefly.cloud

## Changes Deployed
1. [List of changes with commit hashes]

## Validation Results
- **Health Checks**: ✅ All Passed
- **Performance Tests**: ✅ Within Baseline
- **Security Tests**: ✅ All Controls Active
- **Integration Tests**: ✅ All Passed

## Issues Encountered
- [Any issues and their resolutions]

## Post-Deployment Actions
- [Required follow-up actions]

## Lessons Learned
- [Key findings and improvements]
```

### Deployment Checklist

#### Pre-Deployment Checklist
- [ ] Code review completed and approved
- [ ] Security scan passed
- [ ] Environment variables validated
- [ ] Database migrations tested
- [ ] Backup procedures verified
- [ ] Rollback plan prepared

#### Post-Deployment Checklist
- [ ] Health checks passed
- [ ] Performance baseline met
- [ ] Security controls verified
- [ ] User acceptance testing completed
- [ ] Monitoring alerts configured
- [ ] Documentation updated

This comprehensive redeployment procedure ensures reliable application recovery and deployment capabilities while maintaining security and performance standards throughout the process.