"""
Chat routes for Briefly Cloud
Handles LLM queries with context from vector database
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any, AsyncGenerator
import os
import logging
import json
import asyncio
from datetime import datetime
from dotenv import load_dotenv
import openai
from supabase import create_client, Client
# ML imports (optional for serverless deployment)
try:
    import chromadb
    from chromadb.config import Settings
    from sentence_transformers import SentenceTransformer
    ML_LIBRARIES_AVAILABLE = True
except ImportError as e:
    print(f"ML libraries not available: {e}")
    ML_LIBRARIES_AVAILABLE = False
    # Create dummy classes for compatibility
    class SentenceTransformer:
        def __init__(self, *args, **kwargs):
            pass
        def encode(self, *args, **kwargs):
            raise HTTPException(status_code=501, detail="ML libraries not available in this deployment")
    
    class chromadb:
        @staticmethod
        def Client(*args, **kwargs):
            raise HTTPException(status_code=501, detail="ChromaDB not available in this deployment")
    
    class Settings:
        pass

# Import usage limits
from utils.usage_limits import (
    check_and_increment_usage, 
    UsageLimitError,
    get_user_usage
)

# Load environment variables
load_dotenv()

# Configure logging
logger = logging.getLogger(__name__)

# Initialize services
# Import shared Supabase client
from utils.supabase_client import get_supabase_client

# Initialize OpenAI
openai.api_key = os.getenv("OPENAI_API_KEY")

# Initialize ChromaDB client for Chroma Cloud
chroma_client = None
try:
    if os.getenv("CHROMA_API_KEY") and os.getenv("CHROMA_TENANT_ID"):
        chroma_client = chromadb.CloudClient(
            api_key=os.getenv("CHROMA_API_KEY"),
            tenant=os.getenv("CHROMA_TENANT_ID"),
            database=os.getenv("CHROMA_DB_NAME", "Briefly Cloud")
        )
        logger.info("✅ ChromaDB Cloud client initialized successfully")
    else:
        logger.info("ℹ️ ChromaDB credentials not configured, vector search disabled")
except Exception as e:
    logger.info(f"ℹ️ ChromaDB unavailable, vector search disabled")
    chroma_client = None

# Initialize embedding model
embedding_model = SentenceTransformer('all-MiniLM-L6-v2')

router = APIRouter(prefix="/chat", tags=["chat"])

# Data models
class ChatRequest(BaseModel):
    message: str
    user_id: str
    conversation_id: Optional[str] = None
    model: str = "gpt-4-turbo"
    stream: bool = True

class ChatResponse(BaseModel):
    response: str
    conversation_id: str
    sources: List[str] = []
    usage: Dict[str, Any] = {}

class ContextChunk(BaseModel):
    content: str
    file_name: str
    similarity_score: float

# Subscription tier limits
TIER_LIMITS = {
    "free": {
        "documents": 25,
        "chat_messages": 100,
        "api_calls": 250,
        "storage_bytes": 104857600,  # 100 MB
        "model": "gpt-3.5-turbo"
    },
    "pro": {
        "documents": 500,
        "chat_messages": 400,
        "api_calls": 1000,
        "storage_bytes": 1073741824,  # 1 GB
        "model": "gpt-4-turbo"
    },
    "pro_byok": {
        "documents": 5000,
        "chat_messages": 2000,
        "api_calls": 5000,
        "storage_bytes": 10737418240,  # 10 GB
        "model": "byok"
    }
}

@router.post("/")
async def chat_endpoint(request: ChatRequest):
    """Main chat endpoint with context retrieval and LLM integration"""
    try:
        # Enforce chat message usage limits
        usage_data = await check_and_increment_usage(
            supabase,
            request.user_id,
            'chat_messages',
            'chat_message',
            increment=1,
            event_data={
                'message_length': len(request.message),
                'conversation_id': request.conversation_id,
                'model_requested': request.model
            }
        )
        
        # Get user profile and tier info
        user_data = get_supabase_client().table('users').select('*').eq('id', request.user_id).execute()
        if not user_data.data:
            raise HTTPException(status_code=404, detail="User not found")
        
        user = user_data.data[0]
        tier = user['subscription_tier']
        
        # Get relevant context from vector database
        context_chunks = await get_relevant_context(request.user_id, request.message)
        
        # Prepare conversation history
        conversation_history = []
        if request.conversation_id:
            conversation_history = await get_conversation_history(request.conversation_id)
        
        # Determine model to use
        model = determine_model(tier, user.get('api_key_hash'), request.model)
        
        # Generate response
        if request.stream:
            return StreamingResponse(
                stream_chat_response(
                    request.message,
                    context_chunks,
                    conversation_history,
                    model,
                    user
                ),
                media_type="text/plain"
            )
        else:
            response = await generate_chat_response(
                request.message,
                context_chunks,
                conversation_history,
                model,
                user
            )
            
            # Log usage
            await log_usage(request.user_id, "chat", {"model": model})
            
            return response
            
    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail="Chat request failed")

async def check_usage_limits(user_id: str, tier: str) -> bool:
    """Check if user has exceeded their usage limits"""
    try:
        tier_limits = TIER_LIMITS.get(tier, TIER_LIMITS['free'])
        max_calls = tier_limits['chat_messages']
        
        if tier == 'pro_byok':  # BYOK has higher limits but not unlimited
            max_calls = tier_limits['chat_messages']
        
        # Get current month usage
        current_month = datetime.utcnow().strftime('%Y-%m')
        usage_data = get_supabase_client().table('usage_logs').select('*').eq('user_id', user_id).eq('action', 'chat').gte('created_at', f'{current_month}-01').execute()
        
        current_usage = len(usage_data.data)
        return current_usage < max_calls
        
    except Exception as e:
        logger.error(f"Usage check error: {e}")
        return False

async def get_relevant_context(user_id: str, query: str, max_chunks: int = 5) -> List[ContextChunk]:
    """Retrieve relevant document chunks for the query"""
    try:
        # Generate query embedding
        query_embedding = embedding_model.encode([query])[0].tolist()
        
        # Get user's collection
        collection_name = f"user_{user_id}"
        try:
            collection = chroma_client.get_collection(collection_name)
        except:
            logger.warning(f"No collection found for user {user_id}")
            return []
        
        # Query similar chunks
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=max_chunks,
            include=['documents', 'metadatas', 'distances']
        )
        
        # Convert to ContextChunk objects
        context_chunks = []
        if results['documents'] and results['documents'][0]:
            for i, doc in enumerate(results['documents'][0]):
                metadata = results['metadatas'][0][i]
                distance = results['distances'][0][i]
                similarity = 1 - distance  # Convert distance to similarity
                
                context_chunks.append(ContextChunk(
                    content=doc,
                    file_name=metadata.get('file_name', 'Unknown'),
                    similarity_score=similarity
                ))
        
        return context_chunks
        
    except Exception as e:
        logger.error(f"Context retrieval error: {e}")
        return []

async def get_conversation_history(conversation_id: str) -> List[Dict[str, str]]:
    """Get conversation history from database"""
    try:
        conv_data = get_supabase_client().table('conversations').select('messages').eq('id', conversation_id).execute()
        
        if conv_data.data:
            return conv_data.data[0]['messages']
        else:
            return []
            
    except Exception as e:
        logger.error(f"Conversation history error: {e}")
        return []

def determine_model(tier: str, api_key_hash: Optional[str], requested_model: str) -> str:
    """Determine which model to use based on tier and availability"""
    tier_limits = TIER_LIMITS.get(tier, TIER_LIMITS['free'])
    
    if tier == 'pro_byok' and api_key_hash:
        return 'byok'
    elif tier == 'pro':
        return 'gpt-4-turbo'  # Updated to GPT-4.1 (GPT-4 Turbo)
    else:
        return 'gpt-3.5-turbo'

async def stream_chat_response(
    message: str,
    context_chunks: List[ContextChunk],
    conversation_history: List[Dict[str, str]],
    model: str,
    user: Dict[str, Any]
) -> AsyncGenerator[str, None]:
    """Stream chat response from LLM"""
    try:
        # Prepare context
        context_text = "\n\n".join([
            f"From {chunk.file_name}:\n{chunk.content}"
            for chunk in context_chunks
        ])
        
        # Prepare messages
        messages = []
        
        # System prompt
        system_prompt = f"""You are Briefly, an AI assistant that helps users understand their documents. 

