# Security Configuration Management

## Overview

This document provides comprehensive guidelines for managing security configurations across the Briefly Cloud infrastructure. It covers configuration standards, change management processes, monitoring procedures, and compliance requirements.

## Configuration Standards

### Application Security Configuration

#### Next.js Security Headers
```javascript
// next.config.js - Security Headers Configuration
const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains; preload'
  },
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co https://api.openai.com; frame-ancestors 'none';"
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=()'
  }
];

module.exports = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};
```

#### Environment Variable Security
```bash
# Production Environment Variables - Security Configuration
NEXT_PUBLIC_SUPABASE_URL=https://[project-id].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon-key]
SUPABASE_SERVICE_ROLE_KEY=[service-role-key]
NEXTAUTH_SECRET=[32-character-random-string]
NEXTAUTH_URL=https://briefly.cloud
OPENAI_API_KEY=[openai-key]
STRIPE_SECRET_KEY=[stripe-secret]
STRIPE_WEBHOOK_SECRET=[webhook-secret]

# Security-specific variables
SECURITY_AUDIT_ENABLED=true
RATE_LIMITING_ENABLED=true
ENHANCED_LOGGING=true
MAINTENANCE_MODE=false
EMERGENCY_LOCKDOWN=false
```

### Database Security Configuration

#### Supabase Security Settings
```sql
-- Row Level Security (RLS) Configuration
ALTER TABLE app.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.rate_limits ENABLE ROW LEVEL SECURITY;

-- Private schema security
ALTER TABLE private.oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.encryption_keys ENABLE ROW LEVEL SECURITY;

-- Connection security settings
ALTER SYSTEM SET ssl = on;
ALTER SYSTEM SET log_connections = on;
ALTER SYSTEM SET log_disconnections = on;
ALTER SYSTEM SET log_statement = 'mod';
```

#### Database User Roles and Permissions
```sql
-- Service role permissions (minimal required)
GRANT SELECT, INSERT, UPDATE, DELETE ON app.users TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.files TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.document_chunks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.conversations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.chat_messages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.usage_logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.rate_limits TO service_role;

-- Private schema access (service role only)
GRANT SELECT, INSERT, UPDATE, DELETE ON private.oauth_tokens TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON private.audit_logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON private.encryption_keys TO service_role;

-- Authenticated user permissions (via RLS)
-- Users can only access their own data through RLS policies
```

### Infrastructure Security Configuration

#### Vercel Security Settings
```json
{
  "version": 2,
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/next"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        }
      ]
    }
  ],
  "redirects": [
    {
      "source": "/admin/(.*)",
      "destination": "/admin/$1",
      "permanent": false,
      "has": [
        {
          "type": "header",
          "key": "authorization"
        }
      ]
    }
  ]
}
```

#### DNS Security Configuration
```
# DNS Security Records
briefly.cloud. IN CAA 0 issue "letsencrypt.org"
briefly.cloud. IN CAA 0 issuewild ";"
briefly.cloud. IN CAA 0 iodef "mailto:security@briefly.cloud"

# DMARC Policy
_dmarc.briefly.cloud. IN TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc@briefly.cloud; ruf=mailto:dmarc@briefly.cloud; fo=1"

# SPF Record
briefly.cloud. IN TXT "v=spf1 include:_spf.google.com ~all"

# DKIM (configured through email provider)
```

## Configuration Change Management

### Change Control Process

