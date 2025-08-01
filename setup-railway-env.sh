#!/bin/bash
# Setup Railway environment variables from .env.railway file

echo "🚀 Setting up Railway environment variables..."

# Install Railway CLI if not installed
if ! command -v railway &> /dev/null; then
    echo "Installing Railway CLI..."
    npm install -g @railway/cli
fi

# Login to Railway (if not already)
echo "Please make sure you're logged into Railway CLI:"
echo "Run: railway login"
echo ""

# Set variables from .env.railway file
echo "Setting environment variables from .env.railway..."
railway variables --kv-from-file .env.railway

echo "✅ Environment variables set!"
echo "🔄 Railway will automatically redeploy with new variables"