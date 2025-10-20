# OAuth Production Deployment Requirements

This document outlines the complete requirements for deploying OAuth functionality in production, including environment variables, provider console configuration, security considerations, and compliance requirements.

## Environment Variables

### Required OAuth Environment Variables

#### Google Drive OAuth
```env
# Google OAuth Configuration
GOOGLE_DRIVE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_DRIVE_CLIENT_SECRET=your-google-client-secret
GOOGLE_DRIVE_REDIRECT_URI=https://your-domain.com/api/storage/google/callback
GOOGLE_DRIVE_SCOPES=openid email profile https://www.googleapis.com/auth/drive.readonly
```

#### Microsoft OneDrive OAuth
```env
# Microsoft OAuth Configuration
MS_DRIVE_CLIENT_ID=your-microsoft-client-id
MS_DRIVE_CLIENT_SECRET=your-microsoft-client-secret
MS_DRIVE_TENANT_ID=common
MS_DRIVE_REDIRECT_URI=https://your-domain.com/api/storage/microsoft/callback
MS_DRIVE_SCOPES=offline_access Files.Read User.Read openid profile email
```

#### Core Application Configuration
```env
# Site Configuration (Required for OAuth redirects)
NEXT_PUBLIC_SITE_URL=https://your-production-domain.com

# Supabase Configuration (Required for user authentication)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

### Environment Variable Security

#### Production Security Requirements
- **Never commit secrets to version control**
- **Use environment-specific configurations**
- **Rotate secrets regularly (quarterly recommended)**
- **Use secure secret management systems** (Vercel Environment Variables, AWS Secrets Manager, etc.)
- **Validate all environment variables on startup**

#### Environment Variable Validation
```typescript
// Add to your startup validation
const requiredEnvVars = [
  'GOOGLE_DRIVE_CLIENT_ID',
  'GOOGLE_DRIVE_CLIENT_SECRET',
  'MS_DRIVE_CLIENT_ID',
  'MS_DRIVE_CLIENT_SECRET',
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_SUPABASE_URL'
]

