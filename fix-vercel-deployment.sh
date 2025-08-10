#!/bin/bash

# Fix Vercel Deployment Script for Briefly Cloud
# This script helps resolve the Python server deployment issue

echo "🔧 Fixing Vercel Deployment Configuration..."

# Check if we're in the right directory
if [ ! -d "briefly-cloud-nextjs" ]; then
    echo "❌ Error: briefly-cloud-nextjs directory not found"
    echo "Please run this script from the Briefly_Cloud root directory"
    exit 1
fi

echo "✅ Found briefly-cloud-nextjs directory"

# Remove any legacy Python configuration files that might interfere
echo "🧹 Cleaning up legacy Python configuration..."

# Remove legacy vercel.json if it exists in root
if [ -f "vercel.json" ] && grep -q "python" "vercel.json"; then
    echo "🗑️  Removing legacy Python vercel.json from root"
    rm vercel.json
fi

# Remove any Python requirements files that might be in the root
if [ -f "requirements.txt" ]; then
    echo "🗑️  Moving requirements.txt to legacy backup"
    mv requirements.txt legacy-python-backup/ 2>/dev/null || rm requirements.txt
fi

if [ -f "requirements-vercel.txt" ]; then
    echo "🗑️  Moving requirements-vercel.txt to legacy backup"
    mv requirements-vercel.txt legacy-python-backup/ 2>/dev/null || rm requirements-vercel.txt
fi

# Ensure the Next.js vercel.json exists and is properly configured
echo "⚙️  Checking Next.js vercel.json configuration..."

if [ ! -f "briefly-cloud-nextjs/vercel.json" ]; then
    echo "❌ vercel.json not found in briefly-cloud-nextjs directory"
    echo "Creating vercel.json..."
    
    cat > briefly-cloud-nextjs/vercel.json << 'EOF'
{
  "version": 2,
  "name": "briefly-cloud-app",
  "framework": "nextjs",
  "functions": {
    "src/app/api/**/*.ts": {
      "maxDuration": 30
    },
    "src/app/api/chat/**/*.ts": {
      "maxDuration": 60
    },
    "src/app/api/upload/**/*.ts": {
      "maxDuration": 120
    },
    "src/app/api/extract/**/*.ts": {
      "maxDuration": 120
    },
    "src/app/api/embeddings/**/*.ts": {
      "maxDuration": 120
    },
    "src/app/api/cron/**/*.ts": {
      "maxDuration": 300
    }
  },
  "env": {
    "NODE_ENV": "production"
  },
  "regions": ["iad1", "sfo1", "lhr1"],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options", 
          "value": "nosniff"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=31536000; includeSubDomains"
        }
      ]
    }
  ],
  "crons": [
    {
      "path": "/api/cron/gdpr-cleanup", 
      "schedule": "0 2 * * *"
    }
  ]
}
EOF
    echo "✅ Created vercel.json in briefly-cloud-nextjs directory"
else
    echo "✅ vercel.json already exists in briefly-cloud-nextjs directory"
fi

# Check package.json in Next.js directory
echo "📦 Checking package.json configuration..."

if [ ! -f "briefly-cloud-nextjs/package.json" ]; then
    echo "❌ package.json not found in briefly-cloud-nextjs directory"
    exit 1
fi

# Verify Next.js dependencies
if ! grep -q '"next"' briefly-cloud-nextjs/package.json; then
    echo "❌ Next.js not found in dependencies"
    exit 1
fi

echo "✅ Next.js dependencies verified"

# Check if node_modules exists
if [ ! -d "briefly-cloud-nextjs/node_modules" ]; then
    echo "📦 Installing dependencies..."
    cd briefly-cloud-nextjs
    npm install
    cd ..
    echo "✅ Dependencies installed"
else
    echo "✅ Dependencies already installed"
fi

# Verify build works
echo "🔨 Testing build process..."
cd briefly-cloud-nextjs

if npm run build > /dev/null 2>&1; then
    echo "✅ Build test successful"
else
    echo "⚠️  Build test failed - check for errors:"
    npm run build
fi

cd ..

echo ""
echo "🎉 Vercel deployment fix completed!"
echo ""
echo "📋 Next steps for Vercel dashboard:"
echo "1. Go to your Vercel project settings"
echo "2. Set Root Directory to: briefly-cloud-nextjs"
echo "3. Set Framework Preset to: Next.js"
echo "4. Ensure all environment variables are configured"
echo "5. Trigger a new deployment"
echo ""
echo "📖 For detailed instructions, see:"
echo "   - VERCEL_DEPLOYMENT_SETUP.md"
echo "   - briefly-cloud-nextjs/docs/VERCEL_DEPLOYMENT_GUIDE.md"
echo ""
echo "🚀 Your deployment should now work correctly!"