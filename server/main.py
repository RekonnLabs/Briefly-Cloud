from fastapi import FastAPI, HTTPException, UploadFile, File, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
import json
import logging
import asyncio
import aiofiles
import httpx
from datetime import datetime
import uuid
from dotenv import load_dotenv

# Load environment variables first
load_dotenv()

# Configure logging first
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
# Mute overly verbose libraries
logging.getLogger("pdfminer").setLevel(logging.WARNING)
logging.getLogger("pdfminer.pdfparser").setLevel(logging.WARNING)

# Import route modules
try:
    from routes import auth, storage, chat, embed, usage
    ROUTES_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Route modules not available: {e}")
    ROUTES_AVAILABLE = False

app = FastAPI(title="Briefly Cloud Backend", version="1.0.0")

# Startup logging
logger.info("🚀 Briefly Cloud Backend starting...")
logger.info(f"Python path: {os.getcwd()}")
logger.info(f"Environment: {os.getenv('ENVIRONMENT', 'development')}")

@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring"""
    return {"status": "healthy", "service": "briefly-cloud-backend", "timestamp": "2025-08-01"}

@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "Briefly Cloud Backend API", "status": "running"}

# CORS middleware
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173").split(",")
allowed_origins.extend([
    "https://rekonnlabs.com",
    "https://www.rekonnlabs.com",
    "https://rekonnlabs.vercel.app",
    "http://127.0.0.1:5173", 
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://localhost:3000"
])

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Data models
class ChatMessage(BaseModel):
    role: str
    content: str
    timestamp: Optional[str] = None

class ChatRequest(BaseModel):
    message: str
    context_folder: Optional[str] = None
    conversation_id: Optional[str] = None

class SettingsModel(BaseModel):
    referenceFolder: Optional[str] = None
    theme: str = "system"
    llmApiUrl: str = "https://api.openai.com/v1/chat/completions"
    llmApiKey: Optional[str] = None
    modelPath: Optional[str] = None
    port: int = 8080
    autoStartLlm: bool = True

# Global variables
settings_file = "settings.json"
conversations_file = "conversations.json"
uploaded_files_file = "uploaded_files.json"

# Helper functions
def load_json_file(filename: str, default: Any = None) -> Any:
    """Load JSON file with error handling"""
    try:
        if os.path.exists(filename):
            with open(filename, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        logger.error(f"Error loading {filename}: {e}")
    return default or {}

def save_json_file(filename: str, data: Any) -> bool:
    """Save JSON file with error handling"""
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        logger.error(f"Error saving {filename}: {e}")
        return False

def get_settings() -> Dict[str, Any]:
    """Get current settings, with full device info and OpenChat as default model."""
    default_settings = {
        "referenceFolder": None,
        "theme": "system",
        "llmApiUrl": "https://api.openai.com/v1/chat/completions",
        "llmApiKey": None,
        "modelPath": "OpenChat",  # Set OpenChat as the default model
        "port": 8080,
        "autoStartLlm": True
    }

    # Try to get device info from vector store (if initialized)
    device = "cpu"
    device_name = "None"
    backend = "cpu"
    try:
        from vector_store import ChromaVectorStore
        # Try to get or create the singleton instance if used elsewhere
        _store = None
        if hasattr(ChromaVectorStore, '_instance'):
            _store = getattr(ChromaVectorStore, '_instance', None)
        if not _store:
            _store = ChromaVectorStore()
        device = getattr(_store, 'device', 'cpu')
        device_name = getattr(_store, 'device_name', 'None')
        backend = getattr(_store, 'backend', 'cpu')
    except Exception as e:
        # Fallback to torch detection
        try:
            import torch
            if torch.cuda.is_available():
                device = 'cuda'
                device_name = torch.cuda.get_device_name(0)
                backend = f'CUDA {getattr(torch.version, "cuda", "unknown")}'
            elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available() and torch.backends.mps.is_built():
                device = 'mps'
                device_name = 'Apple MPS'
                backend = 'MPS'
            else:
                device = 'cpu'
                device_name = 'None'
                backend = 'cpu'
        except Exception:
            device = 'cpu'
            device_name = 'None'
            backend = 'cpu'
    settings = load_json_file(settings_file, default_settings)
    merged_settings = {**default_settings, **settings}
    merged_settings["gpu_name"] = device_name or "None"
    merged_settings["device"] = device
    merged_settings["device_name"] = device_name
    merged_settings["backend"] = backend
    return merged_settings


async def call_llm_api(messages: List[Dict[str, str]], settings: Dict[str, Any], max_tokens: int = 2048) -> Dict[str, Any]:
    """Call the bundled LLM API"""
    try:
        llm_url = settings.get("llmApiUrl", "https://api.openai.com/v1/chat/completions")
        
        # Prepare the request payload
        payload = {
            "model": "bundled-llm",  # This can be any string for llama.cpp
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": max_tokens,
            "stream": False
        }
        
        # Add API key if provided
        headers = {"Content-Type": "application/json"}
        if settings.get("llmApiKey"):
            headers["Authorization"] = f"Bearer {settings['llmApiKey']}"
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(llm_url, json=payload, headers=headers)
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"LLM API error: {response.status_code} - {response.text}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"LLM API error: {response.text}"
                )
                
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail="Cannot connect to LLM server. Please ensure the LLM is running."
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="LLM request timed out. The model may be processing a large request."
        )
    except Exception as e:
        logger.error(f"Unexpected error calling LLM API: {e}")
        raise HTTPException(status_code=500, detail=f"LLM API error: {str(e)}")

def build_context_from_folder(folder_path: str, max_files: int = 10) -> str:
    """Build context from files in the reference folder"""
    if not folder_path or not os.path.exists(folder_path):
        return ""
    
    context_parts = []
    file_count = 0
    
    try:
        for root, dirs, files in os.walk(folder_path):
            for file in files:
                if file_count >= max_files:
                    break
                    
                file_path = os.path.join(root, file)
                
                # Skip binary files and large files
                if file.lower().endswith(('.txt', '.md', '.py', '.js', '.json', '.csv', '.html', '.css')):
                    try:
                        if os.path.getsize(file_path) < 100000:  # 100KB limit
                            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                                content = f.read()
                                relative_path = os.path.relpath(file_path, folder_path)
                                context_parts.append(f"File: {relative_path}\n{content}\n")
                                file_count += 1
                    except Exception as e:
                        logger.warning(f"Could not read file {file_path}: {e}")
                        
            if file_count >= max_files:
                break
                
    except Exception as e:
        logger.error(f"Error building context from folder {folder_path}: {e}")
    
    if context_parts:
        return f"Reference folder context ({file_count} files):\n\n" + "\n".join(context_parts)
    return ""

# Include route modules if available
if ROUTES_AVAILABLE:
    app.include_router(auth.router, prefix="/api")
    app.include_router(storage.router, prefix="/api")
    app.include_router(chat.router, prefix="/api")
    app.include_router(embed.router, prefix="/api")
    app.include_router(usage.router, prefix="/api")
    logger.info("Cloud routes loaded successfully")
else:
    logger.warning("Running in legacy mode - cloud routes not available")

# Legacy API Routes for backward compatibility (only if vector_store is available)
from fastapi import BackgroundTasks

# Try to import vector store functions (optional for serverless deployment)
try:
    from vector_store import build_vector_index, get_vector_store_stats
    VECTOR_STORE_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Vector store not available: {e}")
    VECTOR_STORE_AVAILABLE = False
    # Create dummy functions for compatibility
    def build_vector_index(*args, **kwargs):
        raise HTTPException(status_code=501, detail="Vector store not available in this deployment")
    def get_vector_store_stats(*args, **kwargs):
        raise HTTPException(status_code=501, detail="Vector store not available in this deployment")

class ParseFolderRequest(BaseModel):
    folder_path: str

@app.post("/api/parse_folder")
async def parse_folder_endpoint(background_tasks: BackgroundTasks, req: ParseFolderRequest):
    """Legacy endpoint - use /api/embed/index instead"""
    try:
        def run_indexing():
            try:
                build_vector_index(req.folder_path, force_rebuild=True)
            except Exception as e:
                logger.error(f"Error during indexing: {e}")
        background_tasks.add_task(run_indexing)
        logger.info(f"Started parsing/indexing for {req.folder_path}")
        return {"success": True, "message": f"Started parsing/indexing for {req.folder_path}"}
    except Exception as e:
        logger.error(f"Failed to start indexing: {e}")
        return {"success": False, "message": f"Failed to start indexing: {str(e)}"}

@app.get("/api/vector_stats")
async def vector_stats_endpoint():
    """Legacy endpoint - use /api/embed/stats instead"""
    stats = get_vector_store_stats()
    return stats



@app.get("/api/settings")
async def get_settings_endpoint():
    """Get current settings, including GPU info."""
    return get_settings()


@app.post("/api/settings")
async def save_settings_endpoint(settings: SettingsModel):
    """Save settings, including reference folder, and return updated settings"""
    try:
        settings_dict = settings.dict()
        # Persist reference folder and all settings
        success = save_json_file(settings_file, settings_dict)
        if success:
            logger.info(f"Settings updated: {settings_dict}")
            return {"success": True, "message": "Settings saved successfully", "settings": settings_dict}
        else:
            logger.error("Failed to save settings")
            raise HTTPException(status_code=500, detail="Failed to save settings")
    except Exception as e:
        logger.error(f"Error saving settings: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save settings: {str(e)}")

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    """Main chat endpoint"""
    try:
        settings = get_settings()
        
        # Load conversation history
        conversations = load_json_file(conversations_file, {})
        conversation_id = request.conversation_id or str(uuid.uuid4())
        
        if conversation_id not in conversations:
            conversations[conversation_id] = {
                "id": conversation_id,
                "created_at": datetime.now().isoformat(),
                "messages": []
            }
        conversation = conversations[conversation_id]

        # Retrieve relevant context chunks using vector search
        from vector_store import get_relevant_context
        retrieved_chunks = []
        if request.context_folder:
            retrieved_chunks = get_relevant_context(request.message, max_results=3)
            if retrieved_chunks:
                logger.info(f"[CHAT] Retrieved {len(retrieved_chunks)} context chunks for query via vector search.")
                logger.debug(f"[CHAT] First chunk preview: {retrieved_chunks[0]['content'][:500]}")
            else:
                logger.info(f"[CHAT] No relevant context found via vector search.")
        # Format context as numbered excerpts for clarity
        context_excerpts = "\n".join([
            f"{i+1}. {chunk['content'].strip()}\n(Source: {chunk['metadata'].get('filename', chunk['metadata'])})"
            for i, chunk in enumerate(retrieved_chunks)
        ])
        messages = []
        synthesis_prompt = (
            "You are an expert assistant. Here are excerpts from documents you must use to answer the user's question. "
            "Synthesize, summarize, compare, and explain as needed, but only use information from these excerpts. "
            "Do not use any outside knowledge or invent information. "
            "If you cannot answer using these excerpts, reply: 'I don't know based on the provided documents.'\n\n"
            "[EXCERPTS]\n" + (context_excerpts if context_excerpts else "(No relevant excerpts found)") + "\n\n"
            "When you answer, cite the excerpt number(s) you used, e.g. [Source: 1], [Source: 2], etc."
        )
        messages.append({"role": "system", "content": synthesis_prompt})
        # Optionally, add recent messages as before

        recent_messages = conversation["messages"][-10:] if conversation["messages"] else []
        for msg in recent_messages:
            messages.append({"role": msg["role"], "content": msg["content"]})
        # Add current user message
        messages.append({"role": "user", "content": request.message})
        
        # Call LLM API
        logger.info(f"[CHAT] Sending {len(messages)} messages to LLM for conversation {conversation_id}")
        logger.debug(f"[CHAT] FULL PROMPT to LLM: {messages}")
        print("[CHAT] FULL PROMPT to LLM:", messages)
        try:
            llm_response = await call_llm_api(messages, settings, max_tokens=256)
        except Exception as e:
            logger.error(f"[CHAT] LLM server unavailable or crashed: {e}")
            return JSONResponse(status_code=503, content={"error": "LLM server unavailable or context too large. Please try again or reduce your query/context size."})
        logger.info(f"[CHAT] LLM response received for conversation {conversation_id}")
        logger.debug(f"[CHAT] LLM raw response: {llm_response}")
        
        # Extract assistant response
        assistant_message = ""
        if not retrieved_chunks:
            assistant_message = "I don't know based on the provided documents."
        elif "choices" in llm_response and llm_response["choices"]:
            assistant_message = llm_response["choices"][0]["message"]["content"]
        else:
            raise HTTPException(status_code=500, detail="Invalid response from LLM")
        
        # Save messages to conversation
        timestamp = datetime.now().isoformat()
        
        conversation["messages"].append({
            "role": "user",
            "content": request.message,
            "timestamp": timestamp
        })
        
        conversation["messages"].append({
            "role": "assistant",
            "content": assistant_message,
            "timestamp": timestamp
        })
        
        conversation["updated_at"] = timestamp
        
        # Save conversation
        conversations[conversation_id] = conversation
        save_json_file(conversations_file, conversations)
        
        return {
            "response": assistant_message,
            "conversation_id": conversation_id,
            "timestamp": timestamp,
            "retrieved_chunks": [
                {
                    "content": chunk["content"],
                    "metadata": chunk["metadata"],
                    "score": chunk["score"]
                } for chunk in retrieved_chunks
            ]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Chat endpoint error: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.get("/api/conversations")
async def get_conversations():
    """Get all conversations"""
    conversations = load_json_file(conversations_file, {})
    
    # Return summary of conversations
    summaries = []
    for conv_id, conv in conversations.items():
        if conv.get("messages"):
            first_message = conv["messages"][0]["content"] if conv["messages"] else "New conversation"
            summaries.append({
                "id": conv_id,
                "title": first_message[:50] + "..." if len(first_message) > 50 else first_message,
                "created_at": conv.get("created_at"),
                "updated_at": conv.get("updated_at"),
                "message_count": len(conv["messages"])
            })
    
    # Sort by updated_at descending
    summaries.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
    
    return {"conversations": summaries}

@app.get("/api/conversations/{conversation_id}")
async def get_conversation(conversation_id: str):
    """Get specific conversation"""
    conversations = load_json_file(conversations_file, {})
    
    if conversation_id not in conversations:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    return conversations[conversation_id]

@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    """Delete specific conversation"""
    conversations = load_json_file(conversations_file, {})
    
    if conversation_id not in conversations:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    del conversations[conversation_id]
    save_json_file(conversations_file, conversations)
    
    return {"success": True, "message": "Conversation deleted"}

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Upload and process a file"""
    try:
        # Create uploads directory if it doesn't exist
        upload_dir = "uploads"
        os.makedirs(upload_dir, exist_ok=True)
        
        # Save uploaded file
        file_path = os.path.join(upload_dir, file.filename)
        
        async with aiofiles.open(file_path, 'wb') as f:
            content = await file.read()
            await f.write(content)
        
        # Track uploaded file
        uploaded_files = load_json_file(uploaded_files_file, [])
        
        file_info = {
            "filename": file.filename,
            "path": file_path,
            "size": len(content),
            "uploaded_at": datetime.now().isoformat(),
            "content_type": file.content_type
        }
        
        uploaded_files.append(file_info)
        save_json_file(uploaded_files_file, uploaded_files)
        
        return {
            "success": True,
            "message": "File uploaded successfully",
            "file_info": file_info
        }
        
    except Exception as e:
        logger.error(f"File upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@app.get("/api/files")
async def get_uploaded_files():
    """Get list of uploaded files"""
    uploaded_files = load_json_file(uploaded_files_file, [])
    return {"files": uploaded_files}

if __name__ == "__main__":
    import uvicorn
    
    # Handle port configuration more robustly
    try:
        port_env = os.getenv("PORT", "8000")
        port = int(port_env)
        logger.info(f"Starting server on port {port}")
    except (ValueError, TypeError) as e:
        logger.error(f"Invalid PORT environment variable: {port_env}, using default 8000")
        port = 8000
    
    uvicorn.run(app, host="0.0.0.0", port=port)