requiredEnvVars.forEach(envVar => {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`)
  }
})
```

## OAuth Provider Console Configuration

### Google Cloud Console Setup

#### 1. Create OAuth 2.0 Credentials
1. Navigate to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project or create a new one
3. Go to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth 2.0 Client IDs**
5. Select **Web application** as application type

#### 2. Configure Authorized Redirect URIs
**Production URIs** (must be exact matches):
```
https://your-production-domain.com/api/storage/google/callback
```

**Development URIs** (for testing):
```
http://localhost:3000/api/storage/google/callback
https://your-preview-domain.vercel.app/api/storage/google/callback
```

#### 3. Configure OAuth Consent Screen
- **Application name**: Briefly Cloud
- **User support email**: Your support email
- **Application homepage**: https://your-production-domain.com
- **Application privacy policy**: https://your-production-domain.com/privacy
- **Application terms of service**: https://your-production-domain.com/terms
- **Authorized domains**: your-production-domain.com

#### 4. Required Scopes Configuration
```
openid
email
profile
https://www.googleapis.com/auth/drive.readonly
```

#### 5. Security Settings
- **Enable** "Include granted scopes"
- **Set** access type to "offline"
- **Configure** for production use (remove test users limitation)

### Microsoft Azure Portal Setup

#### 1. Register Application
1. Navigate to [Azure Portal](https://portal.azure.com/)
2. Go to **Azure Active Directory** → **App registrations**
3. Click **New registration**
4. Enter application details:
   - **Name**: Briefly Cloud
   - **Supported account types**: Accounts in any organizational directory and personal Microsoft accounts
   - **Redirect URI**: Web - https://your-production-domain.com/api/storage/microsoft/callback

#### 2. Configure Authentication
1. Go to **Authentication** in your app registration
2. Add redirect URIs:
   ```
   https://your-production-domain.com/api/storage/microsoft/callback
   http://localhost:3000/api/storage/microsoft/callback (for development)
   ```
3. **Enable** "Access tokens" and "ID tokens"
4. **Configure** supported account types for multi-tenant access

#### 3. Configure API Permissions
1. Go to **API permissions**
2. Add the following Microsoft Graph permissions:
   - **Files.Read** (Delegated)
   - **User.Read** (Delegated)
   - **offline_access** (Delegated)
   - **openid** (Delegated)
   - **profile** (Delegated)
   - **email** (Delegated)

#### 4. Create Client Secret
1. Go to **Certificates & secrets**
2. Click **New client secret**
3. Set expiration (24 months maximum recommended)
4. **Copy the secret value immediately** (it won't be shown again)

#### 5. Configure Branding
- **Publisher domain**: your-production-domain.com
- **Terms of service URL**: https://your-production-domain.com/terms
- **Privacy statement URL**: https://your-production-domain.com/privacy

## Security Considerations

### OAuth Security Best Practices

#### 1. Minimal Scope Principle
**Google Drive Scopes**:
- `openid` - Identity verification only
- `email` - Account linking only
- `profile` - Basic profile information only
- `https://www.googleapis.com/auth/drive.readonly` - Read-only file access only

**Microsoft OneDrive Scopes**:
- `offline_access` - Refresh token capability
- `Files.Read` - Read-only file access only
- `User.Read` - Basic profile information only
- `openid`, `profile`, `email` - Identity and account linking only

#### 2. State Parameter Security
- **Always use user ID as state parameter** for CSRF protection
- **Verify state parameter** in all callback handlers
- **Log security events** for state mismatches with HIGH severity
- **Reject callbacks** with missing or invalid state parameters

#### 3. Redirect URI Security
- **Use exact URI matches** in provider consoles (no wildcards)
- **Validate redirect URIs** server-side before OAuth initiation
- **Use HTTPS only** in production (no HTTP redirects)
- **Implement domain allowlisting** for additional security

#### 4. Token Security
- **Store tokens encrypted** in secure database
- **Use httpOnly cookies** for session management
- **Implement token rotation** for refresh tokens
- **Set appropriate token expiration** times
- **Revoke tokens** on user logout or account deletion

### Production Security Headers

#### Required Security Headers
```typescript
// middleware.ts - Production security headers
if (process.env.NODE_ENV === 'production') {
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Content-Security-Policy', 'default-src \'self\'; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\'')
}
```

#### OAuth-Specific Cache Prevention
```typescript
// OAuth routes must include no-cache headers
response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
response.headers.set('Pragma', 'no-cache')
response.headers.set('Expires', '0')
```

## Compliance Requirements

### GDPR Compliance

#### Data Processing Requirements
1. **Lawful Basis**: Consent for OAuth data processing
2. **Data Minimization**: Only collect necessary OAuth scopes
3. **Purpose Limitation**: Use OAuth data only for stated purposes
4. **Storage Limitation**: Implement data retention policies
5. **User Rights**: Provide data access, portability, and deletion

#### Required Documentation
- **Privacy Policy**: Document OAuth data collection and use
- **Terms of Service**: Define OAuth integration terms
- **Data Processing Agreement**: With OAuth providers if required
- **Cookie Policy**: Document OAuth-related cookies

#### User Consent Management
```typescript
// Example consent tracking
interface OAuthConsent {
  userId: string
  provider: 'google' | 'microsoft'
  scopes: string[]
  consentDate: string
  ipAddress: string
  userAgent: string
}
```

### Security Compliance

#### SOC 2 Type II Considerations
- **Access Controls**: Implement proper OAuth token access controls
- **Monitoring**: Log all OAuth operations for audit trails
- **Encryption**: Encrypt OAuth tokens at rest and in transit
- **Incident Response**: Define OAuth security incident procedures

#### Industry-Specific Requirements
- **HIPAA**: Additional encryption and access controls if handling health data
- **PCI DSS**: Secure token handling if processing payments
- **ISO 27001**: Comprehensive information security management

## Deployment Checklist

### Pre-Deployment Validation

#### Environment Configuration
- [ ] All required environment variables configured
- [ ] OAuth provider credentials valid and tested
- [ ] Redirect URIs match exactly between code and provider consoles
- [ ] Domain configuration matches production domain
- [ ] SSL certificates valid and properly configured

#### Security Validation
- [ ] State parameter verification implemented and tested
- [ ] CSRF protection active on all OAuth routes
- [ ] Security headers configured for production
- [ ] Token encryption implemented and tested
- [ ] Rate limiting configured (if applicable)

#### Provider Console Validation
- [ ] Google OAuth consent screen approved for production
- [ ] Microsoft app registration configured for multi-tenant
- [ ] All required scopes approved and minimal
- [ ] Redirect URIs exactly match production URLs
- [ ] Branding and legal URLs configured

#### Compliance Validation
- [ ] Privacy policy updated with OAuth data handling
- [ ] Terms of service include OAuth integration terms
- [ ] User consent flows implemented and tested
- [ ] Data retention policies defined and implemented
- [ ] Audit logging configured for OAuth operations

### Post-Deployment Monitoring

#### Health Checks
```bash
# OAuth endpoint health checks
curl -f https://your-domain.com/api/health
curl -f https://your-domain.com/api/storage/status
```

#### OAuth Flow Monitoring
- **Success Rate**: Monitor OAuth completion rates
- **Error Rates**: Track OAuth failures by error type
- **Security Events**: Monitor state mismatch and security violations
- **Performance**: Track OAuth response times and timeouts

#### Log Monitoring Queries
```
# Successful OAuth flows
[oauth:callback] success:true

# Security events (high priority alerts)
[oauth:security] severity:HIGH

# OAuth errors requiring investigation
[oauth:callback] success:false error:token_exchange_failed
```

## Domain and SSL Configuration

### Production Domain Requirements

#### DNS Configuration
```
# A record for main domain
your-domain.com → your-server-ip

# CNAME for www (optional)
www.your-domain.com → your-domain.com

# Verify DNS propagation before OAuth setup
```

#### SSL Certificate Requirements
- **Valid SSL certificate** for production domain
- **Certificate chain** properly configured
- **HTTPS redirect** enforced for all OAuth endpoints
- **HSTS header** configured for security

### Multi-Environment Setup

#### Environment-Specific Configuration
```env
# Production
NEXT_PUBLIC_SITE_URL=https://your-domain.com
GOOGLE_DRIVE_REDIRECT_URI=https://your-domain.com/api/storage/google/callback

# Staging
NEXT_PUBLIC_SITE_URL=https://staging.your-domain.com
GOOGLE_DRIVE_REDIRECT_URI=https://staging.your-domain.com/api/storage/google/callback

# Preview (Vercel)
NEXT_PUBLIC_SITE_URL=https://your-app-preview.vercel.app
GOOGLE_DRIVE_REDIRECT_URI=https://your-app-preview.vercel.app/api/storage/google/callback
```

## Troubleshooting Production Issues

### Common Deployment Issues

#### Redirect URI Mismatch
**Symptoms**: OAuth fails with "redirect_uri_mismatch" error
**Solution**: Verify exact URI match between code and provider console

#### Invalid Client Credentials
**Symptoms**: OAuth fails with "invalid_client" error
**Solution**: Verify client ID and secret are correct and not expired

#### CORS Issues
**Symptoms**: OAuth requests blocked by browser CORS policy
**Solution**: Configure proper CORS headers and allowed origins

#### SSL Certificate Issues
**Symptoms**: OAuth fails with SSL/TLS errors
**Solution**: Verify certificate validity and proper chain configuration

### Emergency Procedures

#### OAuth Service Outage
1. **Disable OAuth features** temporarily if needed
2. **Communicate with users** about service availability
3. **Monitor provider status pages** for updates
4. **Implement graceful degradation** for core functionality

#### Security Incident Response
1. **Immediately revoke compromised tokens** if detected
2. **Rotate OAuth client secrets** if compromise suspected
3. **Audit OAuth logs** for suspicious activity
4. **Notify users** if data breach confirmed
5. **Document incident** for compliance reporting

This production deployment guide ensures secure, compliant, and reliable OAuth integration in production environments.