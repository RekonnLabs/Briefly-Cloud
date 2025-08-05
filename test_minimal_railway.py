#!/usr/bin/env python3
"""
Test the minimal Railway main.py
"""
import sys
import os

def test_minimal_app():
    """Test the minimal Railway app"""
    print("🧪 Testing minimal Railway app...")
    
    try:
        print("  Importing main app...")
        from main import app
        print("  ✅ Main app imported successfully")
        
        print("  Testing app routes...")
        routes = []
        for route in app.routes:
            if hasattr(route, 'path'):
                routes.append(route.path)
        
        print(f"  ✅ Found {len(routes)} routes: {routes}")
        
        expected_routes = ["/", "/health", "/api/test", "/api/diagnostics"]
        for expected in expected_routes:
            if expected in routes:
                print(f"  ✅ Route {expected} found")
            else:
                print(f"  ❌ Route {expected} missing")
        
        return True
        
    except Exception as e:
        print(f"  ❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_minimal_app()
    
    if success:
        print("\n✅ Minimal Railway app test PASSED")
        print("🚀 App should work on Railway")
    else:
        print("\n❌ Minimal Railway app test FAILED")
    
    sys.exit(0 if success else 1)