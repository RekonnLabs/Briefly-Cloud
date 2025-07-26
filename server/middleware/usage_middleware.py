"""
Usage limits middleware for Briefly Cloud
Automatically enforces usage limits on API endpoints
"""

from fastapi import Request, Response, HTTPException
from fastapi.responses import JSONResponse
import logging
from typing import Dict, Optional
import json
from utils.usage_limits import (
    check_and_increment_usage, 
    UsageLimitError,
    get_usage_warning_threshold
)

logger = logging.getLogger(__name__)

# Endpoint to limit type mapping
ENDPOINT_LIMITS = {
    '/api/embed/upload': 'documents',
    '/api/chat/message': 'chat_messages',
    '/api/chat/stream': 'chat_messages',
    # Add more endpoints as needed
}

# Endpoint to event type mapping
ENDPOINT_EVENTS = {
    '/api/embed/upload': 'document_upload',
    '/api/chat/message': 'chat_message',
    '/api/chat/stream': 'chat_message',
}

class UsageLimitsMiddleware:
    """Middleware to enforce usage limits on API endpoints"""
    
    def __init__(self, app, supabase_client):
        self.app = app
        self.supabase = supabase_client
    
    async def __call__(self, request: Request, call_next):
        # Skip middleware for non-API endpoints
        if not request.url.path.startswith('/api/'):
            return await call_next(request)
        
        # Skip for health checks and auth endpoints
        skip_paths = ['/api/health', '/api/auth/', '/docs', '/openapi.json']
        if any(request.url.path.startswith(path) for path in skip_paths):
            return await call_next(request)
        
        # Get user ID from request (assuming it's set by auth middleware)
        user_id = getattr(request.state, 'user_id', None)
        if not user_id:
            # If no user ID, let the request proceed (auth middleware will handle)
            return await call_next(request)
        
        # Check if this endpoint has usage limits
        endpoint_path = request.url.path
        limit_type = ENDPOINT_LIMITS.get(endpoint_path)
        
        if limit_type:
            try:
                # Enforce usage limits before processing request
                event_type = ENDPOINT_EVENTS.get(endpoint_path, 'api_call')
                
                usage_data = await check_and_increment_usage(
                    self.supabase,
                    user_id,
                    limit_type,
                    event_type,
                    increment=1,
                    event_data={
                        'endpoint': endpoint_path,
                        'method': request.method,
                        'user_agent': request.headers.get('user-agent', ''),
                        'ip_address': request.client.host if request.client else None
                    }
                )
                
                # Process the request
                response = await call_next(request)
                
                # Add usage headers to response
                if isinstance(response, Response):
                    response.headers['X-Usage-Current'] = str(usage_data['current'])
                    response.headers['X-Usage-Limit'] = str(usage_data['limit'])
                    response.headers['X-Usage-Remaining'] = str(usage_data['remaining'])
                    response.headers['X-Usage-Tier'] = usage_data['tier']
                    
                    # Add warning header if approaching limit
                    warning_threshold = get_usage_warning_threshold(
                        usage_data['tier'], limit_type
                    )
                    if usage_data['current'] >= warning_threshold:
                        response.headers['X-Usage-Warning'] = 'approaching_limit'
                
                return response
                
            except UsageLimitError as e:
                # Return 429 Too Many Requests with detailed error
                return JSONResponse(
                    status_code=429,
                    content=e.detail,
                    headers={
                        'Retry-After': '3600',  # Suggest retry in 1 hour
                        'X-Usage-Limit-Exceeded': limit_type
                    }
                )
            except Exception as e:
                logger.error(f"Usage middleware error for {user_id}: {e}")
                # Continue with request if middleware fails
                return await call_next(request)
        else:
            # No usage limits for this endpoint, just track as API call
            try:
                await check_and_increment_usage(
                    self.supabase,
                    user_id,
                    'api_calls',
                    'api_call',
                    increment=1,
                    event_data={
                        'endpoint': endpoint_path,
                        'method': request.method
                    }
                )
            except UsageLimitError as e:
                return JSONResponse(
                    status_code=429,
                    content=e.detail,
                    headers={'Retry-After': '3600'}
                )
            except Exception as e:
                logger.error(f"API call tracking error for {user_id}: {e}")
            
            return await call_next(request)

def add_usage_middleware(app, supabase_client):
    """Add usage limits middleware to FastAPI app"""
    app.add_middleware(UsageLimitsMiddleware, supabase_client=supabase_client)
    logger.info("Usage limits middleware added to application")

# Decorator for manual usage limit enforcement
def enforce_usage_limit(limit_type: str, event_type: str = None):
    """
    Decorator to enforce usage limits on specific functions
    
    Usage:
        @enforce_usage_limit('documents', 'document_upload')
        async def upload_document(user_id: str, ...):
            # Function implementation
    """
    def decorator(func):
        async def wrapper(*args, **kwargs):
            # Extract user_id from function arguments
            user_id = kwargs.get('user_id') or (args[0] if args else None)
            if not user_id:
                raise HTTPException(
                    status_code=400, 
                    detail="User ID required for usage limit enforcement"
                )
            
            # Get supabase client (assuming it's available in the module)
            from main import supabase  # Import from main app
            
            try:
                await check_and_increment_usage(
                    supabase,
                    user_id,
                    limit_type,
                    event_type or 'api_call'
                )
                
                return await func(*args, **kwargs)
                
            except UsageLimitError as e:
                raise e
            except Exception as e:
                logger.error(f"Usage limit decorator error: {e}")
                # Continue with function if limit check fails
                return await func(*args, **kwargs)
        
        return wrapper
    return decorator