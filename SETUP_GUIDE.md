# 🚀 Briefly Cloud - Setup Guide

## 🔐 **IMPORTANT: API Key Configuration Required**

This package does **NOT** include API keys for security reasons. You must configure your own API keys before using Briefly Cloud.

## 📋 **Quick Setup Checklist**

- [ ] 1. Extract the project
- [ ] 2. Copy environment templates
- [ ] 3. Get required API keys
- [ ] 4. Configure environment files
- [ ] 5. Install dependencies
- [ ] 6. Test configuration
- [ ] 7. Start development

## 🛠️ **Step-by-Step Setup**

### 1. **Extract Project**
```bash
unzip Briefly_Cloud_CLEAN.zip
cd Briefly_Cloud
```

### 2. **Copy Environment Templates**
```bash
# Server environment
cp server/.env.example server/.env

# Client environment
cp client/.env.example client/.env
```

### 3. **Get Required API Keys**

You need to obtain API keys from these services:

#### 🤖 **OpenAI** (Required)
- Go to: https://platform.openai.com/api-keys
- Create new API key
- Copy the key (starts with `sk-`)

#### 🗄️ **Chroma Cloud** (Required)
- Go to: https://www.trychroma.com/
- Sign up for Chroma Cloud
- Get your API key and tenant ID

#### 🗃️ **Supabase** (Required)
- Go to: https://supabase.com/
- Create new project
- Get URL, anon key, and service role key from Settings > API

#### 💳 **Stripe** (Required for payments)
- Go to: https://dashboard.stripe.com/
- Get secret key and public key from Developers > API Keys

#### 🔐 **OAuth Services** (Required for cloud storage)

**Google OAuth:**
- Go to: https://console.cloud.google.com/
- Create OAuth 2.0 Client ID
- Add redirect URI: `http://localhost:5173/auth/google/callback`

**Microsoft Azure:**
- Go to: https://portal.azure.com/
- Register new application
- Add redirect URI: `http://localhost:5173/auth/microsoft/callback`

### 4. **Configure Environment Files**

#### **Server Configuration** (`server/.env`)
```bash
nano server/.env
```

**Required Keys to Add:**
```env
# Replace these with your actual keys
OPENAI_API_KEY=sk-your-actual-openai-key
CHROMA_API_KEY=ck-your-actual-chroma-key
CHROMA_TENANT_ID=your-actual-tenant-id
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-actual-anon-key
SUPABASE_SERVICE_ROLE=your-actual-service-role-key
STRIPE_SECRET_KEY=sk_test_your-actual-stripe-secret
GOOGLE_CLIENT_ID=your-actual-google-client-id
GOOGLE_CLIENT_SECRET=your-actual-google-secret
AZURE_CLIENT_ID=your-actual-azure-client-id
AZURE_CLIENT_SECRET=your-actual-azure-secret
```

#### **Client Configuration** (`client/.env`)
```bash
nano client/.env
```

**Required Keys to Add:**
```env
# Replace with your actual Stripe public key
VITE_STRIPE_PUBLIC_KEY=pk_test_your-actual-stripe-public-key
```

### 5. **Install Dependencies**
```bash
npm run install-all
```

### 6. **Test Configuration**
```bash
# Test API keys
npm run test-api

# Should show all green checkmarks ✅
```

### 7. **Start Development**
```bash
npm run dev
# OR
start.bat
```

Visit: http://localhost:5173

## 🔍 **Troubleshooting**

### **Common Issues:**

#### ❌ **OpenAI API Error**
- **Problem**: Invalid API key or no credits
- **Solution**: Check key format, verify billing in OpenAI dashboard

#### ❌ **Chroma Connection Failed**
- **Problem**: Invalid API key or tenant ID
- **Solution**: Verify credentials in Chroma Cloud dashboard

#### ❌ **Supabase Connection Error**
- **Problem**: Wrong URL or keys
- **Solution**: Check project settings in Supabase dashboard

#### ❌ **OAuth Not Working**
- **Problem**: Redirect URIs not configured
- **Solution**: Add exact redirect URIs in OAuth app settings

### **Getting Help:**
- Check `TROUBLESHOOTING_GUIDE.md`
- Run `npm run test-api` for detailed error messages
- Verify all keys are correctly copied (no extra spaces)

## 🎯 **Verification Checklist**

After setup, verify these work:

- [ ] ✅ API key test passes
- [ ] ✅ Server starts without errors
- [ ] ✅ Client loads at http://localhost:5173
- [ ] ✅ Can upload a test document
- [ ] ✅ Can chat with AI about the document
- [ ] ✅ OAuth login buttons appear
- [ ] ✅ No console errors

## 🚀 **Ready to Launch!**

Once all tests pass, your Briefly Cloud is ready for:
- ✅ Development and testing
- ✅ Document processing
- ✅ AI-powered conversations
- ✅ Cloud storage integration
- ✅ Team collaboration

## 🔐 **Security Notes**

- **Never commit** `.env` files to version control
- **Keep API keys secure** and don't share them
- **Use test keys** for development
- **Rotate keys regularly** for production
- **Monitor usage** in service dashboards

## 📞 **Support**

If you need help:
1. Check the troubleshooting guide
2. Run the API test script
3. Verify your API keys are valid
4. Check service status pages
5. Review the documentation in `Docs/`

---

**🎉 Welcome to Briefly Cloud - Your AI-Powered Productivity Assistant!**

