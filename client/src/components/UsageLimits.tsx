import React, { useState, useEffect } from 'react';
import { AlertTriangle, BarChart3, Zap, FileText, MessageSquare, Database } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

// Temporary inline Alert components until module resolution is fixed
const Alert = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={`relative w-full rounded-lg border p-4 bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200 ${className || ''}`}
      {...props}
    />
  )
);
Alert.displayName = 'Alert';

const AlertDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={`text-sm leading-relaxed ${className || ''}`}
      {...props}
    />
  )
);
AlertDescription.displayName = 'AlertDescription';

interface UsageData {
  tier: string;
  documents_uploaded: number;
  documents_limit: number;
  chat_messages_count: number;
  chat_messages_limit: number;
  api_calls_count: number;
  api_calls_limit: number;
  storage_used_bytes: number;
  storage_limit_bytes: number;
  usage_reset_date: string;
  subscription_status: string;
}

interface UsageLimitsProps {
  userId: string;
  onUpgrade?: () => void;
}

const UsageLimits: React.FC<UsageLimitsProps> = ({ userId, onUpgrade }) => {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUsageData();
  }, [userId]);

  const fetchUsageData = async () => {
    try {
      const response = await fetch(`/api/usage/${userId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supabase_token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch usage data');
      }

      const data = await response.json();
      setUsage(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const getUsagePercentage = (current: number, limit: number): number => {
    return Math.min((current / limit) * 100, 100);
  };

  const getProgressColor = (percentage: number): string => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 80) return 'bg-yellow-500';
    return 'bg-blue-500';
  };

  const getTierBadgeColor = (tier: string): string => {
    switch (tier) {
      case 'free': return 'bg-gray-100 text-gray-800';
      case 'pro': return 'bg-blue-100 text-blue-800';
      case 'pro_byok': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatResetDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="space-y-2">
              <div className="h-3 bg-gray-200 rounded"></div>
              <div className="h-3 bg-gray-200 rounded w-5/6"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !usage) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {error || 'Unable to load usage data'}
        </AlertDescription>
      </Alert>
    );
  }

  const documentsPercentage = getUsagePercentage(usage.documents_uploaded, usage.documents_limit);
  const chatPercentage = getUsagePercentage(usage.chat_messages_count, usage.chat_messages_limit);
  const apiPercentage = getUsagePercentage(usage.api_calls_count, usage.api_calls_limit);
  const storagePercentage = getUsagePercentage(usage.storage_used_bytes, usage.storage_limit_bytes);

  const hasWarnings = [documentsPercentage, chatPercentage, apiPercentage, storagePercentage]
    .some(p => p >= 80);

  return (
    <div className="space-y-4">
      {hasWarnings && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            You're approaching your usage limits. Consider upgrading your plan for higher limits.
            {onUpgrade && (
              <Button
                variant="link"
                className="p-0 h-auto ml-2"
                onClick={onUpgrade}
              >
                Upgrade now
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Usage Overview
              </CardTitle>
              <CardDescription>
                Current usage for your {usage.tier.replace('_', ' ')} plan
              </CardDescription>
            </div>
            <Badge className={getTierBadgeColor(usage.tier)}>
              {usage.tier.replace('_', ' ').toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Documents */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span>Documents</span>
              </div>
              <span className="text-gray-500">
                {usage.documents_uploaded} / {usage.documents_limit}
              </span>
            </div>
            <Progress
              value={documentsPercentage}
              className="h-2"
            />
          </div>

          {/* Chat Messages */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                <span>Chat Messages</span>
              </div>
              <span className="text-gray-500">
                {usage.chat_messages_count} / {usage.chat_messages_limit}
              </span>
            </div>
            <Progress
              value={chatPercentage}
              className="h-2"
            />
          </div>

          {/* API Calls */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                <span>API Calls</span>
              </div>
              <span className="text-gray-500">
                {usage.api_calls_count} / {usage.api_calls_limit}
              </span>
            </div>
            <Progress
              value={apiPercentage}
              className="h-2"
            />
          </div>

          {/* Storage */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                <span>Storage</span>
              </div>
              <span className="text-gray-500">
                {formatBytes(usage.storage_used_bytes)} / {formatBytes(usage.storage_limit_bytes)}
              </span>
            </div>
            <Progress
              value={storagePercentage}
              className="h-2"
            />
          </div>

          <div className="pt-4 border-t text-sm text-gray-500">
            Usage resets on {formatResetDate(usage.usage_reset_date)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default UsageLimits;