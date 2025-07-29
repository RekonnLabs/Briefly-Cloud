"""
Cloud storage OAuth routes for Briefly Cloud
Handles Google Drive and OneDrive integration
"""

from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import os
import logging
from dotenv import load_dotenv
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
import msal
import httpx
from supabase import create_client, Client

# Load environment variables
load_dotenv()

# Configure logging
logger = logging.getLogger(__name__)

# Initialize Supabase client
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_ANON_KEY")
supabase: Client = create_client(supabase_url, supabase_key)

router = APIRouter(prefix="/storage", tags=["cloud_storage"])

# Data models
class DriveFile(BaseModel):
    id: str
    name: str
    mimeType: str
    size: Optional[int] = None
    modifiedTime: str
    webViewLink: str

class StorageConnection(BaseModel):
    provider: str  # 'google' or 'microsoft'
    connected: bool
    email: Optional[str] = None
    files_count: Optional[int] = None

# Google Drive OAuth configuration
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:3001/api/storage/google/callback")

SCOPES = [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/userinfo.email'
]

# Microsoft OAuth configuration
MICROSOFT_CLIENT_ID = os.getenv("AZURE_CLIENT_ID")
MICROSOFT_CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET")
MICROSOFT_TENANT_ID = os.getenv("AZURE_TENANT_ID")
MICROSOFT_REDIRECT_URI = os.getenv("MICROSOFT_REDIRECT_URI", "http://localhost:3001/api/storage/microsoft/callback")

MICROSOFT_SCOPES = [
    'https://graph.microsoft.com/Files.Read.All',
    'https://graph.microsoft.com/User.Read'
]

@router.get("/google/auth")
async def google_auth(user_id: str):
    """Initiate Google Drive OAuth flow"""
    try:
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": GOOGLE_CLIENT_ID,
                    "client_secret": GOOGLE_CLIENT_SECRET,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [GOOGLE_REDIRECT_URI]
                }
            },
            scopes=SCOPES
        )
        flow.redirect_uri = GOOGLE_REDIRECT_URI
        
        authorization_url, state = flow.authorization_url(
            access_type='offline',
            include_granted_scopes='true',
            state=user_id  # Pass user_id in state
        )
        
        return {"authorization_url": authorization_url}
        
    except Exception as e:
        logger.error(f"Google auth error: {e}")
        raise HTTPException(status_code=500, detail="Failed to initiate Google auth")

@router.get("/google/callback")
async def google_callback(code: str, state: str):
    """Handle Google OAuth callback"""
    try:
        user_id = state  # Extract user_id from state
        
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": GOOGLE_CLIENT_ID,
                    "client_secret": GOOGLE_CLIENT_SECRET,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [GOOGLE_REDIRECT_URI]
                }
            },
            scopes=SCOPES
        )
        flow.redirect_uri = GOOGLE_REDIRECT_URI
        
        # Exchange code for tokens
        flow.fetch_token(code=code)
        credentials = flow.credentials
        
        # Get user info
        service = build('oauth2', 'v2', credentials=credentials)
        user_info = service.userinfo().get().execute()
        
        # Store tokens in database
        token_data = {
            "user_id": user_id,
            "provider": "google",
            "access_token": credentials.token,
            "refresh_token": credentials.refresh_token,
            "expires_at": credentials.expiry.isoformat() if credentials.expiry else None,
            "scope": " ".join(SCOPES)
        }
        
        # Upsert token (insert or update)
        supabase.table('oauth_tokens').upsert(token_data).execute()
        
        # Update user settings
        supabase.table('user_settings').upsert({
            "user_id": user_id,
            "key": "google_drive_connected",
            "value": {"connected": True, "email": user_info.get('email')}
        }).execute()
        
        logger.info(f"Google Drive connected for user {user_id}")
        
        return RedirectResponse(url=f"http://localhost:3000/settings?google_connected=true")
        
    except Exception as e:
        logger.error(f"Google callback error: {e}")
        raise HTTPException(status_code=500, detail="Failed to complete Google auth")

