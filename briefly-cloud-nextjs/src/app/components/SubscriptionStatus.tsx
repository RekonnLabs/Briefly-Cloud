"use client";

import { useState } from 'react';
import { Crown, CreditCard, Zap, AlertCircle } from 'lucide-react';
import { CompleteUserData } from '@/app/lib/user-data-types';

interface SubscriptionStatusProps {
  user: CompleteUserData | null;
}

// Price IDs — monthly and annual
const PRICE_IDS = {
  pro_monthly: undefined,       // resolved server-side from STRIPE_PRO_PRICE_ID env var
  pro_annual: 'price_1TDoQxCyLd2ewSj072pIukU7',
  byok_monthly: undefined,      // resolved server-side from STRIPE_BYOK_PRICE_ID env var
  byok_annual: 'price_1TDoR0CyLd2ewSj0TqMQoBBd',
} as const

export function SubscriptionStatus({ user }: SubscriptionStatusProps) {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');

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
        name: 'Pro Trial',  // All free-tier users are in trial — no permanent free tier
        icon: '⏳',
        color: 'text-blue-300',
        bgColor: 'bg-blue-900/30',
        description: '14-day trial'
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

  const startCheckout = async (planTier: 'pro' | 'pro_byok', period: 'monthly' | 'annual') => {
    setIsLoading(true);
    try {
      const body: Record<string, string> = { tier: planTier }
      // For annual, pass the explicit price_id so the checkout route uses it directly
      if (period === 'annual') {
        body.price_id = planTier === 'pro' ? PRICE_IDS.pro_annual : PRICE_IDS.byok_annual
      }
      const response = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        const { data } = await response.json();
        if (data?.url) window.location.href = data.url;
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

        {/* Usage indicator for trial/free users */}
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
        
        {/* Upgrade button — shown for all trial/free users */}
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

            {/* Monthly / Annual toggle */}
            <div className="flex items-center justify-center mb-5">
              <div className="flex bg-gray-800 rounded-lg p-1 gap-1">
                <button
                  onClick={() => setBillingPeriod('monthly')}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    billingPeriod === 'monthly'
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingPeriod('annual')}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    billingPeriod === 'annual'
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Annual
                  <span className="ml-1.5 text-xs text-green-400 font-semibold">save 2 months</span>
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {/* Pro Plan */}
              <div className="border border-gray-700/50 bg-gray-800/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-3">
                    <Crown className="w-5 h-5 text-blue-400" />
                    <h4 className="font-medium text-white">Pro Plan</h4>
                  </div>
                  <div className="text-right">
                    {billingPeriod === 'monthly' ? (
                      <span className="text-white font-semibold">$30<span className="text-gray-400 text-xs font-normal">/mo</span></span>
                    ) : (
                      <div>
                        <span className="text-white font-semibold">$300<span className="text-gray-400 text-xs font-normal">/yr</span></span>
                        <div className="text-green-400 text-xs">save $60</div>
                      </div>
                    )}
                  </div>
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
                  onClick={() => startCheckout('pro', billingPeriod)}
                  disabled={isLoading}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {isLoading ? 'Processing...' : `Upgrade to Pro — ${billingPeriod === 'annual' ? '$300/yr' : '$30/mo'}`}
                </button>
              </div>

              {/* Pro BYOK Plan */}
              <div className="border border-gray-700/50 bg-gray-800/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-3">
                    <CreditCard className="w-5 h-5 text-purple-400" />
                    <h4 className="font-medium text-white">Pro BYOK</h4>
                  </div>
                  <div className="text-right">
                    {billingPeriod === 'monthly' ? (
                      <span className="text-white font-semibold">$15<span className="text-gray-400 text-xs font-normal">/mo</span></span>
                    ) : (
                      <div>
                        <span className="text-white font-semibold">$150<span className="text-gray-400 text-xs font-normal">/yr</span></span>
                        <div className="text-green-400 text-xs">save $30</div>
                      </div>
                    )}
                  </div>
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
                  onClick={() => startCheckout('pro_byok', billingPeriod)}
                  disabled={isLoading}
                  className="w-full bg-purple-600 text-white py-2 px-4 rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  {isLoading ? 'Processing...' : `Upgrade to Pro BYOK — ${billingPeriod === 'annual' ? '$150/yr' : '$15/mo'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
