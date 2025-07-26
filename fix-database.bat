@echo off
title Briefly Cloud - Fix Database
echo ========================================
echo    BRIEFLY CLOUD - DATABASE FIX
echo ========================================
echo.

if not exist "fix-users-table.sql" (
    echo ❌ ERROR: fix-users-table.sql not found!
    pause
    exit /b 1
)

echo 📋 DATABASE FIX REQUIRED:
echo.
echo The users table is missing some columns that the application needs.
echo.
echo 🔧 STEPS TO FIX:
echo.
echo 1. Open your Supabase project dashboard:
echo    https://supabase.com/dashboard/project/aeeumarwdxepqibjbkaf
echo.
echo 2. Go to SQL Editor (left sidebar)
echo.
echo 3. Copy the contents of fix-users-table.sql
echo.
echo 4. Paste and run the SQL script
echo.
echo 5. This will add the missing columns:
echo    - subscription_tier (for user plans)
echo    - stripe_customer_id (for billing)
echo    - api_key_hash (for BYOK users)
echo    - usage_stats (for tracking usage)
echo    - preferences (for user settings)
echo    - created_at/updated_at (timestamps)
echo.
echo ✅ After running the SQL, restart the application with start.bat
echo.
echo Press any key when database fix is complete...
pause >nul

echo.
echo Testing database connection...
cd server
call venv\Scripts\activate.bat
python -c "
from supabase import create_client
import os
from dotenv import load_dotenv
load_dotenv('.env')
url = os.getenv('SUPABASE_URL')
key = os.getenv('SUPABASE_ANON_KEY')
client = create_client(url, key)
try:
    result = client.table('users').select('subscription_tier').limit(1).execute()
    print('✅ Database fix successful! subscription_tier column found')
except Exception as e:
    print(f'❌ Database fix needed: {e}')
"
call deactivate
cd ..

echo.
echo Press any key to continue...
pause >nul