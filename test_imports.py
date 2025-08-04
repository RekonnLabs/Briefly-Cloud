#!/usr/bin/env python3
"""
Test script to check which imports are failing
"""

import sys
import os

# Add server directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'server'))

def test_imports():
    """Test importing each route module individually"""
    
    print("🔍 Testing Route Module Imports")
    print("=" * 40)
    
    modules = ['auth', 'storage', 'chat', 'embed', 'usage']
    
    for module_name in modules:
        try:
            module = __import__(f'routes.{module_name}', fromlist=[module_name])
            print(f"✅ routes.{module_name} - OK")
        except ImportError as e:
            print(f"❌ routes.{module_name} - FAILED: {e}")
        except Exception as e:
            print(f"⚠️ routes.{module_name} - ERROR: {e}")
    
    print("\n🔍 Testing Individual Dependencies")
    print("=" * 40)
    
    dependencies = [
        ('google.auth', 'Google Auth'),
        ('google_auth_oauthlib', 'Google OAuth'),
        ('googleapiclient', 'Google API Client'),
        ('msal', 'Microsoft MSAL'),
        ('supabase', 'Supabase'),
        ('openai', 'OpenAI'),
        ('stripe', 'Stripe'),
    ]
    
    for dep, name in dependencies:
        try:
            __import__(dep)
            print(f"✅ {name} ({dep}) - OK")
        except ImportError as e:
            print(f"❌ {name} ({dep}) - FAILED: {e}")

if __name__ == "__main__":
    test_imports()