/**
 * GDPR Dashboard Component
 * 
 * Provides users with tools to manage their data and privacy rights
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface ConsentState {
  essential: boolean;
  analytics: boolean;
  marketing: boolean;
  functional: boolean;
}

interface DataRequest {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requested_at: string;
  completed_at?: string;
  download_url?: string;
  expires_at?: string;
}

export default function GDPRDashboard() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<'consent' | 'export' | 'deletion'>('consent');
  const [consent, setConsent] = useState<ConsentState>({
    essential: true,
    analytics: false,
    marketing: false,
    functional: false
  });
  const [exportRequests, setExportRequests] = useState<DataRequest[]>([]);
  const [deletionRequests, setDeletionRequests] = useState<DataRequest[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session?.user) {
      loadUserData();
    }
  }, [session]);

  const loadUserData = async () => {
    try {
      setLoading(true);

      // Load consent preferences
      const consentResponse = await fetch('/api/gdpr/consent');
      if (consentResponse.ok) {
        const consentData = await consentResponse.json();
        setConsent({
          essential: true, // Always true
          analytics: consentData.analytics?.granted || false,
          marketing: consentData.marketing?.granted || false,
          functional: consentData.functional?.granted || false
        });
      }

      // Load export requests
      const exportResponse = await fetch('/api/gdpr/data-export');
      if (exportResponse.ok) {
        const exportData = await exportResponse.json();
        setExportRequests(exportData.requests || []);
      }

      // Load deletion requests
      const deletionResponse = await fetch('/api/gdpr/data-deletion');
      if (deletionResponse.ok) {
        const deletionData = await deletionResponse.json();
        setDeletionRequests(deletionData.requests || []);
      }

    } catch (error) {
      console.error('Error loading GDPR data:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateConsent = async (newConsent: ConsentState) => {
    try {
      setLoading(true);

      const response = await fetch('/api/gdpr/consent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          consent: newConsent,
          metadata: {
            version: '1.0',
            user_agent: navigator.userAgent
          }
        }),
      });

      if (response.ok) {
        setConsent(newConsent);
        alert('Consent preferences updated successfully');
      } else {
        throw new Error('Failed to update consent');
      }

    } catch (error) {
      console.error('Error updating consent:', error);
      alert('Failed to update consent preferences');
    } finally {
      setLoading(false);
    }
  };

  const requestDataExport = async () => {
    try {
      setLoading(true);

      const response = await fetch('/api/gdpr/data-export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        alert(`Data export request submitted. ${data.estimated_completion}`);
        loadUserData(); // Refresh the list
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Failed to request data export');
      }

    } catch (error) {
      console.error('Error requesting data export:', error);
      alert(error instanceof Error ? error.message : 'Failed to request data export');
    } finally {
      setLoading(false);
    }
  };

  const requestDataDeletion = async (deletionType: 'account' | 'data_only') => {
    const confirmMessage = deletionType === 'account' 
      ? 'This will permanently delete your account and all data. This action cannot be undone. Are you sure?'
      : 'This will delete your data but keep your account active. Are you sure?';

    if (!confirm(confirmMessage)) {
      return;
    }

    const reason = prompt('Please provide a reason for deletion (optional):');

    try {
      setLoading(true);

      const response = await fetch('/api/gdpr/data-deletion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deletion_type: deletionType,
          reason: reason || undefined
        }),
      });

      if (response.ok) {
        const data = await response.json();
        alert(`Data deletion request submitted. ${data.estimated_completion}`);
        loadUserData(); // Refresh the list
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Failed to request data deletion');
      }

    } catch (error) {
      console.error('Error requesting data deletion:', error);
      alert(error instanceof Error ? error.message : 'Failed to request data deletion');
    } finally {
      setLoading(false);
    }
  };

  const handleConsentChange = (type: keyof ConsentState, value: boolean) => {
    if (type === 'essential') return; // Essential consent cannot be changed
    
    const newConsent = { ...consent, [type]: value };
    setConsent(newConsent);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-100';
      case 'processing': return 'text-blue-600 bg-blue-100';
      case 'failed': return 'text-red-600 bg-red-100';
      default: return 'text-yellow-600 bg-yellow-100';
    }
  };

  if (!session?.user) {
    return (
      <div className="p-6 bg-gray-50 rounded-lg">
        <p className="text-gray-600">Please sign in to access your privacy dashboard.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="bg-blue-600 text-white p-6">
          <h1 className="text-2xl font-bold mb-2">Privacy & Data Management</h1>
          <p className="text-blue-100">
            Manage your data, privacy preferences, and exercise your rights under GDPR
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200">
          <nav className="flex">
            {[
              { key: 'consent', label: 'Consent Management', icon: '🔒' },
              { key: 'export', label: 'Data Export', icon: '📥' },
              { key: 'deletion', label: 'Data Deletion', icon: '🗑️' }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex items-center gap-2 px-6 py-4 font-medium text-sm border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* Consent Management Tab */}
          {activeTab === 'consent' && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Consent Preferences</h2>
              <p className="text-gray-600 mb-6">
                Control how we use your data. You can change these preferences at any time.
              </p>

              <div className="space-y-6">
                {/* Essential Cookies */}
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">Essential Data Processing</h3>
                    <div className="flex items-center">
                      <span className="text-sm text-gray-500 mr-2">Always Active</span>
                      <div className="w-12 h-6 bg-blue-600 rounded-full relative">
                        <div className="w-5 h-5 bg-white rounded-full absolute top-0.5 right-0.5"></div>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600">
                    Required for basic functionality, authentication, and security. Cannot be disabled.
                  </p>
                </div>

                {/* Analytics */}
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">Analytics & Performance</h3>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={consent.analytics}
                        onChange={(e) => handleConsentChange('analytics', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-12 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  <p className="text-sm text-gray-600">
                    Help us improve our service by collecting anonymous usage statistics and performance data.
                  </p>
                </div>

                {/* Marketing */}
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">Marketing Communications</h3>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={consent.marketing}
                        onChange={(e) => handleConsentChange('marketing', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-12 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  <p className="text-sm text-gray-600">
                    Receive updates about new features, tips, and promotional content.
                  </p>
                </div>

                {/* Functional */}
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">Enhanced Functionality</h3>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={consent.functional}
                        onChange={(e) => handleConsentChange('functional', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-12 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  <p className="text-sm text-gray-600">
                    Enable features like chat history, personalized settings, and improved user experience.
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <button
                  onClick={() => updateConsent(consent)}
                  disabled={loading}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors"
                >
                  {loading ? 'Saving...' : 'Save Preferences'}
                </button>
              </div>
            </div>
          )}

          {/* Data Export Tab */}
          {activeTab === 'export' && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Data Export</h2>
              <p className="text-gray-600 mb-6">
                Download a copy of all your data. This includes your profile, documents, chat history, and preferences.
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h3 className="font-medium text-blue-900 mb-2">What's included in your export:</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• User profile and account information</li>
                  <li>• Uploaded documents and metadata</li>
                  <li>• Chat conversations and message history</li>
                  <li>• Consent records and preferences</li>
                  <li>• Connected cloud storage information</li>
                </ul>
              </div>

              <button
                onClick={requestDataExport}
                disabled={loading}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg font-medium transition-colors mb-6"
              >
                {loading ? 'Requesting...' : 'Request Data Export'}
              </button>

              {/* Export Requests History */}
              {exportRequests.length > 0 && (
                <div>
                  <h3 className="font-medium mb-3">Export Requests</h3>
                  <div className="space-y-3">
                    {exportRequests.map((request) => (
                      <div key={request.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(request.status)}`}>
                            {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                          </span>
                          <span className="text-sm text-gray-500">
                            {new Date(request.requested_at).toLocaleDateString()}
                          </span>
                        </div>
                        {request.status === 'completed' && request.download_url && (
                          <div className="mt-2">
                            <a
                              href={request.download_url}
                              className="text-blue-600 hover:text-blue-800 text-sm underline"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Download Export
                            </a>
                            {request.expires_at && (
                              <span className="text-xs text-gray-500 ml-2">
                                (Expires: {new Date(request.expires_at).toLocaleDateString()})
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Data Deletion Tab */}
          {activeTab === 'deletion' && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Data Deletion</h2>
              <p className="text-gray-600 mb-6">
                Request deletion of your data or entire account. This action cannot be undone.
              </p>

              <div className="space-y-4 mb-6">
                <div className="border border-yellow-200 bg-yellow-50 rounded-lg p-4">
                  <h3 className="font-medium text-yellow-900 mb-2">Delete Data Only</h3>
                  <p className="text-sm text-yellow-800 mb-3">
                    Removes all your documents, chat history, and personal data while keeping your account active.
                  </p>
                  <button
                    onClick={() => requestDataDeletion('data_only')}
                    disabled={loading}
                    className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-400 text-white rounded font-medium transition-colors"
                  >
                    {loading ? 'Requesting...' : 'Delete My Data'}
                  </button>
                </div>

                <div className="border border-red-200 bg-red-50 rounded-lg p-4">
                  <h3 className="font-medium text-red-900 mb-2">Delete Entire Account</h3>
                  <p className="text-sm text-red-800 mb-3">
                    Permanently deletes your account and all associated data. This action cannot be undone.
                  </p>
                  <button
                    onClick={() => requestDataDeletion('account')}
                    disabled={loading}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded font-medium transition-colors"
                  >
                    {loading ? 'Requesting...' : 'Delete My Account'}
                  </button>
                </div>
              </div>

              {/* Deletion Requests History */}
              {deletionRequests.length > 0 && (
                <div>
                  <h3 className="font-medium mb-3">Deletion Requests</h3>
                  <div className="space-y-3">
                    {deletionRequests.map((request) => (
                      <div key={request.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(request.status)}`}>
                              {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                            </span>
                            <span className="text-sm text-gray-600">
                              ({(request as any).deletion_type === 'account' ? 'Full Account' : 'Data Only'})
                            </span>
                          </div>
                          <span className="text-sm text-gray-500">
                            {new Date(request.requested_at).toLocaleDateString()}
                          </span>
                        </div>
                        {(request as any).reason && (
                          <p className="text-sm text-gray-600 mt-2">
                            Reason: {(request as any).reason}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}