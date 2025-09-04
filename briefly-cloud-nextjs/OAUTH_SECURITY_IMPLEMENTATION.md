# OAuth Production Security Implementation

This document describes the production security and compliance measures implemented for OAuth flows in Briefly Cloud.

## Overview

Task 7 of the OAuth Production Refinements spec has been completed, implementing comprehensive security measures including:

1. **OAuth Security Configuration** - Minimal required scopes and secure settings
2. **Redirect URI Validation** - Domain allowlist and security validation
3. **Production Security Headers** - Enhanced middleware with security headers

## 1. OAuth Security Configuration

### Implementation: `src/app/lib/oauth/security-config.ts`

**Features:**
- Minimal required scopes for each OAuth provider
- Secure OAuth settings (offline access, consent prompts)
- Scope validation and security implications documentation
- Provider-specific security configurations

**Google OAuth Scopes (Read-Only):**
- `openid` - Basic identity verification
- `email` - User email for account linking
- `profile` - Basic profile information
- `https://www.googleapis.com/auth/drive.readonly` - Read-only Google Drive access

**Microsoft OAuth Scopes (Read-Only):**
- `offline_access` - Refresh token support
- `Files.Read` - Read-only OneDrive access
- `User.Read` - Basic user profile
- `openid`, `profile`, `email` - Identity and profile information

**Security Settings:**
- Google: `access_type=offline`, `prompt=consent`, `include_granted_scopes=true`
- Microsoft: `response_type=code`, configurable tenant support

### Usage in OAuth Routes

Both Google and Microsoft start routes now use:
```typescript
import { getOAuthScopes, getOAuthSettings } from '@/app/lib/oauth/security-config'

const scopes = getOAuthScopes('google') // or 'microsoft'
const settings = getOAuthSettings('google') // or 'microsoft'
```

## 2. Redirect URI Validation

### Implementation: `src/app/lib/oauth/redirect-validation.ts`

**Features:**
- Environment-specific domain allowlists
- Comprehensive redirect URI validation
- Security logging and monitoring
- Provider console configuration helpers

**Allowed Domains by Environment:**

**Development:**
- `localhost:3000`, `127.0.0.1:3000`
- `localhost:3001`, `127.0.0.1:3001` (alternative dev ports)

**Production:**
- `briefly.rekonnlabs.com`
- `www.briefly.rekonnlabs.com`

**Preview (Vercel):**
- `briefly-cloud-nextjs-git-main-rekonnlabs.vercel.app`
- `briefly-cloud-nextjs-rekonnlabs.vercel.app`
- Pattern: `/^briefly-cloud-nextjs-.*-rekonnlabs\.vercel\.app$/`

### Security Features

**Validation Functions:**
- `validateRedirectUri(uri, provider)` - Validates against allowlist
- `constructRedirectUri(origin, provider, path)` - Secure URI construction
- `validateRedirectUriOrThrow(uri, provider)` - Throws security error if invalid

**Security Protections:**
- Exact domain matching (no subdomain attacks)
- Environment-specific validation
- Comprehensive security logging
- Invalid URL format detection

### Usage in OAuth Routes

```typescript
import { constructRedirectUri } from '@/app/lib/oauth/redirect-validation'

// This will throw if origin is not allowed
const redirectUri = constructRedirectUri(origin, 'google', '/api/storage/google/callback')
```

## 3. Production Security Headers

### Implementation: `src/app/lib/security/headers.ts`

**Security Headers Applied (Production Only):**
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-XSS-Protection: 1; mode=block`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`

### Middleware Enhancement: `middleware.ts`

The middleware now applies security headers automatically in production:

```typescript
import { applySecurityHeaders } from './src/app/lib/security/headers'

// Apply production security headers (only in production environment)
applySecurityHeaders(res)
```

### Next.js Configuration: `next.config.js`

Enhanced with production security headers for additional protection:
- Complementary headers to middleware
- API-specific cache prevention headers
- OAuth route cache prevention

## Security Compliance

