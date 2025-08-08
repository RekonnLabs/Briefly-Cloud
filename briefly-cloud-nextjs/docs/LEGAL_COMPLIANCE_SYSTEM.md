# Legal Compliance and Accessibility System

This document describes the comprehensive legal compliance and accessibility system implemented for Briefly Cloud, ensuring GDPR compliance, accessibility standards (WCAG 2.1 AA), and proper data management.

## Overview

The legal compliance system provides:

- **GDPR Compliance**: Full compliance with European data protection regulations
- **Consent Management**: Granular user consent for different data processing activities
- **Data Rights**: Implementation of user rights (access, rectification, erasure, portability)
- **Accessibility**: WCAG 2.1 AA compliance with audit tools
- **Data Retention**: Automated cleanup of expired data
- **Legal Documentation**: Updated Terms of Service and Privacy Policy

## Architecture

### Core Components

1. **GDPR Compliance Service** (`/app/lib/gdpr-compliance.ts`)
   - Consent recording and management
   - Data export and deletion requests
   - Automated data cleanup
   - Audit trail maintenance

2. **Consent Management** (`/app/components/ConsentManager.tsx`)
   - Cookie consent banner
   - Granular consent preferences
   - Real-time consent application

3. **Accessibility System** (`/app/lib/accessibility.ts`)
   - WCAG compliance utilities
   - Color contrast checking
   - Focus management
   - Screen reader support

4. **Legal Pages** (`/app/legal/`)
   - Terms of Service
   - Privacy Policy
   - GDPR-compliant documentation

5. **User Dashboard** (`/app/components/GDPRDashboard.tsx`)
   - Privacy preferences management
   - Data export requests
   - Account deletion tools

## GDPR Compliance Features

### 1. Consent Management

#### Consent Types
- **Essential**: Required for basic functionality (always active)
- **Analytics**: Usage statistics and performance monitoring
- **Marketing**: Promotional communications and advertising
- **Functional**: Enhanced features and personalization

#### Implementation
```typescript
// Record user consent
await gdprService.recordConsent(userId, 'analytics', true, {
  version: '1.0',
  ip_address: userIP,
  user_agent: userAgent
});

// Check consent validity
const hasConsent = await gdprService.hasValidConsent(userId, 'analytics');
```

### 2. Data Subject Rights

#### Right of Access (Article 15)
Users can request a copy of all their personal data:

```typescript
// Request data export
const exportRequest = await gdprService.requestDataExport(userId);

// Export includes:
// - User profile and account information
// - Uploaded documents and metadata
// - Chat conversations and history
// - Consent records and preferences
// - OAuth connections (anonymized)
```

#### Right to Rectification (Article 16)
Users can update their personal information through account settings.

#### Right to Erasure (Article 17)
Users can request deletion of their data or entire account:

```typescript
// Delete data only (keep account)
await gdprService.requestDataDeletion(userId, 'data_only', reason);

// Delete entire account
await gdprService.requestDataDeletion(userId, 'account', reason);
```

#### Right to Data Portability (Article 20)
Data exports are provided in structured JSON format for easy portability.

### 3. Data Retention and Cleanup

#### Retention Policies
- **Account Data**: 3 years after account deletion
- **Chat Messages**: 7 years for legal compliance
- **Usage Logs**: 2 years for security purposes
- **Payment Records**: 7 years for tax compliance

#### Automated Cleanup
```typescript
// Scheduled cleanup job (runs daily at 2 AM)
await gdprService.cleanupExpiredData();

// Manual cleanup functions
await cleanupExpiredTrials(cutoffDate);
await cleanupInactiveAccounts(cutoffDate);
await cleanupOldChatMessages(cutoffDate);
```

### 4. Audit Trail

All data operations are logged for compliance:

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    user_id UUID,
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    details JSONB,
    ip_address INET,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Accessibility Compliance

### WCAG 2.1 AA Standards

The system ensures compliance with Web Content Accessibility Guidelines:

#### 1. Perceivable
- **Color Contrast**: Minimum 4.5:1 ratio for normal text, 3:1 for large text
- **Alt Text**: All images have descriptive alternative text
- **Captions**: Video content includes captions (when applicable)

#### 2. Operable
- **Keyboard Navigation**: All functionality accessible via keyboard
- **Focus Management**: Clear focus indicators and logical tab order
- **No Seizures**: No content flashes more than 3 times per second

#### 3. Understandable
- **Clear Language**: Simple, clear language throughout
- **Consistent Navigation**: Consistent layout and navigation patterns
- **Error Identification**: Clear error messages and correction guidance

#### 4. Robust
- **Valid HTML**: Semantic HTML markup
- **Screen Reader Support**: ARIA labels and landmarks
- **Browser Compatibility**: Works across modern browsers

### Accessibility Utilities

```typescript
// Color contrast checking
const ratio = a11y.getContrastRatio('#000000', '#ffffff');
const isCompliant = a11y.isContrastCompliant('#000000', '#ffffff', 'AA');

// Focus management
const cleanup = a11y.trapFocus(modalElement);

// Screen reader announcements
a11y.announceToScreenReader('Form submitted successfully', 'polite');

// Keyboard navigation
const newIndex = a11y.handleArrowKeyNavigation(event, items, currentIndex);
```

