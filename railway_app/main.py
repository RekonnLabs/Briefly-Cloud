#!/usr/bin/env python3
"""
Railway deployment entry point - imports the full server
"""
import os
import sys

# Get the correct paths - Railway runs from railway_app directory
current_dir = os.path.dirname(os.path.abspath(__file__))  # /app/railway_app
parent_dir = os.path.dirname(current_dir)  # /app
server_dir = os.path.join(parent_dir, 'server')  # /app/server

print(f"__file__: {__file__}")
print(f"Current directory: {current_dir}")
print(f"Parent directory: {parent_dir}")
print(f"Server directory: {server_dir}")
print(f"Server directory exists: {os.path.exists(server_dir)}")
print(f"Contents of parent directory: {os.listdir(parent_dir) if os.path.exists(parent_dir) else 'Not found'}")

# Add directories to Python path
sys.path.insert(0, parent_dir)
sys.path.insert(0, server_dir)

# Change working directory to server for relative imports
if os.path.exists(server_dir):
    os.chdir(server_dir)
    print(f"✅ Changed working directory to: {server_dir}")
else:
    print(f"❌ Server directory not found: {server_dir}")

# Import the actual FastAPI app from server/main.py
try:
    from main import app
    print("✅ Successfully imported full server app with all routes")
except ImportError as e:
    print(f"❌ Failed to import server app: {e}")
    print(f"Current working directory: {os.getcwd()}")
    print(f"Files in current directory: {os.listdir('.')}")
    
    # Fallback to minimal app
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    
    app = FastAPI(title="Briefly Cloud Backend - Minimal", version="1.0.0")
    
    # Add CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )
    
    @app.get("/health")
    async def health_check():
        return {"status": "unhealthy", "error": f"Failed to load full server: {e}"}
    
    @app.get("/")
    async def root():
        return {"message": "Minimal fallback server", "error": str(e)}

# For Railway deployment
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    print(f"🚀 Starting server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)