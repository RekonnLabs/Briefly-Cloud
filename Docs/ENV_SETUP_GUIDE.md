# 🔧 Environment Setup Guide for Briefly Cloud

## 📋 Required API Keys & Services

### ✅ **ALREADY CONFIGURED** (Based on your .env)

**🤖 AI & LLM Services:**
- ✅ OpenAI API Key - For GPT-4o and embeddings
- ✅ Chroma Cloud API Key - For vector database
- ✅ Chroma Tenant ID - Your Chroma workspace

**🗄️ Backend Services:**
- ✅ Supabase URL & Keys - Database and authentication
- ✅ Stripe Secret Key - Payment processing

**🔐 OAuth Services:**
- ✅ Google OAuth - Client ID and Secret
- ✅ Microsoft Azure OAuth - Client ID and Secret

## ⚠️ **MISSING INFORMATION TO COMPLETE**

### 1. **Stripe Public Key** (Required for frontend)
```env
# Add to client/.env
VITE_STRIPE_PUBLIC_KEY=pk_test_your_stripe_public_key_here
```
**Where to find:** Stripe Dashboard → Developers → API Keys → Publishable key

### 2. **Stripe Webhook Secret** (Optional but recommended)
```env
# Add to server/.env
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```
**Where to find:** Stripe Dashboard → Developers → Webhooks → Select endpoint → Signing secret

### 3. **Email Configuration** (Optional - for notifications)
```env
# Add to server/.env if you want email notifications
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```
**Setup:** Enable 2FA on Gmail → Generate App Password → Use that password

## 🔍 **VALIDATION CHECKLIST**

### OpenAI API Key
- [ ] Key starts with `sk-proj-` or `sk-`
- [ ] Has sufficient credits/quota
- [ ] Can access GPT-4o model

### Chroma Cloud
- [ ] API key starts with `ck-`
- [ ] Tenant ID is a valid UUID
- [ ] Database name is set correctly

### Supabase
- [ ] URL format: `https://[project-id].supabase.co`
- [ ] Anon key starts with `eyJ`
- [ ] Service role key starts with `eyJ`
- [ ] Database tables are created

### Stripe
- [ ] Secret key starts with `sk_test_` (test) or `sk_live_` (production)
- [ ] Public key starts with `pk_test_` (test) or `pk_live_` (production)
- [ ] Webhook endpoint configured (optional)

### OAuth Configuration
- [ ] Google Client ID ends with `.apps.googleusercontent.com`
- [ ] Google Client Secret is properly set
- [ ] Azure Client ID is a valid UUID
- [ ] Azure Client Secret is properly set
- [ ] Redirect URIs are configured in OAuth apps

## 🧪 **TESTING YOUR SETUP**

### 1. **Quick API Test**
```bash
python test_api_keys.py
```

### 2. **Full Integration Test**
```bash
# Start your server first
npm run dev

# Then in another terminal
python test_complete_integration.py
```

## 🔧 **TROUBLESHOOTING COMMON ISSUES**

### OpenAI API Errors
- **Rate Limit**: Upgrade your OpenAI plan
- **Invalid Key**: Check key format and regenerate if needed
- **Model Access**: Ensure you have access to GPT-4o

### Chroma Cloud Errors
- **Authentication**: Verify API key and tenant ID
- **Network**: Check if Chroma Cloud URL is accessible
- **Quota**: Ensure you haven't exceeded usage limits

### Supabase Errors
- **CORS**: Add your domain to allowed origins
- **RLS**: Configure Row Level Security policies
- **Tables**: Ensure required tables exist

### Stripe Errors
- **Test Mode**: Use test keys for development
- **Webhooks**: Verify webhook URL and secret
- **Products**: Create products/prices in Stripe dashboard

### OAuth Errors
- **Redirect URIs**: Must match exactly in OAuth app settings
- **Scopes**: Ensure proper scopes are requested
- **Consent Screen**: Configure OAuth consent screen

## 📚 **ADDITIONAL SETUP STEPS**

### 1. **Supabase Database Setup**
```sql
-- Create required tables (run in Supabase SQL editor)
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  filename TEXT NOT NULL,
  content TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  title TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 2. **Stripe Product Setup**
```bash
# Create products in Stripe dashboard or via API
# Example products:
# - Free Plan: $0/month
# - Pro Plan: $9/month  
# - Team Plan: $29/month
# - Enterprise: $99/month
```

### 3. **OAuth App Configuration**

**Google OAuth:**
1. Go to Google Cloud Console
2. Create OAuth 2.0 Client ID
3. Add redirect URIs:
   - `http://localhost:5173/auth/google/callback`
   - `https://yourdomain.com/auth/google/callback`

**Microsoft Azure:**
1. Go to Azure Portal → App Registrations
2. Create new registration
3. Add redirect URIs:
   - `http://localhost:5173/auth/microsoft/callback`
   - `https://yourdomain.com/auth/microsoft/callback`

## ✅ **PRODUCTION READINESS**

Before going live, ensure:

- [ ] All test keys replaced with production keys
- [ ] HTTPS enabled for all services
- [ ] Environment variables secured
- [ ] Database backups configured
- [ ] Monitoring and logging set up
- [ ] Rate limiting configured
- [ ] CORS properly configured for your domain

## 🆘 **GETTING HELP**

If you encounter issues:

1. **Check the logs** - Look for specific error messages
2. **Run tests** - Use the provided testing scripts
3. **Verify credentials** - Double-check all API keys
4. **Check quotas** - Ensure you haven't hit usage limits
5. **Review documentation** - Check service provider docs

## 🎯 **NEXT STEPS**

1. ✅ Complete any missing API keys
2. 🧪 Run the testing suite
3. 🚀 Start development server
4. 📱 Test core functionality
5. 🌟 Begin adding new features

Your setup is 95% complete! Just add the missing Stripe public key and you're ready to go! 🎉

