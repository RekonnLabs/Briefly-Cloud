'use client';

/**
 * Security Monitoring Dashboard Component
 * Real-time security monitoring and alerting interface
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Shield, 
  AlertTriangle, 
  Activity, 
  Users, 
  Globe, 
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff
} from 'lucide-react';

interface SecurityMetrics {
  timestamp: string;
  authentication_failures: number;
  authorization_violations: number;
  rate_limit_violations: number;
  suspicious_activities: number;
  active_sessions: number;
  failed_login_attempts: number;
  unique_ips: number;
  security_events_per_hour: number;
}

interface SecurityAlert {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  acknowledged: boolean;
  resolved: boolean;
  created_at: string;
  metadata: any;
}

interface ThreatIntelligence {
  id: string;
  ip_address: string;
  threat_type: string;
  threat_level: 'low' | 'medium' | 'high' | 'critical';
  event_count: number;
  blocked: boolean;
  last_seen: string;
}

interface SecurityDashboardData {
  metrics: SecurityMetrics;
  alerts: SecurityAlert[];
  threats: ThreatIntelligence[];
  status: 'normal' | 'elevated' | 'warning' | 'critical';
  events_summary: any[];
  anomalies: any[];
}

export default function SecurityMonitoringDashboard() {
  const [dashboardData, setDashboardData] = useState<SecurityDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeWindow, setTimeWindow] = useState('1h');
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    fetchDashboardData();
    
    if (autoRefresh) {
      const interval = setInterval(fetchDashboardData, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [timeWindow, autoRefresh]);

  const fetchDashboardData = async () => {
    try {
      const response = await fetch(`/api/admin/security/monitoring?timeWindow=${timeWindow}&includeAlerts=true&includeThreats=true`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch security monitoring data');
      }
      
      const data = await response.json();
      setDashboardData(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const acknowledgeAlerts = async (alertIds: string[]) => {
    try {
      const response = await fetch('/api/admin/security/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert_ids: alertIds,
          action: 'acknowledge'
        })
      });

      if (response.ok) {
        fetchDashboardData(); // Refresh data
      }
    } catch (err) {
      console.error('Failed to acknowledge alerts:', err);
    }
  };

  const blockThreat = async (threatId: string) => {
    try {
      const response = await fetch('/api/admin/security/threats', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threat_ids: [threatId],
          action: 'block',
          reason: 'Blocked from security dashboard'
        })
      });

      if (response.ok) {
        fetchDashboardData(); // Refresh data
      }
    } catch (err) {
      console.error('Failed to block threat:', err);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critical': return 'text-red-600 bg-red-50';
      case 'warning': return 'text-orange-600 bg-orange-50';
      case 'elevated': return 'text-yellow-600 bg-yellow-50';
      case 'normal': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="border-red-200 bg-red-50">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-red-800">
          Error loading security dashboard: {error}
        </AlertDescription>
      </Alert>
    );
  }

  if (!dashboardData) {
    return (
      <Alert>
        <AlertDescription>No security monitoring data available</AlertDescription>
      </Alert>
    );
  }

  const { metrics, alerts, threats, status, events_summary, anomalies } = dashboardData;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Shield className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Security Monitoring</h1>
            <p className="text-gray-600">Real-time security event monitoring and threat detection</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <select
            value={timeWindow}
            onChange={(e) => setTimeWindow(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="1h">Last Hour</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
          </select>
          
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? <Eye className="h-4 w-4 mr-2" /> : <EyeOff className="h-4 w-4 mr-2" />}
            Auto Refresh
          </Button>
          
          <Button onClick={fetchDashboardData} size="sm">
            Refresh
          </Button>
        </div>
      </div>

      {/* Security Status */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className={`px-4 py-2 rounded-full ${getStatusColor(status)}`}>
                <span className="font-semibold uppercase text-sm">
                  Security Status: {status}
                </span>
              </div>
              <span className="text-sm text-gray-500">
                Last updated: {new Date(metrics.timestamp).toLocaleString()}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Auth Failures</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{metrics.authentication_failures}</div>
            <p className="text-xs text-gray-500">Failed login attempts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
            <Users className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{metrics.active_sessions}</div>
            <p className="text-xs text-gray-500">Currently active users</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rate Limit Hits</CardTitle>
            <Activity className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{metrics.rate_limit_violations}</div>
            <p className="text-xs text-gray-500">Rate limit violations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unique IPs</CardTitle>
            <Globe className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{metrics.unique_ips}</div>
            <p className="text-xs text-gray-500">Distinct IP addresses</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for detailed views */}
      <Tabs defaultValue="alerts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="alerts">Security Alerts</TabsTrigger>
          <TabsTrigger value="threats">Threat Intelligence</TabsTrigger>
          <TabsTrigger value="events">Event Summary</TabsTrigger>
          <TabsTrigger value="anomalies">Anomalies</TabsTrigger>
        </TabsList>

        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Security Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              {alerts.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No security alerts</p>
              ) : (
                <div className="space-y-4">
                  {alerts.slice(0, 10).map((alert) => (
                    <div key={alert.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <Badge className={getSeverityColor(alert.severity)}>
                          {alert.severity}
                        </Badge>
                        <div>
                          <p className="font-medium">{alert.message}</p>
                          <p className="text-sm text-gray-500">
                            {new Date(alert.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {alert.acknowledged ? (
                          <Badge variant="outline" className="text-green-600">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Acknowledged
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => acknowledgeAlerts([alert.id])}
                          >
                            Acknowledge
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="threats" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Threat Intelligence</CardTitle>
            </CardHeader>
            <CardContent>
              {threats.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No threats detected</p>
              ) : (
                <div className="space-y-4">
                  {threats.slice(0, 10).map((threat) => (
                    <div key={threat.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <Badge className={getSeverityColor(threat.threat_level)}>
                          {threat.threat_level}
                        </Badge>
                        <div>
                          <p className="font-medium">{threat.ip_address}</p>
                          <p className="text-sm text-gray-500">
                            {threat.threat_type} • {threat.event_count} events • 
                            Last seen: {new Date(threat.last_seen).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {threat.blocked ? (
                          <Badge variant="destructive">Blocked</Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => blockThreat(threat.id)}
                          >
                            Block IP
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Security Events Summary</CardTitle>
            </CardHeader>
            <CardContent>
              {events_summary.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No events in selected time window</p>
              ) : (
                <div className="space-y-4">
                  {events_summary.map((event, index) => (
                    <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">{event.event_type}</p>
                        <p className="text-sm text-gray-500">
                          {event.event_count} events • {event.unique_users} users • {event.unique_ips} IPs
                        </p>
                      </div>
                      <Badge variant="outline">{event.event_count}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="anomalies" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Security Anomalies</CardTitle>
            </CardHeader>
            <CardContent>
              {anomalies.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No anomalies detected</p>
              ) : (
                <div className="space-y-4">
                  {anomalies.map((anomaly, index) => (
                    <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <Badge className={getSeverityColor(anomaly.severity)}>
                          {anomaly.severity}
                        </Badge>
                        <div>
                          <p className="font-medium">{anomaly.anomaly_type}</p>
                          <p className="text-sm text-gray-500">
                            Current: {anomaly.current_value} • Baseline: {Math.round(anomaly.baseline_avg)} • 
                            Threshold: {Math.round(anomaly.threshold_value)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}