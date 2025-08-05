#!/usr/bin/env python3
"""
Railway deployment entry point - MINIMAL TEST VERSION
"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Create minimal FastAPI app for testing
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

# Export for Railway
__all__ = ['app']