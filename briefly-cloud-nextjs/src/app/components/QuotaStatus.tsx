"use client";

import { useEffect, useState } from 'react';
import { FileText, HardDrive, MessageSquare, AlertTriangle, TrendingUp, Zap } from 'lucide-react';

interface QuotaData {
  files: {
    used: number;
    limit: number;
    percentage: number;
    remaining: number;
    limitReached: boolean;
  };
  storage: {
    used: number;
    limit: number;
    percentage: number;
    remaining: number;
    limitReached: boolean;
  };
  chat: {
    used: number;
    limit: number;
    percentage: number;
    remaining: number;
    limitReached: boolean;
  };
  trial: {
    active: boolean;
    daysRemaining: number;
    endDate: string | null;
  };
  tier: string;
  status: string;
}

interface QuotaStatusProps {
  className?: string;
}

export function QuotaStatus({ className = '' }: QuotaStatusProps) {
  const [quota, setQuota] = useState<QuotaData | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchQuotaStatus();
  }, []);

  const fetchQuotaStatus = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/usage/quota', {
        credentials: 'include',
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch quota status');
      }

      const data = await response.json();
      
      if (data.success && data.data) {
        setQuota(data.data);
        setWarnings(data.data.warnings || []);
      } else {
        throw new Error(data.message || 'Invalid response format');
      }
    } catch (err) {
      console.error('Error fetching quota:', err);
      setError(err instanceof Error ? err.message : 'Failed to load quota');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className={`bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 ${className}`}>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  if (error || !quota) {
    return (
      <div className={`bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 ${className}`}>
        <div className="flex items-center space-x-2 text-red-400">
          <AlertTriangle className="w-5 h-5" />
          <span className="text-sm">{error || 'Failed to load quota'}</span>
        </div>
      </div>
    );
  }

  const getProgressColor = (percentage: number, limitReached: boolean) => {
    if (limitReached || percentage >= 100) return 'bg-red-500';
    if (percentage >= 90) return 'bg-orange-500';
    if (percentage >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getTextColor = (percentage: number, limitReached: boolean) => {
    if (limitReached || percentage >= 100) return 'text-red-400';
    if (percentage >= 90) return 'text-orange-400';
    if (percentage >= 70) return 'text-yellow-400';
    return 'text-green-400';
  };

  return (
    <div className={`bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Usage & Limits</h3>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-400 capitalize">{quota.tier} Plan</span>
          {quota.trial.active && (
            <span className="px-2 py-0.5 bg-blue-900/50 text-blue-300 text-xs rounded-full">
              Trial: {quota.trial.daysRemaining}d left
            </span>
          )}
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3 space-y-1">
          {warnings.map((warning, index) => (
            <div key={index} className="flex items-start space-x-2 text-xs text-yellow-300">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}

      {/* Quota Meters */}
      <div className="space-y-3">
        {/* Files */}
        <QuotaMeter
          icon={<FileText className="w-4 h-4" />}
          label="Files"
          used={quota.files.used}
          limit={quota.files.limit}
          percentage={quota.files.percentage}
          limitReached={quota.files.limitReached}
          getProgressColor={getProgressColor}
          getTextColor={getTextColor}
        />

        {/* Storage */}
        <QuotaMeter
          icon={<HardDrive className="w-4 h-4" />}
          label="Storage"
          used={quota.storage.used}
          limit={quota.storage.limit}
          percentage={quota.storage.percentage}
          limitReached={quota.storage.limitReached}
          unit="MB"
          getProgressColor={getProgressColor}
          getTextColor={getTextColor}
        />

        {/* Chat Messages */}
        <QuotaMeter
          icon={<MessageSquare className="w-4 h-4" />}
          label="Chat Messages"
          used={quota.chat.used}
          limit={quota.chat.limit}
          percentage={quota.chat.percentage}
          limitReached={quota.chat.limitReached}
          getProgressColor={getProgressColor}
          getTextColor={getTextColor}
        />
      </div>

      {/* Upgrade CTA for free tier */}
      {quota.tier === 'free' && (quota.files.percentage >= 70 || quota.storage.percentage >= 70) && (
        <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-700/50 rounded-lg p-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-1">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-white">Upgrade to Pro</span>
              </div>
              <p className="text-xs text-gray-300">
                Get 10x more storage, files, and chat messages
              </p>
            </div>
            <button
              onClick={() => window.location.href = '/pricing'}
              className="flex items-center space-x-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Zap className="w-3 h-3" />
              <span>Upgrade</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface QuotaMeterProps {
  icon: React.ReactNode;
  label: string;
  used: number;
  limit: number;
  percentage: number;
  limitReached: boolean;
  unit?: string;
  getProgressColor: (percentage: number, limitReached: boolean) => string;
  getTextColor: (percentage: number, limitReached: boolean) => string;
}

function QuotaMeter({
  icon,
  label,
  used,
  limit,
  percentage,
  limitReached,
  unit = '',
  getProgressColor,
  getTextColor
}: QuotaMeterProps) {
  const progressColor = getProgressColor(percentage, limitReached);
  const textColor = getTextColor(percentage, limitReached);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2 text-gray-300">
          {icon}
          <span>{label}</span>
        </div>
        <span className={`font-medium ${textColor}`}>
          {used.toFixed(unit === 'MB' ? 1 : 0)}/{limit}{unit ? ` ${unit}` : ''}
        </span>
      </div>
      
      {/* Progress Bar */}
      <div className="relative w-full h-2 bg-gray-700/50 rounded-full overflow-hidden">
        <div
          className={`absolute top-0 left-0 h-full ${progressColor} transition-all duration-300 ease-out`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      
      {/* Percentage */}
      <div className="flex justify-end">
        <span className={`text-xs ${textColor}`}>
          {percentage.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

