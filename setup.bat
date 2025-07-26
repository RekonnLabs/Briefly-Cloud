@echo off
title Briefly Cloud - Complete Setup
echo ========================================
echo    BRIEFLY CLOUD - COMPLETE SETUP
echo ========================================
echo.
echo Setting up Python virtual environment and all dependencies...
echo This ensures clean, isolated dependency management.
echo.

REM Check if Python is available
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ ERROR: Python not found! Please install Python 3.11.9 from https://python.org/
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

echo ✅ Python found: 
python --version

REM Navigate to server directory
if not exist "server" (
    echo ❌ ERROR: server directory not found! Please run from Briefly_Cloud root directory.
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

cd server

REM Remove existing venv if it exists
if exist "venv" (
    echo 🔄 Removing existing virtual environment...
    rmdir /s /q venv
)

REM Create new virtual environment
echo.
echo 📦 Creating new virtual environment...
python -m venv venv
if %errorlevel% neq 0 (
    echo ❌ ERROR: Failed to create virtual environment!
    echo Make sure you have Python 3.11.9 installed with venv module.
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

echo ✅ Virtual environment created successfully!

REM Activate virtual environment and install dependencies
echo.
echo 🔧 Activating virtual environment and installing dependencies...
call venv\Scripts\activate.bat

REM Upgrade pip first
echo Upgrading pip...
python -m pip install --upgrade pip --quiet

REM Install dependencies from requirements.txt
echo Installing Python dependencies...
pip install -r requirements.txt --quiet

REM Deactivate for now
call deactivate

cd ..

REM Install Node.js dependencies
echo.
echo Installing Node.js dependencies...
echo Installing root dependencies...
call npm install --silent
if %errorlevel% neq 0 (
    echo ⚠️ Root dependencies installation had issues, continuing...
) else (
    echo ✅ Root dependencies installed
)

echo Installing client dependencies...
cd client
call npm install --silent
if %errorlevel% neq 0 (
    echo ⚠️ Client dependencies installation had issues, continuing...
) else (
    echo ✅ Client dependencies installed
)

echo Installing additional UI components...
call npm install @radix-ui/react-progress @supabase/supabase-js --silent
if %errorlevel% neq 0 (
    echo ⚠️ UI components installation had issues, continuing...
) else (
    echo ✅ UI components installed
)

cd ..

echo.
echo Creating directories...
if not exist "data" mkdir data
if not exist "uploads" mkdir uploads
if not exist "logs" mkdir logs

echo.
echo ========================================
echo    COMPLETE SETUP FINISHED
echo ========================================
echo.
echo ✅ Virtual environment created at: server\venv\
echo ✅ All dependencies installed in isolated environment
echo.
echo 📋 Next steps:
echo   1. Use start.bat to run the application
echo   2. Virtual environment will be automatically activated
echo.
echo Press any key to continue...
pause >nul