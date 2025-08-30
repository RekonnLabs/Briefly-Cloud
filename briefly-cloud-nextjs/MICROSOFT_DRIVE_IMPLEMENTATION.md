# Microsoft Drive OAuth Implementation

## Overview
Implemented Microsoft Drive storage integration following the same secure pattern as Google Drive, with separate OAuth clients for authentication vs. storage access.

## Files Created

### API Routes
- `src/app/api/storage/microsoft/start/route.ts` - OAuth initiation
- `src/app/api/storage/microsoft/callback/route.ts` - OAuth callback and token exchange

### Key Features
- **Environment Variable Guards**: Fail fast with clear error messages if config is missing
- **CSRF Protection**: State parameter validation with secure cookies
- **Token Encryption**: Secure storage using existing token store infrastructure
- **Middleware Exclusion**: Callback route properly excluded from auth middleware

## Environment Variables Required

```env
# Microsoft Drive (Client B) - Storage Integration
MS_DRIVE_CLIENT_ID=your-microsoft-drive-client-id
MS_DRIVE_CLIENT_SECRET=your-microsoft-drive-client-secret
MS_DRIVE_REDIRECT_URI=https://your-domain.com/api/storage/microsoft/callback
MS_DRIVE_SCOPES="openid email profile https://graph.microsoft.com/Files.ReadWrite"
MS_DRIVE_TENANT=common
```

## OAuth Flow

### Start Route (`/api/storage/microsoft/start`)
1. **Environment Check**: Validates required env vars before proceeding
2. **User Authentication**: Ensures user is logged in via Supabase
3. **CSRF Token**: Generates and stores state parameter in secure cookie
4. **OAuth Redirect**: Builds Microsoft OAuth URL with proper parameters

**OAuth URL Format:**
```
https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize
  ?client_id={MS_DRIVE_CLIENT_ID}
  &redirect_uri={MS_DRIVE_REDIRECT_URI}
  &response_type=code
  &response_mode=query
  &scope={MS_DRIVE_SCOPES}
  &state={csrf_token}
  &login_hint={user.email}  // optional
```

### Callback Route (`/api/storage/microsoft/callback`)
1. **Environment Check**: Validates required env vars
2. **Error Handling**: Processes OAuth errors from Microsoft
3. **CSRF Validation**: Verifies state parameter matches stored cookie
4. **Token Exchange**: Exchanges authorization code for access/refresh tokens
5. **Secure Storage**: Encrypts and stores tokens tied to user ID

**Token Exchange URL:**
```
https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
```

## Security Features

### Environment Variable Guards
Both routes check for required environment variables and return clear error messages:
- `MS_DRIVE_CLIENT_ID`
- `MS_DRIVE_CLIENT_SECRET` 
- `MS_DRIVE_REDIRECT_URI`
- `MS_DRIVE_SCOPES`

### CSRF Protection
- State parameter generated with `crypto.randomUUID()`
- Stored in secure, HTTP-only cookie with 10-minute expiration
- Validated on callback and cleared after use

### Token Security
- Access and refresh tokens encrypted at rest
- Stored with user ID association in secure token store
- Provider identified as `microsoft_drive`

### Middleware Integration
- `/api/storage/microsoft/callback` excluded from auth middleware
- Allows OAuth callback to complete without authentication redirect loops

## Azure App Registration Setup

### Required Configuration
1. **App Registration**: Create in Azure Portal
2. **Account Types**: Multi-tenant + personal Microsoft accounts
3. **Redirect URIs**: Web platform
   - Development: `http://localhost:3000/api/storage/microsoft/callback`
   - Production: `https://your-domain.com/api/storage/microsoft/callback`
4. **API Permissions**: Microsoft Graph (Delegated)
   - `Files.ReadWrite`
   - `openid`, `email`, `profile`
5. **Client Secret**: Generate and store securely

### Tenant Configuration
- **Multi-tenant**: Use `common` (default)
- **Single tenant**: Use specific tenant ID
- **Consumer accounts**: Use `consumers`
- **Organization accounts**: Use `organizations`

## Integration Points

### Token Store
Updated `OAuthToken` interface to support:
- `google_drive` provider
- `microsoft_drive` provider

### Documentation
Updated `docs/AUTH_CONNECTORS.md` with:
- Microsoft Azure setup instructions
- Environment variable documentation
- Security considerations
- API endpoint references

### Environment Template
Updated `.env.example` with Microsoft Drive variables

## Error Handling

### Clear Error Messages
- Missing environment variables: `missing_env: MS_DRIVE_CLIENT_ID/SECRET/REDIRECT_URI`
- OAuth errors: Forwards Microsoft error descriptions
- State mismatch: `state_mismatch`
- Token exchange failures: Detailed error logging

### Graceful Fallbacks
- Redirects to dashboard with error parameters
- Maintains user session throughout error scenarios
- Provides actionable error information for debugging

## Testing Checklist

### Environment Setup
- [ ] All `MS_DRIVE_*` environment variables configured
- [ ] Azure App Registration created with correct redirect URIs
- [ ] Microsoft Graph API permissions granted

### OAuth Flow
- [ ] Start route redirects to Microsoft OAuth
- [ ] Callback processes authorization code successfully
- [ ] Tokens stored and encrypted properly
- [ ] Error scenarios handled gracefully

### Security Validation
- [ ] CSRF state validation working
- [ ] Environment variable guards active
- [ ] Middleware exclusion prevents auth loops
- [ ] Token encryption functioning

This implementation provides secure, production-ready Microsoft Drive integration that follows the same patterns as the existing Google Drive implementation.