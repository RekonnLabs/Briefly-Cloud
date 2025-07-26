"""
Usage tracking routes for Briefly Cloud
Provides usage statistics and limits information
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
import logging
from datetime import datetime, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client

from utils.usage_limits import (
    get_user_usage,
    get_usage_analytics,
    reset_monthly_usage,
    format_storage_size,
    TIER_LIMITS
)

# Load environment variables
load_dotenv()

# Configure logging
logger = logging.getLogger(__name__)

# Initialize Supabase
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_ANON_KEY")
supabase: Client = create_client(supabase_url, supabase_key)

router = APIRouter(prefix="/api/usage", tags=["usage"])

class UsageResponse(BaseModel):
    tier: str
    subscription_status: str
    documents_uploaded: int
    documents_limit: int
    documents_usage_percent: float
    chat_messages_count: int
    chat_messages_limit: int
    chat_usage_percent: float
    api_calls_count: int
    api_calls_limit: int
    api_usage_percent: float
    storage_used_bytes: int
    storage_limit_bytes: int
    storage_usage_percent: float
    storage_used_formatted: str
    storage_limit_formatted: str
    usage_reset_date: str
    last_active_at: str
    warnings: List[str]

class UsageEvent(BaseModel):
    event_type: str
    resource_consumed: int
    event_data: Dict[str, Any]
    created_at: str

@router.get("/{user_id}")
async def get_user_usage_stats(user_id: str) -> UsageResponse:
    """Get comprehensive usage statistics for a user"""
    try:
        usage_data = await get_user_usage(supabase, user_id)
        if not usage_data:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Calculate usage percentages
        docs_percent = (usage_data['documents_uploaded'] / usage_data['documents_limit']) * 100
        chat_percent = (usage_data['chat_messages_count'] / usage_data['chat_messages_limit']) * 100
        api_percent = (usage_data['api_calls_count'] / usage_data['api_calls_limit']) * 100
        storage_percent = (usage_data['storage_used_bytes'] / usage_data['storage_limit_bytes']) * 100
        
        # Generate warnings
        warnings = []
        if docs_percent >= 90:
            warnings.append("Document limit almost reached")
        elif docs_percent >= 80:
            warnings.append("Document usage high")
            
        if chat_percent >= 90:
            warnings.append("Chat message limit almost reached")
        elif chat_percent >= 80:
            warnings.append("Chat usage high")
            
        if api_percent >= 90:
            warnings.append("API call limit almost reached")
        elif api_percent >= 80:
            warnings.append("API usage high")
            
        if storage_percent >= 90:
            warnings.append("Storage limit almost reached")
        elif storage_percent >= 80:
            warnings.append("Storage usage high")
        
        return UsageResponse(
            tier=usage_data['subscription_tier'],
            subscription_status=usage_data.get('subscription_status', 'active'),
            documents_uploaded=usage_data['documents_uploaded'],
            documents_limit=usage_data['documents_limit'],
            documents_usage_percent=round(docs_percent, 1),
            chat_messages_count=usage_data['chat_messages_count'],
            chat_messages_limit=usage_data['chat_messages_limit'],
            chat_usage_percent=round(chat_percent, 1),
            api_calls_count=usage_data['api_calls_count'],
            api_calls_limit=usage_data['api_calls_limit'],
            api_usage_percent=round(api_percent, 1),
            storage_used_bytes=usage_data['storage_used_bytes'],
            storage_limit_bytes=usage_data['storage_limit_bytes'],
            storage_usage_percent=round(storage_percent, 1),
            storage_used_formatted=format_storage_size(usage_data['storage_used_bytes']),
            storage_limit_formatted=format_storage_size(usage_data['storage_limit_bytes']),
            usage_reset_date=usage_data['usage_reset_date'],
            last_active_at=usage_data['last_active_at'],
            warnings=warnings
        )
        
    except Exception as e:
        logger.error(f"Error fetching usage stats for {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch usage statistics")

@router.get("/{user_id}/events")
async def get_user_usage_events(
    user_id: str, 
    limit: int = 50,
    event_type: Optional[str] = None
) -> List[UsageEvent]:
    """Get recent usage events for a user"""
    try:
        query = supabase.table('usage_events').select('*').eq('user_id', user_id)
        
        if event_type:
            query = query.eq('event_type', event_type)
        
        result = query.order('created_at', desc=True).limit(limit).execute()
        
        events = []
        for event in result.data:
            events.append(UsageEvent(
                event_type=event['event_type'],
                resource_consumed=event['resource_consumed'],
                event_data=event['event_data'],
                created_at=event['created_at']
            ))
        
        return events
        
    except Exception as e:
        logger.error(f"Error fetching usage events for {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch usage events")

@router.get("/analytics/summary")
async def get_usage_analytics_summary(days: int = 30):
    """Get usage analytics summary (admin only)"""
    try:
        analytics = await get_usage_analytics(supabase, days)
        
        # Aggregate data by tier and event type
        summary = {}
        for record in analytics:
            tier = record['subscription_tier']
            event_type = record['event_type']
            
            if tier not in summary:
                summary[tier] = {}
            
            if event_type not in summary[tier]:
                summary[tier][event_type] = {
                    'total_events': 0,
                    'unique_users': 0,
                    'total_resources': 0
                }
            
            summary[tier][event_type]['total_events'] += record['event_count']
            summary[tier][event_type]['unique_users'] += record['unique_users']
            summary[tier][event_type]['total_resources'] += record['total_resources']
        
        return summary
        
    except Exception as e:
        logger.error(f"Error fetching usage analytics: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch usage analytics")

@router.get("/limits/tiers")
async def get_tier_limits():
    """Get all tier limits configuration"""
    return {
        "tiers": TIER_LIMITS,
        "updated_at": datetime.utcnow().isoformat()
    }

@router.post("/reset-monthly")
async def reset_monthly_usage_endpoint():
    """Reset monthly usage counters (admin only)"""
    try:
        success = await reset_monthly_usage(supabase)
        if success:
            return {"message": "Monthly usage reset completed successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to reset monthly usage")
    except Exception as e:
        logger.error(f"Error resetting monthly usage: {e}")
        raise HTTPException(status_code=500, detail="Failed to reset monthly usage")

@router.get("/{user_id}/warnings")
async def get_usage_warnings(user_id: str):
    """Get usage warnings and recommendations for a user"""
    try:
        usage_data = await get_user_usage(supabase, user_id)
        if not usage_data:
            raise HTTPException(status_code=404, detail="User not found")
        
        tier = usage_data['subscription_tier']
        warnings = []
        recommendations = []
        
        # Check each usage type
        usage_checks = [
            ('documents', usage_data['documents_uploaded'], usage_data['documents_limit']),
            ('chat_messages', usage_data['chat_messages_count'], usage_data['chat_messages_limit']),
            ('api_calls', usage_data['api_calls_count'], usage_data['api_calls_limit']),
            ('storage', usage_data['storage_used_bytes'], usage_data['storage_limit_bytes'])
        ]
        
        for usage_type, current, limit in usage_checks:
            percentage = (current / limit) * 100 if limit > 0 else 0
            
            if percentage >= 95:
                warnings.append({
                    "type": "critical",
                    "usage_type": usage_type,
                    "message": f"You've used {percentage:.1f}% of your {usage_type.replace('_', ' ')} limit",
                    "current": current,
                    "limit": limit,
                    "percentage": percentage
                })
            elif percentage >= 80:
                warnings.append({
                    "type": "warning",
                    "usage_type": usage_type,
                    "message": f"You've used {percentage:.1f}% of your {usage_type.replace('_', ' ')} limit",
                    "current": current,
                    "limit": limit,
                    "percentage": percentage
                })
        
        # Generate upgrade recommendations
        if tier == 'free' and warnings:
            recommendations.append({
                "type": "upgrade",
                "message": "Upgrade to Pro for 10x higher limits and better performance",
                "target_tier": "pro",
                "benefits": [
                    "1,000 documents (vs 10)",
                    "1,000 chat messages/month (vs 100)",
                    "10,000 API calls/month (vs 1,000)",
                    "10GB storage (vs 100MB)"
                ]
            })
        elif tier == 'pro' and any(w['type'] == 'critical' for w in warnings):
            recommendations.append({
                "type": "upgrade",
                "message": "Consider Pro BYOK for even higher limits with your own API keys",
                "target_tier": "pro_byok",
                "benefits": [
                    "10,000 documents (vs 1,000)",
                    "5,000 chat messages/month (vs 1,000)",
                    "50,000 API calls/month (vs 10,000)",
                    "100GB storage (vs 10GB)",
                    "Use your own OpenAI API key"
                ]
            })
        
        return {
            "warnings": warnings,
            "recommendations": recommendations,
            "tier": tier,
            "reset_date": usage_data['usage_reset_date']
        }
        
    except Exception as e:
        logger.error(f"Error fetching usage warnings for {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch usage warnings")