### Accessibility Audit Tool

The system includes a built-in accessibility audit tool:

```typescript
// Run accessibility audit
const issues = a11y.auditAccessibility(document.body);

// Issues include:
// - Missing alt text on images
// - Insufficient color contrast
// - Missing form labels
// - Broken heading hierarchy
// - Missing focus indicators
```

## Database Schema

### GDPR Tables

```sql
-- Consent records
CREATE TABLE consent_records (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    consent_type VARCHAR(20) NOT NULL,
    granted BOOLEAN NOT NULL,
    version VARCHAR(10) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Data export requests
CREATE TABLE data_export_requests (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    download_url TEXT,
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Data deletion requests
CREATE TABLE data_deletion_requests (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    deletion_type VARCHAR(20) NOT NULL DEFAULT 'account',
    reason TEXT
);

-- Audit logs
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    user_id UUID,
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## API Endpoints

### Consent Management
- `GET /api/gdpr/consent` - Get current consent status
- `POST /api/gdpr/consent` - Update consent preferences

### Data Export
- `GET /api/gdpr/data-export` - Get export request status
- `POST /api/gdpr/data-export` - Request data export

### Data Deletion
- `GET /api/gdpr/data-deletion` - Get deletion request status
- `POST /api/gdpr/data-deletion` - Request data deletion

### Cleanup Jobs
- `POST /api/cron/gdpr-cleanup` - Automated cleanup job (Vercel Cron)

## Legal Documentation

### Terms of Service
Updated to reflect:
- Unified Next.js architecture
- Data processing practices
- User rights and responsibilities
- Subscription tiers and billing
- Limitation of liability
- Dispute resolution

### Privacy Policy
Comprehensive coverage of:
- Data collection practices
- Legal basis for processing
- Data sharing and disclosure
- International transfers
- User rights under GDPR/CCPA
- Cookie usage and consent
- Contact information for privacy inquiries

## User Interface Components

### Consent Banner
- GDPR-compliant consent collection
- Granular consent options
- Clear explanation of data usage
- Easy consent withdrawal

### GDPR Dashboard
- Consent preference management
- Data export request interface
- Account deletion options
- Request status tracking

### Accessibility Audit Tool
- Real-time accessibility checking
- Issue highlighting and fixing
- WCAG compliance verification
- Developer debugging tools

## Deployment Configuration

### Vercel Configuration
```json
{
  "crons": [
    {
      "path": "/api/cron/gdpr-cleanup",
      "schedule": "0 2 * * *"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        }
      ]
    }
  ]
}
```

### Environment Variables
- `CRON_SECRET` - Secret for authenticating cron jobs
- `GDPR_RETENTION_DAYS` - Data retention period configuration
- `ACCESSIBILITY_AUDIT_ENABLED` - Enable/disable audit tools

## Monitoring and Compliance

### Compliance Metrics
- Consent collection rates
- Data export request processing times
- Deletion request completion rates
- Accessibility issue counts

### Audit Reports
- Monthly GDPR compliance reports
- Accessibility audit summaries
- Data retention policy adherence
- User rights exercise statistics

## Best Practices

### Data Minimization
- Collect only necessary data
- Regular data cleanup
- Purpose limitation enforcement
- Storage limitation compliance

### Privacy by Design
- Default privacy settings
- Transparent data practices
- User control over data
- Regular privacy impact assessments

### Accessibility First
- Semantic HTML structure
- Keyboard navigation support
- Screen reader compatibility
- Color contrast compliance

## Troubleshooting

### Common Issues

1. **Consent Not Recorded**
   - Check network connectivity
   - Verify API endpoint availability
   - Validate request payload

2. **Data Export Fails**
   - Check user permissions
   - Verify data integrity
   - Monitor storage limits

3. **Accessibility Issues**
   - Run audit tool
   - Check color contrast
   - Verify keyboard navigation

### Debugging Tools

- Browser developer tools
- Accessibility audit component
- GDPR dashboard status indicators
- Server logs and monitoring

## Future Enhancements

Potential improvements:
- Automated privacy impact assessments
- Enhanced consent analytics
- Multi-language legal documents
- Advanced accessibility features
- Integration with privacy management platforms

## Compliance Checklist

- [x] GDPR Article 6 (Lawful basis for processing)
- [x] GDPR Article 7 (Conditions for consent)
- [x] GDPR Article 13-14 (Information to be provided)
- [x] GDPR Article 15 (Right of access)
- [x] GDPR Article 16 (Right to rectification)
- [x] GDPR Article 17 (Right to erasure)
- [x] GDPR Article 20 (Right to data portability)
- [x] GDPR Article 25 (Data protection by design)
- [x] GDPR Article 32 (Security of processing)
- [x] WCAG 2.1 AA compliance
- [x] Automated data retention
- [x] Audit trail maintenance
- [x] Legal documentation updates