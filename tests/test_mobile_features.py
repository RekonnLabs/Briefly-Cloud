#!/usr/bin/env python3
"""
Mobile Features Testing Script for Briefly Cloud MVP

This script validates mobile-friendly features and PWA functionality.
Run this after deploying the application to test mobile responsiveness.
"""

import requests
import json
import time
import sys
from typing import Dict, List, Any
from urllib.parse import urljoin

class MobileTester:
    def __init__(self, base_url: str = "http://localhost:5173"):
        self.base_url = base_url
        self.api_base = base_url.replace("5173", "8000")  # Assume API on port 8000
        self.session = requests.Session()
        self.test_results = []
        
    def log_test(self, test_name: str, passed: bool, details: str = ""):
        """Log test result"""
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   {details}")
        
        self.test_results.append({
            "test": test_name,
            "passed": passed,
            "details": details
        })
    
    def test_responsive_layout(self):
        """Test responsive layout and mobile viewport"""
        print("\n🔍 Testing Responsive Layout...")
        
        try:
            # Test main page loads
            response = self.session.get(self.base_url)
            self.log_test(
                "Main page loads",
                response.status_code == 200,
                f"Status: {response.status_code}"
            )
            
            # Check for mobile viewport meta tag
            has_viewport = 'viewport' in response.text and 'width=device-width' in response.text
            self.log_test(
                "Mobile viewport meta tag present",
                has_viewport,
                "Found viewport meta tag" if has_viewport else "Missing viewport meta tag"
            )
            
            # Check for responsive CSS classes (Tailwind)
            has_responsive_classes = any(cls in response.text for cls in ['sm:', 'md:', 'lg:', 'xl:'])
            self.log_test(
                "Responsive CSS classes present",
                has_responsive_classes,
                "Found Tailwind responsive classes" if has_responsive_classes else "Missing responsive classes"
            )
            
            # Check for mobile-specific styles
            has_mobile_styles = 'overscroll-behavior' in response.text or 'touch-action' in response.text
            self.log_test(
                "Mobile-specific styles present",
                has_mobile_styles,
                "Found mobile touch styles" if has_mobile_styles else "No mobile-specific styles found"
            )
            
        except Exception as e:
            self.log_test("Responsive layout test", False, f"Error: {str(e)}")
    
    def test_pwa_manifest(self):
        """Test PWA manifest and service worker"""
        print("\n📱 Testing PWA Features...")
        
        try:
            # Test manifest.json
            manifest_url = urljoin(self.base_url, "/manifest.json")
            response = self.session.get(manifest_url)
            self.log_test(
                "PWA manifest accessible",
                response.status_code == 200,
                f"Manifest status: {response.status_code}"
            )
            
            if response.status_code == 200:
                try:
                    manifest = response.json()
                    required_fields = ['name', 'short_name', 'start_url', 'display', 'icons']
                    has_required = all(field in manifest for field in required_fields)
                    self.log_test(
                        "Manifest has required fields",
                        has_required,
                        f"Required fields present: {has_required}"
                    )
                    
                    # Check for standalone display mode
                    is_standalone = manifest.get('display') == 'standalone'
                    self.log_test(
                        "Standalone display mode",
                        is_standalone,
                        f"Display mode: {manifest.get('display', 'not set')}"
                    )
                    
                    # Check for icons
                    has_icons = len(manifest.get('icons', [])) > 0
                    self.log_test(
                        "App icons defined",
                        has_icons,
                        f"Icon count: {len(manifest.get('icons', []))}"
                    )
                    
                except json.JSONDecodeError:
                    self.log_test("Manifest JSON valid", False, "Invalid JSON in manifest")
            
            # Test service worker
            sw_url = urljoin(self.base_url, "/sw.js")
            response = self.session.get(sw_url)
            self.log_test(
                "Service worker accessible",
                response.status_code == 200,
                f"Service worker status: {response.status_code}"
            )
            
            if response.status_code == 200:
                sw_content = response.text
                has_cache_logic = 'caches.open' in sw_content
                has_fetch_handler = 'addEventListener(\'fetch\'' in sw_content
                has_install_handler = 'addEventListener(\'install\'' in sw_content
                
                self.log_test(
                    "Service worker has caching logic",
                    has_cache_logic,
                    "Found cache management code" if has_cache_logic else "No caching logic found"
                )
                
                self.log_test(
                    "Service worker has fetch handler",
                    has_fetch_handler,
                    "Found fetch event handler" if has_fetch_handler else "No fetch handler found"
                )
                
                self.log_test(
                    "Service worker has install handler",
                    has_install_handler,
                    "Found install event handler" if has_install_handler else "No install handler found"
                )
            
        except Exception as e:
            self.log_test("PWA features test", False, f"Error: {str(e)}")
    
    def test_mobile_auth_flow(self):
        """Test authentication flow on mobile"""
        print("\n🔐 Testing Mobile Auth Flow...")
        
        try:
            # Test auth endpoints exist
            auth_endpoints = [
                "/api/auth/login",
                "/api/auth/signup", 
                "/api/auth/profile"
            ]
            
            for endpoint in auth_endpoints:
                url = urljoin(self.api_base, endpoint)
                # Use HEAD request to check if endpoint exists
                response = self.session.head(url)
                endpoint_exists = response.status_code != 404
                self.log_test(
                    f"Auth endpoint {endpoint} exists",
                    endpoint_exists,
                    f"Status: {response.status_code}"
                )
            
            # Test OAuth endpoints
            oauth_endpoints = [
                "/api/storage/google/auth",
                "/api/storage/microsoft/auth"
            ]
            
            for endpoint in oauth_endpoints:
                url = urljoin(self.api_base, endpoint)
                response = self.session.head(url)
                endpoint_exists = response.status_code != 404
                self.log_test(
                    f"OAuth endpoint {endpoint} exists",
                    endpoint_exists,
                    f"Status: {response.status_code}"
                )
            
        except Exception as e:
            self.log_test("Mobile auth flow test", False, f"Error: {str(e)}")
    
    def test_mobile_chat_interface(self):
        """Test mobile chat interface features"""
        print("\n💬 Testing Mobile Chat Interface...")
        
        try:
            # Test main page for mobile chat elements
            response = self.session.get(self.base_url)
            content = response.text
            
            # Check for mobile-friendly input elements
            has_textarea = '<textarea' in content or 'Textarea' in content
            self.log_test(
                "Chat input textarea present",
                has_textarea,
                "Found textarea element" if has_textarea else "No textarea found"
            )
            
            # Check for mobile navigation
            has_mobile_menu = 'Menu' in content and ('hamburger' in content.lower() or 'mobile' in content.lower())
            self.log_test(
                "Mobile navigation menu",
                has_mobile_menu,
                "Found mobile menu indicators" if has_mobile_menu else "No mobile menu found"
            )
            
            # Check for responsive chat layout
            has_chat_responsive = any(cls in content for cls in ['flex-col', 'h-full', 'overflow-y'])
            self.log_test(
                "Responsive chat layout",
                has_chat_responsive,
                "Found responsive layout classes" if has_chat_responsive else "No responsive layout found"
            )
            
            # Check for mobile-specific touch optimizations
            has_touch_optimizations = any(opt in content for opt in ['touch-action', 'user-select', 'tap-highlight'])
            self.log_test(
                "Touch optimizations present",
                has_touch_optimizations,
                "Found touch optimization styles" if has_touch_optimizations else "No touch optimizations found"
            )
            
        except Exception as e:
            self.log_test("Mobile chat interface test", False, f"Error: {str(e)}")
    
    def test_mobile_settings_ui(self):
        """Test mobile settings and configuration UI"""
        print("\n⚙️ Testing Mobile Settings UI...")
        
        try:
            response = self.session.get(self.base_url)
            content = response.text
            
            # Check for settings components
            has_settings = 'Settings' in content or 'CloudSettings' in content
            self.log_test(
                "Settings component present",
                has_settings,
                "Found settings component" if has_settings else "No settings component found"
            )
            
            # Check for mobile-friendly modals/dialogs
            has_mobile_modals = any(modal in content for modal in ['fixed inset-0', 'z-50', 'overflow-y-auto'])
            self.log_test(
                "Mobile-friendly modals",
                has_mobile_modals,
                "Found mobile modal styles" if has_mobile_modals else "No mobile modal styles found"
            )
            
            # Check for responsive form elements
            has_responsive_forms = any(form in content for form in ['w-full', 'flex-col', 'space-y'])
            self.log_test(
                "Responsive form elements",
                has_responsive_forms,
                "Found responsive form styles" if has_responsive_forms else "No responsive form styles found"
            )
            
        except Exception as e:
            self.log_test("Mobile settings UI test", False, f"Error: {str(e)}")
    
    def test_mobile_performance(self):
        """Test mobile performance optimizations"""
        print("\n⚡ Testing Mobile Performance...")
        
        try:
            # Test page load time
            start_time = time.time()
            response = self.session.get(self.base_url)
            load_time = time.time() - start_time
            
            fast_load = load_time < 3.0  # Should load in under 3 seconds
            self.log_test(
                "Fast page load time",
                fast_load,
                f"Load time: {load_time:.2f}s"
            )
            
            # Check for preload/prefetch optimizations
            content = response.text
            has_preload = 'preload' in content or 'prefetch' in content
            self.log_test(
                "Resource preloading present",
                has_preload,
                "Found preload/prefetch directives" if has_preload else "No resource preloading found"
            )
            
            # Check for font optimization
            has_font_display = 'font-display' in content or 'preconnect' in content
            self.log_test(
                "Font loading optimization",
                has_font_display,
                "Found font optimization" if has_font_display else "No font optimization found"
            )
            
            # Check response size (should be reasonable for mobile)
            content_size = len(response.content)
            reasonable_size = content_size < 500000  # Less than 500KB
            self.log_test(
                "Reasonable page size",
                reasonable_size,
                f"Page size: {content_size / 1024:.1f}KB"
            )
            
        except Exception as e:
            self.log_test("Mobile performance test", False, f"Error: {str(e)}")
    
    def test_offline_functionality(self):
        """Test offline functionality and caching"""
        print("\n🔌 Testing Offline Functionality...")
        
        try:
            # Test if service worker registration is in the page
            response = self.session.get(self.base_url)
            content = response.text
            
            has_sw_registration = 'serviceWorker.register' in content
            self.log_test(
                "Service worker registration",
                has_sw_registration,
                "Found SW registration code" if has_sw_registration else "No SW registration found"
            )
            
            # Test if offline fallback is configured
            sw_response = self.session.get(urljoin(self.base_url, "/sw.js"))
            if sw_response.status_code == 200:
                sw_content = sw_response.text
                has_offline_fallback = 'offline' in sw_content.lower() and 'fallback' in sw_content.lower()
                self.log_test(
                    "Offline fallback configured",
                    has_offline_fallback,
                    "Found offline fallback logic" if has_offline_fallback else "No offline fallback found"
                )
                
                # Check for cache strategies
                has_cache_strategies = any(strategy in sw_content for strategy in ['cache-first', 'network-first', 'stale-while-revalidate'])
                self.log_test(
                    "Cache strategies implemented",
                    has_cache_strategies,
                    "Found cache strategy patterns" if has_cache_strategies else "No cache strategies found"
                )
            
        except Exception as e:
            self.log_test("Offline functionality test", False, f"Error: {str(e)}")
    
    def test_mobile_accessibility(self):
        """Test mobile accessibility features"""
        print("\n♿ Testing Mobile Accessibility...")
        
        try:
            response = self.session.get(self.base_url)
            content = response.text
            
            # Check for proper semantic HTML
            has_semantic_html = any(tag in content for tag in ['<main', '<nav', '<header', '<section'])
            self.log_test(
                "Semantic HTML elements",
                has_semantic_html,
                "Found semantic HTML tags" if has_semantic_html else "No semantic HTML found"
            )
            
            # Check for ARIA labels and roles
            has_aria = 'aria-' in content or 'role=' in content
            self.log_test(
                "ARIA attributes present",
                has_aria,
                "Found ARIA attributes" if has_aria else "No ARIA attributes found"
            )
            
            # Check for focus management
            has_focus_management = any(focus in content for focus in ['focus:', 'focus-visible', 'outline'])
            self.log_test(
                "Focus management styles",
                has_focus_management,
                "Found focus management" if has_focus_management else "No focus management found"
            )
            
            # Check for proper contrast (basic check for dark mode support)
            has_dark_mode = 'dark:' in content
            self.log_test(
                "Dark mode support",
                has_dark_mode,
                "Found dark mode classes" if has_dark_mode else "No dark mode support found"
            )
            
        except Exception as e:
            self.log_test("Mobile accessibility test", False, f"Error: {str(e)}")
    
    def run_all_tests(self):
        """Run all mobile tests"""
        print("🚀 Starting Mobile Features Testing for Briefly Cloud MVP")
        print(f"Testing URL: {self.base_url}")
        print("=" * 60)
        
        # Run all test categories
        self.test_responsive_layout()
        self.test_pwa_manifest()
        self.test_mobile_auth_flow()
        self.test_mobile_chat_interface()
        self.test_mobile_settings_ui()
        self.test_mobile_performance()
        self.test_offline_functionality()
        self.test_mobile_accessibility()
        
        # Generate summary
        self.generate_summary()
    
    def generate_summary(self):
        """Generate test summary"""
        print("\n" + "=" * 60)
        print("📊 MOBILE TESTING SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result['passed'])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {passed_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        if failed_tests > 0:
            print(f"\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result['passed']:
                    print(f"   • {result['test']}")
                    if result['details']:
                        print(f"     {result['details']}")
        
        print(f"\n🎯 MOBILE READINESS: {'READY' if failed_tests == 0 else 'NEEDS WORK'}")
        
        if failed_tests == 0:
            print("🎉 All mobile features are working correctly!")
            print("📱 Your app is ready for mobile users and PWA installation.")
        else:
            print("⚠️  Some mobile features need attention before production deployment.")
        
        return failed_tests == 0

def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Test mobile features for Briefly Cloud MVP")
    parser.add_argument("--url", default="http://localhost:5173", help="Base URL to test")
    parser.add_argument("--api-url", help="API base URL (defaults to port 8000)")
    
    args = parser.parse_args()
    
    tester = MobileTester(args.url)
    if args.api_url:
        tester.api_base = args.api_url
    
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()

