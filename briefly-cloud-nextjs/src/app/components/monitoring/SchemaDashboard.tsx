'use client'

/**
 * Schema Monitoring Dashboard Component
 * 
 * Provides real-time visualization of schema health, performance metrics,
 * and alerts for system administrators
 */

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/app/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs'
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Database, 
  TrendingUp,
  XCircle,
  RefreshCw
} from 'lucide-react'

interface SchemaMetrics {
  schema: 'app' | 'private' | 'public'
  timestamp: string
  status: 'healthy' | 'degraded' | 'unhealthy'
  responseTime: number
  errorCount: number
  successCount: number
  lastError?: string
}

interface PerformanceMetrics {
  timestamp: string
  totalRequests: number
  averageResponseTime: number
  errorRate: number
  schemaMetrics: {
    app: SchemaMetrics
    private: SchemaMetrics
    public: SchemaMetrics
  }
  alerts: SchemaAlert[]
}

interface SchemaAlert {
  id: string
  type: 'error_rate' | 'response_time' | 'connectivity' | 'schema_unavailable'
  severity: 'low' | 'medium' | 'high' | 'critical'
  schema: 'app' | 'private' | 'public' | 'all'
  message: string
  timestamp: string
  resolved: boolean
  metadata?: Record<string, any>
}

interface MonitoringStatus {
  isMonitoring: boolean
  metricsCount: number
  alertsCount: number
  uptime: number
}

