"use client";

import { useState } from 'react';
import { Crown, CreditCard, Zap } from 'lucide-react';

interface SubscriptionStatusProps {
  user: any;
}

export function SubscriptionStatus({ user }: SubscriptionStatusProps) {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const tier = user?.subscription_tier || 'free';
  const status = user?.subscription_status || 'active';

  const getTierInfo = (tier: string) => {
    switch (tier) {
      case 'free':
        return {
          name: 'Free',
          icon: '🆓',
          color: 'text-gray-600',
          bgColor: 'bg-gray-100',
          description: 'Basic features'
        };
      case 'pro':
        return {
          name: 'Pro',
          icon: '⭐',
          color: 'text-blue-600',
          bgColor: 'bg-blue-100',
          description: 'Advanced features'
        };
      case 'pro_byok':
        return {
          name: 'Pro BYOK',
          icon: '👑',
          color: 'text-purple-600',
          bgColor: 'bg-purple-100',
          description: 'Bring your own key'
        };
      default:
        return {
          name: 'Free',
          icon: '🆓',
          color: 'text-gray-600',
          bgColor: 'bg-gray-100',
          description: 'Basic features'
        };
    }
  };

  const tierInfo = getTierInfo(tier);

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
        <div className={`px-3 py-1 rounded-full text-xs font-medium ${tierInfo.bgColor} ${tierInfo.color}`}>
          <span className="mr-1">{tierInfo.icon}</span>
          {tierInfo.name}
        </div>
        
        {tier === 'free' && (
          <button
            onClick={() => setShowUpgradeModal(true)}
            className="flex items-center space-x-1 px-3 py-1 text-xs bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
          >
            <Zap className="w-3 h-3" />
            <span>Upgrade</span>
          </button>
        )}
      </div>

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Upgrade Your Plan</h3>
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center space-x-3 mb-2">
                  <Crown className="w-5 h-5 text-blue-600" />
                  <h4 className="font-medium text-gray-900">Pro Plan</h4>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  Advanced AI features with GPT-5-mini model
                </p>
                <ul className="text-xs text-gray-600 space-y-1 mb-4">
                  <li>• Higher message limits</li>
                  <li>• Better AI responses</li>
                  <li>• Priority support</li>
                </ul>
                <button
                  onClick={upgradeToPro}
                  disabled={isLoading}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {isLoading ? 'Processing...' : 'Upgrade to Pro'}
                </button>
              </div>

              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center space-x-3 mb-2">
                  <CreditCard className="w-5 h-5 text-purple-600" />
                  <h4 className="font-medium text-gray-900">Pro BYOK</h4>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  Use your own OpenAI API key
                </p>
                <ul className="text-xs text-gray-600 space-y-1 mb-4">
                  <li>• Bring your own API key</li>
                  <li>• Full control over costs</li>
                  <li>• Custom model selection</li>
                </ul>
                <button
                  onClick={upgradeToProBYOK}
                  disabled={isLoading}
                  className="w-full bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
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
