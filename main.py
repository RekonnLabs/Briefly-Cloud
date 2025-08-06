#!/usr/bin/env python3
"""
Railway deployment entry point - Ultra simple version
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
import uvicorn

print("🚀 Starting Briefly Cloud Backend - Ultra Simple")

app = FastAPI(title="Briefly Cloud Backend", version="1.0.0")

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
    return {"status": "healthy", "service": "briefly-cloud-backend"}

@app.get("/")
async def root():
    return {"message": "Briefly Cloud Backend API", "status": "running"}

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

print("✅ App setup complete")

# For Railway deployment
if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    print(f"🚀 Starting server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)