from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

logger.info("🚀 Starting minimal Briefly Cloud Backend...")

app = FastAPI(title="Briefly Cloud Backend - Minimal", version="1.0.0")

# CORS middleware - allow all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring"""
    return {"status": "healthy", "service": "briefly-cloud-backend"}

@app.get("/api/diagnostics")
async def diagnostics():
    """Simple diagnostic endpoint"""
    return {
        "status": "healthy",
        "service": "briefly-cloud-backend-minimal",
        "environment": os.getenv("ENVIRONMENT", "development")
    }

@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "Briefly Cloud Backend API", "status": "running"}

@app.get("/api/auth/health")
async def auth_health():
    """Auth health check"""
    return {"status": "ok", "service": "auth"}

@app.get("/api/storage/health")
async def storage_health():
    """Storage health check"""
    return {"status": "ok", "service": "storage"}

@app.post("/api/auth/login")
async def login():
    """Temporary login endpoint"""
    return {"error": "Authentication temporarily disabled", "status": 503}

@app.get("/api/conversations")
async def conversations():
    """Temporary conversations endpoint"""
    return {"conversations": [], "status": "ok"}

@app.get("/api/embed/status")
async def embed_status():
    """Temporary embed status endpoint"""
    return {"status": "disabled", "message": "Embedding temporarily disabled"}

@app.get("/api/storage/microsoft/auth")
async def microsoft_auth():
    """Temporary Microsoft OAuth endpoint"""
    return {"error": "Microsoft OAuth temporarily disabled", "status": 503}

logger.info("✅ Minimal server setup complete")