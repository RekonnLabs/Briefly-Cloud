"""
Usage limits utility for Briefly Cloud
"""

import os
import logging

logger = logging.getLogger(__name__)

class UsageLimitError(Exception):
    """Exception raised when usage limits are exceeded"""
    pass

def check_and_increment_usage(user_id: str, usage_type: str = "chat"):
    """Check and increment usage - minimal implementation"""
    return True

def get_user_usage(user_id: str):
    """Get user usage stats - minimal implementation"""
    return {
        "chat_messages_count": 0,
        "documents_uploaded": 0,
        "api_calls_count": 0
    }