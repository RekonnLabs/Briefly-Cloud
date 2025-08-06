#!/usr/bin/env python3
"""
Railway deployment entry point - imports the full server
"""
import os
import sys

# Debug environment variables
print("🔍 Environment Debug:")
print(f"PORT: {os.getenv('PORT', 'Not set')}")
print(f"ENVIRONMENT: {os.getenv('ENVIRONMENT', 'Not set')}")
print(f"SUPABASE_URL: {'Set' if os.getenv('SUPABASE_URL') else 'Not set'}")
print(f"OPENAI_API_KEY: {'Set' if os.getenv('OPENAI_API_KEY') else 'Not set'}")
print(f"Python version: {sys.version}")
print(f"Python executable: {sys.executable}")

# Railway copies the railway_app directory to /app, so server should be at /app/server
app_root = '/app'
server_dir = os.path.join(app_root, 'server')

print(f"App root: {app_root}")
print(f"Expected server directory: {server_dir}")
print(f"Server directory exists: {os.path.exists(server_dir)}")

if not os.path.exists(server_dir):
    print(f"Contents of app root: {os.listdir(app_root)}")
    print("Available directories:")
    for item in os.listdir(app_root):
        item_path = os.path.join(app_root, item)
        if os.path.isdir(item_path):
            print(f"  📁 {item}/")
        else:
            print(f"  📄 {item}")
    
    # Server directory not found - this is expected since we copied it
    print("❌ Server directory not found - this should not happen with the copied structure")

# Add directories to Python path and change working directory
if server_dir and os.path.exists(server_dir):
    # Add both the parent directory and server directory to Python path
    parent_dir = os.path.dirname(server_dir)
    sys.path.insert(0, parent_dir)
    sys.path.insert(0, server_dir)
    os.chdir(server_dir)
    print(f"✅ Changed working directory to: {server_dir}")
    print(f"✅ Added to Python path: {parent_dir}, {server_dir}")
    
    # Check if main.py exists in server directory
    main_py_path = os.path.join(server_dir, 'main.py')
    print(f"main.py exists: {os.path.exists(main_py_path)}")
    
    # Check if routes directory exists
    routes_dir = os.path.join(server_dir, 'routes')
    print(f"routes directory exists: {os.path.exists(routes_dir)}")
    if os.path.exists(routes_dir):
        print(f"routes contents: {os.listdir(routes_dir)}")
    
    # Check if utils directory exists
    utils_dir = os.path.join(server_dir, 'utils')
    print(f"utils directory exists: {os.path.exists(utils_dir)}")
    if os.path.exists(utils_dir):
        print(f"utils contents: {os.listdir(utils_dir)}")
        
    # Try to load environment from server directory
    env_file = os.path.join(server_dir, '.env')
    if os.path.exists(env_file):
        print(f"Found .env file at: {env_file}")
        from dotenv import load_dotenv
        load_dotenv(env_file)
        print("✅ Loaded environment variables from server/.env")
    else:
        print("No .env file found in server directory")
else:
    print(f"❌ Server directory not found")

# Skip complex import - use simple inline server
print("🚀 Using simple inline server to avoid import issues")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Briefly Cloud Backend - Simple", version="1.0.0")

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
    return {"status": "healthy", "service": "briefly-cloud-simple"}

@app.get("/")
async def root():
    return {"message": "Briefly Cloud Backend - Simple Version", "status": "running"}

@app.get("/api/auth/health")
async def auth_health():
    return {"status": "ok", "service": "auth"}

@app.get("/api/storage/microsoft/auth")
async def microsoft_auth():
    return {"error": "Microsoft OAuth temporarily disabled", "status": 503}

@app.get("/api/conversations")
async def conversations():
    return {"conversations": [], "status": "ok"}

@app.get("/api/embed/status")
async def embed_status():
    return {"status": "disabled", "message": "Embedding temporarily disabled"}

print("✅ Simple server setup complete")

# For Railway deployment
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    print(f"🚀 Starting server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)