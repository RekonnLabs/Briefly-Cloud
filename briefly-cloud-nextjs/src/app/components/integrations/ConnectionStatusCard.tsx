/**
 * Connection Status Card Component
 * 
 * Displays connection status with user-friendly error messages,
 * retry mechanisms, and progress indicators for OAuth flows.
 */

'use client';

import { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  AlertCircle, 
  XCircle, 
  RefreshCw, 
  Clock, 
  ExternalLink,
  Info,
  Wifi,
  WifiOff,
  Shield,
  ShieldAlert,
  Loader2
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Alert, AlertDescription } from '@/app/components/ui/alert';
import { Progress } from '@/app/components/ui/progress';
import { useToast } from '@/app/components/ui/toast';

export interface ConnectionStatus {
  provider: 'google' | 'microsoft';
  connected: boolean;
  status: 'healthy' | 'expired' | 'invalid' | 'error' | 'connecting' | 'disconnected';
  lastSync?: string;
  error?: string;
  needsRefresh?: boolean;
  canRefresh?: boolean;
  lastChecked?: string;
}

export interface ConnectionStatusCardProps {
  status: ConnectionStatus;
  onConnect?: () => void;
  onRefresh?: () => void;
  onDisconnect?: () => void;
  onHealthCheck?: () => void;
  isLoading?: boolean;
  showAdvanced?: boolean;
  className?: string;
}

interface RetryState {
  isRetrying: boolean;
  attempts: number;
  maxAttempts: number;
  nextRetryIn?: number;
}

interface ProgressState {
  isVisible: boolean;
  message: string;
  progress: number;
  stage: 'initializing' | 'authenticating' | 'connecting' | 'verifying' | 'complete' | 'error';
}

