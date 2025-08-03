import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Settings, MessageSquare, Menu, X, User, Crown, Zap } from 'lucide-react';
import ChatWindow from './ChatWindow';
import CloudSettings from './CloudSettings';
import LlmSettings from './LlmSettings';
import OnboardingFlow from './OnboardingFlow';
import IndexingProgress from './IndexingProgress';
import ThemeProvider from './ThemeProvider';

import SimpleTest from './SimpleTest';

interface UserProfile {
  id: string;
  email: string;
  subscription_tier: 'free' | 'pro' | 'pro_byok';
  usage_count: number;
  usage_limit: number;
}

interface StorageConnections {
  google: {
    connected: boolean;
    email?: string;
  };
  microsoft: {
    connected: boolean;
    email?: string;
  };
}

function App() {
  // Enable test mode by adding ?test=1 to URL
  const isTestMode = new URLSearchParams(window.location.search).get('test') === '1';

  if (isTestMode) {
    return <SimpleTest />;
  }

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [storageConnections, setStorageConnections] = useState<StorageConnections>({
    google: { connected: false },
    microsoft: { connected: false }
  });
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLlmSettings, setShowLlmSettings] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexingProgress, setIndexingProgress] = useState({ processed: 0, total: 0, status: '' });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Check authentication status on load
  useEffect(() => {
    console.log('App: Starting authentication check...');
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const token = localStorage.getItem('supabase_token');
      console.log('App: Token check:', token ? 'Token exists' : 'No token found');

      if (!token) {
        console.log('App: No token found, showing login screen');
        setIsLoading(false);
        return;
      }

      // Basic token format validation
      if (!token.includes('.') || token.split('.').length !== 3) {
        console.log('App: Invalid token format, removing');
        localStorage.removeItem('supabase_token');
        setIsLoading(false);
        return;
      }

      console.log('App: Validating token with server...');

      // Check if token is valid and get user profile
      const response = await fetch('/api/auth/profile', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const profile = await response.json();
        console.log('App: User profile loaded successfully');
        setUserProfile(profile);
        setIsAuthenticated(true);

        // Only check storage connections if authentication succeeded
        try {
          const hasConnectedStorage = await checkStorageConnections();
          console.log('App: Storage connected:', hasConnectedStorage);
          if (!hasConnectedStorage && !localStorage.getItem('onboarding_completed')) {
            setShowOnboarding(true);
          }
        } catch (storageError) {
          console.log('App: Storage check failed, continuing anyway:', storageError);
        }
      } else {
        console.log('App: Token validation failed:', response.status);
        // Remove invalid token
        localStorage.removeItem('supabase_token');
        setIsAuthenticated(false);
        setUserProfile(null);
      }
    } catch (error) {
      console.error('App: Auth check network error:', error);
      // On network errors, don't remove token but don't authenticate either
      setIsAuthenticated(false);
      setUserProfile(null);
    } finally {
      console.log('App: Authentication check complete');
      setIsLoading(false);
    }
  };

  const checkStorageConnections = async () => {
    try {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch('/api/storage/status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const connections = await response.json();
        setStorageConnections(connections);
        return connections.google?.connected || connections.microsoft?.connected;
      } else {
        console.error('Storage status check failed:', response.status, response.statusText);
        // Set default disconnected state
        setStorageConnections({
          google: { connected: false },
          microsoft: { connected: false }
        });
      }
    } catch (error) {
      console.error('Failed to check storage connections:', error);
      // Set default disconnected state on error
      setStorageConnections({
        google: { connected: false },
        microsoft: { connected: false }
      });
    }
    return false;
  };

  const handleLogin = async (email: string, password: string) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('supabase_token', data.token);
        setUserProfile(data.user);
        setIsAuthenticated(true);

        // Check if user needs onboarding
        const hasConnectedStorage = await checkStorageConnections();
        if (!hasConnectedStorage) {
          setShowOnboarding(true);
        }
      } else {
        const error = await response.json();
        throw new Error(error.message);
      }
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const handleSignup = async (email: string, password: string) => {
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      if (response.ok) {
        const data = await response.json();

        // Signup successful - user needs to confirm email first
        // Success message will be shown by the AuthForm component
        // Don't set authentication state - user needs to confirm email first
      } else {
        const error = await response.json();
        throw new Error(error.detail || error.message || 'Signup failed');
      }
    } catch (error) {
      console.error('Signup failed:', error);
      throw error;
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('supabase_token');
    localStorage.removeItem('onboarding_completed');
    setUserProfile(null);
    setIsAuthenticated(false);
    setStorageConnections({
      google: { connected: false },
      microsoft: { connected: false }
    });
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    localStorage.setItem('onboarding_completed', 'true');
  };

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case 'pro':
      case 'pro_byok':
        return <Crown className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'pro':
        return 'text-blue-600';
      case 'pro_byok':
        return 'text-purple-600';
      default:
        return 'text-gray-600';
    }
  };

  const formatTierName = (tier: string) => {
    switch (tier) {
      case 'free':
        return 'Free';
      case 'pro':
        return 'Pro';
      case 'pro_byok':
        return 'Pro BYOK';
      default:
        return tier;
    }
  };

  // Mobile menu component
  const MobileMenu = () => (
    <div className={`fixed inset-0 z-50 lg:hidden ${isMobileMenuOpen ? 'block' : 'hidden'}`}>
      <div className="fixed inset-0 bg-black/50" onClick={() => setIsMobileMenuOpen(false)} />
      <div className="fixed right-0 top-0 h-full w-64 bg-white dark:bg-gray-900 shadow-xl">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">Menu</h2>
          <Button variant="ghost" size="sm" onClick={() => setIsMobileMenuOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-4 space-y-4">
          {userProfile && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {getTierIcon(userProfile.subscription_tier)}
                <span className={`text-sm font-medium ${getTierColor(userProfile.subscription_tier)}`}>
                  {formatTierName(userProfile.subscription_tier)} Plan
                </span>
              </div>
              <div className="text-xs text-gray-500">
                {userProfile.email}
              </div>
              <div className="text-xs text-gray-500">
                Usage: {userProfile.usage_count}/{userProfile.usage_limit} messages
              </div>
            </div>
          )}
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => {
              setShowSettings(true);
              setIsMobileMenuOpen(false);
            }}
          >
            <Settings className="h-4 w-4 mr-2" />
            Cloud Settings
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => {
              setShowLlmSettings(true);
              setIsMobileMenuOpen(false);
            }}
          >
            <Zap className="h-4 w-4 mr-2" />
            LLM Settings
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => {
              setShowOnboarding(true);
              setIsMobileMenuOpen(false);
            }}
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Show Onboarding
          </Button>
          <Button
            variant="destructive"
            className="w-full justify-start"
            onClick={handleLogout}
          >
            Logout
          </Button>
        </div>
      </div>
    </div>
  );

  // Loading screen
  if (isLoading) {
    return (
      <ThemeProvider defaultTheme="system">
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading Briefly Cloud...</p>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  // Authentication screen
  if (!isAuthenticated) {
    return (
      <ThemeProvider defaultTheme="system">
        <div className="min-h-screen flex items-center justify-center p-4">
          <AuthForm onLogin={handleLogin} onSignup={handleSignup} />
        </div>
      </ThemeProvider>
    );
  }

  // Onboarding flow
  if (showOnboarding) {
    return (
      <ThemeProvider defaultTheme="system">
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
          <OnboardingFlow
            onComplete={handleOnboardingComplete}
            userProfile={userProfile}
            storageConnections={storageConnections}
            onShowSettings={() => setShowSettings(true)}
            onStorageUpdate={setStorageConnections}
          />
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider defaultTheme="system">
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Mobile Header */}
        <header className="lg:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src="/Briefly Image.png"
                alt="Briefly Cloud Logo"
                className="h-8 w-8 object-contain"
              />
              <h1 className="text-lg font-bold">Briefly Cloud</h1>
              {userProfile && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {getTierIcon(userProfile.subscription_tier)}
                  <span className={getTierColor(userProfile.subscription_tier)}>
                    {formatTierName(userProfile.subscription_tier)}
                  </span>
                </div>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setIsMobileMenuOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </header>

        {/* Desktop Header */}
        <header className="hidden lg:block bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img
                src="/Briefly Image.png"
                alt="Briefly Cloud Logo"
                className="h-10 w-10 object-contain"
              />
              <div>
                <h1 className="text-2xl font-bold">Briefly Cloud</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">AI-powered document assistant</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {userProfile && (
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="flex items-center gap-2">
                      {getTierIcon(userProfile.subscription_tier)}
                      <span className={`text-sm font-medium ${getTierColor(userProfile.subscription_tier)}`}>
                        {formatTierName(userProfile.subscription_tier)} Plan
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {userProfile.usage_count}/{userProfile.usage_limit} messages used
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    {userProfile.email}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
                  <Settings className="h-4 w-4 mr-1" />
                  Settings
                </Button>
                <Button variant="outline" size="sm" onClick={handleLogout}>
                  Logout
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto p-4 lg:p-6 max-w-6xl">
          {/* Indexing Progress */}
          {isIndexing && (
            <div className="mb-6">
              <IndexingProgress
                progress={indexingProgress}
                onComplete={() => setIsIndexing(false)}
              />
            </div>
          )}

          {/* Chat Interface */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 h-[calc(100vh-200px)] lg:h-[calc(100vh-160px)]">
            {userProfile ? (
              <ChatWindow
                userProfile={userProfile}
                storageConnections={storageConnections}
                onIndexingStart={(progress) => {
                  setIsIndexing(true);
                  setIndexingProgress(progress);
                }}
                onIndexingProgress={setIndexingProgress}
                onShowSettings={() => setShowSettings(true)}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Loading user profile...</p>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Mobile Menu */}
        <MobileMenu />



        {/* Settings Modals */}
        {showSettings && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <CloudSettings
                onClose={() => setShowSettings(false)}
                userProfile={userProfile}
                storageConnections={storageConnections}
                onStorageUpdate={setStorageConnections}
              />
            </div>
          </div>
        )}

        {showLlmSettings && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <LlmSettings
                onClose={() => setShowLlmSettings(false)}
                userProfile={userProfile}
              />
            </div>
          </div>
        )}
      </div>
    </ThemeProvider>
  );
}

// Authentication Form Component
function AuthForm({ onLogin, onSignup }: { onLogin: (email: string, password: string) => Promise<void>; onSignup: (email: string, password: string) => Promise<void> }) {
  // Check URL parameters to determine initial mode
  const urlParams = new URLSearchParams(window.location.search);
  const mode = urlParams.get('mode');
  const [isLogin, setIsLogin] = useState(mode !== 'signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleModeSwitch = () => {
    setIsLogin(!isLogin);
    setError('');
    setSuccess('');
    setEmail('');
    setPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      if (isLogin) {
        await onLogin(email, password);
      } else {
        await onSignup(email, password);
        setSuccess('Account created successfully! Please check your email for a confirmation link, then sign in.');
        setIsLogin(true); // Switch to login mode after successful signup
        setEmail(''); // Clear form fields
        setPassword('');
      }
    } catch (err: any) {
      let errorMessage = err.message || 'Authentication failed';

      // Provide more user-friendly error messages
      if (errorMessage.includes('Invalid email or password')) {
        errorMessage = 'Invalid email or password. Please check your credentials and try again.';
      } else if (errorMessage.includes('Email not confirmed')) {
        errorMessage = 'Please check your email and click the confirmation link before signing in.';
      } else if (errorMessage.includes('User already registered')) {
        errorMessage = 'An account with this email already exists. Please sign in instead.';
        setIsLogin(true);
      }

      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Briefly Cloud</h1>
        <p className="text-gray-600 mt-2">
          {isLogin ? 'Sign in to your account' : 'Create your account'}
        </p>
      </div>

      {/* Mode indicator tabs */}
      <div className="flex bg-gray-100 rounded-lg p-1">
        <button
          type="button"
          onClick={() => !isLogin && handleModeSwitch()}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${isLogin
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
            }`}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => isLogin && handleModeSwitch()}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${!isLogin
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
            }`}
        >
          Sign Up
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {success && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-600">{success}</p>
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Please wait...' : (isLogin ? 'Sign In' : 'Sign Up')}
        </Button>
      </form>
    </div>
  );
}

export default App;