export function SchemaDashboard() {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null)
  const [monitoringStatus, setMonitoringStatus] = useState<MonitoringStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  // Fetch monitoring data
  const fetchMonitoringData = async () => {
    try {
      const response = await fetch('/api/monitoring/schema')
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      setMetrics(data.performance)
      setMonitoringStatus(data.monitoring)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch monitoring data')
      console.error('Monitoring data fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Resolve an alert
  const resolveAlert = async (alertId: string) => {
    try {
      const response = await fetch('/api/monitoring/schema?action=resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId })
      })
      
      if (response.ok) {
        // Refresh data to show resolved alert
        fetchMonitoringData()
      }
    } catch (err) {
      console.error('Failed to resolve alert:', err)
    }
  }

  // Control monitoring
  const controlMonitoring = async (action: 'start-monitoring' | 'stop-monitoring') => {
    try {
      const response = await fetch(`/api/monitoring/schema?action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval: 30000 })
      })
      
      if (response.ok) {
        fetchMonitoringData()
      }
    } catch (err) {
      console.error(`Failed to ${action}:`, err)
    }
  }

  // Auto-refresh effect
  useEffect(() => {
    fetchMonitoringData()
    
    if (autoRefresh) {
      const interval = setInterval(fetchMonitoringData, 30000) // 30 seconds
      return () => clearInterval(interval)
    }
  }, [autoRefresh])

  // Status badge component
  const StatusBadge = ({ status }: { status: 'healthy' | 'degraded' | 'unhealthy' }) => {
    const variants = {
      healthy: { variant: 'default' as const, icon: CheckCircle, color: 'text-green-600' },
      degraded: { variant: 'secondary' as const, icon: AlertTriangle, color: 'text-yellow-600' },
      unhealthy: { variant: 'destructive' as const, icon: XCircle, color: 'text-red-600' }
    }
    
    const { variant, icon: Icon, color } = variants[status]
    
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        <Icon className={`h-3 w-3 ${color}`} />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    )
  }

  // Alert severity badge
  const AlertSeverityBadge = ({ severity }: { severity: string }) => {
    const variants = {
      low: 'default',
      medium: 'secondary',
      high: 'destructive',
      critical: 'destructive'
    } as const
    
    return (
      <Badge variant={variants[severity as keyof typeof variants] || 'default'}>
        {severity.toUpperCase()}
      </Badge>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin mr-2" />
        Loading monitoring data...
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Monitoring Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (!metrics || !monitoringStatus) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>No Data Available</AlertTitle>
        <AlertDescription>No monitoring data available. Check if monitoring is enabled.</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Schema Monitoring Dashboard</h1>
          <p className="text-muted-foreground">
            Real-time monitoring of database schema health and performance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <Activity className={`h-4 w-4 mr-1 ${autoRefresh ? 'animate-pulse' : ''}`} />
            Auto Refresh: {autoRefresh ? 'On' : 'Off'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchMonitoringData}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          {monitoringStatus.isMonitoring ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => controlMonitoring('stop-monitoring')}
            >
              Stop Monitoring
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={() => controlMonitoring('start-monitoring')}
            >
              Start Monitoring
            </Button>
          )}
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monitoring Status</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {monitoringStatus.isMonitoring ? 'Active' : 'Inactive'}
            </div>
            <p className="text-xs text-muted-foreground">
              {monitoringStatus.metricsCount} metrics collected
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {metrics.alerts.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Unresolved issues
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.round(metrics.averageResponseTime)}ms
            </div>
            <p className="text-xs text-muted-foreground">
              Across all schemas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(metrics.errorRate * 100).toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {metrics.totalRequests} total requests
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Tabs */}
      <Tabs defaultValue="schemas" className="space-y-4">
        <TabsList>
          <TabsTrigger value="schemas">Schema Health</TabsTrigger>
          <TabsTrigger value="alerts">
            Alerts {metrics.alerts.length > 0 && `(${metrics.alerts.length})`}
          </TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="schemas" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(metrics.schemaMetrics).map(([schemaName, schema]) => (
              <Card key={schemaName}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      {schemaName.toUpperCase()} Schema
                    </span>
                    <StatusBadge status={schema.status} />
                  </CardTitle>
                  <CardDescription>
                    Last checked: {new Date(schema.timestamp).toLocaleTimeString()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Response Time:</span>
                    <span className="text-sm font-medium">{schema.responseTime}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Success Count:</span>
                    <span className="text-sm font-medium text-green-600">{schema.successCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Error Count:</span>
                    <span className="text-sm font-medium text-red-600">{schema.errorCount}</span>
                  </div>
                  {schema.lastError && (
                    <div className="mt-2 p-2 bg-red-50 rounded text-xs text-red-700">
                      <strong>Last Error:</strong> {schema.lastError}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          {metrics.alerts.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <div className="text-center">
                  <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-2" />
                  <h3 className="text-lg font-medium">No Active Alerts</h3>
                  <p className="text-muted-foreground">All schemas are operating normally</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {metrics.alerts.map((alert) => (
                <Card key={alert.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <AlertSeverityBadge severity={alert.severity} />
                          <Badge variant="outline">{alert.schema.toUpperCase()}</Badge>
                          <Badge variant="outline">{alert.type.replace('_', ' ')}</Badge>
                        </div>
                        <p className="text-sm">{alert.message}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(alert.timestamp).toLocaleString()}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => resolveAlert(alert.id)}
                      >
                        Resolve
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Performance Summary</CardTitle>
                <CardDescription>Overall system performance metrics</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Total Requests:</span>
                  <span className="text-sm font-medium">{metrics.totalRequests}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Average Response Time:</span>
                  <span className="text-sm font-medium">{Math.round(metrics.averageResponseTime)}ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Error Rate:</span>
                  <span className="text-sm font-medium">{(metrics.errorRate * 100).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Monitoring Uptime:</span>
                  <span className="text-sm font-medium">
                    {Math.round(monitoringStatus.uptime / 1000 / 60)} minutes
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Schema Response Times</CardTitle>
                <CardDescription>Current response times by schema</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(metrics.schemaMetrics).map(([schemaName, schema]) => (
                  <div key={schemaName} className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      {schemaName.toUpperCase()}:
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{schema.responseTime}ms</span>
                      <StatusBadge status={schema.status} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}