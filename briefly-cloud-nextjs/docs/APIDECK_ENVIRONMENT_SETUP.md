# Apideck Environment Setup Guide

This guide covers the setup and configuration of Apideck Vault integration environment variables for Google Drive and other cloud storage providers.

## Overview

Apideck Vault provides OAuth integration for cloud storage providers like Google Drive, Microsoft OneDrive, Dropbox, and others. This integration allows users to connect their cloud storage accounts and index their documents for AI-powered search and chat.

## Required Environment Variables

### Core Apideck Configuration

```bash
# Enable/disable Apideck integration
APIDECK_ENABLED=true

# Apideck API credentials (from Apideck dashboard)
APIDECK_API_KEY=sk_your_api_key_here
APIDECK_APP_ID=app_your_app_id_here
APIDECK_APP_UID=app_uid_your_app_uid_here

# Apideck API endpoints
APIDECK_API_BASE_URL=https://unify.apideck.com
APIDECK_VAULT_BASE_URL=https://unify.apideck.com/vault

# OAuth callback URL (must match your domain)
APIDECK_REDIRECT_URL=https://your-domain.com/api/integrations/apideck/callback

# Your application's base URL
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

## Environment-Specific Configuration

### Development Environment

```bash
# Development URLs (localhost)
APIDECK_REDIRECT_URL=http://localhost:3000/api/integrations/apideck/callback
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Optional: Enable debug logging
DEBUG=apideck:*
LOG_LEVEL=debug
```

### Staging Environment

```bash
# Staging URLs
APIDECK_REDIRECT_URL=https://staging.your-domain.com/api/integrations/apideck/callback
NEXT_PUBLIC_SITE_URL=https://staging.your-domain.com

# Use production Apideck credentials or separate staging credentials
APIDECK_API_KEY=sk_staging_key_here
APIDECK_APP_ID=app_staging_id_here
APIDECK_APP_UID=app_uid_staging_uid_here
```

### Production Environment

```bash
# Production URLs (must use HTTPS)
APIDECK_REDIRECT_URL=https://your-domain.com/api/integrations/apideck/callback
NEXT_PUBLIC_SITE_URL=https://your-domain.com

# Production Apideck credentials
APIDECK_API_KEY=sk_live_key_here
APIDECK_APP_ID=app_live_id_here
APIDECK_APP_UID=app_uid_live_uid_here

# Security settings
NODE_ENV=production
SECURITY_HEADERS_ENABLED=true
CORS_ENABLED=true
RATE_LIMITING_ENABLED=true
```

## Getting Apideck Credentials

1. **Sign up for Apideck**: Visit [apideck.com](https://apideck.com) and create an account
2. **Create an Application**: In the Apideck dashboard, create a new application
3. **Configure OAuth Settings**:
   - Set your redirect URI to: `https://your-domain.com/api/integrations/apideck/callback`
   - Enable the required scopes for Google Drive, OneDrive, etc.
4. **Get Credentials**: Copy your API key, App ID, and App UID from the dashboard

## URL Configuration Guidelines

### Redirect URL Requirements

- **Must be HTTPS in production** (HTTP allowed for localhost in development)
- **Must match exactly** what's configured in your Apideck dashboard
- **Must point to the callback endpoint**: `/api/integrations/apideck/callback`
- **Domain must match** your `NEXT_PUBLIC_SITE_URL` domain

### Base URL Requirements

- **APIDECK_API_BASE_URL**: Always `https://unify.apideck.com`
- **APIDECK_VAULT_BASE_URL**: Always `https://unify.apideck.com/vault`
- **Do not change these URLs** unless instructed by Apideck support

## Validation

Use the environment validation script to check your configuration:

```bash
# Validate all environment variables including Apideck
npm run validate:environment

# Or run the script directly
node scripts/validate-environment.js
```

The validator will check:
- ✅ All required Apideck variables are present
- ✅ API key, App ID, and App UID formats are correct
- ✅ URLs use HTTPS in production
- ✅ Redirect URL matches site URL domain
- ✅ No localhost URLs in production
- ✅ Callback endpoint path is correct

## Common Issues and Solutions

### 1. "Permission denied" errors during OAuth callback

**Cause**: Database RLS policies not properly configured
**Solution**: Run the database migration script:
```bash
node scripts/deploy-apideck-rls-fix.js
```

### 2. "Invalid redirect URI" error

**Cause**: Mismatch between `APIDECK_REDIRECT_URL` and Apideck dashboard configuration
**Solution**: 
- Check your Apideck dashboard OAuth settings
- Ensure the redirect URI exactly matches your environment variable
- Include the full path: `/api/integrations/apideck/callback`

### 3. "Invalid API key" error

**Cause**: Incorrect API key format or expired credentials
**Solution**:
- Verify API key starts with `sk_`
- Check if credentials are for the correct environment (staging vs production)
- Regenerate credentials in Apideck dashboard if needed

### 4. CORS errors during OAuth flow

**Cause**: Domain mismatch or incorrect CORS configuration
**Solution**:
- Ensure `NEXT_PUBLIC_SITE_URL` matches your actual domain
- Check that your domain is whitelisted in Apideck dashboard
- Verify CORS settings in `next.config.js`

### 5. "Connection not found" after successful OAuth

**Cause**: Database query issues or authentication context problems
**Solution**:
- Check database connection and RLS policies
- Verify JWT token extraction in API middleware
- Check logs for specific database errors

## Security Considerations

### API Key Protection
- **Never commit API keys** to version control
- **Use environment variables** for all credentials
- **Rotate keys regularly** in production
- **Use different keys** for staging and production

### URL Security
- **Always use HTTPS** in production
- **Validate redirect URLs** to prevent open redirect attacks
- **Whitelist domains** in Apideck dashboard
- **Use secure session handling** for OAuth state

### Database Security
- **Enable RLS policies** for connection data
- **Use authenticated user context** for all queries
- **Audit connection access** regularly
- **Encrypt sensitive connection metadata**

## Monitoring and Debugging

### Enable Debug Logging

```bash
# Development
DEBUG=apideck:*
LOG_LEVEL=debug

# Production (limited logging)
LOG_LEVEL=info
APIDECK_DEBUG=false
```

### Monitor OAuth Flow

The system logs detailed information about:
- OAuth session creation
- Callback processing
- Connection storage
- Error scenarios

Check logs for correlation IDs to trace specific OAuth flows.

### Health Checks

Use the connection health check endpoint:
```bash
curl https://your-domain.com/api/storage/health
```

This endpoint validates:
- Apideck API connectivity
- Database connection
- RLS policy functionality
- Connection status retrieval

## Deployment Checklist

Before deploying to production:

- [ ] All Apideck environment variables are set
- [ ] API credentials are for production environment
- [ ] URLs use HTTPS and correct domain
- [ ] Redirect URI matches Apideck dashboard configuration
- [ ] Database RLS policies are deployed
- [ ] Environment validation passes
- [ ] OAuth flow tested end-to-end
- [ ] Connection health check passes
- [ ] Monitoring and logging configured

## Support

For Apideck-specific issues:
- Check [Apideck documentation](https://developers.apideck.com/)
- Contact Apideck support through their dashboard
- Review Apideck API status page

For integration issues:
- Check application logs for detailed error messages
- Use the environment validation script
- Review the troubleshooting guide
- Check database migration status