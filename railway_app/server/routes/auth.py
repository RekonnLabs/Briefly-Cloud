"""
Authentication routes for Briefly Cloud
Handles Supabase auth and Stripe tier management
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any
import os
import logging
from dotenv import load_dotenv
from supabase import create_client, Client
import stripe

# Load environment variables
load_dotenv()

# Configure logging
logger = logging.getLogger(__name__)

# Import shared Supabase client
from utils.supabase_client import get_supabase_client

# Initialize Stripe
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

router = APIRouter(prefix="/auth", tags=["authentication"])

# Data models
class LoginRequest(BaseModel):
    email: str
    password: str

class SignupRequest(BaseModel):
    email: str
    password: str

class UserProfile(BaseModel):
    id: str
    email: str
    subscription_tier: str
    stripe_customer_id: Optional[str] = None
    api_key_hash: Optional[str] = None
    created_at: str
    updated_at: str

class TierInfo(BaseModel):
    tier: str
    max_files: int
    max_llm_calls: int
    features: list

# Subscription tier definitions
TIER_LIMITS = {
    "free": TierInfo(
        tier="free",
        max_files=25,
        max_llm_calls=100,
        features=["basic_chat", "google_drive", "gpt_3_5_turbo"]
    ),
    "pro": TierInfo(
        tier="pro", 
        max_files=500,
        max_llm_calls=400,
        features=["advanced_chat", "google_drive", "onedrive", "priority_support", "gpt_4_turbo"]
    ),
    "pro_byok": TierInfo(
        tier="pro_byok",
        max_files=5000, 
        max_llm_calls=2000,
        features=["byok", "advanced_chat", "google_drive", "onedrive", "priority_support", "gpt_4_turbo"]
    )
}

@router.post("/login")
async def login(request: LoginRequest):
    """Login user with email and password"""
    try:
        response = get_supabase_client().auth.sign_in_with_password({
            "email": request.email,
            "password": request.password
        })
        
        if response.user:
            # Get user profile from database
            user_data = get_supabase_client().table('users').select('*').eq('id', response.user.id).execute()
            
            if user_data.data:
                user_profile = user_data.data[0]
                tier_info = TIER_LIMITS.get(user_profile['subscription_tier'], TIER_LIMITS['free'])
                
                # Add usage count and limit for compatibility
                user_profile['usage_count'] = user_profile.get('chat_messages_count', 0)
                user_profile['usage_limit'] = user_profile.get('chat_messages_limit', tier_info.max_llm_calls)
                
                return {
                    "token": response.session.access_token,
                    "refresh_token": response.session.refresh_token,
                    "user": {
                        "id": user_profile['id'],
                        "email": user_profile['email'],
                        "subscription_tier": user_profile['subscription_tier'],
                        "usage_count": user_profile['usage_count'],
                        "usage_limit": user_profile['usage_limit']
                    },
                    "tier_info": tier_info.dict()
                }
            else:
                # Create user profile if it doesn't exist
                new_user = {
                    "id": response.user.id,
                    "email": response.user.email,
                    "full_name": response.user.email.split('@')[0],  # Use email prefix as name
                    "plan": "free",  # Legacy column
                    "subscription_tier": "free",
                    "subscription_status": "active",
                    "chat_messages_count": 0,
                    "chat_messages_limit": 100,
                    "documents_uploaded": 0,
                    "documents_limit": 10,
                    "api_calls_count": 0,
                    "api_calls_limit": 1000,
                    "storage_used_bytes": 0,
                    "storage_limit_bytes": 104857600,
                    "usage_stats": {},
                    "preferences": {},
                    "features_enabled": {"cloud_storage": True, "ai_chat": True, "document_upload": True},
                    "permissions": {"can_upload": True, "can_chat": True, "can_export": False},
                    "usage_reset_date": "2024-02-01T00:00:00Z",  # Next month
                    "trial_end_date": "2024-02-07T00:00:00Z"  # 7 days from now
                }
                
                try:
                    # Use upsert to avoid duplicate key errors
                    result = get_supabase_client().table('users').upsert(new_user).execute()
                    logger.info(f"User profile created successfully for {response.user.email}")
                except Exception as db_error:
                    logger.error(f"User creation failed: {db_error}")
                    # Try to get existing user
                    user_data = get_supabase_client().table('users').select('*').eq('id', response.user.id).execute()
                    if user_data.data:
                        new_user = user_data.data[0]
                    else:
                        raise HTTPException(status_code=500, detail="Failed to create user profile")
                
                # Add usage count and limit for compatibility
                new_user['usage_count'] = new_user.get('chat_messages_count', 0)
                new_user['usage_limit'] = new_user.get('chat_messages_limit', TIER_LIMITS['free'].max_llm_calls)
                
                return {
                    "token": response.session.access_token,
                    "refresh_token": response.session.refresh_token,
                    "user": {
                        "id": new_user['id'],
                        "email": new_user['email'],
                        "subscription_tier": new_user['subscription_tier'],
                        "usage_count": new_user['usage_count'],
                        "usage_limit": new_user['usage_limit']
                    },
                    "tier_info": TIER_LIMITS['free'].dict()
                }
        else:
            raise HTTPException(status_code=401, detail="Invalid credentials")
            
    except Exception as e:
        logger.error(f"Login error: {e}")
        # More specific error handling
        if "Invalid login credentials" in str(e):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        elif "Email not confirmed" in str(e):
            raise HTTPException(status_code=401, detail="Please check your email and confirm your account")
        else:
            raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")

@router.get("/health")
async def auth_health():
    """Simple health check for auth service"""
    return {"status": "ok", "service": "auth"}