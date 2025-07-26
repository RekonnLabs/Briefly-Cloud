#!/usr/bin/env python3
"""
API Key Validation Script for Briefly Cloud
Tests all configured API keys and services
"""

import os
import sys
import asyncio
import aiohttp
import json
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class APITester:
    def __init__(self):
        self.results = {}
        self.total_tests = 0
        self.passed_tests = 0

    def log_result(self, service, success, message=""):
        """Log test result"""
        self.total_tests += 1
        if success:
            self.passed_tests += 1
            print(f"✅ {service}: PASSED {message}")
        else:
            print(f"❌ {service}: FAILED {message}")
        
        self.results[service] = {
            "success": success,
            "message": message,
            "timestamp": datetime.utcnow().isoformat()
        }

    async def test_openai(self):
        """Test OpenAI API Key"""
        try:
            api_key = os.getenv('OPENAI_API_KEY')
            if not api_key:
                self.log_result("OpenAI", False, "API key not found in environment")
                return

            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.get('https://api.openai.com/v1/models', headers=headers) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        model_count = len(data.get('data', []))
                        self.log_result("OpenAI", True, f"- {model_count} models available")
                    else:
                        error_text = await resp.text()
                        self.log_result("OpenAI", False, f"- HTTP {resp.status}: {error_text[:100]}")
        except Exception as e:
            self.log_result("OpenAI", False, f"- Exception: {str(e)}")

    async def test_chroma_cloud(self):
        """Test Chroma Cloud API"""
        try:
            api_key = os.getenv('CHROMA_API_KEY')
            tenant_id = os.getenv('CHROMA_TENANT_ID')
            cloud_url = os.getenv('CHROMA_CLOUD_URL')
            
            if not all([api_key, tenant_id, cloud_url]):
                self.log_result("Chroma Cloud", False, "Missing API key, tenant ID, or URL")
                return

            headers = {
                "Authorization": f"Bearer {api_key}",
                "X-Chroma-Token": api_key
            }
            
            async with aiohttp.ClientSession() as session:
                # Test heartbeat endpoint
                async with session.get(f"{cloud_url}/api/v1/heartbeat", headers=headers) as resp:
                    if resp.status == 200:
                        self.log_result("Chroma Cloud", True, f"- Connected to {cloud_url}")
                    else:
                        error_text = await resp.text()
                        self.log_result("Chroma Cloud", False, f"- HTTP {resp.status}: {error_text[:100]}")
        except Exception as e:
            self.log_result("Chroma Cloud", False, f"- Exception: {str(e)}")

    async def test_supabase(self):
        """Test Supabase Connection"""
        try:
            url = os.getenv('SUPABASE_URL')
            anon_key = os.getenv('SUPABASE_ANON_KEY')
            
            if not all([url, anon_key]):
                self.log_result("Supabase", False, "Missing URL or anon key")
                return

            headers = {
                "apikey": anon_key,
                "Authorization": f"Bearer {anon_key}",
                "Content-Type": "application/json"
            }
            
            async with aiohttp.ClientSession() as session:
                # Test REST API endpoint
                async with session.get(f"{url}/rest/v1/", headers=headers) as resp:
                    if resp.status == 200:
                        self.log_result("Supabase", True, f"- Connected to {url}")
                    else:
                        error_text = await resp.text()
                        self.log_result("Supabase", False, f"- HTTP {resp.status}: {error_text[:100]}")
        except Exception as e:
            self.log_result("Supabase", False, f"- Exception: {str(e)}")

    async def test_stripe(self):
        """Test Stripe API Key"""
        try:
            api_key = os.getenv('STRIPE_SECRET_KEY')
            if not api_key:
                self.log_result("Stripe", False, "API key not found in environment")
                return

            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/x-www-form-urlencoded"
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.get('https://api.stripe.com/v1/account', headers=headers) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        account_id = data.get('id', 'Unknown')
                        self.log_result("Stripe", True, f"- Account ID: {account_id}")
                    else:
                        error_text = await resp.text()
                        self.log_result("Stripe", False, f"- HTTP {resp.status}: {error_text[:100]}")
        except Exception as e:
            self.log_result("Stripe", False, f"- Exception: {str(e)}")

    def test_google_oauth(self):
        """Test Google OAuth Configuration"""
        client_id = os.getenv('GOOGLE_CLIENT_ID')
        client_secret = os.getenv('GOOGLE_CLIENT_SECRET')
        
        if not all([client_id, client_secret]):
            self.log_result("Google OAuth", False, "Missing client ID or secret")
            return
        
        # Basic validation of client ID format
        if client_id.endswith('.apps.googleusercontent.com'):
            self.log_result("Google OAuth", True, f"- Client ID format valid")
        else:
            self.log_result("Google OAuth", False, "- Client ID format invalid")

    def test_azure_oauth(self):
        """Test Azure OAuth Configuration"""
        client_id = os.getenv('AZURE_CLIENT_ID')
        client_secret = os.getenv('AZURE_CLIENT_SECRET')
        
        if not all([client_id, client_secret]):
            self.log_result("Azure OAuth", False, "Missing client ID or secret")
            return
        
        # Basic validation
        if len(client_id) > 30:  # Azure client IDs are typically UUIDs
            self.log_result("Azure OAuth", True, f"- Client ID format valid")
        else:
            self.log_result("Azure OAuth", False, "- Client ID format invalid")

    async def run_all_tests(self):
        """Run all API tests"""
        print("🧪 BRIEFLY CLOUD API KEY VALIDATION")
        print("=" * 50)
        print(f"Started at: {datetime.utcnow().isoformat()}")
        print()

        # Run async tests
        await self.test_openai()
        await self.test_chroma_cloud()
        await self.test_supabase()
        await self.test_stripe()
        
        # Run sync tests
        self.test_google_oauth()
        self.test_azure_oauth()

        # Print summary
        print()
        print("📊 TEST SUMMARY")
        print("=" * 50)
        print(f"Total Tests: {self.total_tests}")
        print(f"Passed: {self.passed_tests}")
        print(f"Failed: {self.total_tests - self.passed_tests}")
        print(f"Success Rate: {(self.passed_tests/self.total_tests)*100:.1f}%")
        
        if self.passed_tests == self.total_tests:
            print("\n🎉 ALL TESTS PASSED! Your Briefly Cloud is ready for testing!")
        else:
            print(f"\n⚠️  {self.total_tests - self.passed_tests} tests failed. Please check your .env configuration.")
        
        # Save results to file
        with open('api_test_results.json', 'w') as f:
            json.dump({
                "timestamp": datetime.utcnow().isoformat(),
                "summary": {
                    "total": self.total_tests,
                    "passed": self.passed_tests,
                    "failed": self.total_tests - self.passed_tests,
                    "success_rate": (self.passed_tests/self.total_tests)*100
                },
                "results": self.results
            }, f, indent=2)
        
        print(f"\n📄 Detailed results saved to: api_test_results.json")

def main():
    """Main function"""
    if not os.path.exists('.env'):
        print("❌ .env file not found. Please create one with your API keys.")
        sys.exit(1)
    
    tester = APITester()
    asyncio.run(tester.run_all_tests())

if __name__ == "__main__":
    main()

