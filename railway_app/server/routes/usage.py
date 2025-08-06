"""
Usage tracking routes for Briefly Cloud
Provides usage statistics and limits information
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/usage", tags=["usage"])

@router.get("/health")
async def usage_health():
    """Simple health check for usage service"""
    return {"status": "ok", "service": "usage"}

@router.get("/stats")
async def get_usage_stats():
    """Usage stats endpoint"""
    raise HTTPException(status_code=501, detail="Usage stats not implemented in minimal deployment")