export function ConnectionStatusCard({
  status,
  onConnect,
  onRefresh,
  onDisconnect,
  onHealthCheck,
  isLoading = false,
  showAdvanced = false,
  className = ''
}: ConnectionStatusCardProps) {
  const { showSuccess, showError } = useToast();
  const [retryState, setRetryState] = useState<RetryState>({
    isRetrying: false,
    attempts: 0,
    maxAttempts: 3
  });
  const [progressState, setProgressState] = useState<ProgressState>({
    isVisible: false,
    message: '',
    progress: 0,
    stage: 'initializing'
  });
  const [showDetails, setShowDetails] = useState(false);

  // Auto-retry countdown
  useEffect(() => {
    if (retryState.nextRetryIn && retryState.nextRetryIn > 0) {
      const timer = setTimeout(() => {
        setRetryState(prev => ({
          ...prev,
          nextRetryIn: prev.nextRetryIn ? prev.nextRetryIn - 1 : 0
        }));
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [retryState.nextRetryIn]);

  // Auto-retry when countdown reaches 0
  useEffect(() => {
    if (retryState.nextRetryIn === 0 && retryState.isRetrying) {
      handleRetryConnection();
    }
  }, [retryState.nextRetryIn]);

  const getProviderName = () => {
    return status.provider === 'google' ? 'Google Drive' : 'OneDrive';
  };

  const getStatusIcon = () => {
    if (isLoading || retryState.isRetrying) {
      return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
    }

    switch (status.status) {
      case 'healthy':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'connecting':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'expired':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'invalid':
        return <ShieldAlert className="w-5 h-5 text-red-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'disconnected':
      default:
        return <WifiOff className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusBadge = () => {
    if (isLoading || retryState.isRetrying) {
      return <Badge variant="secondary" className="bg-blue-100 text-blue-800">Connecting...</Badge>;
    }

    switch (status.status) {
      case 'healthy':
        return <Badge variant="default" className="bg-green-100 text-green-800">Connected</Badge>;
      case 'connecting':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800">Connecting</Badge>;
      case 'expired':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Expired</Badge>;
      case 'invalid':
        return <Badge variant="destructive">Invalid</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      case 'disconnected':
      default:
        return <Badge variant="outline" className="text-gray-600">Disconnected</Badge>;
    }
  };

  const getStatusMessage = () => {
    if (retryState.isRetrying) {
      return `Retrying connection (${retryState.attempts}/${retryState.maxAttempts})...`;
    }

    switch (status.status) {
      case 'healthy':
        return `${getProviderName()} is connected and working properly`;
      case 'connecting':
        return `Connecting to ${getProviderName()}...`;
      case 'expired':
        return `${getProviderName()} connection has expired and needs to be refreshed`;
      case 'invalid':
        return `${getProviderName()} connection is invalid - permissions may have been revoked`;
      case 'error':
        return status.error || `${getProviderName()} connection has errors`;
      case 'disconnected':
      default:
        return `${getProviderName()} is not connected`;
    }
  };

  const getActionButtons = () => {
    const buttons = [];

    if (status.status === 'disconnected' || status.status === 'invalid') {
      buttons.push(
        <Button
          key="connect"
          onClick={handleConnect}
          disabled={isLoading || retryState.isRetrying}
          className="flex items-center gap-2"
        >
          <Wifi className="w-4 h-4" />
          Connect {getProviderName()}
        </Button>
      );
    }

    if (status.status === 'expired' && status.canRefresh && onRefresh) {
      buttons.push(
        <Button
          key="refresh"
          onClick={handleRefresh}
          disabled={isLoading || retryState.isRetrying}
          variant="outline"
          className="flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh Connection
        </Button>
      );
    }

    if (status.status === 'error' && retryState.attempts < retryState.maxAttempts) {
      buttons.push(
        <Button
          key="retry"
          onClick={handleRetryConnection}
          disabled={isLoading || retryState.isRetrying}
          variant="outline"
          className="flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          {retryState.nextRetryIn ? `Retry in ${retryState.nextRetryIn}s` : 'Retry Connection'}
        </Button>
      );
    }

    if (status.connected && onHealthCheck) {
      buttons.push(
        <Button
          key="health-check"
          onClick={onHealthCheck}
          disabled={isLoading || retryState.isRetrying}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <Shield className="w-4 h-4" />
          Check Health
        </Button>
      );
    }

    if (status.connected && onDisconnect) {
      buttons.push(
        <Button
          key="disconnect"
          onClick={onDisconnect}
          disabled={isLoading || retryState.isRetrying}
          variant="outline"
          size="sm"
          className="flex items-center gap-2 text-red-600 hover:text-red-700"
        >
          <WifiOff className="w-4 h-4" />
          Disconnect
        </Button>
      );
    }

    return buttons;
  };

  const handleConnect = async () => {
    if (!onConnect) return;

    setProgressState({
      isVisible: true,
      message: 'Initializing connection...',
      progress: 10,
      stage: 'initializing'
    });

    try {
      await simulateConnectionProgress();
      await onConnect();
      
      setProgressState({
        isVisible: true,
        message: 'Connection successful!',
        progress: 100,
        stage: 'complete'
      });

      setTimeout(() => {
        setProgressState(prev => ({ ...prev, isVisible: false }));
      }, 2000);

      showSuccess(`${getProviderName()} connected successfully`, 'You can now access your files');
    } catch (error) {
      setProgressState({
        isVisible: true,
        message: 'Connection failed',
        progress: 0,
        stage: 'error'
      });

      setTimeout(() => {
        setProgressState(prev => ({ ...prev, isVisible: false }));
      }, 3000);

      showError('Connection failed', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleRefresh = async () => {
    if (!onRefresh) return;

    try {
      await onRefresh();
      showSuccess('Connection refreshed', `${getProviderName()} connection has been updated`);
    } catch (error) {
      showError('Refresh failed', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleRetryConnection = async () => {
    if (retryState.attempts >= retryState.maxAttempts) {
      showError('Maximum retries reached', 'Please try connecting manually or contact support');
      return;
    }

    setRetryState(prev => ({
      ...prev,
      isRetrying: true,
      attempts: prev.attempts + 1
    }));

    try {
      await handleConnect();
      
      // Reset retry state on success
      setRetryState({
        isRetrying: false,
        attempts: 0,
        maxAttempts: 3
      });
    } catch (error) {
      // Schedule next retry
      const delay = Math.min(5 * retryState.attempts, 30); // Exponential backoff, max 30s
      
      setRetryState(prev => ({
        ...prev,
        isRetrying: false,
        nextRetryIn: delay
      }));

      showError(`Retry ${retryState.attempts} failed`, 'Will retry automatically...');
    }
  };

  const simulateConnectionProgress = async () => {
    const stages = [
      { message: 'Authenticating with provider...', progress: 30, stage: 'authenticating' as const },
      { message: 'Establishing connection...', progress: 60, stage: 'connecting' as const },
      { message: 'Verifying permissions...', progress: 90, stage: 'verifying' as const }
    ];

    for (const stage of stages) {
      setProgressState(prev => ({ ...prev, ...stage }));
      await new Promise(resolve => setTimeout(resolve, 800));
    }
  };

  const formatLastSync = (lastSync?: string) => {
    if (!lastSync) return 'Never';
    
    const date = new Date(lastSync);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString();
  };

  const getBorderColor = () => {
    switch (status.status) {
      case 'healthy':
        return 'border-l-green-500';
      case 'expired':
        return 'border-l-yellow-500';
      case 'invalid':
      case 'error':
        return 'border-l-red-500';
      case 'connecting':
        return 'border-l-blue-500';
      default:
        return 'border-l-gray-300';
    }
  };

  return (
    <Card className={`border-l-4 ${getBorderColor()} ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <div>
              <CardTitle className="text-base">{getProviderName()}</CardTitle>
              <CardDescription className="text-sm">
                {getStatusMessage()}
              </CardDescription>
            </div>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress indicator for OAuth flows */}
        {progressState.isVisible && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">{progressState.message}</span>
              <span className="text-gray-500">{progressState.progress}%</span>
            </div>
            <Progress 
              value={progressState.progress} 
              className={`h-2 ${
                progressState.stage === 'error' ? 'bg-red-100' : 
                progressState.stage === 'complete' ? 'bg-green-100' : 'bg-blue-100'
              }`}
            />
          </div>
        )}

        {/* Error alert */}
        {status.error && status.status === 'error' && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {status.error}
            </AlertDescription>
          </Alert>
        )}

        {/* Retry information */}
        {retryState.attempts > 0 && retryState.attempts < retryState.maxAttempts && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Connection attempt {retryState.attempts} of {retryState.maxAttempts} failed. 
              {retryState.nextRetryIn ? ` Retrying in ${retryState.nextRetryIn} seconds...` : ' Ready to retry.'}
            </AlertDescription>
          </Alert>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {getActionButtons()}
        </div>

        {/* Connection details */}
        {(status.connected || showAdvanced) && (
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Last sync: {formatLastSync(status.lastSync)}</span>
              <Button
                variant="link"
                size="sm"
                onClick={() => setShowDetails(!showDetails)}
                className="p-0 h-auto text-xs"
              >
                {showDetails ? 'Hide' : 'Show'} details
              </Button>
            </div>
            
            {showDetails && (
              <div className="mt-2 p-3 bg-gray-50 rounded text-xs text-gray-600 space-y-1">
                <div><strong>Status:</strong> {status.status}</div>
                <div><strong>Provider:</strong> {status.provider}</div>
                <div><strong>Connected:</strong> {status.connected ? 'Yes' : 'No'}</div>
                {status.needsRefresh && <div><strong>Needs Refresh:</strong> Yes</div>}
                {status.canRefresh !== undefined && <div><strong>Can Refresh:</strong> {status.canRefresh ? 'Yes' : 'No'}</div>}
                {status.lastChecked && <div><strong>Last Checked:</strong> {formatLastSync(status.lastChecked)}</div>}
                {status.error && <div><strong>Error:</strong> {status.error}</div>}
              </div>
            )}
          </div>
        )}

        {/* Help links */}
        {(status.status === 'invalid' || status.status === 'error') && (
          <div className="pt-2 border-t">
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <ExternalLink className="w-4 h-4" />
              <a 
                href="/docs/troubleshooting#connection-issues" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:underline"
              >
                Troubleshooting Guide
              </a>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}