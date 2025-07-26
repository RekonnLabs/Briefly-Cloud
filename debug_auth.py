#!/usr/bin/env python3
"""
Debug authentication issues for Briefly Cloud
"""

import os
import requests
import json
from dotenv import load_dotenv

# Load environment variables
load_dotenv('server/.env')

def test_auth_endpoints():
    """Test authentication endpoints"""
    
    base_url = "http://localhost:3001"
    
    print("🔄 Testing authentication endpoints...")
    
    # Test login endpoint
    login_data = {
        "email": "rekonnlabs@gmail.com",
        "password": "testpassword123"
    }
    
    try:
        print(f"\n1. Testing POST {base_url}/api/auth/login")
        response = requests.post(
            f"{base_url}/api/auth/login",
            json=login_data,
            headers={"Content-Type": "application/json"}
        )
        
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print("✅ Login successful!")
            print(f"Token received: {'token' in data}")
            print(f"User data: {data.get('user', {})}")
            
            # Test profile endpoint with token
            if 'token' in data:
                print(f"\n2. Testing GET {base_url}/api/auth/profile")
                profile_response = requests.get(
                    f"{base_url}/api/auth/profile",
                    headers={"Authorization": f"Bearer {data['token']}"}
                )
                
                print(f"Status: {profile_response.status_code}")
                
                if profile_response.status_code == 200:
                    profile_data = profile_response.json()
                    print("✅ Profile fetch successful!")
                    print(f"Profile: {json.dumps(profile_data, indent=2)}")
                else:
                    print(f"❌ Profile fetch failed: {profile_response.text}")
            
        else:
            print(f"❌ Login failed: {response.text}")
            
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to server. Is it running on localhost:3001?")
    except Exception as e:
        print(f"❌ Error: {e}")

def test_other_endpoints():
    """Test other problematic endpoints"""
    
    base_url = "http://localhost:3001"
    
    endpoints = [
        "/api/settings",
        "/api/storage/status", 
        "/api/chat/history",
        "/api/embed/status",
        "/health"
    ]
    
    print(f"\n🔄 Testing other endpoints...")
    
    for endpoint in endpoints:
        try:
            print(f"\nTesting GET {base_url}{endpoint}")
            response = requests.get(f"{base_url}{endpoint}")
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                print("✅ Success")
            else:
                print(f"❌ Failed: {response.text[:100]}...")
                
        except Exception as e:
            print(f"❌ Error: {e}")

if __name__ == "__main__":
    print("Briefly Cloud - Authentication Debug")
    print("=" * 40)
    
    test_auth_endpoints()
    test_other_endpoints()
    
    print("\n" + "=" * 40)
    print("Debug complete!")
    print("\nIf login is still failing:")
    print("1. Run: python create_test_user.py")
    print("2. Check server logs for detailed errors")
    print("3. Verify Supabase credentials in server/.env")