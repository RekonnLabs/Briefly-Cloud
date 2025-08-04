# OAuth Setup Guide for Cloud Storage Integration

This guide will help you set up Google Drive and OneDrive OAuth integrations for Briefly Cloud.

## Prerequisites

- Access to Google Cloud Console
- Access to Microsoft Azure Portal
- Your deployed backend URL (e.g., `https://briefly-cloud-production.up.railway.app`)

## Google Drive OAuth Setup

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Drive API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Drive API"
   - Click "Enable"

### 2. Configure OAuth Consent Screen

1. Go to "APIs & Services" > "OAuth consent screen"
2. Choose "External" user type
3. Fill in the required information:
   - **App name**: Briefly Cloud
   - **User support email**: Your email
   - **Developer contact information**: Your email
4. Add scopes:
   - `https://www.googleapis.com/auth/drive.readonly`
   - `https://www.googleapis.com/auth/userinfo.email`
5. Add test users (your email and any test accounts)

### 3. Create OAuth Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client IDs"
3. Choose "Web application"
4. Configure:
   - **Name**: Briefly Cloud Web Client
   - **Authorized JavaScript origins**: 
     - `https://rekonnlabs.com`
     - `https://www.rekonnlabs.com`
   - **Authorized redirect URIs**:
     - `https://briefly-cloud-production.up.railway.app/api/storage/google/callback`
5. Save the Client ID and Client Secret

## Microsoft OneDrive OAuth Setup

### 1. Register Application in Azure

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to "Azure Active Directory" > "App registrations"
3. Click "New registration"
4. Configure:
   - **Name**: Briefly Cloud
   - **Supported account types**: Accounts in any organizational directory and personal Microsoft accounts
   - **Redirect URI**: Web - `https://briefly-cloud-production.up.railway.app/api/storage/microsoft/callback`

### 2. Configure API Permissions

1. In your app registration, go to "API permissions"
2. Click "Add a permission"
3. Choose "Microsoft Graph"
4. Select "Delegated permissions"
5. Add these permissions:
   - `Files.Read`
   - `Files.Read.All`
   - `User.Read`
6. Click "Grant admin consent" (if you're an admin)

### 3. Create Client Secret

1. Go to "Certificates & secrets"
2. Click "New client secret"
3. Add description: "Briefly Cloud Backend"
4. Choose expiration (recommend 24 months)
5. Save the secret value (you won't see it again!)

## Environment Configuration

Update your `.env` file with the OAuth credentials:

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_REDIRECT_URI=https://briefly-cloud-production.up.railway.app/api/storage/google/callback

# Microsoft Azure OAuth
AZURE_CLIENT_ID=your_azure_client_id_here
AZURE_CLIENT_SECRET=your_azure_client_secret_here
AZURE_TENANT_ID=common
MICROSOFT_REDIRECT_URI=https://briefly-cloud-production.up.railway.app/api/storage/microsoft/callback
```

## Railway Deployment

If using Railway, add these environment variables in your Railway dashboard:

1. Go to your Railway project
2. Click on your service
3. Go to "Variables" tab
4. Add each environment variable

## Testing the Integration

1. Deploy your backend with the new environment variables
2. Go to your Briefly Cloud app
3. Open Cloud Settings
4. Try connecting Google Drive or OneDrive
5. You should be redirected to the OAuth consent screen

## Troubleshooting

### Common Issues:

1. **"OAuth credentials not configured" error**:
   - Check that environment variables are set correctly
   - Restart your backend service after adding variables

2. **"Redirect URI mismatch" error**:
   - Ensure the redirect URI in your OAuth app matches exactly
   - Check for trailing slashes or http vs https

3. **"Access denied" error**:
   - Make sure you've granted the required permissions
   - Check that the user is added to test users (for Google)

4. **"Invalid client" error**:
   - Verify your Client ID and Client Secret are correct
   - Check that the OAuth app is enabled

### Testing Locally:

For local development, you can use ngrok to create a public URL:

```bash
# Install ngrok
npm install -g ngrok

# Expose your local server
ngrok http 8000

# Use the ngrok URL in your OAuth redirect URIs
# Example: https://abc123.ngrok.io/api/storage/google/callback
```

## Security Notes

- Never commit OAuth credentials to version control
- Use environment variables for all sensitive data
- Regularly rotate client secrets
- Monitor OAuth usage in your cloud consoles
- Consider using separate OAuth apps for development and production

## Support

If you encounter issues:
1. Check the backend logs for detailed error messages
2. Verify all environment variables are set
3. Test the OAuth flow step by step
4. Contact support with specific error messages

Once configured, users will be able to connect their Google Drive and OneDrive accounts to access and search their documents with AI.