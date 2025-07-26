#!/usr/bin/env python3
"""
Complete Integration Test for Briefly Cloud
Tests the entire user workflow from registration to chat
"""

import os
import sys
import asyncio
import aiohttp
import json
import tempfile
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class IntegrationTester:
    def __init__(self):
        self.base_url = "http://localhost:8000"
        self.session = None
        self.test_user_email = f"test_{int(datetime.utcnow().timestamp())}@example.com"
        self.test_password = "TestPassword123!"
        self.auth_token = None
        self.results = []

    def log_test(self, test_name, success, message="", data=None):
        """Log test result"""
        result = {
            "test": test_name,
            "success": success,
            "message": message,
            "timestamp": datetime.utcnow().isoformat(),
            "data": data
        }
        self.results.append(result)
        
        status = "✅ PASSED" if success else "❌ FAILED"
        print(f"{status} - {test_name}: {message}")

    async def setup_session(self):
        """Setup HTTP session"""
        self.session = aiohttp.ClientSession()

    async def cleanup_session(self):
        """Cleanup HTTP session"""
        if self.session:
            await self.session.close()

    async def test_server_health(self):
        """Test if server is running and healthy"""
        try:
            async with self.session.get(f"{self.base_url}/health") as resp:
                if resp.status == 200:
                    data = await resp.json()
                    self.log_test("Server Health", True, f"Server is healthy", data)
                    return True
                else:
                    self.log_test("Server Health", False, f"HTTP {resp.status}")
                    return False
        except Exception as e:
            self.log_test("Server Health", False, f"Connection failed: {str(e)}")
            return False

    async def test_user_registration(self):
        """Test user registration"""
        try:
            register_data = {
                "email": self.test_user_email,
                "password": self.test_password,
                "full_name": "Test User"
            }
            
            async with self.session.post(f"{self.base_url}/auth/register", json=register_data) as resp:
                if resp.status in [200, 201]:
                    data = await resp.json()
                    self.log_test("User Registration", True, f"User created: {self.test_user_email}")
                    return True
                else:
                    error_text = await resp.text()
                    self.log_test("User Registration", False, f"HTTP {resp.status}: {error_text[:100]}")
                    return False
        except Exception as e:
            self.log_test("User Registration", False, f"Exception: {str(e)}")
            return False

    async def test_user_login(self):
        """Test user login"""
        try:
            login_data = {
                "email": self.test_user_email,
                "password": self.test_password
            }
            
            async with self.session.post(f"{self.base_url}/auth/login", json=login_data) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    self.auth_token = data.get('access_token') or data.get('token')
                    self.log_test("User Login", True, f"Login successful, token received")
                    return True
                else:
                    error_text = await resp.text()
                    self.log_test("User Login", False, f"HTTP {resp.status}: {error_text[:100]}")
                    return False
        except Exception as e:
            self.log_test("User Login", False, f"Exception: {str(e)}")
            return False

    async def test_document_upload(self):
        """Test document upload functionality"""
        try:
            # Create a test document
            test_content = """
            This is a test document for Briefly Cloud integration testing.
            
            Key Information:
            - Product: Briefly Cloud
            - Type: Cloud-based productivity assistant
            - Features: Document processing, AI chat, vector search
            - Technology: FastAPI, React, OpenAI, Chroma
            
            This document should be processed and indexed for vector search.
            """
            
            # Create temporary file
            with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
                f.write(test_content)
                temp_file_path = f.name
            
            # Upload the file
            headers = {}
            if self.auth_token:
                headers['Authorization'] = f'Bearer {self.auth_token}'
            
            with open(temp_file_path, 'rb') as f:
                data = aiohttp.FormData()
                data.add_field('file', f, filename='test_document.txt', content_type='text/plain')
                
                async with self.session.post(f"{self.base_url}/upload", data=data, headers=headers) as resp:
                    if resp.status in [200, 201]:
                        response_data = await resp.json()
                        self.log_test("Document Upload", True, f"File uploaded successfully")
                        return True
                    else:
                        error_text = await resp.text()
                        self.log_test("Document Upload", False, f"HTTP {resp.status}: {error_text[:100]}")
                        return False
            
            # Cleanup
            os.unlink(temp_file_path)
            
        except Exception as e:
            self.log_test("Document Upload", False, f"Exception: {str(e)}")
            return False

    async def test_vector_search(self):
        """Test vector search functionality"""
        try:
            headers = {}
            if self.auth_token:
                headers['Authorization'] = f'Bearer {self.auth_token}'
            
            search_data = {
                "query": "What is Briefly Cloud?",
                "max_results": 5
            }
            
            async with self.session.post(f"{self.base_url}/search", json=search_data, headers=headers) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    results_count = len(data.get('results', []))
                    self.log_test("Vector Search", True, f"Found {results_count} relevant documents")
                    return True
                else:
                    error_text = await resp.text()
                    self.log_test("Vector Search", False, f"HTTP {resp.status}: {error_text[:100]}")
                    return False
        except Exception as e:
            self.log_test("Vector Search", False, f"Exception: {str(e)}")
            return False

    async def test_chat_functionality(self):
        """Test AI chat functionality"""
        try:
            headers = {}
            if self.auth_token:
                headers['Authorization'] = f'Bearer {self.auth_token}'
            
            chat_data = {
                "message": "What is Briefly Cloud and what are its main features?",
                "conversation_id": f"test_conv_{int(datetime.utcnow().timestamp())}",
                "use_context": True
            }
            
            async with self.session.post(f"{self.base_url}/chat", json=chat_data, headers=headers) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    response_message = data.get('response', data.get('message', ''))
                    self.log_test("Chat Functionality", True, f"AI responded: {response_message[:100]}...")
                    return True
                else:
                    error_text = await resp.text()
                    self.log_test("Chat Functionality", False, f"HTTP {resp.status}: {error_text[:100]}")
                    return False
        except Exception as e:
            self.log_test("Chat Functionality", False, f"Exception: {str(e)}")
            return False

    async def test_conversation_history(self):
        """Test conversation history retrieval"""
        try:
            headers = {}
            if self.auth_token:
                headers['Authorization'] = f'Bearer {self.auth_token}'
            
            async with self.session.get(f"{self.base_url}/conversations", headers=headers) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    conv_count = len(data.get('conversations', []))
                    self.log_test("Conversation History", True, f"Retrieved {conv_count} conversations")
                    return True
                else:
                    error_text = await resp.text()
                    self.log_test("Conversation History", False, f"HTTP {resp.status}: {error_text[:100]}")
                    return False
        except Exception as e:
            self.log_test("Conversation History", False, f"Exception: {str(e)}")
            return False

    async def test_user_profile(self):
        """Test user profile retrieval"""
        try:
            headers = {}
            if self.auth_token:
                headers['Authorization'] = f'Bearer {self.auth_token}'
            
            async with self.session.get(f"{self.base_url}/profile", headers=headers) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    user_email = data.get('email', 'Unknown')
                    self.log_test("User Profile", True, f"Profile retrieved for: {user_email}")
                    return True
                else:
                    error_text = await resp.text()
                    self.log_test("User Profile", False, f"HTTP {resp.status}: {error_text[:100]}")
                    return False
        except Exception as e:
            self.log_test("User Profile", False, f"Exception: {str(e)}")
            return False

    async def run_integration_tests(self):
        """Run complete integration test suite"""
        print("🧪 BRIEFLY CLOUD INTEGRATION TESTS")
        print("=" * 50)
        print(f"Started at: {datetime.utcnow().isoformat()}")
        print(f"Test User: {self.test_user_email}")
        print(f"Server URL: {self.base_url}")
        print()

        await self.setup_session()
        
        try:
            # Core functionality tests
            tests = [
                ("Server Health Check", self.test_server_health),
                ("User Registration", self.test_user_registration),
                ("User Login", self.test_user_login),
                ("Document Upload", self.test_document_upload),
                ("Vector Search", self.test_vector_search),
                ("Chat Functionality", self.test_chat_functionality),
                ("Conversation History", self.test_conversation_history),
                ("User Profile", self.test_user_profile),
            ]
            
            passed_tests = 0
            total_tests = len(tests)
            
            for test_name, test_func in tests:
                print(f"\n🔄 Running: {test_name}")
                try:
                    success = await test_func()
                    if success:
                        passed_tests += 1
                except Exception as e:
                    self.log_test(test_name, False, f"Unexpected error: {str(e)}")
            
            # Print summary
            print("\n" + "=" * 50)
            print("📊 INTEGRATION TEST SUMMARY")
            print("=" * 50)
            print(f"Total Tests: {total_tests}")
            print(f"Passed: {passed_tests}")
            print(f"Failed: {total_tests - passed_tests}")
            print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
            
            if passed_tests == total_tests:
                print("\n🎉 ALL INTEGRATION TESTS PASSED!")
                print("Your Briefly Cloud is fully functional and ready for production!")
            else:
                print(f"\n⚠️  {total_tests - passed_tests} tests failed.")
                print("Please check the server logs and fix the issues before proceeding.")
            
            # Save detailed results
            with open('integration_test_results.json', 'w') as f:
                json.dump({
                    "timestamp": datetime.utcnow().isoformat(),
                    "test_user": self.test_user_email,
                    "server_url": self.base_url,
                    "summary": {
                        "total": total_tests,
                        "passed": passed_tests,
                        "failed": total_tests - passed_tests,
                        "success_rate": (passed_tests/total_tests)*100
                    },
                    "results": self.results
                }, f, indent=2)
            
            print(f"\n📄 Detailed results saved to: integration_test_results.json")
            
        finally:
            await self.cleanup_session()

def main():
    """Main function"""
    print("🚀 Starting Briefly Cloud Integration Tests...")
    print("Make sure your server is running on http://localhost:8000")
    print()
    
    # Check if server is likely running
    import socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(('127.0.0.1', 8000))
    sock.close()
    
    if result != 0:
        print("❌ Server doesn't appear to be running on port 8000")
        print("Please start your server with: npm run dev")
        sys.exit(1)
    
    tester = IntegrationTester()
    asyncio.run(tester.run_integration_tests())

if __name__ == "__main__":
    main()

