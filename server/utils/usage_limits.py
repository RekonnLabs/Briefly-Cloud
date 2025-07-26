"""
Usage limits enforcement for Briefly Cloud
Handles tier-based limits and usage tracking
"""

from typing import Dict, Optional, Tuple
from fastapi import HTTPException
import logging
from datetime import datetime
from supabase import Client

logger = logging.getLogger(__name__)

# Updated tier limits - cost-conscious values
TIER_LIMITS = {
    'free': {
        'documents': 10,
        'chat_messages': 100,
        'api_calls': 1000,
        'storage_bytes': 104857600,  # 100MB
    },
    'pro': {
        'documents': 1000,
        'chat_messages': 1000,
        'api_calls': 10000,
        'storage_bytes': 10737418240,  # 10GB
    },
    'pro_byok': {
        'documents': 10000,
        'chat_messages': 5000,
        'api_calls': 50000,
        'storage_bytes': 107374182400,  # 100GB
    }
}

class UsageLimitError(HTTPException):
    """Custom exception for usage limit violations"""
    def __init__(self, limit_type: str, current: int, limit: int, tier: str):
        self.limit_type = limit_type
        self.current = current
        self.limit = limit
        self.tier = tier
        
        detail = {
            "error": "usage_limit_exceeded",
            "message": f"You have exceeded your {limit_type} limit for the {tier} tier",
            "current_usage": current,
            "limit": limit,
            "tier": tier,
            "upgrade_required": tier == 'free'
        }
        
        super().__init__(status_code=429, detail=detail)

async def get_user_usage(supabase: Client, user_id: str) -> Optional[Dict]:
    """Get current user usage statistics"""
    try:
        result = supabase.table('users').select(
            'subscription_tier, documents_uploaded, documents_limit, '
            'chat_messages_count, chat_messages_limit, '
            'api_calls_count, api_calls_limit, '
            'storage_used_bytes, storage_limit_bytes, '
            'usage_reset_date'
        ).eq('id', user_id).single().execute()
        
        return result.data if result.data else None
    except Exception as e:
        logger.error(f"Error fetching user usage for {user_id}: {e}")
        return None

async def check_usage_limit(
    supabase: Client, 
    user_id: str, 
    limit_type: str, 
    increment: int = 1
) -> Tuple[bool, Dict]:
    """
    Check if user can perform an action without exceeding limits
    
    Args:
        supabase: Supabase client
        user_id: User UUID
        limit_type: 'documents', 'chat_messages', 'api_calls', or 'storage'
        increment: Amount to increment (default 1)
    
    Returns:
        Tuple of (within_limits, usage_data)
    """
    usage = await get_user_usage(supabase, user_id)
    if not usage:
        return False, {}
    
    tier = usage['subscription_tier']
    
    # Map limit types to database columns
    limit_mapping = {
        'documents': ('documents_uploaded', 'documents_limit'),
        'chat_messages': ('chat_messages_count', 'chat_messages_limit'),
        'api_calls': ('api_calls_count', 'api_calls_limit'),
        'storage': ('storage_used_bytes', 'storage_limit_bytes')
    }
    
    if limit_type not in limit_mapping:
        logger.error(f"Invalid limit type: {limit_type}")
        return False, usage
    
    current_col, limit_col = limit_mapping[limit_type]
    current_usage = usage[current_col] or 0
    limit = usage[limit_col] or 0
    
    # Check if adding increment would exceed limit
    would_exceed = (current_usage + increment) > limit
    
    return not would_exceed, {
        'tier': tier,
        'current': current_usage,
        'limit': limit,
        'would_exceed': would_exceed,
        'remaining': max(0, limit - current_usage)
    }

