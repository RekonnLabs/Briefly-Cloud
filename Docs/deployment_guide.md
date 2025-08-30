# Briefly Cloud MVP - Deployment Guide

## Overview
This guide covers deploying Briefly Cloud MVP to production and creating installation packages.

## Deployment Options

### Option 1: Cloud Deployment (Recommended)

#### Backend Deployment (Railway/Render/Heroku)

**Railway Deployment:**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and initialize
railway login
railway init

# Deploy backend
cd server
railway up
```

**Environment Variables for Production:**
```env
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key

# Google OAuth
GOOGLE_DRIVE_CLIENT_ID=your_google_drive_client_id
GOOGLE_DRIVE_CLIENT_SECRET=your_google_drive_client_secret
GOOGLE_DRIVE_REDIRECT_URI=https://your-domain.com/api/storage/google/callback
GOOGLE_DRIVE_SCOPES=https://www.googleapis.com/auth/drive.readonly

# Microsoft Drive OAuth
MS_DRIVE_CLIENT_ID=your_microsoft_drive_client_id
MS_DRIVE_CLIENT_SECRET=your_microsoft_drive_client_secret
MS_DRIVE_TENANT_ID=your_microsoft_tenant_id
MS_DRIVE_REDIRECT_URI=https://your-domain.com/api/storage/microsoft/callback
MS_DRIVE_SCOPES=https://graph.microsoft.com/Files.Read.All offline_access

# Stripe Configuration
STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

# Production Settings
ENVIRONMENT=production
CORS_ORIGINS=https://your-frontend-domain.com
```

#### Frontend Deployment (Vercel/Netlify)

**Vercel Deployment:**
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy frontend
cd client
vercel --prod
```

**Build Configuration:**
```json
{
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/static-build",
      "config": {
        "distDir": "dist"
      }
    }
  ]
}
```

### Option 2: Self-Hosted Deployment

#### Docker Deployment

**Backend Dockerfile:**
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Frontend Dockerfile:**
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=0 /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Docker Compose:**
```yaml
version: '3.8'

services:
  backend:
    build: ./server
    ports:
      - "8000:8000"
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    volumes:
      - ./data:/app/data

  frontend:
    build: ./client
    ports:
      - "80:80"
    depends_on:
      - backend

  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - frontend
```

## Desktop Application (Electron)

### Building Desktop App

**Update package.json:**
```json
{
  "main": "main.js",
  "scripts": {
    "electron": "electron .",
    "electron-dev": "ELECTRON_IS_DEV=true electron .",
    "build-electron": "npm run build && electron-builder",
    "dist": "npm run build && electron-builder --publish=never"
  },
  "build": {
    "appId": "com.briefly.cloud",
    "productName": "Briefly Cloud",
    "directories": {
      "output": "dist-electron"
    },
    "files": [
      "dist/**/*",
      "main.js",
      "preload.js"
    ],
    "mac": {
      "category": "public.app-category.productivity",
      "target": "dmg"
    },
    "win": {
      "target": "nsis"
    },
    "linux": {
      "target": "AppImage"
    }
  }
}
```

**Main Electron Process (main.js):**
```javascript
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const isDev = process.env.ELECTRON_IS_DEV === 'true';

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets/icon.png')
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
```

### Building Installers

**Windows (NSIS):**
```bash
npm run build
npm run dist -- --win
```

**macOS (DMG):**
```bash
npm run build
npm run dist -- --mac
```

**Linux (AppImage):**
```bash
npm run build
npm run dist -- --linux
```

## Production Configuration

### Supabase Setup

**Required Tables:**
```sql
-- Users table (handled by Supabase Auth)

-- OAuth tokens
CREATE TABLE oauth_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- File metadata
CREATE TABLE file_metadata (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  path TEXT,
  size BIGINT,
  mime_type TEXT,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  external_url TEXT,
  processed BOOLEAN DEFAULT FALSE,
  processing_status TEXT DEFAULT 'pending',
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Document chunks
CREATE TABLE document_chunks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_id TEXT REFERENCES file_metadata(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(384),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Conversations
CREATE TABLE conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  messages JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Usage logs
CREATE TABLE usage_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB,
  cost_cents INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Job logs
CREATE TABLE job_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  input_data JSONB,
  output_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);
```