You have access to the following context from the user's documents:

{context_text}

Please answer the user's question based on this context. If the context doesn't contain relevant information, say so clearly. Always cite which documents you're referencing when possible."""

        messages.append({"role": "system", "content": system_prompt})
        
        # Add conversation history
        for msg in conversation_history[-10:]:  # Last 10 messages
            messages.append(msg)
        
        # Add current message
        messages.append({"role": "user", "content": message})
        
        # Generate response
        if model == 'byok':
            # Use user's API key with proper error handling
            user_api_key = await get_user_api_key(user['id'])
            if not user_api_key:
                yield "⚠️ No API key configured. Please add your OpenAI API key in Settings to use BYOK features."
                return
            
            try:
                # Create temporary OpenAI client with user's key
                import openai as user_openai
                user_openai.api_key = user_api_key
                
                response = await user_openai.ChatCompletion.acreate(
                    model="gpt-4-turbo",  # Default to GPT-4 Turbo for BYOK
                    messages=messages,
                    stream=True,
                    max_tokens=1000,
                    temperature=0.7
                )
                
                async for chunk in response:
                    if chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
                        
            except openai.error.AuthenticationError:
                yield "⚠️ We couldn't complete your request using your LLM key. Please check your key or upgrade to Rekonn Labs Pro."
                return
            except openai.error.RateLimitError:
                yield "⚠️ Your OpenAI API key has exceeded its rate limit. Please check your OpenAI account or upgrade to Rekonn Labs Pro."
                return
            except openai.error.InvalidRequestError as e:
                if "insufficient_quota" in str(e).lower():
                    yield "⚠️ Your OpenAI API key has insufficient quota. Please add credits to your OpenAI account or upgrade to Rekonn Labs Pro."
                else:
                    yield f"⚠️ Invalid request with your API key: {str(e)}. Please check your key configuration or upgrade to Rekonn Labs Pro."
                return
            except Exception as e:
                logger.error(f"BYOK error: {e}")
                yield "⚠️ We couldn't complete your request using your LLM key. Please check your key or upgrade to Rekonn Labs Pro."
                return
        else:
            # Use OpenAI API
            response = await openai.ChatCompletion.acreate(
                model=model,
                messages=messages,
                stream=True,
                max_tokens=1000,
                temperature=0.7
            )
            
            async for chunk in response:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        
        # Log usage after streaming
        await log_usage(user['id'], "chat", {"model": model})
        
    except Exception as e:
        logger.error(f"Streaming error: {e}")
        yield f"\n\nError: {str(e)}"

