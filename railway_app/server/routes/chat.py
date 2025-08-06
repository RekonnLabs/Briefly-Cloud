"""
Chat routes for Briefly Cloud
Handles LLM queries with context from vector database
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

class ChatRequest(BaseModel):
    message: str
    context_folder: str = None

@router.get("/health")
async def chat_health():
    """Simple health check for chat service"""
    return {"status": "ok", "service": "chat"}

@router.post("/message")
async def chat_message(request: ChatRequest):
    """Chat endpoint"""
    raise HTTPException(status_code=501, detail="Chat not implemented in minimal deployment")