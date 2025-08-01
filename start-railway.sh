#!/bin/bash
# Railway startup script

echo "🚀 Starting Briefly Cloud Backend on Railway..."

# Set default port if not provided
export PORT=${PORT:-8000}

echo "📦 Checking dependencies..."
python server/deployment_check.py

echo "🌐 Starting server on port $PORT..."
cd server && uvicorn main:app --host 0.0.0.0 --port $PORT