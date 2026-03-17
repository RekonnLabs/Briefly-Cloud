"use client";
import { useEffect, useState } from 'react';
import {
  MessageSquare,
  FileText,
  HardDrive,
  Cloud,
  Settings,
  LogOut,
  User,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { CompleteUserData } from '@/app/lib/user-data-types';
import { useSignout } from '@/app/lib/auth/use-signout';

interface CompactQuota {
  files: { used: number; limit: number; percentage: number; limitReached: boolean };
  storage: { used: number; limit: number; percentage: number; limitReached: boolean };
  chat: { used: number; limit: number; percentage: number; limitReached: boolean };
  tier: string;
  trial: { active: boolean; daysRemaining: number };
}

function useCompactQuota() {
  const [quota, setQuota] = useState<CompactQuota | null>(null);
  useEffect(() => {
    fetch('/api/usage/quota', { credentials: 'include', cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.success && d?.data) setQuota(d.data); })
      .catch(() => {});
  }, []);
  return quota;
}

function bar(pct: number, reached: boolean) {
  if (reached || pct >= 100) return 'bg-red-500';
  if (pct >= 90) return 'bg-orange-500';
  if (pct >= 70) return 'bg-yellow-500';
  return 'bg-green-500';
}

function barText(pct: number, reached: boolean) {
  if (reached || pct >= 100) return 'text-red-400';
  if (pct >= 90) return 'text-orange-400';
  if (pct >= 70) return 'text-yellow-400';
  return 'text-green-400';
}

interface SidebarProps {
  activeTab: 'chat' | 'files' | 'storage';
  setActiveTab: (tab: 'chat' | 'files' | 'storage') => void;
  user: CompleteUserData | null;
}

