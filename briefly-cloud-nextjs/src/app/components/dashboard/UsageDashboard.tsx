/**
 * Usage Dashboard Component
 * 
 * This component displays comprehensive usage analytics, limits,
 * and recommendations for the authenticated user.
 */

'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Progress } from '@/app/components/ui/progress'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/app/components/ui/alert'
import { 
  MessageSquare, 
  Upload, 
  Search, 
  Database, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Clock,
  Zap
} from 'lucide-react'

interface UsageData {
  subscription: {
    tier: string
    status: string
    limits: {
      chatMessages: { current: number; limit: number; remaining: number; percentUsed: number }
      documents: { current: number; limit: number; remaining: number; percentUsed: number }
      apiCalls: { current: number; limit: number; remaining: number; percentUsed: number }
      storage: { current: number; limit: number; remaining: number; percentUsed: number }
    }
  }
  trends: {
    chatMessages: { current: number; previous: number; change: number; percentChange: number }
    uploads: { current: number; previous: number; change: number; percentChange: number }
    apiCalls: { current: number; previous: number; change: number; percentChange: number }
  }
  efficiency: {
    averageSessionLength: number
    documentsPerSession: number
    queriesPerDocument: number
    successRate: number
  }
  recommendations: Array<{
    reason: string
    recommendedTier: string
    benefits: string[]
  }>
  recentActivity: Array<{
    action: string
    timestamp: string
    quantity: number
  }>
  insights: {
    mostUsedFeature: string
    peakUsageDay: string
    averageDailyUsage: number
    projectedMonthlyUsage: number
  }
}

export function UsageDashboard() {
  const [usageData, setUsageData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPeriod, setSelectedPeriod] = useState('current')

  useEffect(() => {
    fetchUsageData()
  }, [selectedPeriod])

  const fetchUsageData = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/usage/analytics?period=${selectedPeriod}`)
      const result = await response.json()
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch usage data')
      }
      
      setUsageData(result.data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'free': return 'bg-gray-100 text-gray-800'
      case 'pro': return 'bg-blue-100 text-blue-800'
      case 'pro_byok': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getUsageColor = (percentUsed: number) => {
    if (percentUsed >= 90) return 'text-red-600'
    if (percentUsed >= 75) return 'text-yellow-600'
    return 'text-green-600'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading usage data...</span>
      </div>
    )
  }

  if (error) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
        <Button onClick={fetchUsageData} className="mt-2">Retry</Button>
      </Alert>
    )
  }

  if (!usageData) {
    return <div>No usage data available</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Usage Dashboard</h1>
          <p className="text-gray-600">Monitor your usage, limits, and performance</p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge className={getTierColor(usageData.subscription.tier)}>
            {usageData.subscription.tier.toUpperCase()} Plan
          </Badge>
          <select 
            value={selectedPeriod} 
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="px-3 py-1 border rounded-md"
          >
            <option value="current">Current Period</option>
            <option value="previous">Previous Period</option>
          </select>
        </div>
      </div>

      {/* Recommendations Alert */}
      {usageData.recommendations.length > 0 && (
        <Alert>
          <Zap className="h-4 w-4" />
          <AlertTitle>Upgrade Recommendations</AlertTitle>
          <AlertDescription>
            {usageData.recommendations[0].reason}. Consider upgrading to {usageData.recommendations[0].recommendedTier} for better limits.
          </AlertDescription>
        </Alert>
      )}

      {/* Usage Limits Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Chat Messages</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {usageData.subscription.limits.chatMessages.current}
              <span className="text-sm text-gray-500">/{usageData.subscription.limits.chatMessages.limit === Infinity ? '∞' : usageData.subscription.limits.chatMessages.limit}</span>
            </div>
            <Progress 
              value={usageData.subscription.limits.chatMessages.percentUsed} 
              className="mt-2" 
            />
            <p className={`text-xs mt-1 ${getUsageColor(usageData.subscription.limits.chatMessages.percentUsed)}`}>
              {usageData.subscription.limits.chatMessages.percentUsed.toFixed(1)}% used
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Documents</CardTitle>
            <Upload className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {usageData.subscription.limits.documents.current}
              <span className="text-sm text-gray-500">/{usageData.subscription.limits.documents.limit === Infinity ? '∞' : usageData.subscription.limits.documents.limit}</span>
            </div>
            <Progress 
              value={usageData.subscription.limits.documents.percentUsed} 
              className="mt-2" 
            />
            <p className={`text-xs mt-1 ${getUsageColor(usageData.subscription.limits.documents.percentUsed)}`}>
              {usageData.subscription.limits.documents.percentUsed.toFixed(1)}% used
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">API Calls</CardTitle>
            <Search className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {usageData.subscription.limits.apiCalls.current}
              <span className="text-sm text-gray-500">/{usageData.subscription.limits.apiCalls.limit === Infinity ? '∞' : usageData.subscription.limits.apiCalls.limit}</span>
            </div>
            <Progress 
              value={usageData.subscription.limits.apiCalls.percentUsed} 
              className="mt-2" 
            />
            <p className={`text-xs mt-1 ${getUsageColor(usageData.subscription.limits.apiCalls.percentUsed)}`}>
              {usageData.subscription.limits.apiCalls.percentUsed.toFixed(1)}% used
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Storage</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatBytes(usageData.subscription.limits.storage.current)}
            </div>
            <Progress 
              value={usageData.subscription.limits.storage.percentUsed} 
              className="mt-2" 
            />
            <p className={`text-xs mt-1 ${getUsageColor(usageData.subscription.limits.storage.percentUsed)}`}>
              {usageData.subscription.limits.storage.percentUsed.toFixed(1)}% used
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Your latest actions and usage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {usageData.recentActivity.slice(0, 10).map((activity, index) => (
              <div key={index} className="flex items-center justify-between py-2 border-b last:border-b-0">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                  <span className="capitalize">{activity.action.replace('_', ' ')}</span>
                  {activity.quantity > 1 && (
                    <Badge variant="secondary">×{activity.quantity}</Badge>
                  )}
                </div>
                <div className="flex items-center text-sm text-gray-500">
                  <Clock className="h-3 w-3 mr-1" />
                  {new Date(activity.timestamp).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}