#!/usr/bin/env python3
"""
Deployment readiness check - verifies which dependencies are available
"""
import sys
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def check_dependencies():
    """Check which dependencies are available"""
    results = {}
    
    # Core dependencies (required)
    core_deps = [
        'fastapi',
        'uvicorn', 
        'supabase',
        'stripe',
        'httpx',
        'python_jose',
        'passlib'
    ]
    
    # Optional dependencies (for full functionality)
    optional_deps = [
        'chromadb',
        'sentence_transformers',
        'transformers',
        'google.auth',
        'googleapiclient',
        'msal',
        'numpy',
        'scipy'
    ]
    
    print("🔍 Checking Core Dependencies (Required):")
    for dep in core_deps:
        try:
            __import__(dep)
            results[dep] = True
            print(f"  ✅ {dep}")
        except ImportError:
            results[dep] = False
            print(f"  ❌ {dep} - MISSING (REQUIRED)")
    
    print("\n🔍 Checking Optional Dependencies:")
    for dep in optional_deps:
        try:
            __import__(dep)
            results[dep] = True
            print(f"  ✅ {dep}")
        except ImportError:
            results[dep] = False
            print(f"  ⚠️  {dep} - Missing (Optional)")
    
    # Determine deployment mode
    has_ml = results.get('chromadb', False) and results.get('sentence_transformers', False)
    has_oauth = results.get('google.auth', False) and results.get('msal', False)
    
    print(f"\n📊 Deployment Analysis:")
    print(f"  ML Processing: {'✅ Available' if has_ml else '❌ Disabled (API-only mode)'}")
    print(f"  OAuth Integration: {'✅ Available' if has_oauth else '❌ Disabled'}")
    
    if has_ml and has_oauth:
        print(f"  🚀 Mode: Full functionality")
    elif has_oauth:
        print(f"  🚀 Mode: API-only (external ML services)")
    else:
        print(f"  🚀 Mode: Basic API (no OAuth, no ML)")
    
    return results

if __name__ == "__main__":
    check_dependencies()