async def generate_chat_response(
    message: str,
    context_chunks: List[ContextChunk],
    conversation_history: List[Dict[str, str]],
    model: str,
    user: Dict[str, Any]
) -> ChatResponse:
    """Generate non-streaming chat response"""
    try:
        # Prepare context
        context_text = "\n\n".join([
            f"From {chunk.file_name}:\n{chunk.content}"
            for chunk in context_chunks
        ])
        
        # Prepare messages
        messages = []
        
        # System prompt
        system_prompt = f"""You are Briefly, an AI assistant that helps users understand their documents. 

You have access to the following context from the user's documents:

{context_text}

Please answer the user's question based on this context. If the context doesn't contain relevant information, say so clearly. Always cite which documents you're referencing when possible."""

        messages.append({"role": "system", "content": system_prompt})
        
        # Add conversation history
        for msg in conversation_history[-10:]:  # Last 10 messages
            messages.append(msg)
        
        # Add current message
        messages.append({"role": "user", "content": message})
        
        # Generate response
        if model == 'byok':
            # Use user's API key with proper error handling
            user_api_key = await get_user_api_key(user['id'])
            if not user_api_key:
                response_text = "⚠️ No API key configured. Please add your OpenAI API key in Settings to use BYOK features."
                usage = {}
            else:
                try:
                    # Create OpenAI client with user's key
                    import openai as user_openai
                    user_openai.api_key = user_api_key
                    
                    response = await user_openai.ChatCompletion.acreate(
                        model="gpt-4-turbo",  # Default to GPT-4 Turbo for BYOK
                        messages=messages,
                        max_tokens=1000,
                        temperature=0.7
                    )
                    
                    response_text = response.choices[0].message.content
                    usage = response.usage.to_dict() if hasattr(response, 'usage') else {}
                    
                except user_openai.error.AuthenticationError:
                    response_text = "⚠️ Invalid OpenAI API key. Please check your key in Settings or upgrade to Rekonn Labs Pro."
                    usage = {}
                except user_openai.error.RateLimitError:
                    response_text = "⚠️ Your OpenAI API key has exceeded its rate limit. Please check your OpenAI account or upgrade to Rekonn Labs Pro."
                    usage = {}
                except user_openai.error.InvalidRequestError as e:
                    if "insufficient_quota" in str(e).lower():
                        response_text = "⚠️ Your OpenAI API key has insufficient quota. Please add credits to your OpenAI account or upgrade to Rekonn Labs Pro."
                    else:
                        response_text = f"⚠️ Invalid request with your API key: {str(e)}. Please check your key configuration or upgrade to Rekonn Labs Pro."
                    usage = {}
                except Exception as e:
                    logger.error(f"BYOK error: {e}")
                    response_text = "⚠️ We couldn't complete your request using your LLM key. Please check your key or upgrade to Rekonn Labs Pro."
                    usage = {}
        else:
            # Use OpenAI API
            response = await openai.ChatCompletion.acreate(
                model=model,
                messages=messages,
                max_tokens=1000,
                temperature=0.7
            )
            
            response_text = response.choices[0].message.content
            usage = response.usage
        
        # Prepare sources
        sources = [chunk.file_name for chunk in context_chunks]
        
        return ChatResponse(
            response=response_text,
            conversation_id="temp_id",  # Will be updated when saving
            sources=sources,
            usage=usage
        )
        
    except Exception as e:
        logger.error(f"Chat response error: {e}")
        raise

