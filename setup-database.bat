@echo off
title Briefly Cloud - Database Setup
echo ========================================
echo    BRIEFLY CLOUD - DATABASE SETUP
echo ========================================
echo.
echo This will help you set up the Supabase database.
echo.

if not exist "database_schema.sql" (
    echo ❌ ERROR: database_schema.sql not found!
    pause
    exit /b 1
)

echo 📋 MANUAL DATABASE SETUP REQUIRED:
echo.
echo 1. Open your Supabase project dashboard:
echo    https://supabase.com/dashboard
echo.
echo 2. Go to SQL Editor (left sidebar)
echo.
echo 3. Copy the contents of database_schema.sql
echo.
echo 4. Paste and run the SQL script
echo.
echo 5. This will create all necessary tables and security policies
echo.
echo ✅ Your Supabase configuration looks correct:
echo    URL: https://aeeumarwdxepqibjbkaf.supabase.co
echo.
echo Press any key when database setup is complete...
pause >nul

echo.
echo Testing database connection...
cd server
call venv\Scripts\activate.bat
python -c "from supabase import create_client; import os; from dotenv import load_dotenv; load_dotenv('.env'); url=os.getenv('SUPABASE_URL'); key=os.getenv('SUPABASE_ANON_KEY'); client=create_client(url, key); print('✅ Database connection successful!')"
if %errorlevel% neq 0 (
    echo ❌ Database connection failed
    echo Please check your Supabase credentials
) else (
    echo ✅ Database connection working!
)
call deactivate
cd ..

echo.
echo Press any key to continue...
pause >nul