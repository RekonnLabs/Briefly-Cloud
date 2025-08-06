"""
Briefly Cloud Backend - Clean Railway Deployment
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

app = FastAPI(title="Briefly Cloud Backend", version="2.0.0")

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
    return {"message": "Briefly Cloud Backend v2", "status": "running"}

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "briefly-cloud-v2"}

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

# Environment info endpoint
@app.get("/api/diagnostics")
async def diagnostics():
    return {
        "status": "healthy",
        "environment": os.getenv("ENVIRONMENT", "development"),
        "port": os.getenv("PORT", "8000"),
        "version": "2.0.0"
    }