#### 1. Change Request Template
```markdown
# Security Configuration Change Request

**Change ID**: SCR-2024-001
**Requestor**: [Name]
**Date**: [Date]
**Priority**: [Low/Medium/High/Critical]

## Change Description
[Detailed description of the configuration change]

## Business Justification
[Why this change is needed]

## Security Impact Assessment
[Analysis of security implications]

## Affected Systems
- [ ] Application (Next.js)
- [ ] Database (Supabase)
- [ ] Infrastructure (Vercel)
- [ ] DNS Configuration
- [ ] Third-party Services

## Implementation Plan
1. [Step 1]
2. [Step 2]
3. [Step 3]

## Testing Plan
- [ ] Development environment testing
- [ ] Security validation
- [ ] Performance impact assessment
- [ ] Rollback procedure verification

## Rollback Plan
[Detailed rollback procedure if change fails]

## Approvals Required
- [ ] Security Team Lead
- [ ] System Administrator
- [ ] Development Lead
- [ ] (Critical changes) CTO Approval

## Implementation Schedule
**Planned Start**: [Date/Time]
**Planned Completion**: [Date/Time]
**Maintenance Window**: [If applicable]
```

#### 2. Change Approval Matrix

| Change Type | Security Lead | System Admin | Dev Lead | CTO |
|-------------|---------------|--------------|----------|-----|
| Low Impact | ✓ | - | - | - |
| Medium Impact | ✓ | ✓ | - | - |
| High Impact | ✓ | ✓ | ✓ | - |
| Critical/Emergency | ✓ | ✓ | ✓ | ✓ |

### Configuration Validation Scripts

#### Pre-Change Validation
```bash
#!/bin/bash
# scripts/validate-security-config-pre-change.sh

echo "🔍 Pre-Change Security Configuration Validation"

# Backup current configuration
echo "📦 Backing up current configuration..."
node scripts/backup-security-config.js

# Validate current security posture
echo "🛡️ Validating current security posture..."
npm run test:security:baseline

# Check for active incidents
echo "🚨 Checking for active security incidents..."
node scripts/check-active-incidents.js

# Validate change prerequisites
echo "✅ Validating change prerequisites..."
node scripts/validate-change-prerequisites.js --change-id $1

echo "✅ Pre-change validation completed"
```

#### Post-Change Validation
```bash
#!/bin/bash
# scripts/validate-security-config-post-change.sh

echo "🔍 Post-Change Security Configuration Validation"

# Validate new configuration
echo "🛡️ Validating new security configuration..."
npm run test:security:comprehensive

# Check security headers
echo "🔒 Validating security headers..."
node scripts/validate-security-headers.js --url https://briefly.cloud

# Test authentication flows
echo "🔐 Testing authentication flows..."
npm run test:auth:security

# Validate RLS policies
echo "🛡️ Validating RLS policies..."
npm run test:rls:comprehensive

# Check audit logging
echo "📝 Validating audit logging..."
node scripts/validate-audit-logging.js

# Performance impact assessment
echo "⚡ Assessing performance impact..."
node scripts/assess-performance-impact.js

echo "✅ Post-change validation completed"
```

## Configuration Monitoring

### Automated Configuration Monitoring

