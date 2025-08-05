#!/usr/bin/env python3
"""
Railway deployment entry point - imports the full server
"""
import os
import sys

# Add server directory to Python path
server_dir = os.path.join(os.path.dirname(__file__), 'server')
sys.path.insert(0, server_dir)

# Change to server directory for relative imports
os.chdir(server_dir)

print(f"🚀 Starting Briefly Cloud Backend")
print(f"Current working directory: {os.getcwd()}")
print(f"Contents of /app: {os.listdir('/app')}")
print(f"Server directory: {server_dir}")
print(f"Server directory exists: {os.path.exists(server_dir)}")

# Check if server directory exists anywhere
for root, dirs, files in os.walk('/app'):
    if 'server' in dirs:
        print(f"Found server directory at: {root}/server")
        server_dir = os.path.join(root, 'server')
        break

# Import the actual FastAPI app from server/main.py
try:
    # Import the server main module directly to avoid circular import
    import importlib.util
    spec = importlib.util.spec_from_file_location("server_main", os.path.join(server_dir, "main.py"))
    server_main = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(server_main)
    app = server_main.app
    print("✅ Successfully imported full server app with all routes")
except ImportError as e:
    print(f"❌ Failed to import server app: {e}")
    # Fallback to minimal app
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    
    app = FastAPI(title="Briefly Cloud Backend - Minimal", version="1.0.0")
    
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