@router.get("/microsoft/auth")
async def microsoft_auth(user_id: str):
    """Initiate Microsoft OneDrive OAuth flow"""
    try:
        app = msal.ConfidentialClientApplication(
            MICROSOFT_CLIENT_ID,
            authority="https://login.microsoftonline.com/common",
            client_credential=MICROSOFT_CLIENT_SECRET
        )
        
        auth_url = app.get_authorization_request_url(
            MICROSOFT_SCOPES,
            redirect_uri=MICROSOFT_REDIRECT_URI,
            state=user_id
        )
        
        return {"authorization_url": auth_url}
        
    except Exception as e:
        logger.error(f"Microsoft auth error: {e}")
        raise HTTPException(status_code=500, detail="Failed to initiate Microsoft auth")

@router.get("/microsoft/callback")
async def microsoft_callback(code: str, state: str):
    """Handle Microsoft OAuth callback"""
    try:
        user_id = state  # Extract user_id from state
        
        app = msal.ConfidentialClientApplication(
            MICROSOFT_CLIENT_ID,
            authority="https://login.microsoftonline.com/common",
            client_credential=MICROSOFT_CLIENT_SECRET
        )
        
        # Exchange code for tokens
        result = app.acquire_token_by_authorization_code(
            code,
            scopes=MICROSOFT_SCOPES,
            redirect_uri=MICROSOFT_REDIRECT_URI
        )
        
        if "access_token" in result:
            # Get user info
            headers = {"Authorization": f"Bearer {result['access_token']}"}
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    "https://graph.microsoft.com/v1.0/me",
                    headers=headers
                )
                user_info = response.json()
            
            # Store tokens in database
            token_data = {
                "user_id": user_id,
                "provider": "microsoft",
                "access_token": result['access_token'],
                "refresh_token": result.get('refresh_token'),
                "expires_at": None,  # Microsoft tokens don't have explicit expiry
                "scope": " ".join(MICROSOFT_SCOPES)
            }
            
            # Upsert token (insert or update)
            supabase.table('oauth_tokens').upsert(token_data).execute()
            
            # Update user settings
            supabase.table('user_settings').upsert({
                "user_id": user_id,
                "key": "onedrive_connected",
                "value": {"connected": True, "email": user_info.get('mail') or user_info.get('userPrincipalName')}
            }).execute()
            
            logger.info(f"OneDrive connected for user {user_id}")
            
            return RedirectResponse(url=f"http://localhost:3000/settings?microsoft_connected=true")
        else:
            raise HTTPException(status_code=400, detail="Failed to get access token")
            
    except Exception as e:
        logger.error(f"Microsoft callback error: {e}")
        raise HTTPException(status_code=500, detail="Failed to complete Microsoft auth")

@router.get("/status")
async def get_storage_status_no_param():
    """Get storage status without user_id parameter for compatibility"""
    # This is a compatibility endpoint - in a real app you'd get user_id from auth
    return {
        "google": StorageConnection(provider="google", connected=False),
        "microsoft": StorageConnection(provider="microsoft", connected=False)
    }

@router.get("/status/{user_id}")
async def get_storage_status(user_id: str):
    """Get current cloud storage connection status"""
    try:
        # Get storage connections from settings
        settings_data = supabase.table('user_settings').select('*').eq('user_id', user_id).execute()
        
        connections = {
            "google": StorageConnection(provider="google", connected=False),
            "microsoft": StorageConnection(provider="microsoft", connected=False)
        }
        
        for setting in settings_data.data:
            if setting['key'] == 'google_drive_connected':
                value = setting['value']
                connections["google"] = StorageConnection(
                    provider="google",
                    connected=value.get('connected', False),
                    email=value.get('email')
                )
            elif setting['key'] == 'onedrive_connected':
                value = setting['value']
                connections["microsoft"] = StorageConnection(
                    provider="microsoft", 
                    connected=value.get('connected', False),
                    email=value.get('email')
                )
        
        return connections
        
    except Exception as e:
        logger.error(f"Storage status error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get storage status")

