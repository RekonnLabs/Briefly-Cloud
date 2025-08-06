"""
Cloud storage OAuth routes for Briefly Cloud
Handles Google Drive and OneDrive integration
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/storage", tags=["storage"])

@router.get("/health")
async def storage_health():
    """Simple health check for storage service"""
    return {"status": "ok", "service": "storage"}

@router.get("/google/auth")
async def google_auth():
    """Google OAuth endpoint"""
    raise HTTPException(status_code=501, detail="Google OAuth not implemented in minimal deployment")

@router.get("/microsoft/auth")
async def microsoft_auth():
    """Microsoft OAuth endpoint"""
    raise HTTPException(status_code=501, detail="Microsoft OAuth not implemented in minimal deployment")