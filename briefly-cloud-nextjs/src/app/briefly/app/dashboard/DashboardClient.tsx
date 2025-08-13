"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileUpload } from '@/app/components/FileUpload';
import { ChatInterface } from '@/app/components/ChatInterface';
import { CloudStorage } from '@/app/components/CloudStorage';
import { SubscriptionStatus } from '@/app/components/SubscriptionStatus';
import { Sidebar } from '@/app/components/Sidebar';
import { ErrorBoundary } from '@/app/components/ErrorBoundary';

interface DashboardClientProps {
  user: {
    id: string
    email: string
    name?: string
    image?: string
    subscription_tier: string
    subscription_status: string
    usage_count: number
    usage_limit: number
  }
}

function DashboardContent({ user }: DashboardClientProps) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<'chat' | 'files' | 'storage'>('chat');

  // Set up global error handlers
  useEffect(() => {
    const { setupBrowserErrorHandlers } = require('@/app/lib/error-monitoring');
    setupBrowserErrorHandlers();
  }, []);

  // Load user's preferred default tab and check URL params
  useEffect(() => {
    // Load user's preferred default tab
    const savedTab = localStorage.getItem('briefly-default-tab');
    if (savedTab && ['chat', 'files', 'storage'].includes(savedTab)) {
      setActiveTab(savedTab as 'chat' | 'files' | 'storage');
    }

    // Check for tab parameter in URL
    const tabParam = searchParams.get('tab');
    if (tabParam && ['chat', 'files', 'storage'].includes(tabParam)) {
      setActiveTab(tabParam as 'chat' | 'files' | 'storage');
    }
  }, [searchParams]);

  // Save tab preference when changed
  const handleTabChange = (tab: 'chat' | 'files' | 'storage') => {
    setActiveTab(tab);
    localStorage.setItem('briefly-default-tab', tab);

    // Update URL without causing navigation
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState({}, '', url.toString());
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex">
        {/* Sidebar */}
        <Sidebar activeTab={activeTab} setActiveTab={handleTabChange} user={user} />

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <header className="bg-gray-900/80 backdrop-blur-sm border-b border-gray-700/50 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <img
                  src="/Briefly_Logo_120px.png"
                  alt="Briefly Logo"
                  className="w-10 h-10"
                />
                <div>
                  <h1 className="text-2xl font-bold text-white">Briefly Cloud</h1>
                  <p className="text-sm text-gray-300">AI-Powered Document Assistant</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <SubscriptionStatus user={user} />
                <div className="flex items-center space-x-2">
                  <img
                    src={user?.image || '/default-avatar.png'}
                    alt="Profile"
                    className="w-8 h-8 rounded-full border-2 border-gray-600"
                  />
                  <span className="text-sm font-medium text-gray-200">
                    {user?.name || user?.email}
                  </span>
                </div>
              </div>
            </div>
          </header>

          {/* Content Area */}
          <main className="flex-1 p-6">
            {activeTab === 'chat' && (
              <ErrorBoundary>
                <ChatInterface />
              </ErrorBoundary>
            )}

            {activeTab === 'files' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-white mb-4">Upload Documents</h2>
                  <ErrorBoundary>
                    <FileUpload />
                  </ErrorBoundary>
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white mb-4">Your Documents</h2>
                  {/* Document list component will go here */}
                  <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 shadow-xl p-6">
                    <p className="text-gray-400 text-center">No documents uploaded yet</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'storage' && (
              <ErrorBoundary>
                <CloudStorage />
              </ErrorBoundary>
            )}
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default function DashboardClient({ user }: DashboardClientProps) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    }>
      <DashboardContent user={user} />
    </Suspense>
  );
}