# Authentication & Storage Connectors

This document outlines the OAuth configuration for Briefly Cloud's authentication and storage integration systems.

## OAuth Client Architecture

Briefly Cloud uses a **dual OAuth client architecture** to separate authentication concerns from storage access:

### Client A: Authentication (Login)
- **Purpose**: User authentication and sign-in
- **Location**: Supabase provider settings
- **Scopes**: Basic profile information (`openid`, `email`, `profile`)
- **Managed by**: Supabase Auth
- **Redirect URI**: `https://your-project.supabase.co/auth/v1/callback`

### Client B: Storage Integration (Drive)
- **Purpose**: Google Drive file access and storage operations
- **Location**: Vercel environment variables & storage routes
- **Scopes**: Drive file access (`https://www.googleapis.com/auth/drive.file`)
- **Managed by**: Custom storage routes
- **Redirect URI**: `https://your-domain.com/api/storage/google/callback`

## Environment Configuration

### Development Environment
```env
# Site Configuration
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Client B (Drive) - Storage Integration
# Note: Client A (Login) credentials are configured in Supabase Auth Providers, not here
GOOGLE_DRIVE_CLIENT_ID=your-google-drive-client-id
GOOGLE_DRIVE_CLIENT_SECRET=your-google-drive-client-secret
GOOGLE_DRIVE_REDIRECT_URI=http://localhost:3000/api/storage/google/callback
GOOGLE_DRIVE_SCOPES="openid email profile https://www.googleapis.com/auth/drive.file"
```

### Production Environment
```env
# Site Configuration
NEXT_PUBLIC_SITE_URL=https://briefly.rekonnlabs.com

# Client B (Drive) - Storage Integration
# Note: Client A (Login) credentials are configured in Supabase Auth Providers, not here
GOOGLE_DRIVE_CLIENT_ID=your-google-drive-client-id
GOOGLE_DRIVE_CLIENT_SECRET=your-google-drive-client-secret
GOOGLE_DRIVE_REDIRECT_URI=https://briefly.rekonnlabs.com/api/storage/google/callback
GOOGLE_DRIVE_SCOPES="openid email profile https://www.googleapis.com/auth/drive.file"
```

## Google Cloud Console Setup

### Client A (Login) Configuration
1. **Create OAuth 2.0 Client ID** in Google Cloud Console
2. **Application Type**: Web application
3. **Authorized JavaScript Origins**: 
   - `http://localhost:3000` (development)
   - `https://briefly.rekonnlabs.com` (production)
4. **Authorized Redirect URIs**:
   - `https://your-project.supabase.co/auth/v1/callback`
5. **Configure in Supabase**: Dashboard → Authentication → Providers → Google

### Client B (Drive) Configuration
1. **Create separate OAuth 2.0 Client ID** in Google Cloud Console
2. **Application Type**: Web application
3. **Authorized JavaScript Origins**:
   - `http://localhost:3000` (development)
   - `https://briefly.rekonnlabs.com` (production)
4. **Authorized Redirect URIs**:
   - `http://localhost:3000/api/storage/google/callback` (development)
   - `https://briefly.rekonnlabs.com/api/storage/google/callback` (production)
5. **Enable APIs**: **Google Drive API** (required for storage integration)
6. **Configure Scopes**: `https://www.googleapis.com/auth/drive.file`

### OAuth Consent Policy
- **First Link Attempt**: Use `prompt=consent` to ensure user grants permissions
- **Subsequent Links**: Omit `prompt=consent` to avoid re-prompting users unnecessarily
- The storage route handles this automatically based on user's connection status

## Security Considerations

### Principle of Least Privilege
- **Client A**: Only requests basic profile information needed for authentication
- **Client B**: Only requests `drive.file` scope (access to files created by the app)
- **No Broad Access**: Neither client requests full Drive access or sensitive scopes

### CSRF Protection
- Both flows use state parameters for CSRF protection
- State tokens are stored in secure, HTTP-only cookies
- State validation occurs on callback processing

### Token Storage
- Drive tokens are encrypted at rest using the secure token store
- Refresh tokens are stored for offline access
- Tokens are scoped to individual users and providers

## Flow Diagrams

### Authentication Flow (Client A)
```
User → Supabase Auth → Google OAuth → Supabase Callback → Dashboard
```

### Storage Integration Flow (Client B)
```
User → Storage Route → Google OAuth → Storage Callback → Token Store → Dashboard
```

## Troubleshooting

### Common Issues

1. **Redirect URI Mismatch**
   - Ensure redirect URIs in Google Cloud Console match environment variables
   - Check both development and production configurations

2. **Scope Errors**
   - Verify `GOOGLE_DRIVE_SCOPES` includes required permissions
   - Ensure Google Drive API is enabled in Google Cloud Console

3. **State Mismatch**
   - Check cookie settings (secure, sameSite, httpOnly)
   - Verify state parameter generation and validation

4. **Token Exchange Failures**
   - Validate client ID and secret for Drive client
   - Check network connectivity to Google OAuth endpoints

### Debug Commands
```bash
# Check environment variables
echo $GOOGLE_DRIVE_CLIENT_ID
echo $GOOGLE_DRIVE_REDIRECT_URI

# Test OAuth flow
curl -X GET "http://localhost:3000/api/storage/google/start"
```

## Migration Notes

### From Single Client to Dual Client
1. **Create new OAuth client** in Google Cloud Console for Drive access
2. **Update environment variables** with new Drive client credentials
3. **Deploy updated storage routes** with new client configuration
4. **Test both flows** independently to ensure proper separation

### Rollback Procedure
1. **Revert storage routes** to use original client credentials
2. **Update environment variables** to remove Drive-specific config
3. **Verify authentication flow** continues to work normally

## Monitoring

### Health Checks
- Monitor OAuth callback success rates
- Track token refresh failures
- Alert on authentication errors

### Metrics to Track
- Authentication success/failure rates
- Storage connection success rates
- Token refresh frequency
- API quota usage

This dual-client architecture ensures proper separation of concerns while maintaining security and functionality for both authentication and storage integration.