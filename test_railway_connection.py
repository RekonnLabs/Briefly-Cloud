#!/usr/bin/env python3
"""
Test script to verify Railway backend connectivity
"""

import requests
import json

def test_railway_backend():
    """Test if the Railway backend is accessible"""
    
    backend_url = "https://briefly-cloud-production.up.railway.app"
    
    print("🔍 Testing Railway Backend Connectivity")
    print("=" * 50)
    print(f"Backend URL: {backend_url}")
    print()
    
    # Test basic health endpoint
    print("1. Testing basic health endpoint...")
    try:
        response = requests.get(f"{backend_url}/health", timeout=10)
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"   Response: {json.dumps(data, indent=2)}")
            print("   ✅ Basic health check PASSED")
        else:
            print(f"   ❌ Health check failed with status {response.status_code}")
            print(f"   Response: {response.text}")
    except requests.exceptions.RequestException as e:
        print(f"   ❌ Health check FAILED: {e}")
    
    print()
    
    # Test root endpoint
    print("2. Testing root endpoint...")
    try:
        response = requests.get(f"{backend_url}/", timeout=10)
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"   Response: {json.dumps(data, indent=2)}")
            print("   ✅ Root endpoint PASSED")
        else:
            print(f"   ❌ Root endpoint failed with status {response.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"   ❌ Root endpoint FAILED: {e}")
    
    print()
    
    # Test storage health endpoint
    print("3. Testing storage health endpoint...")
    try:
        response = requests.get(f"{backend_url}/api/storage/health", timeout=10)
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"   Response: {json.dumps(data, indent=2)}")
            print("   ✅ Storage health check PASSED")
        else:
            print(f"   ❌ Storage health check failed with status {response.status_code}")
            print(f"   Response: {response.text}")
    except requests.exceptions.RequestException as e:
        print(f"   ❌ Storage health check FAILED: {e}")
    
    print()
    
    # Test OAuth endpoint (should fail with proper error)
    print("4. Testing Google OAuth endpoint (should return error)...")
    try:
        response = requests.get(f"{backend_url}/api/storage/google/auth?user_id=test", timeout=10)
        print(f"   Status: {response.status_code}")
        if response.status_code in [400, 501]:  # Expected error codes
            data = response.json()
            print(f"   Response: {json.dumps(data, indent=2)}")
            print("   ✅ OAuth endpoint responding correctly (with expected error)")
        else:
            print(f"   ⚠️ Unexpected status code: {response.status_code}")
            print(f"   Response: {response.text}")
    except requests.exceptions.RequestException as e:
        print(f"   ❌ OAuth endpoint test FAILED: {e}")
    
    print()
    print("=" * 50)
    print("🔗 If all tests pass, the backend is accessible from the internet.")
    print("🔗 If tests fail, there might be a Railway deployment issue.")

if __name__ == "__main__":
    test_railway_backend()