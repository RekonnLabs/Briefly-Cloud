# Security Guide - API Key Management

## 🔐 SECURE KEY STORAGE

### **DO NOT USE:**
- ❌ Notepad/Text files
- ❌ Email
- ❌ Slack/Discord
- ❌ GitHub (even private repos)
- ❌ Browser bookmarks
- ❌ Sticky notes

### **RECOMMENDED TOOLS:**

#### **1. Password Manager (BEST)**
- **Bitwarden** (Free) - https://bitwarden.com/
- **1Password** (Paid) - https://1password.com/
- **KeePass** (Free, local) - https://keepass.info/

#### **2. Railway Dashboard (Production)**
- All production keys stored securely in Railway
- No local files needed for production
- Easy to update via web interface

#### **3. Local Development**
```bash
# Copy template to local file (NEVER commit this)
cp env.railway.template .env.railway

# Fill in your keys locally
# This file is in .gitignore and won't be committed
```

## 📋 KEY REGISTRY TEMPLATE

### **OpenAI**
- **Service**: OpenAI API
- **URL**: https://platform.openai.com/api-keys
- **Key Type**: API Key
- **Format**: sk-proj-...
- **Notes**: Regenerate if exposed

### **Chroma**
- **Service**: Chroma Cloud
- **URL**: https://cloud.trychroma.com/
- **Key Type**: API Key
- **Format**: ck-...
- **Notes**: Regenerate if exposed

### **Stripe**
- **Service**: Stripe Dashboard
- **URL**: https://dashboard.stripe.com/apikeys
- **Key Type**: Secret Key
- **Format**: sk_test_... (test) / sk_live_... (live)
- **Notes**: Separate test/live keys

### **Google OAuth**
- **Service**: Google Cloud Console
- **URL**: https://console.cloud.google.com/
- **Key Type**: Client Secret
- **Format**: GOCSPX-...
- **Notes**: Regenerate if exposed

### **Azure OAuth**
- **Service**: Azure Portal
- **URL**: https://portal.azure.com/
- **Key Type**: Client Secret
- **Format**: Various
- **Notes**: Regenerate if exposed

### **Mailjet**
- **Service**: Mailjet Dashboard
- **URL**: https://app.mailjet.com/
- **Key Type**: API Key/Secret
- **Format**: Various
- **Notes**: Regenerate if exposed

### **Supabase**
- **Service**: Supabase Dashboard
- **URL**: https://supabase.com/dashboard
- **Key Type**: Anon Key + Service Role
- **Format**: eyJ...
- **Notes**: Keep service role secret

## 🚨 EMERGENCY PROCEDURES

### **If Keys Are Exposed:**
1. **IMMEDIATELY** regenerate all exposed keys
2. Update Railway dashboard with new keys
3. Update local `.env.railway` with new keys
4. Test all functionality
5. Monitor for unauthorized usage

### **Key Rotation Schedule:**
- **Monthly**: Review all keys
- **Quarterly**: Rotate non-critical keys
- **Annually**: Rotate all keys
- **Immediately**: If any exposure detected

## 📱 MOBILE ACCESS

### **Bitwarden Mobile App:**
- Install on phone/tablet
- Sync across all devices
- Secure access to keys anywhere
- Biometric unlock

### **Railway Mobile:**
- Access Railway dashboard on mobile
- View/update environment variables
- Monitor deployments
- Check logs

## 🔄 WORKFLOW

### **Adding New Keys:**
1. Generate key in service dashboard
2. Store in password manager
3. Add to Railway dashboard (production)
4. Add to local `.env.railway` (development)
5. Test functionality
6. Document in this guide

### **Updating Keys:**
1. Generate new key
2. Update password manager
3. Update Railway dashboard
4. Update local `.env.railway`
5. Test thoroughly
6. Remove old key from service

## ✅ SECURITY CHECKLIST

- [ ] All keys stored in password manager
- [ ] No keys in plain text files
- [ ] Railway dashboard updated
- [ ] Local `.env.railway` updated
- [ ] `.env.railway` in `.gitignore`
- [ ] Template file committed to GitHub
- [ ] All exposed keys regenerated
- [ ] Functionality tested
- [ ] Team members have access to password manager
- [ ] Emergency procedures documented 