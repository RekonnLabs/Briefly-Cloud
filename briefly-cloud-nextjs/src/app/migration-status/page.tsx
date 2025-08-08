'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Alert, AlertDescription } from '@/app/components/ui/alert'
import { Badge } from '@/app/components/ui/badge'
import { Progress } from '@/app/components/ui/progress'
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle, 
  RefreshCw,
  ExternalLink,
  MessageCircle,
  Phone,
  Mail
} from 'lucide-react'

interface MigrationStatus {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'rolled_back'
  started_at: string
  completed_at?: string
  error?: string
  records_processed: number
  records_total: number
  progress: number
}

interface Notification {
  id: string
  type: string
  title: string
  message: string
  created_at: string
  read_at?: string
  action_url?: string
  action_text?: string
}

export default function MigrationStatusPage() {
  const { data: session, status } = useSession()
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      fetchMigrationStatus()
      fetchNotifications()
    } else if (status === 'unauthenticated') {
      setIsLoading(false)
    }
  }, [session, status])

  const fetchMigrationStatus = async () => {
    try {
      const response = await fetch('/api/migration?action=status')
      const data = await response.json()
      
      if (data.success && data.data.migrations?.length > 0) {
        const latestMigration = data.data.migrations[0]
        const progress = latestMigration.records_total > 0 
          ? Math.round((latestMigration.records_processed / latestMigration.records_total) * 100)
          : 0
        
        setMigrationStatus({
          ...latestMigration,
          progress
        })
      }
    } catch (error) {
      console.error('Failed to fetch migration status:', error)
      setError('Unable to fetch migration status')
    }
  }

  const fetchNotifications = async () => {
    try {
      const response = await fetch('/api/notifications?limit=10')
      const data = await response.json()
      
      if (data.success) {
        setNotifications(data.data.notifications || [])
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-6 w-6 text-green-500" />
      case 'failed':
        return <XCircle className="h-6 w-6 text-red-500" />
      case 'running':
        return <RefreshCw className="h-6 w-6 text-blue-500 animate-spin" />
      case 'pending':
        return <Clock className="h-6 w-6 text-yellow-500" />
      default:
        return <AlertTriangle className="h-6 w-6 text-orange-500" />
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      completed: 'default',
      failed: 'destructive',
      running: 'secondary',
      pending: 'outline',
      rolled_back: 'destructive',
    }

    return (
      <Badge variant={variants[status] || 'outline'}>
        {status.replace('_', ' ')}
      </Badge>
    )
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-6 w-6 animate-spin" />
          <span>Loading migration status...</span>
        </div>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Migration Status Check
            </CardTitle>
            <CardDescription>
              Please sign in to check your migration status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <a href="/briefly/app/auth/signin">Sign In</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Migration Status
          </h1>
          <p className="text-gray-600">
            Check the status of your data migration and get support if needed
          </p>
        </div>

        <div className="grid gap-6">
          {/* Migration Status Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {migrationStatus && getStatusIcon(migrationStatus.status)}
                Migration Progress
              </CardTitle>
              <CardDescription>
                Your data is being migrated to our new system
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {migrationStatus ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Status</span>
                    {getStatusBadge(migrationStatus.status)}
                  </div>
                  
                  {migrationStatus.status === 'running' && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Progress</span>
                        <span>{migrationStatus.progress}%</span>
                      </div>
                      <Progress value={migrationStatus.progress} className="h-2" />
                      <div className="text-sm text-gray-600">
                        {migrationStatus.records_processed} / {migrationStatus.records_total} records processed
                      </div>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Started:</span>
                      <div className="font-medium">{formatDate(migrationStatus.started_at)}</div>
                    </div>
                    {migrationStatus.completed_at && (
                      <div>
                        <span className="text-gray-600">Completed:</span>
                        <div className="font-medium">{formatDate(migrationStatus.completed_at)}</div>
                      </div>
                    )}
                  </div>
                  
                  {migrationStatus.error && (
                    <Alert className="border-red-200 bg-red-50">
                      <XCircle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Error:</strong> {migrationStatus.error}
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  {migrationStatus.status === 'completed' && (
                    <Alert className="border-green-200 bg-green-50">
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        Your migration has completed successfully! You can now access your data.
                      </AlertDescription>
                    </Alert>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No migration found for your account</p>
                  <p className="text-sm text-gray-500 mt-2">
                    If you believe this is an error, please contact support
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Notifications */}
          {notifications.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5" />
                  Recent Updates
                </CardTitle>
                <CardDescription>
                  Latest notifications about your migration
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {notifications.map((notification) => (
                    <div key={notification.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium">{notification.title}</h4>
                          <p className="text-sm text-gray-600 mt-1">
                            {notification.message}
                          </p>
                          <p className="text-xs text-gray-500 mt-2">
                            {formatDate(notification.created_at)}
                          </p>
                        </div>
                        {notification.action_url && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={notification.action_url} target="_blank" rel="noopener noreferrer">
                              {notification.action_text || 'View'}
                              <ExternalLink className="h-3 w-3 ml-1" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Support Section */}
          <Card>
            <CardHeader>
              <CardTitle>Need Help?</CardTitle>
              <CardDescription>
                Contact our support team if you're experiencing issues
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <MessageCircle className="h-5 w-5 text-blue-500" />
                  <div className="flex-1">
                    <h4 className="font-medium">Live Chat</h4>
                    <p className="text-sm text-gray-600">Get instant help from our support team</p>
                  </div>
                  <Button variant="outline" size="sm">
                    Start Chat
                  </Button>
                </div>
                
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <Mail className="h-5 w-5 text-green-500" />
                  <div className="flex-1">
                    <h4 className="font-medium">Email Support</h4>
                    <p className="text-sm text-gray-600">support@rekonnlabs.com</p>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <a href="mailto:support@rekonnlabs.com">Send Email</a>
                  </Button>
                </div>
                
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <Phone className="h-5 w-5 text-purple-500" />
                  <div className="flex-1">
                    <h4 className="font-medium">Phone Support</h4>
                    <p className="text-sm text-gray-600">Available during business hours</p>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <a href="tel:+1-555-0123">Call Now</a>
                  </Button>
                </div>
              </div>
              
              <div className="mt-6 pt-4 border-t">
                <h4 className="font-medium mb-2">Common Issues</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span>Migration taking longer than expected</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span>Can't access my documents</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span>Missing files after migration</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span>Chat history not appearing</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-4">
            <Button onClick={fetchMigrationStatus} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Status
            </Button>
            <Button asChild>
              <a href="/briefly/app">Go to App</a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
