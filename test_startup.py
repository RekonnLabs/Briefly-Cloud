#!/usr/bin/env python3
"""
Test that the app can start without errors
"""
import sys
import os

# Add server to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'server'))

def test_app_import():
    """Test that we can import the app"""
    try:
        print("🧪 Testing app import...")
        from main import app
        print("✅ App imported successfully")
        
        # Test health endpoint
        print("🧪 Testing health endpoint...")
        import asyncio
        
        async def test_health():
            from main import health_check
            result = await health_check()
            print(f"✅ Health check result: {result}")
            return result
        
        result = asyncio.run(test_health())
        
        if result.get("status") == "healthy":
            print("🎉 App startup test PASSED")
            return True
        else:
            print("❌ Health check failed")
            return False
            
    except Exception as e:
        print(f"❌ App startup test FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_app_import()
    sys.exit(0 if success else 1)