**Row Level Security (RLS) Policies:**
```sql
-- Enable RLS on all tables
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for user data isolation
CREATE POLICY "Users can only access their own oauth tokens" ON oauth_tokens
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only access their own files" ON file_metadata
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only access their own chunks" ON document_chunks
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only access their own conversations" ON conversations
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only access their own usage logs" ON usage_logs
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only access their own job logs" ON job_logs
  FOR ALL USING (auth.uid() = user_id);
```

### OAuth App Configuration

**Google Cloud Console:**
1. Create new project or use existing
2. Enable Google Drive API
3. Create OAuth 2.0 credentials
4. Add authorized redirect URIs:
   - `http://localhost:8000/storage/google/callback` (development)
   - `https://your-domain.com/storage/google/callback` (production)

**Microsoft Azure:**
1. Register new application in Azure AD
2. Add Microsoft Graph API permissions
3. Configure redirect URIs:
   - `http://localhost:8000/storage/microsoft/callback` (development)
   - `https://your-domain.com/storage/microsoft/callback` (production)

### Stripe Configuration

**Products and Prices:**
```javascript
// Create products in Stripe Dashboard or via API
const products = [
  {
    name: "Briefly Cloud Pro",
    description: "Advanced AI document assistant",
    price: 1999, // $19.99/month in cents
    interval: "month"
  },
  {
    name: "Briefly Cloud Pro BYOK",
    description: "Pro features with your own OpenAI API key",
    price: 999, // $9.99/month in cents
    interval: "month"
  }
];
```

## Monitoring and Analytics

### Error Tracking (Sentry)
```javascript
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "your-sentry-dsn",
  environment: process.env.NODE_ENV,
});
```

### Analytics (PostHog/Mixpanel)
```javascript
import posthog from 'posthog-js';

posthog.init('your-posthog-key', {
  api_host: 'https://app.posthog.com'
});
```

## Security Checklist

- [ ] HTTPS enabled for all endpoints
- [ ] API keys stored securely (environment variables)
- [ ] CORS configured properly
- [ ] Rate limiting implemented
- [ ] Input validation on all endpoints
- [ ] SQL injection protection (parameterized queries)
- [ ] XSS protection enabled
- [ ] CSRF protection implemented
- [ ] User data encryption at rest
- [ ] Secure session management
- [ ] OAuth flows properly secured
- [ ] File upload restrictions in place

## Performance Optimization

### Backend Optimizations
- Database indexing on frequently queried columns
- Connection pooling for database
- Caching for frequently accessed data
- Async processing for heavy operations
- Rate limiting to prevent abuse

### Frontend Optimizations
- Code splitting and lazy loading
- Image optimization
- Bundle size optimization
- CDN for static assets
- Service worker for offline functionality

## Backup and Recovery

### Database Backups
- Automated daily backups via Supabase
- Point-in-time recovery enabled
- Cross-region backup replication

### File Storage Backups
- Vector database backups
- User file metadata backups
- Configuration backups

## Launch Checklist

### Pre-Launch
- [ ] All tests passing
- [ ] Security audit completed
- [ ] Performance testing completed
- [ ] Documentation updated
- [ ] Support processes ready
- [ ] Monitoring configured
- [ ] Backup procedures tested

### Launch Day
- [ ] Deploy to production
- [ ] Verify all services running
- [ ] Test critical user flows
- [ ] Monitor error rates
- [ ] Check performance metrics
- [ ] Announce launch

### Post-Launch
- [ ] Monitor user feedback
- [ ] Track key metrics
- [ ] Address any issues quickly
- [ ] Plan next iteration
- [ ] Update documentation
- [ ] Scale infrastructure as needed

## Support and Maintenance

### User Support
- Documentation and FAQ
- Email support system
- User feedback collection
- Bug report process

### System Maintenance
- Regular security updates
- Performance monitoring
- Capacity planning
- Feature updates and improvements

