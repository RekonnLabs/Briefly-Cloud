# 🎯 Briefly Cloud MVP Completion Guide

This guide will help you complete the MVP setup and get Briefly Cloud fully operational.

## 📋 Current Status

✅ **Completed:**
- Backend architecture with FastAPI
- Frontend React components
- Database schema design
- Authentication system
- Cloud storage OAuth integration
- Document processing pipeline
- Vector embedding with Chroma Cloud
- Chat interface with context retrieval

🚧 **Remaining Tasks:**
- Environment configuration
- Database setup
- OAuth application setup
- API key configuration
- Testing and validation

## 🚀 Step-by-Step Setup

### 1. Prerequisites Setup

First, run the automated setup script:

```bash
python setup_mvp.py
```

This will check your environment and install dependencies.

### 2. Database Configuration

#### A. Supabase Setup
1. Go to [supabase.com](https://supabase.com) and create a new project
2. In the SQL Editor, run the schema from `database_schema_cloud.sql`
3. Go to Settings > API and copy your:
   - Project URL
   - Anon public key
   - Service role key (keep this secret)

#### B. Enable Authentication
1. In Supabase Dashboard > Authentication > Settings
2. Enable email authentication
3. Configure OAuth providers (Google, Microsoft)

### 3. OAuth Applications Setup

#### A. Google Cloud Console
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable Google Drive API and Google+ API
4. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:3001/api/storage/google/callback`
5. Copy Client ID and Client Secret

#### B. Microsoft Azure
1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to Azure Active Directory > App registrations
3. Create new registration:
   - Name: Briefly Cloud
   - Redirect URI: `http://localhost:3001/api/storage/microsoft/callback`
4. Go to API permissions and add:
   - Microsoft Graph > Files.Read.All
   - Microsoft Graph > User.Read
5. Copy Application (client) ID and create a client secret

### 4. Vector Database Setup

#### Option A: Chroma Cloud (Recommended)
1. Sign up at [trychroma.com](https://trychroma.com)
2. Create a new database
3. Copy your API key and tenant ID

#### Option B: Local ChromaDB (Fallback)
- Leave CHROMA_HOST and CHROMA_API_KEY empty in .env
- The system will use local ChromaDB automatically

### 5. Environment Configuration

#### A. Server Environment (`server/.env`)
```env
# Database & Authentication
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key

# AI & Vector Database
OPENAI_API_KEY=your_openai_api_key
CHROMA_API_KEY=your_chroma_cloud_api_key
CHROMA_HOST=api.trychroma.com
CHROMA_PORT=8000
CHROMA_TENANT_ID=your_chroma_tenant_id

# OAuth Providers
GOOGLE_DRIVE_CLIENT_ID=your_google_drive_client_id
GOOGLE_DRIVE_CLIENT_SECRET=your_google_drive_client_secret
GOOGLE_DRIVE_REDIRECT_URI=http://localhost:3001/api/storage/google/callback
GOOGLE_DRIVE_SCOPES=https://www.googleapis.com/auth/drive.readonly

MS_DRIVE_CLIENT_ID=your_microsoft_drive_client_id
MS_DRIVE_CLIENT_SECRET=your_microsoft_drive_client_secret
MS_DRIVE_TENANT_ID=your_microsoft_tenant_id
MS_DRIVE_REDIRECT_URI=http://localhost:3001/api/storage/microsoft/callback
MS_DRIVE_SCOPES=https://graph.microsoft.com/Files.Read.All offline_access

# Server Configuration
PORT=3001
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

#### B. Client Environment (`client/.env`)
```env
VITE_API_BASE_URL=http://localhost:3001
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_APP_NAME=Briefly Cloud
```

### 6. Start Development

```bash
# Install all dependencies
npm run install-all

# Start both client and server
npm run dev
```

The application will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

### 7. Testing the Complete Flow

#### A. User Registration & Authentication
1. Visit http://localhost:5173
2. Sign up with email/password
3. Verify the user appears in Supabase Auth dashboard

#### B. Cloud Storage Connection
1. Complete onboarding flow
2. Connect Google Drive or OneDrive
3. Verify OAuth tokens are stored in database

#### C. Document Indexing
1. Click "Index Documents" in the chat interface
2. Monitor the progress bar
3. Check that documents are processed and stored

#### D. AI Chat
1. Ask questions about your documents
2. Verify responses include source citations
3. Test different subscription tiers

## 🔧 Troubleshooting

### Common Issues

#### 1. "Route modules not available"
- Check that all route files exist in `server/routes/`
- Verify Python dependencies are installed
- Check for import errors in route modules

#### 2. "Supabase connection failed"
- Verify SUPABASE_URL and SUPABASE_ANON_KEY are correct
- Check that database schema has been applied
- Ensure RLS policies are enabled

#### 3. "OAuth callback failed"
- Verify redirect URIs match exactly in OAuth apps
- Check that OAuth credentials are correct
- Ensure OAuth APIs are enabled

#### 4. "ChromaDB connection failed"
- Verify CHROMA_API_KEY is correct
- Check network connectivity to Chroma Cloud
- Try local ChromaDB as fallback

#### 5. "Document processing failed"
- Check file permissions and supported formats
- Verify embedding model can be loaded
- Monitor server logs for specific errors

### Debug Commands

```bash
# Test API endpoints
curl http://localhost:3001/health

# Check server logs
cd server && python main.py

# Test database connection
python -c "from supabase import create_client; print('DB OK')"

# Test vector store
python -c "from server.vector_store import ChromaVectorStore; vs = ChromaVectorStore(); print('Vector OK')"
```

## 🎯 MVP Success Criteria

Your MVP is complete when:

- ✅ Users can sign up and authenticate
- ✅ Users can connect Google Drive or OneDrive
- ✅ Documents are automatically indexed with progress feedback
- ✅ Users can chat with their documents and get relevant answers
- ✅ Responses include source citations
- ✅ Different subscription tiers work correctly
- ✅ Mobile interface is responsive and functional

## 🚀 Next Steps After MVP

Once your MVP is working:

1. **Production Deployment**
   - Deploy to cloud provider (Vercel, Railway, etc.)
   - Configure production environment variables
   - Set up monitoring and logging

2. **Advanced Features**
   - Stripe payment integration
   - Team collaboration features
   - Advanced analytics
   - Voice integration

3. **Optimization**
   - Performance monitoring
   - Cost optimization
   - User feedback integration
   - A/B testing

## 📞 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review server logs for specific error messages
3. Verify all environment variables are configured
4. Test each component individually

The MVP architecture is solid and all the core components are implemented. The main work now is configuration and integration testing.

Good luck with your MVP launch! 🚀