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

# Railway copies the entire project to /app, so we need to find the server directory
app_root = '/app'
possible_server_paths = [
    '/app/server',  # If server is at root level
    '/app/Briefly_Cloud/server',  # If entire project structure is copied
]

server_dir = None
for path in possible_server_paths:
    if os.path.exists(path):
        server_dir = path
        break

print(f"App root: {app_root}")
print(f"Looking for server directory in: {possible_server_paths}")
print(f"Found server directory: {server_dir}")

if not server_dir:
    print(f"Contents of app root: {os.listdir(app_root)}")
    print("Available directories:")
    for item in os.listdir(app_root):
        item_path = os.path.join(app_root, item)
        if os.path.isdir(item_path):
            print(f"  📁 {item}/")
            # Check if this directory contains a server subdirectory
            server_subdir = os.path.join(item_path, 'server')
            if os.path.exists(server_subdir):
                print(f"    └── Found server at: {server_subdir}")
                server_dir = server_subdir
        else:
            print(f"  📄 {item}")

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

# Import the actual FastAPI app from server/main.py
try:
    # Try to import the main module
    import main as server_main
    app = server_main.app
    print("✅ Successfully imported full server app with all routes")
except ImportError as e:
    print(f"❌ Failed to import server app: {e}")
    print(f"Current working directory: {os.getcwd()}")
    print(f"Python path: {sys.path}")
    if os.path.exists('.'):
        print(f"Files in current directory: {os.listdir('.')}")
    
    # Try alternative import methods
    try:
        import importlib.util
        if server_dir:
            main_py_path = os.path.join(server_dir, 'main.py')
            if os.path.exists(main_py_path):
                print(f"Trying to load main.py from: {main_py_path}")
                spec = importlib.util.spec_from_file_location("server_main", main_py_path)
                server_main = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(server_main)
                app = server_main.app
                print("✅ Successfully imported server app using importlib")
            else:
                raise ImportError(f"main.py not found at {main_py_path}")
        else:
            raise ImportError("Server directory not found")
    except Exception as e2:
        print(f"❌ Alternative import also failed: {e2}")
        
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
            return {"status": "unhealthy", "error": f"Failed to load full server: {e}", "alternative_error": str(e2)}
        
        @app.get("/")
        async def root():
            return {"message": "Minimal fallback server", "error": str(e), "alternative_error": str(e2)}
        
        @app.get("/debug")
        async def debug_info():
            return {
                "server_dir": server_dir,
                "working_directory": os.getcwd(),
                "python_path": sys.path,
                "app_root_contents": os.listdir('/app') if os.path.exists('/app') else "N/A",
                "current_dir_contents": os.listdir('.') if os.path.exists('.') else "N/A",
                "import_error": str(e),
                "alternative_error": str(e2)
            }

# For Railway deployment
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    print(f"🚀 Starting server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)