@router.get("/google/files/{user_id}")
async def get_google_drive_files(user_id: str, limit: int = 50):
    """Get files from user's Google Drive"""
    try:
        # Get stored tokens
        token_data = supabase.table('oauth_tokens').select('*').eq('user_id', user_id).eq('provider', 'google').execute()
        
        if not token_data.data:
            raise HTTPException(status_code=404, detail="Google Drive not connected")
            
        token_info = token_data.data[0]
        
        # Create credentials
        credentials = Credentials(
            token=token_info['access_token'],
            refresh_token=token_info['refresh_token']
        )
        
        # Build Drive service
        service = build('drive', 'v3', credentials=credentials)
        
        # Get files (documents only)
        results = service.files().list(
            pageSize=limit,
            fields="nextPageToken, files(id, name, mimeType, size, modifiedTime, webViewLink)",
            q="mimeType contains 'document' or mimeType contains 'pdf' or mimeType contains 'text'"
        ).execute()
        
        files = results.get('files', [])
        
        # Convert to our model
        drive_files = [
            DriveFile(
                id=file['id'],
                name=file['name'],
                mimeType=file['mimeType'],
                size=int(file.get('size', 0)) if file.get('size') else None,
                modifiedTime=file['modifiedTime'],
                webViewLink=file['webViewLink']
            )
            for file in files
        ]
        
        return {"files": drive_files, "total": len(drive_files)}
        
    except Exception as e:
        logger.error(f"Google Drive files error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get Google Drive files")

@router.get("/microsoft/files/{user_id}")
async def get_onedrive_files(user_id: str, limit: int = 50):
    """Get files from user's OneDrive"""
    try:
        # Get stored tokens
        token_data = supabase.table('oauth_tokens').select('*').eq('user_id', user_id).eq('provider', 'microsoft').execute()
        
        if not token_data.data:
            raise HTTPException(status_code=404, detail="OneDrive not connected")
            
        token_info = token_data.data[0]
        
        # Get files from Microsoft Graph
        headers = {"Authorization": f"Bearer {token_info['access_token']}"}
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://graph.microsoft.com/v1.0/me/drive/root/children?$top={limit}&$filter=file ne null",
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                files = data.get('value', [])
                
                # Convert to our model
                drive_files = [
                    DriveFile(
                        id=file['id'],
                        name=file['name'],
                        mimeType=file.get('file', {}).get('mimeType', 'unknown'),
                        size=file.get('size'),
                        modifiedTime=file['lastModifiedDateTime'],
                        webViewLink=file['webUrl']
                    )
                    for file in files
                    if file.get('file')  # Only files, not folders
                ]
                
                return {"files": drive_files, "total": len(drive_files)}
            else:
                raise HTTPException(status_code=response.status_code, detail="Failed to fetch OneDrive files")
        
    except Exception as e:
        logger.error(f"OneDrive files error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get OneDrive files")

@router.delete("/disconnect/{provider}/{user_id}")
async def disconnect_storage(provider: str, user_id: str):
    """Disconnect cloud storage provider"""
    try:
        if provider not in ["google", "microsoft"]:
            raise HTTPException(status_code=400, detail="Invalid provider")
            
        # Remove OAuth tokens
        supabase.table('oauth_tokens').delete().eq('user_id', user_id).eq('provider', provider).execute()
        
        # Update settings
        setting_key = f"{provider}_drive_connected" if provider == "google" else "onedrive_connected"
        supabase.table('user_settings').delete().eq('user_id', user_id).eq('key', setting_key).execute()
        
        logger.info(f"Disconnected {provider} for user {user_id}")
        
        return {"message": f"{provider.title()} storage disconnected successfully"}
        
    except Exception as e:
        logger.error(f"Disconnect storage error: {e}")
        raise HTTPException(status_code=500, detail="Failed to disconnect storage")

