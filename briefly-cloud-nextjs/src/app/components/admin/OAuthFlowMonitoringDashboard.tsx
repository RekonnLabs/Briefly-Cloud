/**
 * OAuth Flow Monitoring Dashboard
 * 
 * Admin component to monitor OAuth flow separation compliance and detect violations.
 * This component helps ensure proper separation between main auth and storage OAuth flows.
 */

'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { AlertTriangle, CheckCircle, XCircle, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react'
import { generateOAuthComplianceReport } from '@/app/lib/oauth-flow-monitoring'

interface OAuthMetrics {
  totalRouteUsages: number
  correctUsages: number
  violations: number
  complianceRate: number
  recentViolations: OAuthViolation[]
  flowBreakdown: {
    mainAuth: { total: number; success: number; failures: number }
    storageOAuth: { total: number; success: number; failures: number }
  }
}

interface OAuthViolation {
  id: string
  timestamp: string
  route: string
  expectedFlowType: 'main_auth' | 'storage_oauth'
  actualFlowType: 'main_auth' | 'storage_oauth'
  component: string
  userId?: string
  severity: 'low' | 'medium' | 'high'
}

export function OAuthFlowMonitoringDashboard() {
  const [metrics, setMetrics] = useState<OAuthMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  // Load OAuth metrics
  const loadMetrics = async () => {
    setLoading(true)
    try {
      // In a real implementation, this would fetch from your monitoring API
      const report = generateOAuthComplianceReport()
      
      // Mock data for demonstration
      const mockMetrics: OAuthMetrics = {
        totalRouteUsages: 1250,
        correctUsages: 1235,
        violations: 15,
        complianceRate: 98.8,
        recentViolations: [
          {
            id: '1',
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            route: '/auth/start?provider=google',
            expectedFlowType: 'main_auth',
            actualFlowType: 'storage_oauth',
            component: 'CloudStorage',
            userId: 'user_123',
            severity: 'high'
          },
          {
            id: '2',
            timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
            route: '/api/storage/google/start',
            expectedFlowType: 'storage_oauth',
            actualFlowType: 'main_auth',
            component: 'SupabaseAuthProvider',
            userId: 'user_456',
            severity: 'medium'
          }
        ],
        flowBreakdown: {
          mainAuth: { total: 450, success: 445, failures: 5 },
          storageOAuth: { total: 800, success: 790, failures: 10 }
        }
      }
      
      setMetrics(mockMetrics)
      setLastRefresh(new Date())
    } catch (error) {
      console.error('Failed to load OAuth metrics:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMetrics()
    
    // Auto-refresh every 5 minutes
    const interval = setInterval(loadMetrics, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const getComplianceColor = (rate: number) => {
    if (rate >= 95) return 'text-green-600'
    if (rate >= 90) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getComplianceIcon = (rate: number) => {
    if (rate >= 95) return <CheckCircle className="w-5 h-5 text-green-600" />
    if (rate >= 90) return <AlertTriangle className="w-5 h-5 text-yellow-600" />
    return <XCircle className="w-5 h-5 text-red-600" />
  }

  const getSeverityBadge = (severity: OAuthViolation['severity']) => {
    const colors = {
      low: 'bg-blue-100 text-blue-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-red-100 text-red-800'
    }
    
    return (
      <Badge className={colors[severity]}>
        {severity.toUpperCase()}
      </Badge>
    )
  }

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString()
  }

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        <span>Loading OAuth metrics...</span>
      </div>
    )
  }

  if (!metrics) {
    return (
      <div className="text-center p-8">
        <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Failed to Load Metrics</h3>
        <p className="text-gray-600 mb-4">Unable to load OAuth flow monitoring data.</p>
        <Button onClick={loadMetrics}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">OAuth Flow Monitoring</h2>
          <p className="text-gray-600">Monitor OAuth flow separation compliance and detect violations</p>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-sm text-gray-500">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </span>
          <Button onClick={loadMetrics} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Compliance Rate</CardTitle>
            {getComplianceIcon(metrics.complianceRate)}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getComplianceColor(metrics.complianceRate)}`}>
              {metrics.complianceRate.toFixed(1)}%
            </div>
            <p className="text-xs text-gray-600">
              {metrics.correctUsages} of {metrics.totalRouteUsages} correct
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Violations</CardTitle>
            <XCircle className="w-5 h-5 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {metrics.violations}
            </div>
            <p className="text-xs text-gray-600">
              Route usage violations detected
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Main Auth Success</CardTitle>
            <TrendingUp className="w-5 h-5 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {((metrics.flowBreakdown.mainAuth.success / metrics.flowBreakdown.mainAuth.total) * 100).toFixed(1)}%
            </div>
            <p className="text-xs text-gray-600">
              {metrics.flowBreakdown.mainAuth.success} of {metrics.flowBreakdown.mainAuth.total} successful
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Storage OAuth Success</CardTitle>
            <TrendingUp className="w-5 h-5 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {((metrics.flowBreakdown.storageOAuth.success / metrics.flowBreakdown.storageOAuth.total) * 100).toFixed(1)}%
            </div>
            <p className="text-xs text-gray-600">
              {metrics.flowBreakdown.storageOAuth.success} of {metrics.flowBreakdown.storageOAuth.total} successful
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Violations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <AlertTriangle className="w-5 h-5 mr-2 text-yellow-600" />
            Recent OAuth Route Violations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.recentViolations.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Recent Violations</h3>
              <p className="text-gray-600">All OAuth routes are being used correctly.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {metrics.recentViolations.map((violation) => (
                <div key={violation.id} className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        {getSeverityBadge(violation.severity)}
                        <span className="text-sm text-gray-500">
                          {formatTimestamp(violation.timestamp)}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium">Route: <code className="bg-gray-200 px-1 rounded">{violation.route}</code></p>
                        <p className="text-sm text-gray-600">
                          Component: <span className="font-medium">{violation.component}</span>
                        </p>
                        <p className="text-sm text-gray-600">
                          Expected: <span className="font-medium text-green-600">{violation.expectedFlowType}</span> | 
                          Actual: <span className="font-medium text-red-600">{violation.actualFlowType}</span>
                        </p>
                        {violation.userId && (
                          <p className="text-sm text-gray-600">
                            User: <span className="font-medium">{violation.userId}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Flow Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Main Authentication Flow</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span>Total Requests</span>
                <span className="font-bold">{metrics.flowBreakdown.mainAuth.total}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Successful</span>
                <span className="font-bold text-green-600">{metrics.flowBreakdown.mainAuth.success}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Failures</span>
                <span className="font-bold text-red-600">{metrics.flowBreakdown.mainAuth.failures}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-green-600 h-2 rounded-full" 
                  style={{ 
                    width: `${(metrics.flowBreakdown.mainAuth.success / metrics.flowBreakdown.mainAuth.total) * 100}%` 
                  }}
                ></div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Storage OAuth Flow</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span>Total Requests</span>
                <span className="font-bold">{metrics.flowBreakdown.storageOAuth.total}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Successful</span>
                <span className="font-bold text-green-600">{metrics.flowBreakdown.storageOAuth.success}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Failures</span>
                <span className="font-bold text-red-600">{metrics.flowBreakdown.storageOAuth.failures}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full" 
                  style={{ 
                    width: `${(metrics.flowBreakdown.storageOAuth.success / metrics.flowBreakdown.storageOAuth.total) * 100}%` 
                  }}
                ></div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}