#### Configuration Drift Detection
```javascript
// scripts/detect-config-drift.js
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;

class ConfigurationDriftDetector {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    this.baselineConfig = null;
    this.currentConfig = null;
    this.driftResults = [];
  }

  async detectDrift() {
    console.log('🔍 Detecting configuration drift...');
    
    // Load baseline configuration
    await this.loadBaselineConfig();
    
    // Capture current configuration
    await this.captureCurrentConfig();
    
    // Compare configurations
    await this.compareConfigurations();
    
    // Generate drift report
    await this.generateDriftReport();
    
    // Alert on critical drift
    await this.alertOnCriticalDrift();
  }

  async loadBaselineConfig() {
    try {
      const baselineData = await fs.readFile('./config/security-baseline.json', 'utf8');
      this.baselineConfig = JSON.parse(baselineData);
    } catch (error) {
      throw new Error(`Failed to load baseline configuration: ${error.message}`);
    }
  }

  async captureCurrentConfig() {
    this.currentConfig = {
      database: await this.captureDatabaseConfig(),
      application: await this.captureApplicationConfig(),
      infrastructure: await this.captureInfrastructureConfig(),
      timestamp: new Date().toISOString()
    };
  }

  async captureDatabaseConfig() {
    // Capture RLS policies
    const { data: rlsPolicies } = await this.supabase
      .rpc('get_rls_policies');
    
    // Capture user roles and permissions
    const { data: userRoles } = await this.supabase
      .rpc('get_user_roles');
    
    return {
      rlsPolicies: rlsPolicies || [],
      userRoles: userRoles || [],
      connectionSettings: await this.getDatabaseConnectionSettings()
    };
  }

  async captureApplicationConfig() {
    return {
      securityHeaders: await this.getSecurityHeaders(),
      environmentVariables: await this.getEnvironmentVariables(),
      middlewareConfig: await this.getMiddlewareConfig()
    };
  }

  async captureInfrastructureConfig() {
    return {
      vercelConfig: await this.getVercelConfig(),
      dnsConfig: await this.getDNSConfig(),
      sslConfig: await this.getSSLConfig()
    };
  }

  async compareConfigurations() {
    this.driftResults = [];
    
    // Compare database configuration
    this.compareDatabaseConfig();
    
    // Compare application configuration
    this.compareApplicationConfig();
    
    // Compare infrastructure configuration
    this.compareInfrastructureConfig();
  }

  compareDatabaseConfig() {
    const baseline = this.baselineConfig.database;
    const current = this.currentConfig.database;
    
    // Compare RLS policies
    this.compareRLSPolicies(baseline.rlsPolicies, current.rlsPolicies);
    
    // Compare user roles
    this.compareUserRoles(baseline.userRoles, current.userRoles);
  }

  compareRLSPolicies(baseline, current) {
    const baselinePolicies = new Set(baseline.map(p => `${p.table}.${p.policy}`));
    const currentPolicies = new Set(current.map(p => `${p.table}.${p.policy}`));
    
    // Find missing policies
    const missingPolicies = [...baselinePolicies].filter(p => !currentPolicies.has(p));
    if (missingPolicies.length > 0) {
      this.driftResults.push({
        category: 'database',
        type: 'missing_rls_policies',
        severity: 'critical',
        details: missingPolicies
      });
    }
    
    // Find extra policies
    const extraPolicies = [...currentPolicies].filter(p => !baselinePolicies.has(p));
    if (extraPolicies.length > 0) {
      this.driftResults.push({
        category: 'database',
        type: 'extra_rls_policies',
        severity: 'medium',
        details: extraPolicies
      });
    }
  }

  async generateDriftReport() {
    const report = {
      reportType: 'Configuration Drift Detection',
      timestamp: new Date().toISOString(),
      driftDetected: this.driftResults.length > 0,
      criticalDrift: this.driftResults.filter(d => d.severity === 'critical').length,
      totalDriftItems: this.driftResults.length,
      driftResults: this.driftResults,
      recommendations: this.generateRecommendations()
    };
    
    // Save report
    const reportPath = `./reports/config-drift-${Date.now()}.json`;
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`📊 Configuration drift report saved: ${reportPath}`);
    return report;
  }

  async alertOnCriticalDrift() {
    const criticalDrift = this.driftResults.filter(d => d.severity === 'critical');
    
    if (criticalDrift.length > 0) {
      console.log(`🚨 CRITICAL: ${criticalDrift.length} critical configuration drift items detected`);
      
      // Send alerts
      await this.sendCriticalDriftAlert(criticalDrift);
    }
  }
}

module.exports = { ConfigurationDriftDetector };
```

