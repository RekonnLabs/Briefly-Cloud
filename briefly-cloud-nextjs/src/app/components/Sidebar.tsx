"use client";

import { useState } from 'react';
// Removed client-side signOut import - using server-side logout
import { 
  MessageSquare, 
  FileText, 
  Cloud, 
  Settings, 
  LogOut,
  User
} from 'lucide-react';
import { CompleteUserData } from '@/app/lib/user-data-types';

interface SidebarProps {
  activeTab: 'chat' | 'files' | 'storage';
  setActiveTab: (tab: 'chat' | 'files' | 'storage') => void;
  user: CompleteUserData | null;
}

export function Sidebar({ activeTab, setActiveTab, user }: SidebarProps) {
  const handleSignOut = () => {
    // Use server-side signout route
    window.location.href = '/api/auth/signout'
  }
  const [showUserMenu, setShowUserMenu] = useState(false);

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
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    handleSignOut();
                  }}
                  className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-red-400 hover:bg-red-900/20 hover:text-red-300 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
