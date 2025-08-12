"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileUpload } from '@/app/components/FileUpload';
import { ChatInterface } from '@/app/components/ChatInterface';
import { CloudStorage } from '@/app/components/CloudStorage';
import { SubscriptionStatus } from '@/app/components/SubscriptionStatus';
import { Sidebar } from '@/app/components/Sidebar';
import { ErrorBoundary } from '@/app/components/ErrorBoundary';

function DashboardContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<'chat' | 'files' | 'storage'>('chat');

  // Set up global error handlers
  useEffect(() => {
    const { setupBrowserErrorHandlers } = require('@/app/lib/error-monitoring');
    setupBrowserErrorHandlers();
  }, []);

  // Handle authentication check
  useEffect(() => {
    if (status === 'loading') return;

    // Check if we're being accessed via proxy (from rekonnlabs.com)
    const isProxied = window.location.hostname === 'rekonnlabs.com' || 
                     window.location.hostname.includes('rekonnlabs.com');

    if (!session && !isProxied) {
      // Only redirect to NextAuth signin if accessed directly (not via proxy)
      const returnUrl = window.location.pathname + window.location.search;
      const encodedReturnUrl = encodeURIComponent(returnUrl);
      router.replace(`/api/auth/signin?callbackUrl=${encodedReturnUrl}`);
      return;
    }

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
  }, [session, status, router, searchParams]);

  // Save tab preference when changed
  const handleTabChange = (tab: 'chat' | 'files' | 'storage') => {
    setActiveTab(tab);
    localStorage.setItem('briefly-default-tab', tab);
    
    // Update URL without causing navigation
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState({}, '', url.toString());
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Check if we're being accessed via proxy
  const isProxied = typeof window !== 'undefined' && 
                   (window.location.hostname === 'rekonnlabs.com' || 
                    window.location.hostname.includes('rekonnlabs.com'));

  if (!session && !isProxied) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Redirecting to sign in...</p>
        </div>
      </div>
    );
  }

  // Create a mock session for proxied access
  const effectiveSession = session || (isProxied ? {
    user: {
      id: 'proxy-user',
      email: 'user@rekonnlabs.com',
      name: 'Proxy User',
      subscription_tier: 'free',
      usage_count: 0,
      usage_limit: 100
    }
  } : null);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50 flex">
        {/* Sidebar */}
        <Sidebar activeTab={activeTab} setActiveTab={handleTabChange} user={effectiveSession?.user} />
        
        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <header className="bg-white border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Briefly Cloud</h1>
                <p className="text-sm text-gray-600">AI-Powered Document Assistant</p>
              </div>
              <div className="flex items-center space-x-4">
                <SubscriptionStatus user={effectiveSession?.user} />
                <div className="flex items-center space-x-2">
                  <img 
                    src={effectiveSession?.user?.image || '/default-avatar.png'} 
                    alt="Profile" 
                    className="w-8 h-8 rounded-full"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    {effectiveSession?.user?.name || effectiveSession?.user?.email}
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
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Upload Documents</h2>
                  <ErrorBoundary>
                    <FileUpload />
                  </ErrorBoundary>
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Documents</h2>
                  {/* Document list component will go here */}
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <p className="text-gray-500 text-center">No documents uploaded yet</p>
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

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}