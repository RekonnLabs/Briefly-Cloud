"""
Document embedding routes for Briefly Cloud
Handles document indexing and vector embedding
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/embed", tags=["embed"])

@router.get("/health")
async def embed_health():
    """Simple health check for embed service"""
    return {"status": "ok", "service": "embed"}

@router.post("/index")
async def index_documents():
    """Document indexing endpoint"""
    raise HTTPException(status_code=501, detail="Document indexing not implemented in minimal deployment")