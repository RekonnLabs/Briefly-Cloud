@echo off
REM Vercel Deployment Script - Optimized Build

echo 🚀 Preparing optimized Vercel deployment...

REM Clean any existing cache/build files
echo 🧹 Cleaning build artifacts...
if exist "server\__pycache__" rmdir /s /q "server\__pycache__"
if exist ".pytest_cache" rmdir /s /q ".pytest_cache"
if exist "logs" rmdir /s /q "logs"
if exist "data" rmdir /s /q "data"
if exist "backups" rmdir /s /q "backups"
del /q *.log 2>nul

REM Verify optimized requirements file exists
if not exist "requirements-vercel.txt" (
    echo ❌ requirements-vercel.txt not found!
    exit /b 1
)

echo 📦 Using optimized requirements file
echo ✅ Ready for deployment!
echo Run: vercel --prod