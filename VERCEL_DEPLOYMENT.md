# Vercel Deployment Guide - Briefly Cloud Backend

## Prerequisites
- Vercel account connected to your GitHub repository
- All environment variables configured in Vercel dashboard

## Deployment Steps

### 1. Environment Variables in Vercel Dashboard
Configure these in your Vercel project settings:

```env
# Supabase
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE=your_supabase_service_role_key

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Chroma Vector Store
CHROMA_CLOUD_URL=https://api.trychroma.com/v1
CHROMA_API_KEY=your_chroma_api_key
CHROMA_TENANT_ID=your_chroma_tenant_id
CHROMA_DB_NAME=Briefly Cloud

# Stripe
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Microsoft OAuth
AZURE_CLIENT_ID=your_azure_client_id
AZURE_CLIENT_SECRET=your_azure_client_secret

# Production URLs
ALLOWED_ORIGINS=https://rekonnlabs.com,https://www.rekonnlabs.com
FRONTEND_URL=https://rekonnlabs.com
GOOGLE_REDIRECT_URI=https://briefly-cloud-backend.vercel.app/api/storage/google/callback
MICROSOFT_REDIRECT_URI=https://briefly-cloud-backend.vercel.app/api/storage/microsoft/callback

# Server Config
ENVIRONMENT=production
DEBUG=False
LOG_LEVEL=WARNING
```

### 2. OAuth App Configuration Updates

**Google Cloud Console:**
1. Go to Google Cloud Console → APIs & Services → Credentials
2. Edit your OAuth 2.0 Client ID
3. Add to Authorized redirect URIs:
   - `https://briefly-cloud-backend.vercel.app/api/storage/google/callback`

**Microsoft Azure:**
1. Go to Azure Portal → App registrations → Your app
2. Go to Authentication → Platform configurations → Web
3. Add redirect URI:
   - `https://briefly-cloud-backend.vercel.app/api/storage/microsoft/callback`

### 3. Stripe Webhook Configuration
1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://briefly-cloud-backend.vercel.app/api/stripe/webhook`
3. Select events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`

### 4. Deploy
```bash
git add .
git commit -m "Production ready for Vercel deployment"
git push origin main
```

Vercel will automatically deploy when you push to your main branch.

### 5. Verify Deployment
- Check health endpoint: `https://briefly-cloud-backend.vercel.app/health`
- Test OAuth flows
- Verify Stripe webhooks
- Test API endpoints

## Troubleshooting

### Common Issues:
1. **Import errors**: Ensure all dependencies are in requirements.txt
2. **CORS errors**: Verify ALLOWED_ORIGINS includes your frontend domain
3. **OAuth failures**: Check redirect URIs match exactly
4. **Database connection**: Verify Supabase credentials and URL

### Logs:
View deployment logs in Vercel dashboard under Functions tab.