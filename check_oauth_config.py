#!/usr/bin/env python3
"""
Simple script to check OAuth configuration status
"""

import os
from dotenv import load_dotenv

def check_oauth_config():
    """Check if OAuth credentials are properly configured"""
    
    # Load environment variables
    load_dotenv()
    
    print("🔍 Checking OAuth Configuration")
    print("=" * 50)
    
    # Google OAuth
    google_client_id = os.getenv("GOOGLE_CLIENT_ID")
    google_client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    google_redirect_uri = os.getenv("GOOGLE_REDIRECT_URI")
    
    google_configured = bool(
        google_client_id and 
        google_client_secret and 
        google_client_id != "your_google_client_id_here"
    )
    
    print(f"📱 Google Drive OAuth:")
    print(f"  Client ID: {'✅ Configured' if google_client_id and google_client_id != 'your_google_client_id_here' else '❌ Not configured'}")
    print(f"  Client Secret: {'✅ Configured' if google_client_secret and google_client_secret != 'your_google_client_secret_here' else '❌ Not configured'}")
    print(f"  Redirect URI: {google_redirect_uri or '❌ Not set'}")
    print(f"  Status: {'✅ Ready' if google_configured else '❌ Needs setup'}")
    
    print()
    
    # Microsoft OAuth
    microsoft_client_id = os.getenv("AZURE_CLIENT_ID")
    microsoft_client_secret = os.getenv("AZURE_CLIENT_SECRET")
    microsoft_redirect_uri = os.getenv("MICROSOFT_REDIRECT_URI")
    
    microsoft_configured = bool(
        microsoft_client_id and 
        microsoft_client_secret and 
        microsoft_client_id != "your_azure_client_id_here"
    )
    
    print(f"🗂️ Microsoft OneDrive OAuth:")
    print(f"  Client ID: {'✅ Configured' if microsoft_client_id and microsoft_client_id != 'your_azure_client_id_here' else '❌ Not configured'}")
    print(f"  Client Secret: {'✅ Configured' if microsoft_client_secret and microsoft_client_secret != 'your_azure_client_secret_here' else '❌ Not configured'}")
    print(f"  Redirect URI: {microsoft_redirect_uri or '❌ Not set'}")
    print(f"  Status: {'✅ Ready' if microsoft_configured else '❌ Needs setup'}")
    
    print()
    print("=" * 50)
    
    if google_configured and microsoft_configured:
        print("🎉 All OAuth integrations are configured!")
        print("Users can now connect their Google Drive and OneDrive accounts.")
    elif google_configured or microsoft_configured:
        print("⚠️ Partial OAuth configuration detected.")
        if google_configured:
            print("✅ Google Drive is ready")
        if microsoft_configured:
            print("✅ OneDrive is ready")
        print("❌ Some integrations still need setup")
    else:
        print("❌ No OAuth integrations are configured.")
        print("📖 Please follow the OAUTH_SETUP_GUIDE.md to set up cloud storage.")
    
    print()
    print("🔗 Next steps:")
    if not google_configured:
        print("  1. Set up Google Drive OAuth (see OAUTH_SETUP_GUIDE.md)")
    if not microsoft_configured:
        print("  2. Set up Microsoft OneDrive OAuth (see OAUTH_SETUP_GUIDE.md)")
    print("  3. Restart your backend service after adding environment variables")
    print("  4. Test the connections in the Briefly Cloud app")

if __name__ == "__main__":
    check_oauth_config()