### GDPR Compliance
- Minimal data collection (read-only scopes)
- Clear scope descriptions for user consent
- Secure token storage and handling
- User revocation instructions provided

### Security Best Practices
- **Principle of Least Privilege**: Minimal required scopes only
- **Defense in Depth**: Multiple validation layers
- **Secure by Default**: Production security headers
- **Environment Isolation**: Environment-specific configurations

### OAuth Security Standards
- OAuth 2.0 Authorization Code Flow
- PKCE (handled by Supabase Auth)
- State parameter validation (existing implementation)
- Secure redirect URI validation

## Testing

### Test Coverage
- **Unit Tests**: `src/app/lib/oauth/__tests__/`
  - `security-config.test.ts` - OAuth configuration validation
  - `redirect-validation.test.ts` - Redirect URI security testing

### Test Scenarios
- Scope validation for both providers
- Environment-specific redirect URI validation
- Security header application
- Error handling and security exceptions

### Security Test Cases
- Subdomain attack prevention
- Protocol manipulation detection
- Invalid URL format handling
- Cross-environment isolation

## Deployment Requirements

### Environment Variables
No additional environment variables required. Uses existing:
- `NODE_ENV` - Environment detection
- `VERCEL_ENV` - Vercel environment detection
- `MS_DRIVE_TENANT_ID` - Microsoft tenant configuration (optional)

### Provider Console Configuration

**Google Cloud Console:**
Add these redirect URIs to your OAuth 2.0 Client:
- Development: `http://localhost:3000/api/storage/google/callback`
- Production: `https://briefly.rekonnlabs.com/api/storage/google/callback`
- Preview: `https://briefly-cloud-nextjs-*-rekonnlabs.vercel.app/api/storage/google/callback`

**Azure App Registration:**
Add these redirect URIs to your app registration:
- Development: `http://localhost:3000/api/storage/microsoft/callback`
- Production: `https://briefly.rekonnlabs.com/api/storage/microsoft/callback`
- Preview: `https://briefly-cloud-nextjs-*-rekonnlabs.vercel.app/api/storage/microsoft/callback`

## Monitoring and Logging

### Security Logging
- Redirect URI validation attempts (success/failure)
- OAuth scope validation
- Security header application
- Environment detection and configuration

### Log Format
```json
{
  "level": "info",
  "message": "[oauth:redirect-validation]",
  "provider": "google",
  "uri": "https://briefly.rekonnlabs.com/api/storage/google/callback",
  "hostname": "briefly.rekonnlabs.com",
  "environment": "production",
  "isValid": true,
  "timestamp": "2025-01-27T10:00:00Z"
}
```

## Security Implications

### Data Access
- **Google**: Read-only access to Google Drive files and metadata
- **Microsoft**: Read-only access to OneDrive files and basic user profile

### Token Management
- Tokens stored securely with encryption
- Refresh tokens enable persistent access
- Users can revoke access through provider consoles

### Compliance
- GDPR compliant with minimal data collection
- Follows OAuth 2.0 security best practices
- Implements provider-specific security guidelines

## Future Enhancements

### Potential Security Improvements
1. **Content Security Policy (CSP)** - Configurable CSP headers
2. **Certificate Pinning** - Additional HTTPS security
3. **Rate Limiting** - OAuth-specific rate limiting
4. **Audit Logging** - Enhanced security event logging
5. **Threat Detection** - Automated security monitoring

### Monitoring Enhancements
1. **Security Metrics** - OAuth security event tracking
2. **Alerting** - Security violation notifications
3. **Compliance Reporting** - Automated compliance reports

## Verification

### Manual Testing
1. Test OAuth flows in all environments (dev, preview, production)
2. Verify security headers in production
3. Test redirect URI validation with various inputs
4. Confirm minimal scopes are requested

### Automated Testing
1. Run test suite: `npm test src/app/lib/oauth/__tests__/`
2. Verify TypeScript compilation: `npx tsc --noEmit`
3. Security header validation in production deployment

This implementation provides enterprise-grade OAuth security with comprehensive protection against common vulnerabilities while maintaining usability and compliance with security standards.