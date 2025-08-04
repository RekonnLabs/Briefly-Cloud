#!/usr/bin/env python3
"""
Railway deployment entry point
"""
import sys
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add server directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'server'))

# Import the FastAPI app from server
from server.main import app

# Export for Railway - this is what uvicorn will use
__all__ = ['app']