#### Security Configuration Monitoring Dashboard
```javascript
// scripts/security-config-dashboard.js
class SecurityConfigDashboard {
  constructor() {
    this.metrics = {
      configCompliance: 0,
      securityPosture: 0,
      driftItems: 0,
      lastValidation: null
    };
  }

  async generateDashboard() {
    console.log('📊 Generating Security Configuration Dashboard...');
    
    // Collect current metrics
    await this.collectMetrics();
    
    // Generate dashboard data
    const dashboardData = await this.generateDashboardData();
    
    // Create visual dashboard
    await this.createVisualDashboard(dashboardData);
    
    return dashboardData;
  }

  async collectMetrics() {
    // Configuration compliance score
    this.metrics.configCompliance = await this.calculateComplianceScore();
    
    // Security posture score
    this.metrics.securityPosture = await this.calculateSecurityPosture();
    
    // Configuration drift items
    this.metrics.driftItems = await this.countDriftItems();
    
    // Last validation timestamp
    this.metrics.lastValidation = await this.getLastValidationTime();
  }

  async generateDashboardData() {
    return {
      overview: {
        configCompliance: `${this.metrics.configCompliance}%`,
        securityPosture: `${this.metrics.securityPosture}%`,
        driftItems: this.metrics.driftItems,
        lastValidation: this.metrics.lastValidation
      },
      categories: {
        database: await this.getDatabaseConfigStatus(),
        application: await this.getApplicationConfigStatus(),
        infrastructure: await this.getInfrastructureConfigStatus()
      },
      trends: await this.getConfigurationTrends(),
      alerts: await this.getActiveConfigAlerts()
    };
  }
}
```

### Manual Configuration Reviews

#### Monthly Security Configuration Review Checklist

```markdown
# Monthly Security Configuration Review

**Review Date**: [Date]
**Reviewer**: [Name]
**Review Period**: [Start Date] - [End Date]

## Database Configuration Review
- [ ] RLS policies are enabled on all tenant tables
- [ ] User roles and permissions are appropriate
- [ ] Audit logging is functioning correctly
- [ ] Encryption keys are rotated per schedule
- [ ] Database connection security is maintained

## Application Configuration Review
- [ ] Security headers are properly configured
- [ ] Environment variables are secure and up-to-date
- [ ] Authentication configuration is correct
- [ ] Rate limiting is functioning as expected
- [ ] Error handling doesn't leak sensitive information

## Infrastructure Configuration Review
- [ ] Vercel security settings are optimal
- [ ] DNS security records are in place
- [ ] SSL/TLS configuration is current
- [ ] CDN security settings are appropriate
- [ ] Monitoring and alerting are functional

## Compliance Review
- [ ] SOC 2 requirements are met
- [ ] GDPR compliance is maintained
- [ ] CCPA requirements are satisfied
- [ ] Industry best practices are followed

## Change Management Review
- [ ] All changes followed proper approval process
- [ ] Change documentation is complete
- [ ] Rollback procedures were tested
- [ ] Post-change validation was performed

## Findings and Recommendations
[Document any findings and recommendations]

## Action Items
1. [Action item 1]
2. [Action item 2]
3. [Action item 3]

**Next Review Date**: [Date]
**Reviewer Signature**: [Signature]
```

## Compliance and Audit Requirements

### SOC 2 Configuration Requirements

#### Control Objectives
1. **CC6.1 - Logical and Physical Access Controls**
   - Multi-factor authentication implementation
   - Role-based access control configuration
   - Regular access reviews and updates

2. **CC6.2 - System Access Monitoring**
   - Comprehensive audit logging
   - Real-time monitoring and alerting
   - Regular log review procedures

3. **CC6.3 - Access Revocation**
   - Automated access revocation procedures
   - Timely removal of terminated user access
   - Regular access certification processes

#### Configuration Evidence Collection
```bash
# SOC 2 Evidence Collection Script
#!/bin/bash

echo "📋 Collecting SOC 2 Configuration Evidence..."

# Access control evidence
node scripts/collect-access-control-evidence.js --output ./evidence/access-controls/

# Monitoring evidence
node scripts/collect-monitoring-evidence.js --output ./evidence/monitoring/

# Change management evidence
node scripts/collect-change-management-evidence.js --output ./evidence/changes/

# Security configuration evidence
node scripts/collect-security-config-evidence.js --output ./evidence/security/

echo "✅ SOC 2 evidence collection completed"
```

### GDPR Configuration Requirements

