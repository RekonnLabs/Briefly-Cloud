# Briefly Cloud - Unified Next.js Deployment Guide

## Overview
This guide covers deploying the unified Briefly Cloud app to Vercel with all backend functionality integrated into a single Next.js project.

## Prerequisites
- Vercel account
- Supabase project with pgvector enabled
- Google Cloud Console project (for OAuth)
- Microsoft Azure AD app registration
- Stripe account
- OpenAI API key

## 1. Supabase Setup

### 1.1 Create Supabase Project
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note down your project URL and anon key

### 1.2 Enable pgvector Extension
1. Go to your Supabase dashboard
2. Navigate to Database → Extensions
3. Enable the `vector` extension

### 1.3 Apply Database Schema
1. Go to SQL Editor in your Supabase dashboard
2. Copy and paste the contents of `supabase-schema.sql`
3. Execute the script to create all tables and policies

## 2. OAuth Provider Setup

### 2.1 Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing one
3. Enable Google Drive API
4. Go to Credentials → Create Credentials → OAuth 2.0 Client ID
5. Set application type to "Web application"
6. Add authorized redirect URIs:
   - `https://rekonnlabs.com/briefly/app/api/auth/callback/google`
7. Note down Client ID and Client Secret

### 2.2 Microsoft Azure AD
1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to Azure Active Directory → App registrations
3. Create new registration
4. Set redirect URI to:
   - `https://rekonnlabs.com/briefly/app/api/auth/callback/azure-ad`
5. Note down Application (client) ID and create a client secret
6. Note down Directory (tenant) ID

## 3. Stripe Setup

### 3.1 Create Products and Prices
1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Create two products:
   - **Pro**: Monthly subscription
   - **Pro BYOK**: Monthly subscription
3. Create recurring prices for each product
4. Note down the price IDs (they should match the ones in env.template)

### 3.2 Configure Webhooks
1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://rekonnlabs.com/briefly/app/api/billing/webhook`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.deleted`
4. Note down the webhook signing secret

## 4. Vercel Deployment

### 4.1 Connect Repository
1. Go to [Vercel Dashboard](https://vercel.com)
2. Import your GitHub repository
3. Set root directory to `Briefly_Cloud/briefly-cloud-nextjs`

### 4.2 Configure Environment Variables
Add the following environment variables in Vercel:

```bash
# NextAuth Configuration
NEXTAUTH_URL=https://rekonnlabs.com/briefly/app
NEXTAUTH_SECRET=your-generated-secret

# Storage OAuth Providers (Optional)
GOOGLE_DRIVE_CLIENT_ID=your-google-drive-client-id
GOOGLE_DRIVE_CLIENT_SECRET=your-google-drive-client-secret
GOOGLE_DRIVE_REDIRECT_URI=https://your-domain.com/api/storage/google/callback
GOOGLE_DRIVE_SCOPES=https://www.googleapis.com/auth/drive.readonly

MS_DRIVE_CLIENT_ID=your-microsoft-drive-client-id
MS_DRIVE_CLIENT_SECRET=your-microsoft-drive-client-secret
MS_DRIVE_TENANT_ID=your-microsoft-tenant-id
MS_DRIVE_REDIRECT_URI=https://your-domain.com/api/storage/microsoft/callback
MS_DRIVE_SCOPES=https://graph.microsoft.com/Files.Read.All offline_access

# OpenAI Configuration
OPENAI_API_KEY=your-openai-api-key

# Chat Models
CHAT_MODEL_FREE=gpt-5-nano
CHAT_MODEL_PRO=gpt-5-mini
CHAT_MODEL_BYOK=gpt-5-mini
FEATURE_GPT5=true

# Vector Backend
VECTOR_BACKEND=chroma
CHROMA_API_KEY=ck-D9GA7ki3k88XCfk4TACvH67Q5q5RE7tgUDvyGZ9TZDST
CHROMA_TENANT_ID=d66de939-998f-4a7c-beaa-631552b609fb
CHROMA_DB_NAME=Briefly Cloud

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Stripe Configuration
STRIPE_SECRET_KEY=your-stripe-secret-key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your-stripe-publishable-key
STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret
STRIPE_PRICE_PRO=price_7sY8wO0WUdHydT94eUdZ600
STRIPE_PRICE_PRO_BYOK=price_14A9AS7li6f62arfXCdZ601
STRIPE_SUCCESS_URL=https://rekonnlabs.com/briefly/app/billing/success
STRIPE_CANCEL_URL=https://rekonnlabs.com/briefly/app/billing/cancel
```

### 4.3 Configure Domain
1. In Vercel project settings, go to Domains
2. Add custom domain: `rekonnlabs.com`
3. Configure path-based deployment to `/briefly/app`

## 5. Testing Deployment

### 5.1 Health Check
Visit: `https://rekonnlabs.com/briefly/app/api/health`

### 5.2 Diagnostics
Visit: `https://rekonnlabs.com/briefly/app/api/diagnostics`

### 5.3 Test OAuth Flow
1. Visit the app
2. Try signing in with Google
3. Try signing in with Microsoft

## 6. Monitoring and Maintenance

### 6.1 Vercel Analytics
- Monitor function execution times
- Check for cold starts
- Monitor API route performance

### 6.2 Supabase Monitoring
- Monitor database performance
- Check RLS policy effectiveness
- Monitor vector search performance

### 6.3 Stripe Webhook Monitoring
- Check webhook delivery in Stripe dashboard
- Monitor subscription lifecycle events

## 7. Troubleshooting

### Common Issues

#### OAuth Redirect Errors
- Verify redirect URIs match exactly
- Check NEXTAUTH_URL configuration
- Ensure OAuth providers are properly configured

#### Vector Search Issues
- Verify Chroma Cloud API key and tenant ID
- Check pgvector extension is enabled in Supabase
- Monitor embedding generation performance

#### Stripe Webhook Failures
- Verify webhook endpoint URL
- Check webhook signing secret
- Monitor webhook delivery in Stripe dashboard

#### Database Connection Issues
- Verify Supabase connection strings
- Check RLS policies are properly applied
- Monitor connection pool usage

## 8. Security Considerations

### Environment Variables
- Never commit sensitive keys to version control
- Use Vercel's environment variable encryption
- Rotate keys regularly

### OAuth Security
- Use HTTPS for all redirect URIs
- Implement proper state parameter handling
- Monitor OAuth token refresh cycles

### Database Security
- All tables have RLS enabled
- Users can only access their own data
- Regular security audits recommended

## 9. Performance Optimization

### Vercel Functions
- Keep function size under 50MB
- Use edge functions for global performance
- Implement proper caching strategies

### Vector Search
- Monitor embedding generation costs
- Implement chunk size optimization
- Use appropriate similarity thresholds

### Database
- Monitor query performance
- Implement proper indexing
- Use connection pooling effectively

