# Vercel Deployment Setup for Briefly Cloud

This guide explains how to properly configure Vercel to deploy the unified Next.js Briefly Cloud application.

## Issue Resolution

The deployment was failing because Vercel was trying to run the old Python installation command:
```
cd server && pip install -r requirements-vercel.txt
```

This is because the project was previously configured for a Python FastAPI backend, but we've migrated to a unified Next.js architecture.

## Solution: Configure Vercel Project Settings

### Step 1: Update Vercel Project Configuration

In your Vercel dashboard for the Briefly Cloud project:

1. **Go to Project Settings** → **General**
2. **Set Root Directory**: `briefly-cloud-nextjs`
3. **Framework Preset**: Next.js
4. **Node.js Version**: 18.x or higher

### Step 2: Configure Build Settings

In **Project Settings** → **Build & Development Settings**:

- **Build Command**: `npm run build` (leave empty to use default)
- **Output Directory**: `.next` (leave empty to use default)
- **Install Command**: `npm install` (leave empty to use default)
- **Development Command**: `npm run dev` (leave empty to use default)

### Step 3: Environment Variables

In **Project Settings** → **Environment Variables**, add all required variables:

#### Required Environment Variables

```env
# NextAuth.js Configuration
NEXTAUTH_SECRET=your-nextauth-secret-here
NEXTAUTH_URL=https://your-domain.vercel.app

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# OpenAI Configuration
OPENAI_API_KEY=your-openai-api-key

# OAuth Providers
GOOGLE_DRIVE_CLIENT_ID=your-google-drive-client-id
GOOGLE_DRIVE_CLIENT_SECRET=your-google-drive-client-secret
GOOGLE_DRIVE_REDIRECT_URI=https://your-domain.com/api/storage/google/callback
GOOGLE_DRIVE_SCOPES=https://www.googleapis.com/auth/drive.readonly

MS_DRIVE_CLIENT_ID=your-microsoft-drive-client-id
MS_DRIVE_CLIENT_SECRET=your-microsoft-drive-client-secret
MS_DRIVE_TENANT_ID=your-microsoft-tenant-id
MS_DRIVE_REDIRECT_URI=https://your-domain.com/api/storage/microsoft/callback
MS_DRIVE_SCOPES=https://graph.microsoft.com/Files.Read.All offline_access

# Stripe Configuration
STRIPE_SECRET_KEY=your-stripe-secret-key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your-stripe-publishable-key
STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret

# ChromaDB Configuration (optional)
CHROMA_API_KEY=your-chroma-api-key
CHROMA_TENANT_ID=your-chroma-tenant-id
CHROMA_DB_NAME=briefly-cloud-prod
```

### Step 4: Domain Configuration

1. **Custom Domain**: Configure your custom domain (e.g., `app.brieflycloud.com`)
2. **SSL Certificate**: Vercel automatically provides SSL certificates
3. **Redirects**: Set up any necessary redirects from old URLs

### Step 5: Function Configuration

The `vercel.json` file in the `briefly-cloud-nextjs` directory configures:

- **API Route Timeouts**: Different timeouts for different endpoints
- **Security Headers**: Comprehensive security header configuration
- **CORS Settings**: Proper CORS configuration for API routes
- **Cron Jobs**: Scheduled tasks for health checks and cleanup

## Alternative: Deploy from Subdirectory

If you prefer to keep the current repository structure, you can also:

1. **Create a new Vercel project** specifically for the app
2. **Connect it to the same GitHub repository**
3. **Set the root directory** to `briefly-cloud-nextjs`
4. **Configure environment variables** as above

This approach allows you to have:
- **Website project**: Deploys from the `Website/` directory
- **App project**: Deploys from the `briefly-cloud-nextjs/` directory

## Deployment Commands

### Manual Deployment (if needed)

```bash
# Install Vercel CLI
npm i -g vercel

# Navigate to the Next.js app directory
cd briefly-cloud-nextjs

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

### Automatic Deployment

Once configured correctly, Vercel will automatically deploy:
- **Preview deployments** for all branches and pull requests
- **Production deployments** when pushing to the main branch

## Troubleshooting

### Common Issues

1. **Build fails with Python errors**
   - **Solution**: Ensure root directory is set to `briefly-cloud-nextjs`
   - **Check**: Vercel project settings → General → Root Directory

2. **Environment variables not found**
   - **Solution**: Add all required environment variables in Vercel dashboard
   - **Check**: Project Settings → Environment Variables

3. **API routes timeout**
   - **Solution**: Function timeouts are configured in `vercel.json`
   - **Check**: Increase timeout values if needed

4. **CORS errors**
   - **Solution**: CORS headers are configured in `vercel.json`
   - **Check**: Verify header configuration matches your needs

### Verification Steps

After deployment, verify:

1. **Health Check**: Visit `/api/health` to ensure API is working
2. **Authentication**: Test OAuth login flows
3. **File Upload**: Test document upload functionality
4. **AI Chat**: Test chat functionality with documents
5. **Monitoring**: Check Vercel dashboard for function logs

## Migration from Old Configuration

If you have an existing Vercel project with the old Python configuration:

1. **Update project settings** as described above
2. **Remove old environment variables** related to Python
3. **Add new environment variables** for Next.js app
4. **Trigger a new deployment** to apply changes

## Security Considerations

The `vercel.json` configuration includes:

- **Security Headers**: X-Frame-Options, X-Content-Type-Options, etc.
- **HTTPS Enforcement**: Strict-Transport-Security header
- **Content Security Policy**: Configured for the application needs
- **CORS Configuration**: Properly configured for API access

## Performance Optimization

The configuration includes:

- **Function Timeouts**: Optimized for different endpoint types
- **Regional Deployment**: Multi-region deployment for better performance
- **Caching**: Automatic caching for static assets
- **Edge Functions**: API routes run at the edge for better performance

## Monitoring and Maintenance

- **Health Checks**: Automated health monitoring via cron jobs
- **Error Tracking**: Integrated with Sentry for error monitoring
- **Performance Monitoring**: Vercel Analytics for performance tracking
- **Uptime Monitoring**: External uptime monitoring recommended

---

**Next Steps**: After configuring Vercel as described above, trigger a new deployment to apply all changes.