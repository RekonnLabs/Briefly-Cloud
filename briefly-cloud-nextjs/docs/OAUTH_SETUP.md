# OAuth Setup Guide

This guide explains how to configure OAuth providers for Briefly Cloud authentication and storage access.

## Overview

Briefly Cloud uses **two separate OAuth flows**:

1. **Login OAuth** (NextAuth) - For user authentication
2. **Storage OAuth** - For accessing Google Drive/OneDrive files

Each provider needs **two callback URLs** configured.

## Database Setup

The `oauth_tokens` table is defined in `supabase-schema.sql`. Make sure to run the schema to create the required table structure.

## Google Cloud Console Setup

### 1. Create OAuth 2.0 Client

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project or create a new one
3. Navigate to **APIs & Services > Credentials**
4. Click **Create Credentials > OAuth 2.0 Client IDs**
5. Choose **Web application**

### 2. Configure Authorized Redirect URIs

Add these URIs for each environment:

**Production:**
```
https://briefly-cloud.vercel.app/api/auth/callback/google
https://briefly-cloud.vercel.app/api/storage/google/callback
```

**Preview/Staging:**
```
https://your-preview-url.vercel.app/api/auth/callback/google
https://your-preview-url.vercel.app/api/storage/google/callback
```

**Local Development:**
```
http://localhost:3000/api/auth/callback/google
http://localhost:3000/api/storage/google/callback
```

### 3. Enable Required APIs

Enable these APIs in your Google Cloud project:
- Google Drive API
- Google+ API (for profile info)

### 4. Environment Variables

```env
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here
```

## Microsoft Entra ID (Azure AD) Setup

### 1. Register Application

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to **Entra ID > App registrations**
3. Click **New registration**
4. Choose **Web** platform

### 2. Configure Redirect URIs

Add these URIs in **Authentication > Platform configurations > Web**:

**Production:**
```
https://briefly-cloud.vercel.app/api/auth/callback/azure-ad
https://briefly-cloud.vercel.app/api/storage/microsoft/callback
```

**Preview/Staging:**
```
https://your-preview-url.vercel.app/api/auth/callback/azure-ad
https://your-preview-url.vercel.app/api/storage/microsoft/callback
```

**Local Development:**
```
http://localhost:3000/api/auth/callback/azure-ad
http://localhost:3000/api/storage/microsoft/callback
```

### 3. Configure API Permissions

Add these permissions in **API permissions**:
- Microsoft Graph > User.Read (for profile)
- Microsoft Graph > Files.Read.All (for OneDrive access)
- Microsoft Graph > offline_access (for refresh tokens)

### 4. Create Client Secret

1. Go to **Certificates & secrets**
2. Click **New client secret**
3. Copy the secret value (you won't see it again!)

### 5. Environment Variables

```env
AZURE_AD_CLIENT_ID=your-application-id
AZURE_AD_CLIENT_SECRET=your-client-secret
AZURE_AD_TENANT_ID=common
```

## NextAuth Configuration

Set these environment variables:

```env
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=your-32-character-random-string
```

Generate a secret:
```bash
openssl rand -base64 32
```

## Scopes Explained

### Login Scopes (NextAuth)
- `openid email profile` - Basic user info for authentication
- `offline_access` - For Microsoft refresh tokens

### Storage Scopes (Separate OAuth)
- Google: `drive.file drive.metadata.readonly` - File access
- Microsoft: `Files.Read.All` - OneDrive file access

## Testing OAuth Flows

### 1. Test Login
1. Visit `/briefly/app/auth/signin`
2. Click "Continue with Google" or "Continue with Microsoft"
3. Should redirect to `/briefly/app/dashboard` after success

### 2. Test Storage Connection
1. Login first
2. Go to dashboard Storage tab
3. Click "Connect" for Google Drive or OneDrive
4. Should redirect back with success message

## Troubleshooting

### Common Issues

**"redirect_uri_mismatch"**
- Check that callback URLs exactly match what's configured
- Ensure no trailing slashes
- Verify environment (prod/preview/local)

**"invalid_client"**
- Check client ID/secret are correct
- Verify they match the environment

**"insufficient_scope"**
- Ensure all required permissions are granted
- Check admin consent for Microsoft apps

### Debug Tips

1. Check browser network tab for OAuth requests
2. Verify environment variables are loaded
3. Check Vercel deployment logs
4. Test with different browsers/incognito mode

## Security Notes

- Never commit OAuth secrets to git
- Use different OAuth apps for prod/staging
- Regularly rotate client secrets
- Monitor OAuth usage in provider consoles
- Enable logging for OAuth callbacks during development