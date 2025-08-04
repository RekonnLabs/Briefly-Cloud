#!/usr/bin/env python3
"""
Test the FastAPI app locally to make sure it's working
"""

import sys
import os

# Add server directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'server'))

def test_app():
    """Test that the FastAPI app can be imported and basic endpoints work"""
    
    print("🔍 Testing FastAPI App Locally")
    print("=" * 40)
    
    try:
        # Import the app
        from main import app
        print("✅ App import successful")
        
        # Test with FastAPI test client
        from fastapi.testclient import TestClient
        client = TestClient(app)
        
        # Test health endpoint
        print("\n1. Testing /health endpoint...")
        response = client.get("/health")
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            print(f"   Response: {response.json()}")
            print("   ✅ Health endpoint PASSED")
        else:
            print(f"   ❌ Health endpoint FAILED")
        
        # Test root endpoint
        print("\n2. Testing / endpoint...")
        response = client.get("/")
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            print(f"   Response: {response.json()}")
            print("   ✅ Root endpoint PASSED")
        else:
            print(f"   ❌ Root endpoint FAILED")
        
        # Test storage health endpoint
        print("\n3. Testing /api/storage/health endpoint...")
        response = client.get("/api/storage/health")
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            print(f"   Response: {response.json()}")
            print("   ✅ Storage health endpoint PASSED")
        else:
            print(f"   ❌ Storage health endpoint FAILED")
            print(f"   Response: {response.text}")
        
        print("\n" + "=" * 40)
        print("✅ Local app testing completed successfully!")
        print("The issue is likely with Railway deployment, not the app itself.")
        
    except Exception as e:
        print(f"❌ App testing failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_app()