# Railway Environment Variables Setup

## 🚀 **Essential Variables for Railway Deployment**

Copy these variables into Railway's environment variables section:

### **Core Services (Required)**
```env
# Supabase (Database & Auth)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE=your_supabase_service_role_key_here

# OpenAI (AI Processing)
OPENAI_API_KEY=your_openai_api_key_here

# Stripe (Payments)
STRIPE_SECRET_KEY=your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret_here
```

### **OAuth Integration (Required for Storage)**
```env
# Google Drive OAuth
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_REDIRECT_URI=https://briefly-cloud-production.up.railway.app/api/storage/google/callback

# Microsoft OneDrive OAuth
AZURE_CLIENT_ID=your_azure_client_id_here
AZURE_CLIENT_SECRET=your_azure_client_secret_here
AZURE_TENANT_ID=your_azure_tenant_id_here
MICROSOFT_REDIRECT_URI=https://briefly-cloud-production.up.railway.app/api/storage/microsoft/callback
```

### **Production Configuration**
```env
# Environment
ENVIRONMENT=production
DEBUG=False
LOG_LEVEL=INFO

# CORS & Security
ALLOWED_ORIGINS=https://rekonnlabs.com,https://www.rekonnlabs.com
FRONTEND_URL=https://rekonnlabs.com

# Security Keys (Generate strong random keys)
SESSION_SECRET_KEY=your_strong_session_secret_here
JWT_SECRET_KEY=your_strong_jwt_secret_here
TOKEN_EXPIRY_HOURS=24
```

### **Optional - Advanced Features**
```env
# ChromaDB (Vector Search)
CHROMA_HOST=api.trychroma.com
CHROMA_PORT=443
CHROMA_API_KEY=your_chroma_api_key_here
CHROMA_TENANT_ID=your_chroma_tenant_id_here
CHROMA_DB_NAME=Briefly Cloud

# AI Configuration
DEFAULT_LLM_MODEL=gpt-4o
DEFAULT_LLM_TEMPERATURE=0.7
MAX_TOKENS=4000
EMBEDDING_MODEL=text-embedding-3-large

# File Limits
MAX_FILE_SIZE_MB=50
MAX_FILES_PER_USER=1000

# Rate Limiting
RATE_LIMIT_PER_MINUTE=60
RATE_LIMIT_PER_HOUR=1000
```

## 📋 **Railway Setup Steps**

1. **Go to Railway Variables tab** (as shown in your screenshot)
2. **Use ENV format** (recommended over JSON for Railway)
3. **Add variables one by one** or use "Copy ENV" feature
4. **Update OAuth redirect URIs** to use your Railway domain:
   - `https://briefly-cloud-production.up.railway.app`

## 🔑 **Keys You Need to Obtain**

### **Supabase** (Database & Auth)
- Create project at [supabase.com](https://supabase.com)
- Get URL and keys from Settings → API

### **OpenAI** (AI Processing)
- Get API key from [platform.openai.com](https://platform.openai.com)

### **Stripe** (Payments)
- Get keys from [dashboard.stripe.com](https://dashboard.stripe.com)

### **Google OAuth** (Drive Integration)
- Create OAuth app at [console.cloud.google.com](https://console.cloud.google.com)
- Enable Google Drive API

### **Microsoft OAuth** (OneDrive Integration)
- Create app at [portal.azure.com](https://portal.azure.com)
- Enable Microsoft Graph API

## ⚠️ **Important Notes**

- **Port**: Railway automatically sets `PORT` - don't override it
- **Domain**: Update all redirect URIs to use your Railway domain
- **Security**: Generate strong random keys for production
- **CORS**: Add your frontend domain to `ALLOWED_ORIGINS`

## 🧪 **Testing After Setup**

Once variables are added, test these endpoints:
```bash
curl https://briefly-cloud-production.up.railway.app/api/diagnostics
curl https://briefly-cloud-production.up.railway.app/health
```