"use client";

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { 
  MessageSquare, 
  FileText, 
  Cloud, 
  Settings, 
  LogOut,
  User
} from 'lucide-react';

interface SidebarProps {
  activeTab: 'chat' | 'files' | 'storage';
  setActiveTab: (tab: 'chat' | 'files' | 'storage') => void;
  user: any;
}

export function Sidebar({ activeTab, setActiveTab, user }: SidebarProps) {
  const [showUserMenu, setShowUserMenu] = useState(false);

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
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">Briefly</h1>
        <p className="text-sm text-gray-600">AI Document Assistant</p>
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
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-colors ${
                isActive 
                  ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-5 h-5" />
              <div>
                <div className="font-medium">{item.label}</div>
                <div className="text-xs text-gray-500">{item.description}</div>
              </div>
            </button>
          );
        })}
      </nav>

      {/* User Menu */}
      <div className="p-4 border-t border-gray-200">
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left hover:bg-gray-50 transition-colors"
          >
            <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-gray-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 truncate">
                {user?.name || user?.email}
              </div>
              <div className="text-xs text-gray-500 truncate">
                {user?.email}
              </div>
            </div>
          </button>

          {showUserMenu && (
            <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg">
              <div className="p-2">
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    // TODO: Navigate to settings
                  }}
                  className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded"
                >
                  <Settings className="w-4 h-4" />
                  <span>Settings</span>
                </button>
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    signOut({ callbackUrl: '/' });
                  }}
                  className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded"
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
