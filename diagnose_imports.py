#!/usr/bin/env python3
"""
Comprehensive import diagnostic script
Tests all imports that might be causing Railway deployment failures
"""
import sys
import os
import traceback

print("🔍 Briefly Cloud Import Diagnostics")
print("=" * 50)

# Add server directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'server'))

def test_import(module_name, description):
    """Test importing a module and report results"""
    try:
        if '.' in module_name:
            # Handle from X import Y syntax
            parts = module_name.split('.')
            if len(parts) == 2 and ' import ' in module_name:
                exec(f"from {parts[0]} import {parts[1]}")
            else:
                __import__(module_name)
        else:
            __import__(module_name)
        print(f"✅ {description}: SUCCESS")
        return True
    except Exception as e:
        print(f"❌ {description}: FAILED - {e}")
        return False

# Test basic Python modules
print("\n📦 Basic Python Modules:")
test_import("os", "OS module")
test_import("sys", "Sys module")
test_import("json", "JSON module")
test_import("logging", "Logging module")

# Test FastAPI and related
print("\n🚀 FastAPI and Web Modules:")
test_import("fastapi", "FastAPI")
test_import("uvicorn", "Uvicorn")
test_import("pydantic", "Pydantic")
test_import("httpx", "HTTPX")

# Test authentication modules
print("\n🔐 Authentication Modules:")
test_import("supabase", "Supabase client")
test_import("jose", "Python JOSE")
test_import("passlib", "Passlib")

# Test API clients
print("\n🌐 API Client Modules:")
test_import("openai", "OpenAI client")
test_import("stripe", "Stripe client")
test_import("google.auth", "Google Auth")
test_import("msal", "Microsoft MSAL")

# Test document processing
print("\n📄 Document Processing Modules:")
test_import("docx", "Python-docx")
test_import("pdfplumber", "PDF Plumber")
test_import("openpyxl", "OpenPyXL")
test_import("pptx", "Python-pptx")

# Test ML modules (expected to fail)
print("\n🤖 ML Modules (expected to fail in cloud):")
test_import("chromadb", "ChromaDB")
test_import("sentence_transformers", "Sentence Transformers")
test_import("torch", "PyTorch")

# Test our custom modules
print("\n🏠 Custom Modules:")
test_import("vector_store", "Vector Store module")

# Test route modules
print("\n🛣️ Route Modules:")
test_import("routes.auth", "Auth routes")
test_import("routes.storage", "Storage routes") 
test_import("routes.chat", "Chat routes")
test_import("routes.embed", "Embed routes")
test_import("routes.usage", "Usage routes")

# Test main server import
print("\n🖥️ Main Server:")
try:
    from server.main import app
    print("✅ Server main app: SUCCESS")
    print(f"   App type: {type(app)}")
    print(f"   Routes count: {len(app.routes)}")
    
    # Test a few key routes
    route_paths = [route.path for route in app.routes if hasattr(route, 'path')]
    print(f"   Sample routes: {route_paths[:5]}")
    
except Exception as e:
    print(f"❌ Server main app: FAILED - {e}")
    print(f"   Traceback: {traceback.format_exc()}")

print("\n" + "=" * 50)
print("🏁 Diagnostic Complete")

# Environment info
print(f"\n🌍 Environment Info:")
print(f"   Python version: {sys.version}")
print(f"   Working directory: {os.getcwd()}")
print(f"   Python path: {sys.path[:3]}...")  # First 3 entries