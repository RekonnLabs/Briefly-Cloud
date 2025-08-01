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
        max_files=10,
        max_llm_calls=100,
        features=["basic_chat", "google_drive"]
    ),
    "pro": TierInfo(
        tier="pro", 
        max_files=1000,
        max_llm_calls=10000,
        features=["advanced_chat", "google_drive", "onedrive", "priority_support"]
    ),
    "pro_byok": TierInfo(
        tier="pro_byok",
        max_files=10000, 
        max_llm_calls=-1,  # unlimited with own key
        features=["byok", "advanced_chat", "google_drive", "onedrive", "priority_support"]
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

@router.post("/signup")
async def signup(request: SignupRequest):
    """Register new user"""
    try:
        response = get_supabase_client().auth.sign_up({
            "email": request.email,
            "password": request.password
        })
        
        if response.user:
            # Create user profile with all required fields
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
                # Use upsert to handle existing users gracefully
                get_supabase_client().table('users').upsert(new_user).execute()
                logger.info(f"User profile created/updated for {request.email}")
            except Exception as db_error:
                logger.warning(f"User profile creation failed: {db_error}")
                # Continue anyway - the auth user was created successfully
            
            return {
                "message": "Registration successful. Please check your email for verification.",
                "user": {
                    "id": new_user["id"],
                    "email": new_user["email"],
                    "subscription_tier": new_user["subscription_tier"]
                }
            }
        else:
            raise HTTPException(status_code=400, detail="Registration failed - no user returned")
            
    except Exception as e:
        logger.error(f"Signup error: {e}")
        
        # Handle specific Supabase errors
        if "User already registered" in str(e):
            raise HTTPException(status_code=400, detail="An account with this email already exists. Please try logging in instead.")
        elif "Password should be at least" in str(e):
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters long")
        elif "Invalid email" in str(e):
            raise HTTPException(status_code=400, detail="Please enter a valid email address")
        else:
            raise HTTPException(status_code=400, detail=f"Registration failed: {str(e)}")

@router.post("/logout")
async def logout():
    """Logout user"""
    try:
        get_supabase_client().auth.sign_out()
        return {"message": "Logged out successfully"}
    except Exception as e:
        logger.error(f"Logout error: {e}")
        raise HTTPException(status_code=500, detail="Logout failed")

@router.get("/profile")
async def get_profile(request: Request):
    """Get user profile and tier information from Authorization header"""
    try:
        # Extract token from Authorization header
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split(" ")[1]
        
        # Verify token with Supabase
        try:
            user_response = get_supabase_client().auth.get_user(token)
            
            if not user_response or not user_response.user:
                logger.warning(f"Invalid token - no user found")
                raise HTTPException(status_code=401, detail="Invalid or expired token")
            
            user_id = user_response.user.id
            logger.info(f"Token verified for user: {user_id}")
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Token verification failed: {e}")
            # Handle specific Supabase errors
            if "JWT" in str(e) or "token" in str(e).lower():
                raise HTTPException(status_code=401, detail="Invalid or expired token")
            else:
                raise HTTPException(status_code=401, detail="Authentication failed")
        
        # Get user profile from database
        user_data = get_supabase_client().table('users').select('*').eq('id', user_id).execute()
        
        if user_data.data:
            user_profile = user_data.data[0]
            tier_info = TIER_LIMITS.get(user_profile['subscription_tier'], TIER_LIMITS['free'])
            
            # Add usage count and limit for compatibility
            user_profile['usage_count'] = user_profile.get('chat_messages_count', 0)
            user_profile['usage_limit'] = user_profile.get('chat_messages_limit', tier_info.max_llm_calls)
            
            return {
                "id": user_profile['id'],
                "email": user_profile['email'],
                "subscription_tier": user_profile['subscription_tier'],
                "usage_count": user_profile['usage_count'],
                "usage_limit": user_profile['usage_limit'],
                "created_at": user_profile.get('created_at', ''),
                "updated_at": user_profile.get('updated_at', ''),
                "tier_info": tier_info.dict()
            }
        else:
            # Create user profile if it doesn't exist (shouldn't happen but just in case)
            new_user = {
                "id": user_id,
                "email": user_response.user.email,
                "subscription_tier": "free",
                "chat_messages_count": 0,
                "chat_messages_limit": 100
            }
            get_supabase_client().table('users').insert(new_user).execute()
            
            return {
                "id": user_id,
                "email": user_response.user.email,
                "subscription_tier": "free",
                "usage_count": 0,
                "usage_limit": 100,
                "created_at": "",
                "updated_at": "",
                "tier_info": TIER_LIMITS['free'].dict()
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Profile error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get profile")

@router.post("/update-tier")
async def update_tier(user_id: str, new_tier: str):
    """Update user subscription tier"""
    try:
        if new_tier not in TIER_LIMITS:
            raise HTTPException(status_code=400, detail="Invalid tier")
            
        get_supabase_client().table('users').update({
            "subscription_tier": new_tier
        }).eq('id', user_id).execute()
        
        tier_info = TIER_LIMITS[new_tier]
        
        return {
            "message": "Tier updated successfully",
            "tier_info": tier_info.dict()
        }
        
    except Exception as e:
        logger.error(f"Update tier error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update tier")

@router.post("/stripe/create-checkout")
async def create_stripe_checkout(user_id: str, tier: str):
    """Create Stripe checkout session for subscription"""
    try:
        if tier not in ["pro", "pro_byok"]:
            raise HTTPException(status_code=400, detail="Invalid tier for checkout")
            
        # Get user data
        user_data = get_supabase_client().table('users').select('*').eq('id', user_id).execute()
        if not user_data.data:
            raise HTTPException(status_code=404, detail="User not found")
            
        user = user_data.data[0]
        
        # Create or get Stripe customer
        if user.get('stripe_customer_id'):
            customer_id = user['stripe_customer_id']
        else:
            customer = stripe.Customer.create(
                email=user['email'],
                metadata={'user_id': user_id}
            )
            customer_id = customer.id
            
            # Update user with Stripe customer ID
            get_supabase_client().table('users').update({
                "stripe_customer_id": customer_id
            }).eq('id', user_id).execute()
        
        # Create checkout session
        price_id = os.getenv(f"STRIPE_PRICE_{tier.upper()}")
        
        session = stripe.checkout.Session.create(
            customer=customer_id,
            payment_method_types=['card'],
            line_items=[{
                'price': price_id,
                'quantity': 1,
            }],
            mode='subscription',
            success_url=os.getenv("STRIPE_SUCCESS_URL"),
            cancel_url=os.getenv("STRIPE_CANCEL_URL"),
            metadata={'user_id': user_id, 'tier': tier}
        )
        
        return {"checkout_url": session.url}
        
    except Exception as e:
        logger.error(f"Stripe checkout error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create checkout session")

@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    """Handle Stripe webhooks for subscription updates"""
    try:
        payload = await request.body()
        sig_header = request.headers.get('stripe-signature')
        endpoint_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
        
        event = stripe.Webhook.construct_event(
            payload, sig_header, endpoint_secret
        )
        
        if event['type'] == 'checkout.session.completed':
            session = event['data']['object']
            user_id = session['metadata']['user_id']
            tier = session['metadata']['tier']
            
            # Update user tier
            get_supabase_client().table('users').update({
                "subscription_tier": tier
            }).eq('id', user_id).execute()
            
            logger.info(f"Updated user {user_id} to tier {tier}")
            
        elif event['type'] == 'customer.subscription.deleted':
            # Handle subscription cancellation
            subscription = event['data']['object']
            customer_id = subscription['customer']
            
            # Find user by Stripe customer ID
            user_data = get_supabase_client().table('users').select('*').eq('stripe_customer_id', customer_id).execute()
            if user_data.data:
                user_id = user_data.data[0]['id']
                
                # Downgrade to free tier
                get_supabase_client().table('users').update({
                    "subscription_tier": "free"
                }).eq('id', user_id).execute()
                
                logger.info(f"Downgraded user {user_id} to free tier")
        
        return {"status": "success"}
        
    except Exception as e:
        logger.error(f"Stripe webhook error: {e}")
        raise HTTPException(status_code=400, detail="Webhook processing failed")

@router.get("/tiers")
async def get_tier_info():
    """Get information about all subscription tiers"""
    return {tier: info.dict() for tier, info in TIER_LIMITS.items()}

@router.get("/health")
async def auth_health():
    """Simple health check for auth service"""
    return {"status": "ok", "service": "auth"}

