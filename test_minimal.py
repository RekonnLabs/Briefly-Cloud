#!/usr/bin/env python3
"""
Minimal test version to isolate Railway deployment issues
"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Create minimal FastAPI app
app = FastAPI(title="Minimal Test Backend", version="1.0.0")

# Add CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for testing
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Minimal test backend is running", "status": "success"}

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "minimal-test"}

@app.get("/api/test")
async def api_test():
    return {
        "message": "API endpoint working",
        "environment": os.getenv("ENVIRONMENT", "unknown"),
        "port": os.getenv("PORT", "unknown")
    }

@app.get("/api/diagnostics")
async def diagnostics():
    return {
        "status": "running",
        "environment_vars": {
            "PORT": os.getenv("PORT", "Not set"),
            "ENVIRONMENT": os.getenv("ENVIRONMENT", "Not set"),
            "PWD": os.getenv("PWD", "Not set")
        },
        "routes": [
            "/",
            "/health", 
            "/api/test",
            "/api/diagnostics"
        ]
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting minimal test server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")