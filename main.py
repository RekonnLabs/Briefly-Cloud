#!/usr/bin/env python3
"""
Clean Railway deployment entry point
"""
import os
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Create FastAPI app
app = FastAPI(
    title="Briefly Cloud Backend",
    version="1.0.0",
    description="AI-powered document chat assistant"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Briefly Cloud Backend API",
        "status": "running",
        "version": "1.0.0"
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "briefly-cloud-backend"
    }

@app.get("/api/diagnostics")
async def diagnostics():
    """Diagnostic endpoint"""
    return {
        "status": "healthy",
        "service": "briefly-cloud-backend",
        "python_version": sys.version,
        "environment": {
            "PORT": os.getenv("PORT", "Not set"),
            "ENVIRONMENT": os.getenv("ENVIRONMENT", "production")
        },
        "available_routes": [
            "/",
            "/health",
            "/api/diagnostics"
        ]
    }

# For Railway deployment
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)