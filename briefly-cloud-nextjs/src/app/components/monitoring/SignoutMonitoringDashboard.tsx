/**
 * Signout Monitoring Dashboard Component
 * 
 * Displays signout metrics, success rates, and recent events
 * for monitoring and debugging purposes
 */

'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { Alert, AlertDescription } from '@/app/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs'
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  RefreshCw, 
  TrendingDown, 
  TrendingUp,
  Users,
  Zap
} from 'lucide-react'

interface SignoutMetrics {
  totalAttempts: number
  successfulSignouts: number
  failedSignouts: number
  successRate: number
  averageDuration: number
  cleanupMetrics: {
    pickerTokens: {
      attempts: number
      successes: number
      successRate: number
    }
    storageCredentials: {
      attempts: number
      successes: number
      successRate: number
    }
    sessionData: {
      attempts: number
      successes: number
      successRate: number
    }
  }
  errorCategories: {
    networkErrors: number
    authenticationErrors: number
    cleanupErrors: number
    timeoutErrors: number
    unknownErrors: number
  }
  timeWindow: string
  lastUpdated: string
}

interface SignoutEvent {
  id: string
  timestamp: string
  success: boolean
  duration: number
  component?: string
  options: {
    skipCleanup?: boolean
    forceRedirect?: boolean
  }
  cleanup: {
    pickerTokens: boolean
    storageCredentials: boolean
    sessionData: boolean
    errors: string[]
  }
  error?: {
    message: string
    category: string
  }
}

interface MonitoringData {
  metrics: SignoutMetrics
  recentEvents?: SignoutEvent[]
  timestamp: string
  timeWindow: string
}

export function SignoutMonitoringDashboard() {
  const [data, setData] = useState<MonitoringData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeWindow, setTimeWindow] = useState('1h')
  const [includeEvents, setIncludeEvents] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams({
        timeWindow,
        includeEvents: includeEvents.toString(),
        limit: '50'
      })

      const response = await fetch(`/api/monitoring/signout?${params}`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.statusText}`)
      }

      const result = await response.json()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const testMonitoring = async () => {
    try {
      const response = await fetch('/api/monitoring/signout/test', {
        method: 'POST'
      })
      
      if (!response.ok) {
        throw new Error(`Test failed: ${response.statusText}`)
      }

      // Refresh data after test
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed')
    }
  }

  useEffect(() => {
    fetchData()
  }, [timeWindow, includeEvents])

  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(fetchData, 30000) // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [autoRefresh, timeWindow, includeEvents])

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 95) return 'text-green-600'
    if (rate >= 90) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getSuccessRateBadge = (rate: number) => {
    if (rate >= 95) return 'default'
    if (rate >= 90) return 'secondary'
    return 'destructive'
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString()
  }

  if (loading && !data) {
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
        <AlertDescription>
          Failed to load monitoring data: {error}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchData}
            className="ml-2"
          >
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (!data) {
    return (
      <Alert>
        <AlertDescription>
          No monitoring data available
        </AlertDescription>
      </Alert>
    )
  }

  const { metrics } = data

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Signout Monitoring</h2>
          <p className="text-muted-foreground">
            Monitor signout performance and reliability
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <select
            value={timeWindow}
            onChange={(e) => setTimeWindow(e.target.value)}
            className="px-3 py-1 border rounded-md"
          >
            <option value="5m">Last 5 minutes</option>
            <option value="15m">Last 15 minutes</option>
            <option value="1h">Last hour</option>
            <option value="24h">Last 24 hours</option>
          </select>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <Activity className={`h-4 w-4 mr-1 ${autoRefresh ? 'animate-pulse' : ''}`} />
            Auto-refresh
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {process.env.NODE_ENV === 'development' && (
            <Button
              variant="outline"
              size="sm"
              onClick={testMonitoring}
            >
              <Zap className="h-4 w-4 mr-1" />
              Test
            </Button>
          )}
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Attempts</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalAttempts}</div>
            <p className="text-xs text-muted-foreground">
              in last {timeWindow}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getSuccessRateColor(metrics.successRate)}`}>
              {metrics.successRate.toFixed(1)}%
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={getSuccessRateBadge(metrics.successRate)}>
                {metrics.successfulSignouts}/{metrics.totalAttempts}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatDuration(metrics.averageDuration)}
            </div>
            <p className="text-xs text-muted-foreground">
              average signout time
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed Signouts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {metrics.failedSignouts}
            </div>
            <p className="text-xs text-muted-foreground">
              failures in last {timeWindow}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Metrics */}
      <Tabs defaultValue="cleanup" className="w-full">
        <TabsList>
          <TabsTrigger value="cleanup">Cleanup Tasks</TabsTrigger>
          <TabsTrigger value="errors">Error Categories</TabsTrigger>
          {includeEvents && <TabsTrigger value="events">Recent Events</TabsTrigger>}
        </TabsList>

        <TabsContent value="cleanup" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Picker Tokens</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {metrics.cleanupMetrics.pickerTokens.successRate.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {metrics.cleanupMetrics.pickerTokens.successes}/{metrics.cleanupMetrics.pickerTokens.attempts} successful
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Storage Credentials</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {metrics.cleanupMetrics.storageCredentials.successRate.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {metrics.cleanupMetrics.storageCredentials.successes}/{metrics.cleanupMetrics.storageCredentials.attempts} successful
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Session Data</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {metrics.cleanupMetrics.sessionData.successRate.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {metrics.cleanupMetrics.sessionData.successes}/{metrics.cleanupMetrics.sessionData.attempts} successful
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="errors" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Object.entries(metrics.errorCategories).map(([category, count]) => (
              <Card key={category}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm capitalize">
                    {category.replace(/([A-Z])/g, ' $1').trim()}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">{count}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {includeEvents && data.recentEvents && (
          <TabsContent value="events" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Recent Events</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIncludeEvents(!includeEvents)}
              >
                {includeEvents ? 'Hide Events' : 'Show Events'}
              </Button>
            </div>
            
            <div className="space-y-2">
              {data.recentEvents.map((event) => (
                <Card key={event.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {event.success ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                      )}
                      <span className="font-medium">
                        {event.component || 'Unknown Component'}
                      </span>
                      <Badge variant={event.success ? 'default' : 'destructive'}>
                        {event.success ? 'Success' : 'Failed'}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{formatDuration(event.duration)}</span>
                      <span>{formatTimestamp(event.timestamp)}</span>
                    </div>
                  </div>
                  
                  {event.error && (
                    <div className="mt-2 text-sm text-red-600">
                      <strong>{event.error.category}:</strong> {event.error.message}
                    </div>
                  )}
                  
                  <div className="mt-2 flex gap-2">
                    <Badge variant={event.cleanup.pickerTokens ? 'default' : 'secondary'}>
                      Picker: {event.cleanup.pickerTokens ? 'OK' : 'Failed'}
                    </Badge>
                    <Badge variant={event.cleanup.storageCredentials ? 'default' : 'secondary'}>
                      Storage: {event.cleanup.storageCredentials ? 'OK' : 'Failed'}
                    </Badge>
                    <Badge variant={event.cleanup.sessionData ? 'default' : 'secondary'}>
                      Session: {event.cleanup.sessionData ? 'OK' : 'Failed'}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* Footer */}
      <div className="text-xs text-muted-foreground text-center">
        Last updated: {formatTimestamp(data.timestamp)} | 
        Time window: {timeWindow} | 
        Auto-refresh: {autoRefresh ? 'On' : 'Off'}
      </div>
    </div>
  )
}