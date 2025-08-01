#!/bin/bash
# Vercel Deployment Script - Optimized Build

echo "🚀 Preparing optimized Vercel deployment..."

# Clean any existing cache/build files
echo "🧹 Cleaning build artifacts..."
rm -rf server/__pycache__/
rm -rf server/**/__pycache__/
rm -rf .pytest_cache/
rm -rf *.log
rm -rf logs/
rm -rf data/
rm -rf backups/

# Verify optimized requirements file exists
if [ ! -f "requirements-vercel.txt" ]; then
    echo "❌ requirements-vercel.txt not found!"
    exit 1
fi

echo "📦 Using optimized requirements:"
cat requirements-vercel.txt | grep -v "^#" | grep -v "^$"

# Check file sizes
echo "📊 Checking for large files..."
find . -type f -size +10M -not -path "./.git/*" -not -path "./node_modules/*" | head -10

echo "✅ Ready for deployment!"
echo "Run: vercel --prod"