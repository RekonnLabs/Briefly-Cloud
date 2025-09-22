'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Badge } from '@/app/components/ui/badge'
import { 
  AlertCircleIcon, 
  CheckCircleIcon, 
  ExternalLinkIcon, 
  RefreshCwIcon,
  WifiOffIcon,
  ShieldAlertIcon,
  InfoIcon
} from 'lucide-react'
import { 
  PickerErrorInfo,
  getConnectionStatusMessage,
  getQuickRecoveryAction,
  requiresImmediateReauth
} from '@/app/lib/google-picker/auth-recovery'

interface GoogleDriveConnectionStatusProps {
  isConnected: boolean
  lastError?: PickerErrorInfo | null
  onReconnect?: () => void
  onShowRecovery?: () => void
  className?: string
}

export function GoogleDriveConnectionStatus({ 
  isConnected, 
  lastError, 
  onReconnect, 
  onShowRecovery,
  className 
}: GoogleDriveConnectionStatusProps) {
  const [showDetails, setShowDetails] = useState(false)

  // Auto-show details if there's an error requiring action
  useEffect(() => {
    if (lastError && requiresImmediateReauth(lastError)) {
      setShowDetails(true)
    }
  }, [lastError])

  // If connected and no errors, show simple connected status
  if (isConnected && !lastError) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <CheckCircleIcon className="h-4 w-4 text-green-500" />
        <span className="text-sm text-green-600">Google Drive Connected</span>
      </div>
    )
  }

  // If not connected or has errors, show detailed status
  const statusInfo = lastError ? getConnectionStatusMessage(lastError) : {
    status: 'disconnected' as const,
    message: 'Google Drive is not connected',
    actionRequired: true
  }

  const quickAction = lastError ? getQuickRecoveryAction(lastError) : null

  const getStatusIcon = () => {
    switch (statusInfo.status) {
      case 'connected':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />
      case 'expired':
        return <AlertCircleIcon className="h-5 w-5 text-yellow-500" />
      case 'disconnected':
        return <WifiOffIcon className="h-5 w-5 text-gray-500" />
      case 'error':
        return <ShieldAlertIcon className="h-5 w-5 text-red-500" />
      default:
        return <AlertCircleIcon className="h-5 w-5 text-gray-500" />
    }
  }

  const getStatusBadge = () => {
    switch (statusInfo.status) {
      case 'connected':
        return <Badge variant="default" className="bg-green-100 text-green-800">Connected</Badge>
      case 'expired':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Expired</Badge>
      case 'disconnected':
        return <Badge variant="outline" className="text-gray-600">Disconnected</Badge>
      case 'error':
        return <Badge variant="destructive">Error</Badge>
      default:
        return <Badge variant="outline">Unknown</Badge>
    }
  }

  return (
    <Card className={`border-l-4 ${
      statusInfo.status === 'connected' ? 'border-l-green-500' :
      statusInfo.status === 'expired' ? 'border-l-yellow-500' :
      statusInfo.status === 'error' ? 'border-l-red-500' :
      'border-l-gray-300'
    } ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <div>
              <CardTitle className="text-base">Google Drive Connection</CardTitle>
              <CardDescription className="text-sm">
                {statusInfo.message}
              </CardDescription>
            </div>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>

      {statusInfo.actionRequired && (
        <CardContent className="pt-0">
          <div className="space-y-3">
            {/* Quick action buttons */}
            <div className="flex gap-2">
              {quickAction && quickAction.actionType === 'external' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(quickAction.actionUrl, '_blank', 'noopener,noreferrer')}
                  className="flex items-center gap-1"
                >
                  {quickAction.actionText}
                  <ExternalLinkIcon className="h-3 w-3" />
                </Button>
              )}
              
              {quickAction && quickAction.actionType === 'link' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.location.href = quickAction.actionUrl}
                  className="flex items-center gap-1"
                >
                  {quickAction.actionText}
                </Button>
              )}

              {onReconnect && (
                <Button
                  size="sm"
                  onClick={onReconnect}
                  className="flex items-center gap-1"
                >
                  <RefreshCwIcon className="h-3 w-3" />
                  Reconnect Google Drive
                </Button>
              )}

              {lastError && onShowRecovery && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onShowRecovery}
                  className="flex items-center gap-1"
                >
                  <InfoIcon className="h-3 w-3" />
                  Show Recovery Steps
                </Button>
              )}
            </div>

            {/* Show details toggle */}
            {lastError && (
              <div className="pt-2 border-t">
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => setShowDetails(!showDetails)}
                  className="p-0 h-auto text-xs"
                >
                  {showDetails ? 'Hide' : 'Show'} technical details
                </Button>
                
                {showDetails && (
                  <div className="mt-2 p-3 bg-gray-50 rounded text-xs text-gray-600">
                    <div className="space-y-1">
                      <div><strong>Error Type:</strong> {lastError.type}</div>
                      <div><strong>Severity:</strong> {lastError.severity}</div>
                      <div><strong>Technical Message:</strong> {lastError.technicalMessage}</div>
                      {lastError.canRetry && (
                        <div><strong>Can Retry:</strong> Yes</div>
                      )}
                      {lastError.requiresReauth && (
                        <div><strong>Requires Re-auth:</strong> Yes</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Recovery guidance */}
            {quickAction && (
              <div className="flex items-start gap-2 p-3 bg-blue-50 rounded text-sm">
                <InfoIcon className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-blue-700">
                  <strong>Next Step:</strong> {quickAction.description}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}
