'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Badge } from '@/app/components/ui/badge'
import { Progress } from '@/app/components/ui/progress'
import { Button } from '@/app/components/ui/button'
import { Alert, AlertDescription } from '@/app/components/ui/alert'
import { 
  Activity, 
  AlertTriangle, 
  BarChart3, 
  Clock, 
  Database, 
  Globe, 
  HardDrive, 
  Memory, 
  Monitor, 
  RefreshCw,
  TrendingUp,
  Users,
  Zap
} from 'lucide-react'

interface PerformanceMetrics {
  pageLoadTime: number
  apiResponseTime: number
  databaseQueryTime: number
  cacheHitRate: number
  memoryUsage: number
  cpuUsage: number
  errorRate: number
  activeUsers: number
  requestsPerMinute: number
}

interface Alert {
  id: string
  type: string
  message: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  timestamp: string
  status: 'active' | 'acknowledged' | 'resolved' | 'dismissed'
}

interface ErrorLog {
  id: string
  message: string
  severity: string
  error_type: string
  created_at: string
}

export function MonitoringDashboard() {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [errors, setErrors] = useState<ErrorLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  // Fetch monitoring data
  const fetchMonitoringData = async () => {
    try {
      setIsLoading(true)
      
      // Fetch real-time metrics
      const metricsResponse = await fetch('/api/monitoring/performance?hours=1')
      const metricsData = await metricsResponse.json()
      
      if (metricsData.success) {
        setMetrics(metricsData.data.averages)
      }

      // Fetch alerts
      const alertsResponse = await fetch('/api/monitoring/alerts?hours=24')
      const alertsData = await alertsResponse.json()
      
      if (alertsData.success) {
        setAlerts(alertsData.data.alerts)
      }

      // Fetch errors
      const errorsResponse = await fetch('/api/monitoring/errors?hours=24')
      const errorsData = await errorsResponse.json()
      
      if (errorsData.success) {
        setErrors(errorsData.data.errors)
      }

      setLastUpdated(new Date())
    } catch (error) {
      console.error('Failed to fetch monitoring data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Auto-refresh every 30 seconds
  useEffect(() => {
    fetchMonitoringData()
    
    const interval = setInterval(fetchMonitoringData, 30000)
    return () => clearInterval(interval)
  }, [])

  // Get severity color
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-500'
      case 'high':
        return 'bg-orange-500'
      case 'medium':
        return 'bg-yellow-500'
      case 'low':
        return 'bg-blue-500'
      default:
        return 'bg-gray-500'
    }
  }

  // Get performance status
  const getPerformanceStatus = (value: number, threshold: number) => {
    if (value <= threshold * 0.7) return 'good'
    if (value <= threshold) return 'warning'
    return 'critical'
  }

  // Format time
  const formatTime = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  // Format percentage
  const formatPercentage = (value: number) => {
    return `${Math.round(value)}%`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">System Monitoring</h1>
          <p className="text-gray-600">Real-time performance and analytics dashboard</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-500">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </div>
          <Button 
            onClick={fetchMonitoringData} 
            disabled={isLoading}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Performance Metrics */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Page Load Time</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatTime(metrics.pageLoadTime)}</div>
              <Progress 
                value={Math.min((metrics.pageLoadTime / 3000) * 100, 100)} 
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Target: &lt; 3s
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">API Response</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatTime(metrics.apiResponseTime)}</div>
              <Progress 
                value={Math.min((metrics.apiResponseTime / 2000) * 100, 100)} 
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Target: &lt; 2s
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Database Queries</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatTime(metrics.databaseQueryTime)}</div>
              <Progress 
                value={Math.min((metrics.databaseQueryTime / 1000) * 100, 100)} 
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Target: &lt; 1s
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cache Hit Rate</CardTitle>
              <HardDrive className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPercentage(metrics.cacheHitRate)}</div>
              <Progress value={metrics.cacheHitRate} className="mt-2" />
              <p className="text-xs text-muted-foreground mt-1">
                Target: &gt; 80%
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* System Resources */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
              <Memory className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPercentage(metrics.memoryUsage)}</div>
              <Progress 
                value={metrics.memoryUsage} 
                className={`mt-2 ${
                  getPerformanceStatus(metrics.memoryUsage, 80) === 'critical' 
                    ? 'bg-red-200' 
                    : ''
                }`}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Threshold: 80%
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
              <Monitor className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPercentage(metrics.cpuUsage)}</div>
              <Progress 
                value={metrics.cpuUsage} 
                className={`mt-2 ${
                  getPerformanceStatus(metrics.cpuUsage, 70) === 'critical' 
                    ? 'bg-red-200' 
                    : ''
                }`}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Threshold: 70%
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.activeUsers}</div>
              <div className="text-sm text-muted-foreground mt-1">
                {metrics.requestsPerMinute} req/min
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Error Rate */}
      {metrics && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Error Rate
            </CardTitle>
            <CardDescription>
              Current error rate and system health
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold">{formatPercentage(metrics.errorRate)}</div>
              <Badge 
                variant={metrics.errorRate > 5 ? 'destructive' : 'default'}
                className="text-sm"
              >
                {metrics.errorRate > 5 ? 'Critical' : metrics.errorRate > 2 ? 'Warning' : 'Healthy'}
              </Badge>
            </div>
            <Progress 
              value={Math.min(metrics.errorRate * 10, 100)} 
              className={`mt-4 ${
                metrics.errorRate > 5 ? 'bg-red-200' : metrics.errorRate > 2 ? 'bg-yellow-200' : ''
              }`}
            />
            <p className="text-xs text-muted-foreground mt-2">
              Target: &lt; 2% (Critical: &gt; 5%)
            </p>
          </CardContent>
        </Card>
      )}

      {/* Active Alerts */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Active Alerts
            </CardTitle>
            <CardDescription>
              Recent system alerts and notifications
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {alerts.slice(0, 5).map((alert) => (
                <Alert key={alert.id} className="border-l-4 border-l-red-500">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="flex items-center justify-between">
                      <div>
                        <strong>{alert.type}</strong>: {alert.message}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge 
                          className={`${getSeverityColor(alert.severity)} text-white`}
                        >
                          {alert.severity}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          {new Date(alert.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              ))}
              {alerts.length > 5 && (
                <div className="text-center text-sm text-gray-500">
                  +{alerts.length - 5} more alerts
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Errors */}
      {errors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Recent Errors
            </CardTitle>
            <CardDescription>
              Latest error logs and debugging information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {errors.slice(0, 5).map((error) => (
                <div key={error.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{error.error_type}</div>
                      <div className="text-sm text-gray-600 truncate">{error.message}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={error.severity === 'critical' ? 'destructive' : 'secondary'}
                        className="text-xs"
                      >
                        {error.severity}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        {new Date(error.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {errors.length > 5 && (
                <div className="text-center text-sm text-gray-500">
                  +{errors.length - 5} more errors
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="h-8 w-8 animate-spin text-gray-500" />
          <span className="ml-2 text-gray-500">Loading monitoring data...</span>
        </div>
      )}

      {/* No Data State */}
      {!isLoading && !metrics && (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <div className="text-center">
              <Monitor className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No monitoring data available</h3>
              <p className="text-gray-500">Start collecting metrics to see system performance</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
