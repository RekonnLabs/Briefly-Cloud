#!/usr/bin/env python3
"""
Railway deployment entry point
"""
import sys
import os
import logging
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Add server directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'server'))

# Import the FastAPI app from server
from server.main import app

# Export for Railway
__all__ = ['app']

if __name__ == "__main__":
    import uvicorn
    
    # Handle port configuration more robustly
    try:
        port_env = os.getenv("PORT", "8000")
        port = int(port_env)
        logger.info(f"✅ Using port {port} from environment")
    except (ValueError, TypeError) as e:
        logger.error(f"❌ Invalid PORT environment variable: {port_env}, using default 8000")
        port = 8000
    
    logger.info(f"🚀 Starting Briefly Cloud Backend on 0.0.0.0:{port}")
    logger.info(f"Environment variables: PORT={os.getenv('PORT')}, HOST={os.getenv('HOST')}")
    
    try:
        uvicorn.run(
            app, 
            host="0.0.0.0", 
            port=port,
            log_level="info",
            access_log=True,
            reload=False
        )
    except Exception as e:
        logger.error(f"❌ Failed to start uvicorn server: {e}")
        raise