async def enforce_usage_limit(
    supabase: Client, 
    user_id: str, 
    limit_type: str, 
    increment: int = 1
) -> Dict:
    """
    Enforce usage limits - raise exception if exceeded
    
    Args:
        supabase: Supabase client
        user_id: User UUID
        limit_type: 'documents', 'chat_messages', 'api_calls', or 'storage'
        increment: Amount to increment (default 1)
    
    Returns:
        Usage data dictionary
        
    Raises:
        UsageLimitError: If limit would be exceeded
    """
    within_limits, usage_data = await check_usage_limit(
        supabase, user_id, limit_type, increment
    )
    
    if not within_limits:
        raise UsageLimitError(
            limit_type=limit_type,
            current=usage_data['current'],
            limit=usage_data['limit'],
            tier=usage_data['tier']
        )
    
    return usage_data

async def increment_usage_counter(
    supabase: Client,
    user_id: str,
    event_type: str,
    resource_count: int = 1,
    event_data: Dict = None
) -> bool:
    """
    Increment usage counter using database function
    
    Args:
        supabase: Supabase client
        user_id: User UUID
        event_type: 'document_upload', 'chat_message', 'api_call'
        resource_count: Amount to increment
        event_data: Additional event metadata
    
    Returns:
        Success boolean
    """
    try:
        result = supabase.rpc('increment_usage', {
            'p_user_id': user_id,
            'p_event_type': event_type,
            'p_resource_count': resource_count,
            'p_event_data': event_data or {}
        }).execute()
        
        return result.data if result.data else False
    except Exception as e:
        logger.error(f"Error incrementing usage for {user_id}: {e}")
        return False

async def check_and_increment_usage(
    supabase: Client,
    user_id: str,
    limit_type: str,
    event_type: str,
    increment: int = 1,
    event_data: Dict = None
) -> Dict:
    """
    Check limits and increment usage in one operation
    
    Args:
        supabase: Supabase client
        user_id: User UUID
        limit_type: 'documents', 'chat_messages', 'api_calls'
        event_type: 'document_upload', 'chat_message', 'api_call'
        increment: Amount to increment
        event_data: Additional event metadata
    
    Returns:
        Usage data dictionary
        
    Raises:
        UsageLimitError: If limit would be exceeded
    """
    # First check if within limits
    usage_data = await enforce_usage_limit(supabase, user_id, limit_type, increment)
    
    # If within limits, increment the counter
    success = await increment_usage_counter(
        supabase, user_id, event_type, increment, event_data
    )
    
    if not success:
        logger.error(f"Failed to increment usage counter for {user_id}")
    
    return usage_data

def get_usage_warning_threshold(tier: str, limit_type: str) -> int:
    """Get the threshold at which to warn users about approaching limits"""
    if tier not in TIER_LIMITS or limit_type not in TIER_LIMITS[tier]:
        return 0
    
    limit = TIER_LIMITS[tier][limit_type]
    
    # Warn at 80% of limit
    return int(limit * 0.8)

def format_storage_size(bytes_size: int) -> str:
    """Format storage size in human-readable format"""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if bytes_size < 1024.0:
            return f"{bytes_size:.1f} {unit}"
        bytes_size /= 1024.0
    return f"{bytes_size:.1f} PB"

def get_upgrade_message(tier: str, limit_type: str) -> str:
    """Get appropriate upgrade message based on current tier and limit type"""
    if tier == 'free':
        return "Upgrade to Pro for higher limits and better performance."
    elif tier == 'pro':
        return "Consider Pro BYOK for even higher limits with your own API keys."
    else:
        return "You're on our highest tier. Contact support for enterprise options."

async def reset_monthly_usage(supabase: Client) -> bool:
    """Reset monthly usage counters for all users"""
    try:
        result = supabase.rpc('reset_monthly_usage').execute()
        logger.info("Monthly usage reset completed")
        return True
    except Exception as e:
        logger.error(f"Error resetting monthly usage: {e}")
        return False

async def get_usage_analytics(supabase: Client, days: int = 30) -> Dict:
    """Get usage analytics for the specified number of days"""
    try:
        result = supabase.table('usage_analytics').select('*').limit(days * 10).execute()
        return result.data if result.data else []
    except Exception as e:
        logger.error(f"Error fetching usage analytics: {e}")
        return []