export function Sidebar({ activeTab, setActiveTab, user }: SidebarProps) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { signOut, isSigningOut, error, clearError } = useSignout();

  const handleSignOut = async () => {
    try {
      await signOut({
        showLoading: true,
        forceRedirect: true
      });
    } catch (err) {
      // Error is already handled by the useSignout hook
      console.error('Signout failed:', err);
    }
  };

  // Handle case where user data is not available
  if (!user) {
    return (
      <div className="w-64 bg-gray-900/80 backdrop-blur-sm border-r border-gray-700/50 flex flex-col">
        <div className="p-6 border-b border-gray-700/50">
          <div className="flex items-center space-x-3">
            <img
              src="/Briefly_Logo_120px.png"
              alt="Briefly Logo"
              className="w-8 h-8"
            />
            <div>
              <h1 className="text-xl font-bold text-white">Briefly</h1>
              <p className="text-sm text-gray-300">AI Document Assistant</p>
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <User className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm">User data unavailable</p>
          </div>
        </div>
      </div>
    );
  }

  const navItems = [
    {
      id: 'chat' as const,
      label: 'Chat',
      icon: MessageSquare,
      description: 'AI conversations with your documents'
    },
    {
      id: 'files' as const,
      label: 'Files',
      icon: FileText,
      description: 'Upload and manage documents'
    },
    {
      id: 'storage' as const,
      label: 'Cloud Storage',
      icon: Cloud,
      description: 'Connect Google Drive & OneDrive'
    }
  ];

  const quota = useCompactQuota();

  return (
    <div className="w-64 bg-gray-900/80 backdrop-blur-sm border-r border-gray-700/50 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-700/50">
        <div className="flex items-center space-x-3">
          <img
            src="/Briefly_Logo_120px.png"
            alt="Briefly Logo"
            className="w-8 h-8"
          />
          <div>
            <h1 className="text-xl font-bold text-white">Briefly</h1>
            <p className="text-sm text-gray-300">AI Document Assistant</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-left transition-all duration-200 ${
                isActive
                  ? 'bg-blue-600/80 text-white border border-blue-500/50 shadow-lg'
                  : 'text-gray-300 hover:bg-gray-800/50 hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5" />
              <div>
                <div className="font-medium">{item.label}</div>
                <div className={`text-xs ${isActive ? 'text-blue-100' : 'text-gray-400'}`}>
                  {item.description}
                </div>
              </div>
            </button>
          );
        })}

        {/* Compact Usage Widget — sits directly below Cloud Storage nav item */}
        {quota && (
          <div className="pt-1">
            <div className="bg-gray-800/60 border border-gray-700/40 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-300 capitalize">{quota.tier} Plan</span>
                {quota.trial.active && (
                  <span className="text-xs text-blue-300">{quota.trial.daysRemaining}d left</span>
                )}
              </div>
              {/* Files bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-1.5 text-gray-400">
                    <FileText className="w-3 h-3" />
                    <span>Files</span>
                  </div>
                  <span className={`font-medium ${barText(quota.files.percentage, quota.files.limitReached)}`}>
                    {quota.files.used}/{quota.files.limit}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-gray-700/50 rounded-full overflow-hidden">
                  <div className={`h-full ${bar(quota.files.percentage, quota.files.limitReached)} transition-all`} style={{ width: `${Math.min(quota.files.percentage, 100)}%` }} />
                </div>
              </div>
              {/* Storage bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-1.5 text-gray-400">
                    <HardDrive className="w-3 h-3" />
                    <span>Storage</span>
                  </div>
                  <span className={`font-medium ${barText(quota.storage.percentage, quota.storage.limitReached)}`}>
                    {quota.storage.used.toFixed(1)}/{quota.storage.limit} MB
                  </span>
                </div>
                <div className="w-full h-1.5 bg-gray-700/50 rounded-full overflow-hidden">
                  <div className={`h-full ${bar(quota.storage.percentage, quota.storage.limitReached)} transition-all`} style={{ width: `${Math.min(quota.storage.percentage, 100)}%` }} />
                </div>
              </div>
              {/* Messages bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-1.5 text-gray-400">
                    <MessageSquare className="w-3 h-3" />
                    <span>Messages</span>
                  </div>
                  <span className={`font-medium ${barText(quota.chat.percentage, quota.chat.limitReached)}`}>
                    {quota.chat.used}/{quota.chat.limit}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-gray-700/50 rounded-full overflow-hidden">
                  <div className={`h-full ${bar(quota.chat.percentage, quota.chat.limitReached)} transition-all`} style={{ width: `${Math.min(quota.chat.percentage, 100)}%` }} />
                </div>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* User Menu */}
      <div className="p-4 border-t border-gray-700/50">
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-left hover:bg-gray-800/50 transition-colors"
          >
            <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-gray-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-white truncate">
                {user?.name || user?.full_name || user?.email || 'User'}
              </div>
              <div className="text-xs text-gray-400 truncate">
                {user?.email || 'No email'}
              </div>
            </div>
          </button>

          {showUserMenu && (
            <div className="absolute bottom-full left-0 right-0 mb-2 bg-gray-800/90 backdrop-blur-sm border border-gray-700/50 rounded-xl shadow-xl">
              <div className="p-2">
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    // TODO: Navigate to settings
                  }}
                  className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-lg transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  <span>Settings</span>
                </button>
                
                {/* Error message display */}
                {error && (
                  <div className="px-3 py-2 mb-1">
                    <div className="flex items-center space-x-2 text-xs text-red-400 bg-red-900/20 rounded-lg px-2 py-1">
                      <AlertCircle className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{error}</span>
                      <button
                        onClick={clearError}
                        className="text-red-300 hover:text-red-200 ml-auto"
                        title="Dismiss error"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )}
                
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    handleSignOut();
                  }}
                  disabled={isSigningOut}
                  className={`w-full flex items-center space-x-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                    isSigningOut
                      ? 'text-gray-500 bg-gray-700/30 cursor-not-allowed'
                      : 'text-red-400 hover:bg-red-900/20 hover:text-red-300'
                  }`}
                >
                  {isSigningOut ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <LogOut className="w-4 h-4" />
                  )}
                  <span>{isSigningOut ? 'Signing out...' : 'Sign Out'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