#### Data Protection Configuration
```javascript
// GDPR Data Protection Configuration
const gdprConfig = {
  dataRetention: {
    userProfiles: '7 years',
    chatMessages: '3 years',
    auditLogs: '6 years',
    usageLogs: '2 years'
  },
  dataProcessing: {
    lawfulBasis: 'contract',
    dataMinimization: true,
    purposeLimitation: true,
    accuracyMaintenance: true
  },
  userRights: {
    accessRight: true,
    rectificationRight: true,
    erasureRight: true,
    portabilityRight: true,
    objectionRight: true
  },
  technicalMeasures: {
    encryption: 'AES-256-GCM',
    pseudonymization: true,
    accessControls: 'role-based',
    auditLogging: 'comprehensive'
  }
};
```

## Security Configuration Automation

### Infrastructure as Code (IaC)

#### Terraform Configuration for Security
```hcl
# terraform/security.tf
resource "vercel_project_environment_variable" "security_headers" {
  project_id = var.vercel_project_id
  key        = "SECURITY_HEADERS_ENABLED"
  value      = "true"
  target     = ["production"]
}

resource "vercel_project_environment_variable" "audit_logging" {
  project_id = var.vercel_project_id
  key        = "AUDIT_LOGGING_LEVEL"
  value      = "comprehensive"
  target     = ["production"]
}

resource "vercel_project_environment_variable" "rate_limiting" {
  project_id = var.vercel_project_id
  key        = "RATE_LIMITING_ENABLED"
  value      = "true"
  target     = ["production"]
}
```

#### Automated Security Configuration Deployment
```yaml
# .github/workflows/security-config-deployment.yml
name: Security Configuration Deployment

on:
  push:
    paths:
      - 'config/security/**'
      - 'terraform/security.tf'
    branches:
      - main

jobs:
  deploy-security-config:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Validate Security Configuration
        run: |
          npm run validate:security-config
          
      - name: Deploy Infrastructure Changes
        run: |
          terraform plan -var-file="production.tfvars"
          terraform apply -auto-approve
          
      - name: Validate Deployment
        run: |
          npm run test:security:post-deployment
          
      - name: Update Configuration Baseline
        run: |
          node scripts/update-security-baseline.js
```

## Emergency Configuration Procedures

### Security Configuration Rollback

#### Emergency Rollback Script
```bash
#!/bin/bash
# scripts/emergency-security-rollback.sh

echo "🚨 EMERGENCY: Rolling back security configuration"

# Confirm emergency authorization
read -p "Enter emergency authorization code: " auth_code
if [ "$auth_code" != "$EMERGENCY_AUTH_CODE" ]; then
    echo "❌ Invalid authorization code"
    exit 1
fi

# Rollback to last known good configuration
echo "📦 Rolling back to last known good configuration..."
node scripts/rollback-security-config.js --emergency --backup-id $1

# Validate rollback
echo "✅ Validating rollback..."
npm run test:security:emergency-validation

# Notify stakeholders
echo "📧 Notifying stakeholders..."
node scripts/notify-emergency-rollback.js --reason "$2"

echo "✅ Emergency rollback completed"
```

### Configuration Lock-down Procedures

#### Emergency Lock-down Script
```bash
#!/bin/bash
# scripts/emergency-lockdown.sh

echo "🔒 EMERGENCY: Implementing security lockdown"

# Enable maintenance mode
vercel env add MAINTENANCE_MODE true production
vercel env add EMERGENCY_LOCKDOWN true production

# Deploy lockdown configuration
vercel --prod

# Revoke all active sessions
node scripts/revoke-all-sessions.js --emergency

# Enable enhanced monitoring
node scripts/enable-enhanced-monitoring.js --emergency

# Notify security team
node scripts/notify-security-team.js --emergency-lockdown

echo "🔒 Emergency lockdown implemented"
```

This security configuration management documentation provides comprehensive guidance for maintaining secure configurations across the Briefly Cloud infrastructure while ensuring compliance with industry standards and regulatory requirements.