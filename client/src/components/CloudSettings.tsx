import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { 
  Loader2, 
  Cloud, 
  CheckCircle, 
  AlertCircle, 
  ExternalLink, 
  Unlink, 
  X,
  Crown,
  Zap,
  Key,
  Smartphone,
  Monitor
} from 'lucide-react';

interface StorageConnection {
  provider: string;
  connected: boolean;
  email?: string;
  files_count?: number;
}

interface UserProfile {
  id: string;
  email: string;
  subscription_tier: string;
  usage_count?: number;
  usage_limit?: number;
}

interface StorageConnections {
  google: StorageConnection;
  microsoft: StorageConnection;
}

interface CloudSettingsProps {
  onClose: () => void;
  userProfile: UserProfile | null;
  storageConnections: StorageConnections;
  onStorageUpdate: (connections: StorageConnections) => void;
}

function CloudSettings({ onClose, userProfile, storageConnections, onStorageUpdate }: CloudSettingsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [apiKeyStatus, setApiKeyStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userProfile?.subscription_tier === 'pro_byok') {
      loadApiKey();
    }
  }, [userProfile]);

  const loadApiKey = async () => {
    try {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch('/api/auth/api-key', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.api_key) {
          setApiKey('sk-...' + data.api_key.slice(-4)); // Show masked key
        }
      }
    } catch (error) {
      console.error('Failed to load API key:', error);
    }
  };

  const connectStorage = async (provider: 'google' | 'microsoft') => {
    if (!userProfile) return;
    
    setIsConnecting(provider);
    setError(null);
    
    try {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch(`/api/storage/${provider}/auth?user_id=${userProfile.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // For mobile, use same window redirect instead of popup
        const isMobile = window.innerWidth < 768;
        
        if (isMobile) {
          // Store current state and redirect
          localStorage.setItem('oauth_provider', provider);
          localStorage.setItem('oauth_return_url', window.location.href);
          window.location.href = data.authorization_url;
        } else {
          // Desktop: use popup
          const popup = window.open(
            data.authorization_url, 
            'oauth', 
            'width=500,height=600,scrollbars=yes,resizable=yes'
          );
          
          // Poll for popup closure
          const pollTimer = setInterval(() => {
            try {
              if (popup?.closed) {
                clearInterval(pollTimer);
                setIsConnecting(null);
                checkConnectionStatus(provider);
              }
            } catch (error) {
              // Cross-origin error when popup redirects
              clearInterval(pollTimer);
              setIsConnecting(null);
              checkConnectionStatus(provider);
            }
          }, 1000);
          
          // Timeout after 5 minutes
          setTimeout(() => {
            clearInterval(pollTimer);
            if (popup && !popup.closed) {
              popup.close();
            }
            setIsConnecting(null);
          }, 300000);
        }
      } else {
        const errorData = await response.json();
        setError(errorData.detail || `Failed to connect ${provider}`);
      }
    } catch (error) {
      console.error(`Failed to connect ${provider}:`, error);
      setError(`Failed to connect ${provider}. Please try again.`);
    } finally {
      if (window.innerWidth >= 768) { // Only for desktop
        setIsConnecting(null);
      }
    }
  };

  const checkConnectionStatus = async (provider: string) => {
    try {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch('/api/storage/status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const connections = await response.json();
        onStorageUpdate(connections);
      }
    } catch (error) {
      console.error('Failed to check connection status:', error);
    }
  };

  const disconnectStorage = async (provider: 'google' | 'microsoft') => {
    if (!userProfile) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch(`/api/storage/${provider}/disconnect`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const updatedConnections = {
          ...storageConnections,
          [provider]: { provider, connected: false }
        };
        onStorageUpdate(updatedConnections);
      } else {
        const errorData = await response.json();
        setError(errorData.detail || `Failed to disconnect ${provider}`);
      }
    } catch (error) {
      console.error(`Failed to disconnect ${provider}:`, error);
      setError(`Failed to disconnect ${provider}. Please try again.`);
    } finally {
      setIsLoading(false);
    }
  };

  const saveApiKey = async () => {
    if (!apiKey || apiKey.startsWith('sk-...')) return;
    
    setApiKeyStatus('saving');
    setError(null);
    
    try {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch('/api/auth/api-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ api_key: apiKey })
      });
      
      if (response.ok) {
        setApiKeyStatus('saved');
        setApiKey('sk-...' + apiKey.slice(-4)); // Mask the key
        setTimeout(() => setApiKeyStatus('idle'), 2000);
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Failed to save API key');
        setApiKeyStatus('error');
      }
    } catch (error) {
      console.error('Failed to save API key:', error);
      setError('Failed to save API key. Please try again.');
      setApiKeyStatus('error');
    }
  };

  const getTierBadgeColor = (tier: string) => {
    switch (tier) {
      case 'free': return 'bg-gray-100 text-gray-800';
      case 'pro': return 'bg-blue-100 text-blue-800';
      case 'pro_byok': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatTierName = (tier: string) => {
    switch (tier) {
      case 'free': return 'Free';
      case 'pro': return 'Pro';
      case 'pro_byok': return 'Pro BYOK';
      default: return tier;
    }
  };

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case 'pro':
      case 'pro_byok':
        return <Crown className="h-4 w-4" />;
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Mobile Header */}
      <div className="flex items-center justify-between p-4 lg:p-6 border-b">
        <h2 className="text-lg lg:text-xl font-semibold">Cloud Settings</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4 lg:space-y-6">
        {/* Error Display */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setError(null)}
              className="mt-2 text-red-600 hover:text-red-700"
            >
              Dismiss
            </Button>
          </div>
        )}

        {/* User Profile & Subscription */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
              {getTierIcon(userProfile?.subscription_tier || 'free')}
              Account & Subscription
            </CardTitle>
            <CardDescription className="text-sm">
              Your current plan and usage limits
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {userProfile && (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
                  <span className="text-sm font-medium">Email:</span>
                  <span className="text-sm text-gray-600 break-all">{userProfile.email}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
                  <span className="text-sm font-medium">Plan:</span>
                  <Badge className={getTierBadgeColor(userProfile.subscription_tier)}>
                    {formatTierName(userProfile.subscription_tier)}
                  </Badge>
                </div>
                {userProfile.usage_count !== undefined && userProfile.usage_limit !== undefined && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
                    <span className="text-sm font-medium">Usage:</span>
                    <span className="text-sm text-gray-600">
                      {userProfile.usage_count}/{userProfile.usage_limit} messages
                    </span>
                  </div>
                )}
              </div>
            )}
            
            {userProfile?.subscription_tier === 'free' && (
              <div className="mt-4 p-3 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-800">Upgrade to Pro</span>
                </div>
                <p className="text-xs lg:text-sm text-blue-700 mb-3">
                  Get OneDrive support, 10,000 monthly messages, and GPT-4o access.
                </p>
                <Button size="sm" className="w-full sm:w-auto">
                  <Crown className="h-4 w-4 mr-1" />
                  Upgrade Plan
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cloud Storage Connections */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base lg:text-lg">Cloud Storage</CardTitle>
            <CardDescription className="text-sm">
              Connect your cloud storage to access and index your documents
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 lg:space-y-4">
            {/* Google Drive */}
            <div className="flex items-center justify-between p-3 lg:p-4 border rounded-lg">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-8 h-8 lg:w-10 lg:h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Cloud className="h-4 w-4 lg:h-5 lg:w-5 text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-medium text-sm lg:text-base">Google Drive</h4>
                  <p className="text-xs lg:text-sm text-gray-600 truncate">
                    {storageConnections.google.connected 
                      ? `Connected as ${storageConnections.google.email}`
                      : 'Not connected'
                    }
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {storageConnections.google.connected ? (
                  <>
                    <Badge variant="outline" className="text-green-600 border-green-600 hidden sm:flex">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => disconnectStorage('google')}
                      disabled={isLoading}
                      className="text-xs"
                    >
                      <Unlink className="h-3 w-3 lg:h-4 lg:w-4 mr-1" />
                      <span className="hidden sm:inline">Disconnect</span>
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() => connectStorage('google')}
                    disabled={isConnecting === 'google'}
                    size="sm"
                    className="text-xs"
                  >
                    {isConnecting === 'google' ? (
                      <Loader2 className="h-3 w-3 lg:h-4 lg:w-4 mr-1 animate-spin" />
                    ) : (
                      <ExternalLink className="h-3 w-3 lg:h-4 lg:w-4 mr-1" />
                    )}
                    Connect
                  </Button>
                )}
              </div>
            </div>

            {/* OneDrive */}
            <div className="flex items-center justify-between p-3 lg:p-4 border rounded-lg">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-8 h-8 lg:w-10 lg:h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Cloud className="h-4 w-4 lg:h-5 lg:w-5 text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-medium text-sm lg:text-base">OneDrive</h4>
                  <p className="text-xs lg:text-sm text-gray-600 truncate">
                    {storageConnections.microsoft.connected 
                      ? `Connected as ${storageConnections.microsoft.email}`
                      : 'Not connected'
                    }
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {storageConnections.microsoft.connected ? (
                  <>
                    <Badge variant="outline" className="text-green-600 border-green-600 hidden sm:flex">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => disconnectStorage('microsoft')}
                      disabled={isLoading}
                      className="text-xs"
                    >
                      <Unlink className="h-3 w-3 lg:h-4 lg:w-4 mr-1" />
                      <span className="hidden sm:inline">Disconnect</span>
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() => connectStorage('microsoft')}
                    disabled={isConnecting === 'microsoft'}
                    size="sm"
                    className="text-xs"
                  >
                    {isConnecting === 'microsoft' ? (
                      <Loader2 className="h-3 w-3 lg:h-4 lg:w-4 mr-1 animate-spin" />
                    ) : (
                      <ExternalLink className="h-3 w-3 lg:h-4 lg:w-4 mr-1" />
                    )}
                    {isConnecting === 'microsoft' ? 'Connecting...' : 'Connect'}
                  </Button>
                )}
              </div>
            </div>

            {/* Connection Status */}
            {(storageConnections.google.connected || storageConnections.microsoft.connected) && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-800">
                    Ready for indexing
                  </span>
                </div>
                <p className="text-xs lg:text-sm text-green-700 mt-1">
                  Your documents will be indexed when you start chatting.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* API Key Settings (for BYOK users) */}
        {userProfile?.subscription_tier === 'pro_byok' && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
                <Key className="h-4 w-4" />
                API Configuration
              </CardTitle>
              <CardDescription className="text-sm">
                Configure your own OpenAI API key for unlimited usage
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">OpenAI API Key</label>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder="sk-..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="flex-1 text-sm"
                  />
                  <Button 
                    size="sm" 
                    onClick={saveApiKey}
                    disabled={apiKeyStatus === 'saving' || !apiKey || apiKey.startsWith('sk-...')}
                    className="flex-shrink-0"
                  >
                    {apiKeyStatus === 'saving' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : apiKeyStatus === 'saved' ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      'Save'
                    )}
                  </Button>
                </div>
                <p className="text-xs text-gray-600">
                  Your API key is encrypted and stored securely. Only you can access it.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Mobile App Info */}
        <Card className="lg:hidden">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Smartphone className="h-4 w-4" />
              Mobile App
            </CardTitle>
            <CardDescription className="text-sm">
              Install Briefly Cloud for the best mobile experience
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Smartphone className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-sm text-blue-800">Add to Home Screen</h4>
                  <p className="text-xs text-blue-700">
                    Tap your browser menu and select "Add to Home Screen"
                  </p>
                </div>
              </div>
              <div className="text-xs text-gray-600 space-y-1">
                <p>• Works offline with cached conversations</p>
                <p>• Push notifications for updates</p>
                <p>• Native app-like experience</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Mobile Footer */}
      <div className="lg:hidden p-4 border-t">
        <Button onClick={onClose} className="w-full">
          Done
        </Button>
      </div>
    </div>
  );
}

export default CloudSettings;

