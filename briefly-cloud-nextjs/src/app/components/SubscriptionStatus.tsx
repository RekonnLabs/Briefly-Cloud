"use client";

import { useState } from 'react';
import { Crown, CreditCard, Zap, AlertCircle } from 'lucide-react';
import { CompleteUserData } from '@/app/lib/user-data-types';

interface SubscriptionStatusProps {
  user: CompleteUserData | null;
}

export function SubscriptionStatus({ user }: SubscriptionStatusProps) {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Handle case where user data is not available
  if (!user) {
    return (
      <div className="flex items-center space-x-2">
        <div className="px-3 py-1 rounded-full text-xs font-medium border border-gray-600/50 bg-gray-800/50 text-gray-400">
          <AlertCircle className="w-3 h-3 inline mr-1" />
          <span>User data unavailable</span>
        </div>
      </div>
    );
  }

  const tier = user.subscription_tier || 'free';
  const status = user.subscription_status || 'active';

  const getTierInfo = (tier: string, status: string) => {
    const baseInfo = {
      free: {
        name: 'Free',
        icon: '🆓',
        color: 'text-gray-300',
        bgColor: 'bg-gray-800/50',
        description: 'Basic features'
      },
      pro: {
        name: 'Pro',
        icon: '⭐',
        color: 'text-blue-300',
        bgColor: 'bg-blue-900/50',
        description: 'Advanced features'
      },
      pro_byok: {
        name: 'Pro BYOK',
        icon: '👑',
        color: 'text-purple-300',
        bgColor: 'bg-purple-900/50',
        description: 'Bring your own key'
      }
    };

    const info = baseInfo[tier as keyof typeof baseInfo] || baseInfo.free;

    // Modify appearance based on subscription status
    if (status === 'past_due' || status === 'unpaid') {
      return {
        ...info,
        color: 'text-red-300',
        bgColor: 'bg-red-900/50',
        description: 'Payment required'
      };
    } else if (status === 'canceled') {
      return {
        ...info,
        color: 'text-orange-300',
        bgColor: 'bg-orange-900/50',
        description: 'Canceled'
      };
    } else if (status === 'trialing') {
      return {
        ...info,
        description: 'Trial period'
      };
    }

    return info;
  };

  const tierInfo = getTierInfo(tier, status);

  // Calculate usage percentage for display
  const usagePercentage = user.usage_limit > 0 
    ? Math.round((user.usage_count / user.usage_limit) * 100)
    : 0;

  const isNearLimit = usagePercentage >= 80;
  const isOverLimit = usagePercentage >= 100;

  const upgradeToPro = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tier: 'pro' })
      });

      if (response.ok) {
        const { url } = await response.json();
        window.location.href = url;
      } else {
        throw new Error('Failed to create checkout session');
      }
    } catch (error) {
      console.error('Upgrade error:', error);
      alert('Failed to start upgrade process. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const upgradeToProBYOK = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tier: 'pro_byok' })
      });

      if (response.ok) {
        const { url } = await response.json();
        window.location.href = url;
      } else {
        throw new Error('Failed to create checkout session');
      }
    } catch (error) {
      console.error('Upgrade error:', error);
      alert('Failed to start upgrade process. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="flex items-center space-x-2">
        <div className={`px-3 py-1 rounded-full text-xs font-medium border border-gray-600/50 ${tierInfo.bgColor} ${tierInfo.color}`}>
          <span className="mr-1">{tierInfo.icon}</span>
          {tierInfo.name}
          {status === 'trialing' && user.trial_end_date && (
            <span className="ml-1 text-xs opacity-75">
              (Trial)
            </span>
          )}
        </div>

        {/* Usage indicator for free tier */}
        {tier === 'free' && (
          <div className={`px-2 py-1 rounded text-xs ${
            isOverLimit 
              ? 'bg-red-900/50 text-red-300' 
              : isNearLimit 
                ? 'bg-yellow-900/50 text-yellow-300'
                : 'bg-gray-800/50 text-gray-400'
          }`}>
            {user.usage_count}/{user.usage_limit}
          </div>
        )}
        
        {tier === 'free' && (
          <button
            onClick={() => setShowUpgradeModal(true)}
            className="flex items-center space-x-1 px-3 py-1 text-xs bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors shadow-lg"
          >
            <Zap className="w-3 h-3" />
            <span>Upgrade</span>
          </button>
        )}

        {/* Show warning for problematic subscription statuses */}
        {(status === 'past_due' || status === 'unpaid' || status === 'canceled') && (
          <div className="px-2 py-1 rounded text-xs bg-red-900/50 text-red-300 border border-red-700/50">
            <AlertCircle className="w-3 h-3 inline mr-1" />
            {status === 'past_due' ? 'Payment Due' : 
             status === 'unpaid' ? 'Payment Failed' : 
             'Subscription Canceled'}
          </div>
        )}
      </div>

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-gray-900/90 backdrop-blur-sm border border-gray-700/50 rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Upgrade Your Plan</h3>
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="text-gray-400 hover:text-gray-200 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="border border-gray-700/50 bg-gray-800/50 rounded-xl p-4">
                <div className="flex items-center space-x-3 mb-2">
                  <Crown className="w-5 h-5 text-blue-400" />
                  <h4 className="font-medium text-white">Pro Plan</h4>
                </div>
                <p className="text-sm text-gray-300 mb-3">
                  Advanced AI features with GPT-5-mini model
                </p>
                <ul className="text-xs text-gray-400 space-y-1 mb-4">
                  <li>• Higher message limits</li>
                  <li>• Better AI responses</li>
                  <li>• Priority support</li>
                </ul>
                <button
                  onClick={upgradeToPro}
                  disabled={isLoading}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {isLoading ? 'Processing...' : 'Upgrade to Pro'}
                </button>
              </div>

              <div className="border border-gray-700/50 bg-gray-800/50 rounded-xl p-4">
                <div className="flex items-center space-x-3 mb-2">
                  <CreditCard className="w-5 h-5 text-purple-400" />
                  <h4 className="font-medium text-white">Pro BYOK</h4>
                </div>
                <p className="text-sm text-gray-300 mb-3">
                  Use your own OpenAI API key
                </p>
                <ul className="text-xs text-gray-400 space-y-1 mb-4">
                  <li>• Bring your own API key</li>
                  <li>• Full control over costs</li>
                  <li>• Custom model selection</li>
                </ul>
                <button
                  onClick={upgradeToProBYOK}
                  disabled={isLoading}
                  className="w-full bg-purple-600 text-white py-2 px-4 rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  {isLoading ? 'Processing...' : 'Upgrade to Pro BYOK'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
