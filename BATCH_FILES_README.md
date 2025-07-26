# 🚀 Briefly Cloud - One-Click Setup

## Single Essential Script

### 🚀 **start.bat** - All-in-One Launcher
**Purpose**: Complete setup and launch in one command
**When to use**: Every time you want to run Briefly Cloud

**What it does**:
- ✅ Checks prerequisites (Node.js, Python)
- ✅ Creates environment files from templates
- ✅ Installs all dependencies (root, client, server)
- ✅ Creates Python virtual environment
- ✅ Installs critical missing packages
- ✅ Creates necessary directories
- ✅ Validates configuration
- ✅ Starts both client and server

**Usage**:
```bash
start.bat
```

That's it! One command does everything.

## 📋 Quick Start Guide

### For Everything (First-Time Setup + Daily Use):
```bash
start.bat
```

That's it! One command handles:
- ✅ First-time setup (if needed)
- ✅ Dependency installation
- ✅ Environment configuration
- ✅ Server startup

### No other files needed!

## 🔧 Configuration Requirements

Before the application will work properly, you need to configure:

### **server/.env** - Required API Keys:
```env
OPENAI_API_KEY=sk-your-actual-openai-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-actual-anon-key
SUPABASE_SERVICE_ROLE=your-actual-service-role-key
CHROMA_API_KEY=ck-your-actual-chroma-key
CHROMA_TENANT_ID=your-actual-tenant-id
STRIPE_SECRET_KEY=sk_test_your-actual-stripe-secret
GOOGLE_CLIENT_ID=your-actual-google-client-id
GOOGLE_CLIENT_SECRET=your-actual-google-secret
AZURE_CLIENT_ID=your-actual-azure-client-id
AZURE_CLIENT_SECRET=your-actual-azure-secret
```

### **client/.env** - Client Configuration:
```env
VITE_API_URL=http://localhost:3001
VITE_STRIPE_PUBLIC_KEY=pk_test_your-actual-stripe-public-key
```

### **Database Setup**:
1. Open Supabase SQL Editor
2. Run the `database_schema.sql` script
3. This creates all necessary tables and security policies

## 🌐 Server URLs

After starting the servers:

- **Client (React)**: http://localhost:5173
- **Server (FastAPI)**: http://localhost:3001
- **Health Check**: http://localhost:3001/health
- **API Documentation**: http://localhost:3001/docs (development only)

## 🔍 Troubleshooting

### Common Issues:

#### ❌ "Node.js not found"
- **Solution**: Install Node.js 18+ from https://nodejs.org/

#### ❌ "Python not found"
- **Solution**: Install Python 3.11+ from https://python.org/

#### ❌ "Setup not completed"
- **Solution**: Run `setup.bat` first

#### ❌ "API keys not configured"
- **Solution**: Edit `server/.env` with your actual API keys
- **Check**: Run `check-config.bat` for detailed status

#### ❌ "Database connection failed"
- **Solution**: Run `database_schema.sql` in Supabase SQL Editor
- **Check**: Verify Supabase URL and keys in `server/.env`

#### ❌ "Port already in use"
- **Solution**: Stop other applications using ports 5173 or 3001
- **Alternative**: Change ports in configuration files

### Getting Help:

1. **Run diagnostics**: `check-config.bat`
2. **Check logs**: `dev-tools.bat` → View Logs
3. **Reset config**: `dev-tools.bat` → Reset Environment
4. **Read guides**: `SETUP_GUIDE.md`, `TROUBLESHOOTING_GUIDE.md`

## 📁 File Structure

```
Briefly_Cloud/
├── setup.bat              # Complete setup script
├── run.bat                 # One-click launcher
├── start.bat               # Start servers only
├── check-config.bat        # Configuration checker
├── dev-tools.bat           # Development utilities
├── database_schema.sql     # Database setup script
├── SETUP_GUIDE.md          # Detailed setup instructions
├── server/
│   ├── .env               # Server configuration
│   └── venv/              # Python virtual environment
├── client/
│   └── .env               # Client configuration
└── ...
```

## 🎯 Best Practices

1. **Always run setup first** on new installations
2. **Use check-config.bat** to verify configuration
3. **Keep API keys secure** - never commit .env files
4. **Use dev-tools.bat** for maintenance tasks
5. **Check server URLs** are accessible before reporting issues

---

**🎉 Happy coding with Briefly Cloud!**