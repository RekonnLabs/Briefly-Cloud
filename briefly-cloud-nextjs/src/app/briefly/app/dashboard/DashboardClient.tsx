"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileUpload } from '@/app/components/FileUpload';
import { ChatInterface } from '@/app/components/ChatInterface';
import { CloudStorage } from '@/app/components/CloudStorage';
import { SubscriptionStatus } from '@/app/components/SubscriptionStatus';
import { Sidebar } from '@/app/components/Sidebar';
import { ErrorBoundary } from '@/app/components/ErrorBoundary';

import { CompleteUserData, UserDataError, getUserDataErrorMessage, isValidUserData } from '@/app/lib/user-data-types'

interface DashboardClientProps {
  user: CompleteUserData | null
  error?: UserDataError
}

function DashboardContent({ user, error }: DashboardClientProps) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<'chat' | 'files' | 'storage'>('chat');

  // Handle error states with specific error messages
  if (error) {
    const errorMessage = getUserDataErrorMessage(error);
    const isAuthError = error.code === 'AUTH_REQUIRED';
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className={`border rounded-lg p-6 ${
            isAuthError 
              ? 'bg-red-900/20 border-red-700/50' 
              : 'bg-yellow-900/20 border-yellow-700/50'
          }`}>
            <div className={`mb-4 ${isAuthError ? 'text-red-400' : 'text-yellow-400'}`}>
              {isAuthError ? (
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              ) : (
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              )}
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">
              {isAuthError ? 'Authentication Required' : 'User Data Error'}
            </h2>
            <p className="text-gray-300 mb-4">{errorMessage}</p>
            <div className="space-y-2">
              {isAuthError ? (
                <a
                  href="/auth/signin"
                  className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Sign In
                </a>
              ) : (
                <button
                  onClick={() => window.location.reload()}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Retry
                </button>
              )}
            </div>
            {process.env.NODE_ENV === 'development' && (
              <details className="mt-4 text-left">
                <summary className="text-sm text-gray-400 cursor-pointer">Debug Info</summary>
                <pre className="text-xs text-gray-500 mt-2 overflow-auto">
                  {JSON.stringify(error, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Handle case where user data is not available but no specific error
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-6">
            <div className="text-yellow-400 mb-4">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">User Data Unavailable</h2>
            <p className="text-gray-300 mb-4">
              Your account information is temporarily unavailable. Some features may be limited.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Validate user data completeness
  if (!isValidUserData(user)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="bg-orange-900/20 border border-orange-700/50 rounded-lg p-6">
            <div className="text-orange-400 mb-4">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Incomplete User Data</h2>
            <p className="text-gray-300 mb-4">
              Your account data is incomplete. Please contact support if this issue persists.
            </p>
            <div className="space-y-2">
              <button
                onClick={() => window.location.reload()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors mr-2"
              >
                Retry
              </button>
              <a
                href="mailto:support@briefly.cloud"
                className="inline-block bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Contact Support
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Set up global error handlers
  useEffect(() => {
    const { setupBrowserErrorHandlers } = require('@/app/lib/error-monitoring');
    setupBrowserErrorHandlers();
  }, []);

  // Load user's preferred default tab and check URL params
  useEffect(() => {
    try {
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
    } catch (error) {
      console.warn('Error loading tab preferences:', error);
      // Fallback to default tab
      setActiveTab('chat');
    }
  }, [searchParams]);

  // Save tab preference when changed
  const handleTabChange = (tab: 'chat' | 'files' | 'storage') => {
    try {
      setActiveTab(tab);
      localStorage.setItem('briefly-default-tab', tab);

      // Update URL without causing navigation
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.replaceState({}, '', url.toString());
    } catch (error) {
      console.warn('Error saving tab preference:', error);
      // Still update the active tab even if localStorage fails
      setActiveTab(tab);
    }
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex">
        {/* Sidebar */}
        <ErrorBoundary>
          <Sidebar activeTab={activeTab} setActiveTab={handleTabChange} user={user} />
        </ErrorBoundary>

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
                <ErrorBoundary>
                  <SubscriptionStatus user={user} />
                </ErrorBoundary>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <img
                      src={user?.image || '/default-avatar.png'}
                      alt="Profile"
                      className="w-8 h-8 rounded-full border-2 border-gray-600"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = '/default-avatar.png';
                      }}
                    />
                    <span className="text-sm font-medium text-gray-200">
                      {user?.name || user?.full_name || user?.email || 'User'}
                    </span>
                  </div>
                  <form action="/auth/signout" method="post">
                    <button 
                      type="submit"
                      className="text-sm text-gray-400 hover:text-white transition-colors px-3 py-1 rounded border border-gray-600 hover:border-gray-500"
                    >
                      Sign out
                    </button>
                  </form>
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
                {user?.id ? (
                  <CloudStorage userId={user.id} />
                ) : (
                  <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 shadow-xl p-6">
                    <div className="text-center">
                      <div className="text-yellow-400 mb-4">
                        <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                      </div>
                      <p className="text-gray-400">Cloud storage unavailable - user ID missing</p>
                    </div>
                  </div>
                )}
              </ErrorBoundary>
            )}
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default function DashboardClient({ user, error }: DashboardClientProps) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-gray-300">Loading dashboard...</p>
        </div>
      </div>
    }>
      <DashboardContent user={user} error={error} />
    </Suspense>
  );
}