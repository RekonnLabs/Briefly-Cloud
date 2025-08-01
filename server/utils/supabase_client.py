"""
Shared Supabase client utility with lazy initialization
"""
import os
import logging
from supabase import create_client, Client

logger = logging.getLogger(__name__)

# Global client instance
_supabase_client: Client = None

def get_supabase_client() -> Client:
    """
    Get Supabase client with lazy initialization.
    This prevents import-time errors when environment variables aren't set.
    """
    global _supabase_client
    
    if _supabase_client is None:
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_ANON_KEY")
        
        if not supabase_url or not supabase_key:
            logger.error(f"Missing Supabase credentials: URL={supabase_url}, KEY={'SET' if supabase_key else 'MISSING'}")
            raise ValueError("Supabase credentials not found in environment variables")
        
        _supabase_client = create_client(supabase_url, supabase_key)
        logger.info("Supabase client initialized successfully")
    
    return _supabase_client

def reset_supabase_client():
    """Reset the client (useful for testing)"""
    global _supabase_client
    _supabase_client = None