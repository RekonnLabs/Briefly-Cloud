#!/usr/bin/env python3
"""
Test production endpoints
"""
import requests
import json

BASE_URL = "https://briefly-cloud-production.up.railway.app"

def test_endpoints():
    """Test key production endpoints"""
    
    tests = [
        {
            "name": "Health Check",
            "url": f"{BASE_URL}/health",
            "expected_status": 200,
            "expected_content": "healthy"
        },
        {
            "name": "Root Endpoint", 
            "url": f"{BASE_URL}/",
            "expected_status": 200,
            "expected_content": "running"
        }
    ]
    
    print("🧪 Testing Production Endpoints...")
    print(f"Base URL: {BASE_URL}")
    print("-" * 50)
    
    all_passed = True
    
    for test in tests:
        try:
            print(f"Testing {test['name']}...")
            response = requests.get(test['url'], timeout=10)
            
            if response.status_code == test['expected_status']:
                if test['expected_content'] in response.text:
                    print(f"  ✅ {test['name']} - PASSED")
                else:
                    print(f"  ⚠️  {test['name']} - Status OK but unexpected content")
                    print(f"     Response: {response.text[:100]}...")
            else:
                print(f"  ❌ {test['name']} - FAILED (Status: {response.status_code})")
                all_passed = False
                
        except Exception as e:
            print(f"  ❌ {test['name']} - ERROR: {e}")
            all_passed = False
    
    print("-" * 50)
    if all_passed:
        print("🎉 All tests PASSED! Production is ready!")
    else:
        print("⚠️  Some tests failed. Check the issues above.")
    
    return all_passed

if __name__ == "__main__":
    test_endpoints()