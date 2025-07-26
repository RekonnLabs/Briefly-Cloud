#!/usr/bin/env python3
"""
Test script to verify the missing API endpoints are now working
"""

import requests
import json
import sys

BASE_URL = "http://localhost:3001"

def test_endpoint(method, endpoint, expected_status=200):
    """Test an API endpoint"""
    url = f"{BASE_URL}{endpoint}"
    print(f"Testing {method} {endpoint}...")
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, timeout=5)
        elif method.upper() == "POST":
            response = requests.post(url, json={}, timeout=5)
        else:
            print(f"  ❌ Unsupported method: {method}")
            return False
        
        print(f"  Status: {response.status_code}")
        
        if response.status_code == expected_status:
            print(f"  ✅ SUCCESS")
            try:
                data = response.json()
                print(f"  Response: {json.dumps(data, indent=2)[:200]}...")
            except:
                print(f"  Response: {response.text[:200]}...")
            return True
        else:
            print(f"  ❌ FAILED - Expected {expected_status}, got {response.status_code}")
            print(f"  Response: {response.text[:200]}...")
            return False
            
    except requests.exceptions.ConnectionError:
        print(f"  ❌ CONNECTION ERROR - Server not running?")
        return False
    except requests.exceptions.Timeout:
        print(f"  ❌ TIMEOUT")
        return False
    except Exception as e:
        print(f"  ❌ ERROR: {e}")
        return False

def main():
    """Test all the previously missing endpoints"""
    print("Testing Missing API Endpoints")
    print("=" * 40)
    
    # Test the endpoints that were returning 404
    endpoints_to_test = [
        ("GET", "/api/storage/status"),
        ("GET", "/api/chat/history"), 
        ("GET", "/api/embed/status"),
        ("GET", "/health"),  # Should work
        ("GET", "/api/settings"),  # Should work
    ]
    
    results = []
    for method, endpoint in endpoints_to_test:
        success = test_endpoint(method, endpoint)
        results.append((endpoint, success))
        print()
    
    # Summary
    print("=" * 40)
    print("SUMMARY:")
    passed = 0
    for endpoint, success in results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"  {endpoint}: {status}")
        if success:
            passed += 1
    
    print(f"\nPassed: {passed}/{len(results)}")
    
    if passed == len(results):
        print("🎉 All endpoints are working!")
        sys.exit(0)
    else:
        print("⚠️  Some endpoints are still failing")
        sys.exit(1)

if __name__ == "__main__":
    main()