/**
 * Connection Monitoring Dashboard Component
 * 
 * Provides a comprehensive view of connection health, alerts, and monitoring data
 * with automatic refresh and real-time status updates.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  RefreshCw, 
  TrendingUp,
  Zap,
  Shield,
  Bell,
  Settings,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Alert, AlertDescription } from '@/app/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { useToast } from '@/app/components/ui/toast';
import { ConnectionStatusCard, type ConnectionStatus } from './ConnectionStatusCard';

interface MonitoringAlert {
  type: 'connection_expired' | 'connection_invalid' | 'connection_error' | 'health_check_failed';
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId: string;
  provider?: string;
  connectionId?: string;
  message: string;
  details?: any;
  timestamp: string;
  resolved: boolean;
}

interface MonitoringReport {
  userId: string;
  reportTime: string;
  healthSummary: {
    totalConnections: number;
    healthyConnections: number;
    expiredConnections: number;
    invalidConnections: number;
    errorConnections: number;
  };
  alerts: MonitoringAlert[];
  recommendations: string[];
  autoActionsPerformed: string[];
}

interface ConnectionMonitoringDashboardProps {
  userId: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
  className?: string;
}

export function ConnectionMonitoringDashboard({
  userId,
  autoRefresh = true,
  refreshInterval = 30000, // 30 seconds
  className = ''
}: ConnectionMonitoringDashboardProps) {
  const { showSuccess, showError } = useToast();
  const [connections, setConnections] = useState<ConnectionStatus[]>([]);
  const [monitoringReport, setMonitoringReport] = useState<MonitoringReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [expandedAlerts, setExpandedAlerts] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'overview' | 'connections' | 'alerts' | 'history'>('overview');

  // Fetch connection status
  const fetchConnectionStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/storage/health?quick=true', {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch connection status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.enabled && data.status) {
        const connectionStatuses: ConnectionStatus[] = [];
        
        if (data.status.google) {
          connectionStatuses.push({
            provider: 'google',
            connected: data.status.google.connected,
            status: data.status.google.status || 'disconnected',
            lastSync: data.status.google.lastSync,
            needsRefresh: data.status.google.needsRefresh,
            canRefresh: true
          });
        }

        if (data.status.microsoft) {
          connectionStatuses.push({
            provider: 'microsoft',
            connected: data.status.microsoft.connected,
            status: data.status.microsoft.status || 'disconnected',
            lastSync: data.status.microsoft.lastSync,
            needsRefresh: data.status.microsoft.needsRefresh,
            canRefresh: true
          });
        }

        setConnections(connectionStatuses);
      }
    } catch (error) {
      console.error('Failed to fetch connection status:', error);
      showError('Failed to load connection status', 'Please try refreshing the page');
    }
  }, [showError]);

  // Fetch monitoring report
  const fetchMonitoringReport = useCallback(async () => {
    try {
      const response = await fetch('/api/storage/monitoring', {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setMonitoringReport(data);
      }
    } catch (error) {
      console.error('Failed to fetch monitoring report:', error);
      // Don't show error for monitoring report as it's supplementary
    }
  }, []);

  // Perform full health check
  const performHealthCheck = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/storage/health', {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.enabled && data.health) {
        const healthSummary = data.health;
        const connectionStatuses: ConnectionStatus[] = healthSummary.connections.map((conn: any) => ({
          provider: conn.provider,
          connected: conn.status === 'healthy',
          status: conn.status,
          lastSync: conn.lastSync,
          lastChecked: conn.lastChecked,
          error: conn.error,
          needsRefresh: conn.needsRefresh,
          canRefresh: conn.canRefresh
        }));

        setConnections(connectionStatuses);
        setLastRefresh(new Date());
        
        showSuccess('Health check completed', 
          `${healthSummary.healthyConnections}/${healthSummary.totalConnections} connections healthy`);
      }
    } catch (error) {
      console.error('Health check failed:', error);
      showError('Health check failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [showSuccess, showError]);

  // Refresh expired connections
  const refreshExpiredConnections = useCallback(async () => {
    try {
      const response = await fetch('/api/storage/health/refresh', {
        method: 'POST',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Refresh failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.summary) {
        const { successful, failed } = data.summary;
        
        if (successful > 0) {
          showSuccess(`Refreshed ${successful} connection(s)`, 
            failed > 0 ? `${failed} connection(s) could not be refreshed` : 'All connections updated');
        } else if (failed > 0) {
          showError(`Failed to refresh ${failed} connection(s)`, 'Manual reconnection may be required');
        } else {
          showSuccess('No connections needed refreshing', 'All connections are up to date');
        }
      }

      // Refresh status after operation
      await fetchConnectionStatus();
    } catch (error) {
      console.error('Refresh failed:', error);
      showError('Refresh failed', error instanceof Error ? error.message : 'Unknown error');
    }
  }, [showSuccess, showError, fetchConnectionStatus]);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([
        fetchConnectionStatus(),
        fetchMonitoringReport()
      ]);
      setIsLoading(false);
      setLastRefresh(new Date());
    };

    loadData();
  }, [fetchConnectionStatus, fetchMonitoringReport]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(async () => {
      await fetchConnectionStatus();
      await fetchMonitoringReport();
      setLastRefresh(new Date());
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchConnectionStatus, fetchMonitoringReport]);

  const getOverallHealthStatus = () => {
    if (connections.length === 0) return { status: 'unknown', message: 'No connections configured' };
    
    const healthyCount = connections.filter(c => c.status === 'healthy').length;
    const totalCount = connections.length;
    
    if (healthyCount === totalCount) {
      return { status: 'healthy', message: 'All connections healthy' };
    } else if (healthyCount > 0) {
      return { status: 'partial', message: `${healthyCount}/${totalCount} connections healthy` };
    } else {
      return { status: 'unhealthy', message: 'No healthy connections' };
    }
  };

  const getHealthStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'partial':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'unhealthy':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getSeverityBadge = (severity: MonitoringAlert['severity']) => {
    const variants = {
      low: 'bg-blue-100 text-blue-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-orange-100 text-orange-800',
      critical: 'bg-red-100 text-red-800'
    };

    return (
      <Badge variant="secondary" className={variants[severity]}>
        {severity.toUpperCase()}
      </Badge>
    );
  };

  const toggleAlertExpansion = (alertId: string) => {
    setExpandedAlerts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(alertId)) {
        newSet.delete(alertId);
      } else {
        newSet.add(alertId);
      }
      return newSet;
    });
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const overallHealth = getOverallHealthStatus();

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Connection Monitoring</h2>
          <p className="text-gray-600">Monitor and manage your cloud storage connections</p>
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-sm text-gray-500">
              Last updated: {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <Button
            onClick={performHealthCheck}
            disabled={isLoading}
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Health Check
          </Button>
        </div>
      </div>

      {/* Overall Status Card */}
      <Card className="border-l-4 border-l-blue-500">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getHealthStatusIcon(overallHealth.status)}
              <div>
                <CardTitle className="text-lg">Overall Health</CardTitle>
                <CardDescription>{overallHealth.message}</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {connections.some(c => c.needsRefresh) && (
                <Button
                  onClick={refreshExpiredConnections}
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Zap className="w-4 h-4" />
                  Auto-Refresh
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="connections">Connections</TabsTrigger>
          <TabsTrigger value="alerts">
            Alerts
            {monitoringReport && monitoringReport.alerts.filter(a => !a.resolved).length > 0 && (
              <Badge variant="destructive" className="ml-2 text-xs">
                {monitoringReport.alerts.filter(a => !a.resolved).length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Total Connections</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{connections.length}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Healthy Connections</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {connections.filter(c => c.status === 'healthy').length}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Issues Detected</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {connections.filter(c => c.status === 'error' || c.status === 'invalid').length}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recommendations */}
          {monitoringReport && monitoringReport.recommendations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {monitoringReport.recommendations.map((recommendation, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Shield className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{recommendation}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="connections" className="space-y-4">
          {connections.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-gray-500">No connections configured</p>
              </CardContent>
            </Card>
          ) : (
            connections.map((connection) => (
              <ConnectionStatusCard
                key={connection.provider}
                status={connection}
                onHealthCheck={performHealthCheck}
                isLoading={isLoading}
                showAdvanced={true}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          {!monitoringReport || monitoringReport.alerts.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <p className="text-gray-500">No alerts at this time</p>
              </CardContent>
            </Card>
          ) : (
            monitoringReport.alerts.map((alert, index) => {
              const alertId = `${alert.type}-${index}`;
              const isExpanded = expandedAlerts.has(alertId);
              
              return (
                <Card key={alertId} className={`${alert.resolved ? 'opacity-60' : ''}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Bell className={`w-5 h-5 ${
                          alert.severity === 'critical' ? 'text-red-500' :
                          alert.severity === 'high' ? 'text-orange-500' :
                          alert.severity === 'medium' ? 'text-yellow-500' :
                          'text-blue-500'
                        }`} />
                        <div>
                          <CardTitle className="text-base">{alert.message}</CardTitle>
                          <CardDescription>
                            {alert.provider && `${alert.provider} • `}
                            {formatTimestamp(alert.timestamp)}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getSeverityBadge(alert.severity)}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleAlertExpansion(alertId)}
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  
                  {isExpanded && alert.details && (
                    <CardContent>
                      <div className="bg-gray-50 rounded p-3 text-sm">
                        <pre className="whitespace-pre-wrap text-gray-700">
                          {JSON.stringify(alert.details, null, 2)}
                        </pre>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {/* Auto Actions Performed */}
          {monitoringReport && monitoringReport.autoActionsPerformed.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Recent Auto Actions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {monitoringReport.autoActionsPerformed.map((action, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{action}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Placeholder for historical data */}
          <Card>
            <CardContent className="text-center py-8">
              <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Historical monitoring data will appear here</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}