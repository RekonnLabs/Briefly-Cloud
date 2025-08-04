#!/usr/bin/env python3
"""
Test script to check port configuration
"""

import os
from dotenv import load_dotenv

def test_port_config():
    """Test port configuration"""
    
    load_dotenv()
    
    print("🔍 Testing Port Configuration")
    print("=" * 40)
    
    port_env = os.getenv("PORT")
    print(f"PORT environment variable: {repr(port_env)}")
    
    if port_env is None:
        print("❌ PORT not set, will use default")
        port = 8000
    else:
        try:
            port = int(port_env)
            print(f"✅ PORT parsed successfully: {port}")
        except (ValueError, TypeError) as e:
            print(f"❌ PORT parsing failed: {e}")
            print(f"   Raw value: {repr(port_env)}")
            port = 8000
    
    print(f"Final port: {port}")
    
    # Test other environment variables
    print("\n🔍 Other Environment Variables:")
    print(f"ENVIRONMENT: {os.getenv('ENVIRONMENT', 'not set')}")
    print(f"DEBUG: {os.getenv('DEBUG', 'not set')}")
    print(f"HOST: {os.getenv('HOST', 'not set')}")

if __name__ == "__main__":
    test_port_config()