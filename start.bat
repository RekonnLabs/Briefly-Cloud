@echo off
title Briefly Cloud - Quick Start
echo ========================================
echo    BRIEFLY CLOUD - QUICK START
echo ========================================
echo.
echo Cloud-Native AI Productivity Assistant
echo.

REM Check if setup has been done
if not exist "server\venv" (
    echo ❌ ERROR: Virtual environment not found!
    echo Please run setup.bat first
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

if not exist "client\node_modules" (
    echo ❌ ERROR: Client dependencies not found!
    echo Please run setup.bat first
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

if not exist "node_modules" (
    echo ❌ ERROR: Root dependencies not found!
    echo Please run setup.bat first
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

if not exist "package.json" (
    echo ❌ ERROR: package.json not found! Please run from Briefly_Cloud directory.
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

REM Quick dependency check
echo [1/2] Checking environment...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ ERROR: Node.js not found! Please install Node.js from https://nodejs.org/
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

echo ✅ Environment ready

REM Start the application
echo.
echo [2/2] Starting Briefly Cloud...
echo.
echo 🌟 Launching Cloud-Native AI Assistant...
echo.
echo ┌─────────────────────────────────────────┐
echo │  Frontend: http://localhost:5173        │
echo │  Backend:  http://localhost:3001        │
echo │  API Docs: http://localhost:3001/docs   │
echo └─────────────────────────────────────────┘
echo.
echo Starting servers now...
echo.

REM Start both servers
call npm run dev

echo.
echo ========================================
echo    BRIEFLY CLOUD HAS STOPPED
echo ========================================
echo.
echo Press any key to exit...
pause >nul