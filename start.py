#!/usr/bin/env python3
"""
Railway startup script for Briefly Cloud Backend
Handles port configuration more robustly
"""

import os
import sys
import logging
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def main():
    """Start the FastAPI server with proper port handling"""
    
    # Handle port configuration
    port_env = os.getenv("PORT", "8000")
    
    try:
        port = int(port_env)
        logger.info(f"✅ Using port {port} from environment")
    except (ValueError, TypeError):
        logger.error(f"❌ Invalid PORT environment variable: '{port_env}', using default 8000")
        port = 8000
    
    # Import and start the app
    try:
        import uvicorn
        from main import app
        
        logger.info(f"🚀 Starting Briefly Cloud Backend on 0.0.0.0:{port}")
        
        uvicorn.run(
            app, 
            host="0.0.0.0", 
            port=port,
            log_level="info"
        )
        
    except ImportError as e:
        logger.error(f"❌ Failed to import required modules: {e}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"❌ Failed to start server: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()