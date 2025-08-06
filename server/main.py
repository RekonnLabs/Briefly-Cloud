from fastapi import FastAPI, HTTPException, UploadFile, File, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
import sys
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

@app.get("/api/diagnostics")
async def diagnostics():
    """Comprehensive diagnostic endpoint for troubleshooting"""
    import platform
    from datetime import datetime
    
    # Check route availability
    available_routes = []
    for route in app.routes:
        if hasattr(route, 'path') and hasattr(route, 'methods'):
            available_routes.append({
                "path": route.path,
                "methods": list(route.methods) if route.methods else ["GET"]
            })
    
    # Environment info
    env_info = {
        "PORT": os.getenv("PORT", "Not set"),
        "ENVIRONMENT": os.getenv("ENVIRONMENT", "Not set"),
        "ALLOWED_ORIGINS": os.getenv("ALLOWED_ORIGINS", "Not set"),
        "SUPABASE_URL": "Set" if os.getenv("SUPABASE_URL") else "Not set",
        "SUPABASE_KEY": "Set" if os.getenv("SUPABASE_ANON_KEY") else "Not set",
        "OPENAI_API_KEY": "Set" if os.getenv("OPENAI_API_KEY") else "Not set"
    }
    
    return {
        "status": "healthy",
        "service": "briefly-cloud-backend",
        "timestamp": datetime.now().isoformat(),
        "server_info": {
            "python_version": platform.python_version(),
            "platform": platform.platform(),
            "working_directory": os.getcwd()
        },
        "environment": env_info,
        "routes_loaded": ROUTES_AVAILABLE,
        "total_routes": len(available_routes),
        "sample_routes": available_routes[:10],  # First 10 routes
        "ml_libraries": {
            "chromadb_available": "chromadb" in sys.modules,
            "sentence_transformers_available": "sentence_transformers" in sys.modules
        }
    }

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



