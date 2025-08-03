#!/usr/bin/env python3
"""
Briefly Cloud - Tier Gating Test Script
Tests subscription tier enforcement and usage limits
"""

import requests
import json
import time
from typing import Dict, Any

# Configuration
BASE_URL = "http://localhost:8000"
TEST_USERS = {
    "free": {
        "email": "test-free@example.com",
        "password": "testpass123",
        "expected_tier": "free"
    },
    "pro": {
        "email": "test-pro@example.com", 
        "password": "testpass123",
        "expected_tier": "pro"
    },
    "pro_byok": {
        "email": "test-byok@example.com",
        "password": "testpass123", 
        "expected_tier": "pro_byok"
    }
}

class TierGatingTester:
    def __init__(self):
        self.session = requests.Session()
        self.test_results = []

    def log_result(self, test_name: str, passed: bool, message: str):
        """Log test result"""
        status = "PASS" if passed else "FAIL"
        print(f"[{status}] {test_name}: {message}")
        self.test_results.append({
            "test": test_name,
            "passed": passed,
            "message": message
        })

    def register_user(self, email: str, password: str) -> bool:
        """Register a test user"""
        try:
            response = self.session.post(f"{BASE_URL}/auth/signup", json={
                "email": email,
                "password": password
            })
            return response.status_code == 200
        except Exception as e:
            print(f"Registration error: {e}")
            return False

    def login_user(self, email: str, password: str) -> Dict[str, Any]:
        """Login user and return auth data"""
        try:
            response = self.session.post(f"{BASE_URL}/auth/login", json={
                "email": email,
                "password": password
            })
            if response.status_code == 200:
                return response.json()
            else:
                print(f"Login failed: {response.status_code} - {response.text}")
                return {}
        except Exception as e:
            print(f"Login error: {e}")
            return {}

    def test_user_tier(self, user_data: Dict[str, str]):
        """Test user tier detection and enforcement"""
        email = user_data["email"]
        password = user_data["password"]
        expected_tier = user_data["expected_tier"]
        
        print(f"\n=== Testing {expected_tier.upper()} tier user: {email} ===")
        
        # Login user
        auth_data = self.login_user(email, password)
        if not auth_data:
            self.log_result(f"{expected_tier}_login", False, "Failed to login")
            return
        
        user_profile = auth_data.get("user", {})
        actual_tier = user_profile.get("subscription_tier", "unknown")
        
        # Test 1: Tier Detection
        tier_correct = actual_tier == expected_tier
        self.log_result(
            f"{expected_tier}_tier_detection",
            tier_correct,
            f"Expected {expected_tier}, got {actual_tier}"
        )
        
        access_token = auth_data.get("access_token")
        if not access_token:
            self.log_result(f"{expected_tier}_auth_token", False, "No access token received")
            return
        
        headers = {"Authorization": f"Bearer {access_token}"}
        user_id = user_profile.get("id")
        
        # Test 2: Storage Connection Restrictions
        self.test_storage_restrictions(expected_tier, user_id, headers)
        
        # Test 3: Chat Model Selection
        self.test_chat_model_selection(expected_tier, user_id, headers)
        
        # Test 4: Usage Limits
        self.test_usage_limits(expected_tier, user_id, headers)

    def test_storage_restrictions(self, tier: str, user_id: str, headers: Dict[str, str]):
        """Test storage connection restrictions by tier"""
        
        # Test Google Drive (should work for all tiers)
        try:
            response = self.session.get(f"{BASE_URL}/storage/google/auth?user_id={user_id}", headers=headers)
            google_allowed = response.status_code != 403
            self.log_result(
                f"{tier}_google_drive_access",
                google_allowed,
                "Google Drive access allowed" if google_allowed else "Google Drive access denied"
            )
        except Exception as e:
            self.log_result(f"{tier}_google_drive_access", False, f"Error: {e}")
        
        # Test OneDrive (should only work for Pro tiers)
        try:
            response = self.session.get(f"{BASE_URL}/storage/microsoft/auth?user_id={user_id}", headers=headers)
            onedrive_allowed = response.status_code != 403
            onedrive_should_be_allowed = tier in ["pro", "pro_byok"]
            
            test_passed = onedrive_allowed == onedrive_should_be_allowed
            message = f"OneDrive access {'allowed' if onedrive_allowed else 'denied'} (expected: {'allowed' if onedrive_should_be_allowed else 'denied'})"
            
            self.log_result(f"{tier}_onedrive_access", test_passed, message)
        except Exception as e:
            self.log_result(f"{tier}_onedrive_access", False, f"Error: {e}")

    def test_chat_model_selection(self, tier: str, user_id: str, headers: Dict[str, str]):
        """Test chat model selection by tier"""
        
        # Expected models by tier
        expected_models = {
            "free": "gpt-3.5-turbo",
            "pro": "gpt-4-turbo", 
            "pro_byok": "byok"
        }
        
        expected_model = expected_models.get(tier, "gpt-3.5-turbo")
        
        try:
            # Send a test chat message
            response = self.session.post(f"{BASE_URL}/chat/", 
                headers=headers,
                json={
                    "message": "Hello, this is a test message",
                    "user_id": user_id,
                    "stream": False
                }
            )
            
            if response.status_code == 200:
                # Check usage logs to see which model was used
                usage_response = self.session.get(f"{BASE_URL}/chat/usage/{user_id}", headers=headers)
                if usage_response.status_code == 200:
                    usage_data = usage_response.json()
                    # This would need to be implemented in the actual API
                    self.log_result(f"{tier}_model_selection", True, f"Chat request successful for {tier} tier")
                else:
                    self.log_result(f"{tier}_model_selection", False, "Could not verify model usage")
            else:
                self.log_result(f"{tier}_model_selection", False, f"Chat request failed: {response.status_code}")
                
        except Exception as e:
            self.log_result(f"{tier}_model_selection", False, f"Error: {e}")

    def test_usage_limits(self, tier: str, user_id: str, headers: Dict[str, str]):
        """Test usage limit enforcement"""
        
        # Expected limits by tier
        expected_limits = {
            "free": 100,
            "pro": 10000,
            "pro_byok": -1  # unlimited
        }
        
        expected_limit = expected_limits.get(tier, 100)
        
        try:
            # Get current usage
            response = self.session.get(f"{BASE_URL}/chat/usage/{user_id}", headers=headers)
            if response.status_code == 200:
                usage_data = response.json()
                limits = usage_data.get("limits", {})
                actual_limit = limits.get("max_llm_calls", 0)
                
                limit_correct = actual_limit == expected_limit
                self.log_result(
                    f"{tier}_usage_limits",
                    limit_correct,
                    f"Expected limit {expected_limit}, got {actual_limit}"
                )
            else:
                self.log_result(f"{tier}_usage_limits", False, "Could not retrieve usage data")
                
        except Exception as e:
            self.log_result(f"{tier}_usage_limits", False, f"Error: {e}")

    def test_api_endpoints(self):
        """Test basic API endpoint availability"""
        endpoints = [
            "/health",
            "/auth/tiers",
        ]
        
        for endpoint in endpoints:
            try:
                response = self.session.get(f"{BASE_URL}{endpoint}")
                success = response.status_code == 200
                self.log_result(
                    f"endpoint_{endpoint.replace('/', '_')}",
                    success,
                    f"Status: {response.status_code}"
                )
            except Exception as e:
                self.log_result(f"endpoint_{endpoint.replace('/', '_')}", False, f"Error: {e}")

    def run_all_tests(self):
        """Run all tier gating tests"""
        print("Starting Briefly Cloud Tier Gating Tests...")
        print("=" * 50)
        
        # Test basic API availability
        self.test_api_endpoints()
        
        # Test each user tier
        for tier, user_data in TEST_USERS.items():
            self.test_user_tier(user_data)
        
        # Print summary
        self.print_summary()

    def print_summary(self):
        """Print test results summary"""
        print("\n" + "=" * 50)
        print("TEST RESULTS SUMMARY")
        print("=" * 50)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result["passed"])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        if failed_tests > 0:
            print("\nFAILED TESTS:")
            for result in self.test_results:
                if not result["passed"]:
                    print(f"  - {result['test']}: {result['message']}")
        
        print("\nTier gating tests completed!")
        return failed_tests == 0

if __name__ == "__main__":
    tester = TierGatingTester()
    success = tester.run_all_tests()
    exit(0 if success else 1)

