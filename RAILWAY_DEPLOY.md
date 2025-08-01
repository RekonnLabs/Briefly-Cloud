# Railway Deployment - Simple Setup

## 🚀 One-Click Deploy

1. **Connect Repository to Railway:**
   - Go to [railway.app](https://railway.app)
   - Click "Deploy from GitHub repo"
   - Select this repository

2. **Set Environment Variables:**
   ```
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   OPENAI_API_KEY=your_openai_key
   ```

3. **Deploy:**
   - Railway will automatically build and deploy
   - Health check: `https://your-app.railway.app/health`

## ✅ What's Included

- ✅ Optimized dependencies (no heavy ML libraries)
- ✅ OAuth support (Google Drive, OneDrive)
- ✅ Stripe payments
- ✅ Supabase integration
- ✅ API-only mode (uses OpenAI for ML)

## 🔧 Troubleshooting

**If deployment fails:**
1. Check environment variables are set
2. View logs in Railway dashboard
3. Verify health endpoint responds

**Size:** ~500MB (vs 6GB+ with ML libraries)
**Mode:** API-only (external ML services)