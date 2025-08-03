#!/usr/bin/env python3
"""
Test script to validate model selection based on subscription tiers
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'server'))

from routes.chat import determine_model, TIER_LIMITS

def test_model_selection():
    """Test that the correct models are selected for each tier"""
    
    print("🧪 Testing Model Selection Logic")
    print("=" * 50)
    
    # Test cases: (tier, api_key_hash, expected_model)
    test_cases = [
        ("free", None, "gpt-3.5-turbo"),
        ("free", "some_hash", "gpt-3.5-turbo"),  # Free users can't use BYOK
        ("pro", None, "gpt-4-turbo"),
        ("pro", "some_hash", "gpt-4-turbo"),  # Pro users get GPT-4 Turbo
        ("pro_byok", None, "gpt-3.5-turbo"),  # No API key = fallback to free
        ("pro_byok", "some_hash", "byok"),  # BYOK with API key
        ("unknown_tier", None, "gpt-3.5-turbo"),  # Unknown tier = fallback to free
    ]
    
    all_passed = True
    
    for tier, api_key_hash, expected_model in test_cases:
        actual_model = determine_model(tier, api_key_hash, "requested_model")
        
        if actual_model == expected_model:
            print(f"✅ {tier:12} | API Key: {bool(api_key_hash):5} | Expected: {expected_model:15} | Got: {actual_model}")
        else:
            print(f"❌ {tier:12} | API Key: {bool(api_key_hash):5} | Expected: {expected_model:15} | Got: {actual_model}")
            all_passed = False
    
    print("\n" + "=" * 50)
    print("📊 Tier Limits Configuration:")
    for tier, limits in TIER_LIMITS.items():
        print(f"  {tier:12} | Model: {limits['model']:15} | Chat Messages: {limits['chat_messages']:4} | Documents: {limits['documents']:4} | Storage: {limits['storage_bytes']//1024//1024}MB")
    
    print("\n" + "=" * 50)
    if all_passed:
        print("🎉 All tests passed! Model selection is working correctly.")
        return True
    else:
        print("💥 Some tests failed! Please check the model selection logic.")
        return False

if __name__ == "__main__":
    success = test_model_selection()
    sys.exit(0 if success else 1)