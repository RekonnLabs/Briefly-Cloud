# Vercel Environment Variables Setup

## Required Environment Variables

Add these in your Vercel project dashboard (Settings → Environment Variables):

### **Supabase Configuration**
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE=your_supabase_service_role_key_here
```

### **OpenAI Configuration**
```
OPENAI_API_KEY=your_openai_api_key_here
```

### **Chroma Vector Store**
```
CHROMA_CLOUD_URL=https://api.trychroma.com/v1
CHROMA_API_KEY=your_chroma_api_key_here
CHROMA_TENANT_ID=your_chroma_tenant_id_here
CHROMA_DB_NAME=Briefly Cloud
```

### **Stripe Configuration**
```
STRIPE_SECRET_KEY=your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret_here
```

### **Google OAuth**
```
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
```

### **Microsoft OAuth**
```
AZURE_CLIENT_ID=your_azure_client_id_here
AZURE_CLIENT_SECRET=your_azure_client_secret_here
```

### **Production URLs**
```
ALLOWED_ORIGINS=https://rekonnlabs.com,https://www.rekonnlabs.com
FRONTEND_URL=https://rekonnlabs.com
GOOGLE_REDIRECT_URI=https://your-backend.vercel.app/api/storage/google/callback
MICROSOFT_REDIRECT_URI=https://your-backend.vercel.app/api/storage/microsoft/callback
```

### **Server Configuration**
```
ENVIRONMENT=production
DEBUG=False
LOG_LEVEL=WARNING
```

## How to Add Variables in Vercel

1. Go to your Vercel dashboard
2. Select your project
3. Go to Settings → Environment Variables
4. Add each variable with its value
5. Set environment to "Production" (or All)
6. Save and redeploy

## Testing the Deployment

After setting environment variables, the health check should work:
```
https://your-backend.vercel.app/health
```

Should return:
```json
{"status": "healthy", "service": "briefly-cloud-backend"}
```