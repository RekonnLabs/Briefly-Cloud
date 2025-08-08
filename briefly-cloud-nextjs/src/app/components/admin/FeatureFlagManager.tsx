/**
 * Feature Flag Management Component
 * 
 * Admin interface for managing feature flags, A/B tests, and beta users
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  rollout_percentage: number;
  user_tiers: string[];
  beta_users: string[];
  ab_test_config?: ABTestConfig;
  created_at: string;
  updated_at: string;
}

interface ABTestConfig {
  test_name: string;
  variants: ABTestVariant[];
  traffic_split: Record<string, number>;
  metrics: string[];
  start_date: string;
  end_date?: string;
}

interface ABTestVariant {
  name: string;
  description: string;
  config: Record<string, any>;
}

interface BetaUser {
  id: string;
  email: string;
  subscription_tier: string;
  created_at: string;
}

export default function FeatureFlagManager() {
  const { data: session } = useSession();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [betaUsers, setBetaUsers] = useState<BetaUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'flags' | 'beta-users'>('flags');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Check if user is admin
  const isAdmin = session?.user?.email?.endsWith('@rekonnlabs.com');

  useEffect(() => {
    if (isAdmin) {
      loadData();
    }
  }, [isAdmin]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const [flagsResponse, betaUsersResponse] = await Promise.all([
        fetch('/api/feature-flags'),
        fetch('/api/feature-flags/beta-users')
      ]);

      if (flagsResponse.ok) {
        const flagsData = await flagsResponse.json();
        setFlags(flagsData.flags || []);
      }

      if (betaUsersResponse.ok) {
        const betaUsersData = await betaUsersResponse.json();
        setBetaUsers(betaUsersData.beta_users || []);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const toggleFlag = async (flagId: string, enabled: boolean) => {
    try {
      const response = await fetch(`/api/feature-flags/${flagId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled }),
      });

      if (response.ok) {
        setFlags(prev => prev.map(flag => 
          flag.id === flagId ? { ...flag, enabled } : flag
        ));
      } else {
        throw new Error('Failed to update feature flag');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update flag');
    }
  };

  const updateRollout = async (flagId: string, rollout_percentage: number) => {
    try {
      const response = await fetch(`/api/feature-flags/${flagId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rollout_percentage }),
      });

      if (response.ok) {
        setFlags(prev => prev.map(flag => 
          flag.id === flagId ? { ...flag, rollout_percentage } : flag
        ));
      } else {
        throw new Error('Failed to update rollout percentage');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update rollout');
    }
  };

  const toggleBetaUser = async (userId: string, action: 'add' | 'remove') => {
    try {
      const response = await fetch('/api/feature-flags/beta-users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_id: userId, action }),
      });

      if (response.ok) {
        if (action === 'remove') {
          setBetaUsers(prev => prev.filter(user => user.id !== userId));
        }
        // For 'add', we'd need to reload or add the user to the list
      } else {
        throw new Error('Failed to update beta user');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update beta user');
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <h2 className="text-lg font-semibold text-red-800 mb-2">Access Denied</h2>
        <p className="text-red-600">You don't have permission to access the feature flag manager.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            <div className="h-4 bg-gray-200 rounded w-4/6"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Feature Flag Manager</h1>
        <p className="text-gray-600">Manage feature flags, A/B tests, and beta user groups</p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600">{error}</p>
          <button 
            onClick={() => setError(null)}
            className="mt-2 text-sm text-red-500 hover:text-red-700"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('flags')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'flags'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Feature Flags ({flags.length})
          </button>
          <button
            onClick={() => setActiveTab('beta-users')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'beta-users'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Beta Users ({betaUsers.length})
          </button>
        </nav>
      </div>

      {/* Feature Flags Tab */}
      {activeTab === 'flags' && (
        <div>
          <div className="mb-4 flex justify-between items-center">
            <h2 className="text-lg font-semibold">Feature Flags</h2>
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Create Flag
            </button>
          </div>

          <div className="space-y-4">
            {flags.map((flag) => (
              <div key={flag.id} className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-900">{flag.name}</h3>
                    <p className="text-sm text-gray-600">{flag.description}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={flag.enabled}
                        onChange={(e) => toggleFlag(flag.id, e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Rollout Percentage
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={flag.rollout_percentage}
                        onChange={(e) => updateRollout(flag.id, parseInt(e.target.value))}
                        className="flex-1"
                      />
                      <span className="text-sm font-medium w-12">{flag.rollout_percentage}%</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      User Tiers
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {flag.user_tiers.length > 0 ? (
                        flag.user_tiers.map((tier) => (
                          <span
                            key={tier}
                            className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                          >
                            {tier}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-gray-500">All tiers</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Beta Users
                    </label>
                    <span className="text-sm text-gray-600">
                      {flag.beta_users.length > 0 ? `${flag.beta_users.length} users` : 'None'}
                    </span>
                  </div>
                </div>

                {flag.ab_test_config && (
                  <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                    <h4 className="font-medium text-yellow-800 mb-2">A/B Test Configuration</h4>
                    <div className="text-sm text-yellow-700">
                      <p><strong>Test:</strong> {flag.ab_test_config.test_name}</p>
                      <p><strong>Variants:</strong> {flag.ab_test_config.variants.map(v => v.name).join(', ')}</p>
                      <p><strong>Traffic Split:</strong> {Object.entries(flag.ab_test_config.traffic_split).map(([k, v]) => `${k}: ${v}%`).join(', ')}</p>
                    </div>
                  </div>
                )}

                <div className="mt-3 text-xs text-gray-500">
                  Created: {new Date(flag.created_at).toLocaleDateString()} | 
                  Updated: {new Date(flag.updated_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Beta Users Tab */}
      {activeTab === 'beta-users' && (
        <div>
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Beta Users</h2>
            <p className="text-sm text-gray-600">Users with early access to beta features</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tier
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Joined
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {betaUsers.map((user) => (
                  <tr key={user.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{user.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        {user.subscription_tier}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => toggleBetaUser(user.id, 'remove')}
                        className="text-red-600 hover:text-red-900"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}