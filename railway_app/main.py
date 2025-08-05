#!/usr/bin/env python3
"""
Railway deployment entry point - imports the full server
"""
import os
import sys

# Get the correct paths - Check multiple possible locations
current_dir = '/app'
possible_server_paths = [
    '/app/server',           # If server is in same directory
    '/app/../server',        # If we need to go up one level
    '/server',               # If server is at root
    '/app/Briefly_Cloud/server'  # If full path is preserved
]

print(f"Current directory: {current_dir}")
print("Checking possible server locations:")
server_dir = None
for path in possible_server_paths:
    exists = os.path.exists(path)
    print(f"  {path}: {'EXISTS' if exists else 'NOT FOUND'}")
    if exists and server_dir is None:
        server_dir = path
        print(f"  -> Using this path!")

if server_dir:
    print(f"Selected server directory: {server_dir}")
    print(f"Contents: {os.listdir(server_dir)}")
else:
    print("No server directory found!")
    print(f"Contents of current directory: {os.listdir(current_dir)}")

# Add directories to Python path and change working directory
if server_dir and os.path.exists(server_dir):
    parent_of_server = os.path.dirname(server_dir)
    sys.path.insert(0, parent_of_server)
    sys.path.insert(0, server_dir)
    os.chdir(server_dir)
    print(f"✅ Changed working directory to: {server_dir}")
else:
    print(f"❌ No valid server directory found")

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