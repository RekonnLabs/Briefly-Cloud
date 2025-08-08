'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Badge } from '@/app/components/ui/badge'
import { Progress } from '@/app/components/ui/progress'

interface PerformanceMetrics {
  requests: number
  avgResponseTime: number
  errorRate: number
  databaseQueries: number
  avgDatabaseQueryTime: number
  externalApiCalls: number
  avgExternalApiTime: number
}

interface CacheStats {
  size: number
  max: number
  hits: number
  misses: number
  hitRate: number
}

interface PerformanceData {
  performance: PerformanceMetrics
  cache: CacheStats
  timestamp: string
  uptime: number
  memory: {
    rss: number
    heapTotal: number
    heapUsed: number
    external: number
  }
}

export function PerformanceMonitor() {
  const [data, setData] = useState<PerformanceData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)

  const fetchMetrics = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/performance')
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const metrics = await response.json()
      setData(metrics)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics')
    } finally {
      setLoading(false)
    }
  }

  const resetMetrics = async () => {
    try {
      const response = await fetch('/api/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      })
      
      if (response.ok) {
        await fetchMetrics()
      }
    } catch (err) {
      setError('Failed to reset metrics')
    }
  }

  const clearCache = async () => {
    try {
      const response = await fetch('/api/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear-cache' }),
      })
      
      if (response.ok) {
        await fetchMetrics()
      }
    } catch (err) {
      setError('Failed to clear cache')
    }
  }

  useEffect(() => {
    fetchMetrics()
  }, [])

  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(fetchMetrics, 5000) // Refresh every 5 seconds
    return () => clearInterval(interval)
  }, [autoRefresh])

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${days}d ${hours}h ${minutes}m`
  }

  const getPerformanceColor = (value: number, thresholds: { good: number; warning: number }) => {
    if (value <= thresholds.good) return 'text-green-600'
    if (value <= thresholds.warning) return 'text-yellow-600'
    return 'text-red-600'
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-red-600">Performance Monitor Error</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-600">{error}</p>
          <Button onClick={fetchMetrics} className="mt-2">
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Performance Monitor</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={fetchMetrics}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? 'Stop Auto' : 'Auto Refresh'}
          </Button>
          <Button
            variant="outline"
            onClick={resetMetrics}
          >
            Reset Metrics
          </Button>
          <Button
            variant="outline"
            onClick={clearCache}
          >
            Clear Cache
          </Button>
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Performance Metrics */}
          <Card>
            <CardHeader>
              <CardTitle>Performance Metrics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span>Total Requests:</span>
                <Badge variant="secondary">{data.performance.requests}</Badge>
              </div>
              <div className="flex justify-between">
                <span>Avg Response Time:</span>
                <span className={getPerformanceColor(data.performance.avgResponseTime, { good: 200, warning: 500 })}>
                  {data.performance.avgResponseTime.toFixed(2)}ms
                </span>
              </div>
              <div className="flex justify-between">
                <span>Error Rate:</span>
                <span className={getPerformanceColor(data.performance.errorRate, { good: 1, warning: 5 })}>
                  {data.performance.errorRate.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span>DB Queries:</span>
                <Badge variant="outline">{data.performance.databaseQueries}</Badge>
              </div>
              <div className="flex justify-between">
                <span>Avg DB Query Time:</span>
                <span className={getPerformanceColor(data.performance.avgDatabaseQueryTime, { good: 50, warning: 200 })}>
                  {data.performance.avgDatabaseQueryTime.toFixed(2)}ms
                </span>
              </div>
              <div className="flex justify-between">
                <span>External API Calls:</span>
                <Badge variant="outline">{data.performance.externalApiCalls}</Badge>
              </div>
              <div className="flex justify-between">
                <span>Avg API Call Time:</span>
                <span className={getPerformanceColor(data.performance.avgExternalApiTime, { good: 100, warning: 500 })}>
                  {data.performance.avgExternalApiTime.toFixed(2)}ms
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Cache Statistics */}
          <Card>
            <CardHeader>
              <CardTitle>Cache Statistics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span>Cache Size:</span>
                <Badge variant="secondary">{data.cache.size} / {data.cache.max}</Badge>
              </div>
              <div className="flex justify-between">
                <span>Cache Hit Rate:</span>
                <span className={getPerformanceColor(data.cache.hitRate * 100, { good: 80, warning: 60 })}>
                  {(data.cache.hitRate * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span>Cache Hits:</span>
                <Badge variant="outline">{data.cache.hits}</Badge>
              </div>
              <div className="flex justify-between">
                <span>Cache Misses:</span>
                <Badge variant="outline">{data.cache.misses}</Badge>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Hit Rate</span>
                  <span>{(data.cache.hitRate * 100).toFixed(1)}%</span>
                </div>
                <Progress value={data.cache.hitRate * 100} className="h-2" />
              </div>
            </CardContent>
          </Card>

          {/* System Information */}
          <Card>
            <CardHeader>
              <CardTitle>System Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span>Uptime:</span>
                <Badge variant="secondary">{formatUptime(data.uptime)}</Badge>
              </div>
              <div className="flex justify-between">
                <span>Memory RSS:</span>
                <span>{formatBytes(data.memory.rss)}</span>
              </div>
              <div className="flex justify-between">
                <span>Heap Total:</span>
                <span>{formatBytes(data.memory.heapTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Heap Used:</span>
                <span>{formatBytes(data.memory.heapUsed)}</span>
              </div>
              <div className="flex justify-between">
                <span>External:</span>
                <span>{formatBytes(data.memory.external)}</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Memory Usage</span>
                  <span>{((data.memory.heapUsed / data.memory.heapTotal) * 100).toFixed(1)}%</span>
                </div>
                <Progress 
                  value={(data.memory.heapUsed / data.memory.heapTotal) * 100} 
                  className="h-2" 
                />
              </div>
              <div className="text-sm text-gray-500">
                Last updated: {new Date(data.timestamp).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
