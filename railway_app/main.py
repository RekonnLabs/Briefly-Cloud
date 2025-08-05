#!/usr/bin/env python3
"""
Railway deployment entry point - imports the full server
"""
import os
import sys

# Add parent directory and server directory to path
parent_dir = os.path.dirname(os.path.dirname(__file__))
server_dir = os.path.join(parent_dir, 'server')
sys.path.insert(0, parent_dir)
sys.path.insert(0, server_dir)

# Change working directory to server for relative imports
os.chdir(server_dir)

# Import the actual FastAPI app from server/main.py
try:
    from main import app
    print("✅ Successfully imported full server app with all routes")
except ImportError as e:
    print(f"❌ Failed to import server app: {e}")
    # Fallback to minimal app
    from fastapi import FastAPI
    app = FastAPI(title="Briefly Cloud Backend - Minimal", version="1.0.0")
    
    @app.get("/health")
    async def health_check():
        return {"status": "unhealthy", "error": f"Failed to load full server: {e}"}

# For Railway deployment
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)