async def log_usage(user_id: str, action: str, details: Dict[str, Any]):
    """Log usage for billing and analytics"""
    try:
        usage_data = {
            "user_id": user_id,
            "action": action,
            "details": details,
            "cost_cents": 0  # Will be calculated based on model and usage
        }
        
        get_supabase_client().table('usage_logs').insert(usage_data).execute()
        
    except Exception as e:
        logger.error(f"Usage logging error: {e}")

@router.get("/conversations/{user_id}")
async def get_user_conversations(user_id: str):
    """Get user's conversation list"""
    try:
        conversations = get_supabase_client().table('conversations').select('id, title, created_at, updated_at').eq('user_id', user_id).order('updated_at', desc=True).execute()
        
        return {"conversations": conversations.data}
        
    except Exception as e:
        logger.error(f"Get conversations error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get conversations")

@router.post("/conversations")
async def create_conversation(user_id: str, title: Optional[str] = None):
    """Create new conversation"""
    try:
        conversation_data = {
            "user_id": user_id,
            "title": title or "New Conversation",
            "messages": []
        }
        
        result = get_supabase_client().table('conversations').insert(conversation_data).execute()
        
        return {"conversation": result.data[0]}
        
    except Exception as e:
        logger.error(f"Create conversation error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create conversation")

@router.get("/usage/{user_id}")
async def get_usage_stats(user_id: str):
    """Get user's usage statistics"""
    try:
        # Get current month usage
        current_month = datetime.utcnow().strftime('%Y-%m')
        usage_data = get_supabase_client().table('usage_logs').select('*').eq('user_id', user_id).gte('created_at', f'{current_month}-01').execute()
        
        # Count by action type
        usage_stats = {}
        for log in usage_data.data:
            action = log['action']
            usage_stats[action] = usage_stats.get(action, 0) + 1
        
        # Get user tier limits
        user_data = get_supabase_client().table('users').select('subscription_tier').eq('id', user_id).execute()
        tier = user_data.data[0]['subscription_tier'] if user_data.data else 'free'
        tier_limits = TIER_LIMITS.get(tier, TIER_LIMITS['free'])
        
        return {
            "usage": usage_stats,
            "limits": tier_limits,
            "tier": tier
        }
        
    except Exception as e:
        logger.error(f"Usage stats error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get usage stats")



async def get_user_api_key(user_id: str) -> Optional[str]:
    """Get user's decrypted API key for BYOK"""
    try:
        # Get encrypted API key from user settings
        settings_data = get_supabase_client().table('user_settings').select('*').eq('user_id', user_id).eq('key', 'openai_api_key').execute()
        
        if settings_data.data:
            # In production, this should be properly encrypted/decrypted
            # For now, storing as plain text (NOT SECURE - needs encryption)
            return settings_data.data[0]['value']
        
        return None
        
    except Exception as e:
        logger.error(f"API key retrieval error: {e}")
        return None


@router.get("/history")
async def get_chat_history():
    """Get chat history for compatibility with frontend"""
    try:
        # Return empty history for now - in a real app you'd get user_id from auth
        # and fetch their actual conversation history
        return {
            "conversations": [],
            "total": 0
        }
    except Exception as e:
        logger.error(f"Chat history error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get chat history")

@router.get("/history/{user_id}")
async def get_user_chat_history(user_id: str):
    """Get chat history for a specific user"""
    try:
        # Get conversations from database
        conversations_data = get_supabase_client().table('conversations').select('*').eq('user_id', user_id).order('updated_at', desc=True).execute()
        
        conversations = []
        for conv in conversations_data.data:
            # Get messages for this conversation
            messages_data = get_supabase_client().table('messages').select('*').eq('conversation_id', conv['id']).order('created_at', asc=True).execute()
            
            conversations.append({
                "id": conv['id'],
                "title": conv.get('title', 'New Conversation'),
                "created_at": conv['created_at'],
                "updated_at": conv['updated_at'],
                "message_count": len(messages_data.data),
                "messages": messages_data.data
            })
        
        return {
            "conversations": conversations,
            "total": len(conversations)
        }
        
    except Exception as e:
        logger.error(f"User chat history error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get user chat history")