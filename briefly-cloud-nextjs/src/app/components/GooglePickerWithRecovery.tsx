'use client'

import { useState, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/components/ui/dialog'
import { GooglePicker } from './GooglePicker'
import { GooglePickerRecovery } from './GooglePickerRecovery'
import { GoogleDriveConnectionStatus } from './GoogleDriveConnectionStatus'
import { GoogleDriveAuthGuide } from './GoogleDriveAuthGuide'
import { 
  PickerErrorInfo,
  requiresImmediateReauth,
  getConnectionStatusMessage
} from '@/app/lib/google-picker/auth-recovery'

interface GooglePickerWithRecoveryProps {
  onFilesSelected: (files: any[]) => void
  onError?: (error: string) => void
  userId?: string
  isConnected?: boolean
  className?: string
}

export function GooglePickerWithRecovery({
  onFilesSelected,
  onError,
  userId,
  isConnected = false,
  className
}: GooglePickerWithRecoveryProps) {
  const [lastError, setLastError] = useState<PickerErrorInfo | null>(null)
  const [showRecovery, setShowRecovery] = useState(false)
  const [showAuthGuide, setShowAuthGuide] = useState(false)

  // Handle picker errors and determine recovery flow
  const handlePickerError = useCallback((error: string) => {
    console.error('Picker error:', error)
    
    // For demo purposes, create a mock error info
    // In real implementation, this would come from the picker error handling
    const mockErrorInfo: PickerErrorInfo = {
      type: 'TOKEN_EXPIRED' as any,
      severity: 'medium' as any,
      userMessage: error,
      technicalMessage: error,
      recoveryAction: 'reconnect' as any,
      canRetry: false,
      requiresReauth: true
    }
    
    setLastError(mockErrorInfo)
    
    // Show recovery dialog for auth errors
    if (requiresImmediateReauth(mockErrorInfo)) {
      setShowRecovery(true)
    }
    
    onError?.(error)
  }, [onError])

  // Handle reconnection request
  const handleReconnect = useCallback(() => {
    // Navigate to Google Drive connection
    window.location.href = '/api/storage/google/start'
  }, [])

  // Handle showing recovery steps
  const handleShowRecovery = useCallback(() => {
    if (lastError) {
      setShowRecovery(true)
    } else {
      // Show general auth guide for first-time setup
      setShowAuthGuide(true)
    }
  }, [lastError])

  // Handle recovery completion
  const handleRecoveryComplete = useCallback(() => {
    setLastError(null)
    setShowRecovery(false)
    setShowAuthGuide(false)
  }, [])

  // Determine auth guide scenario
  const getAuthGuideScenario = () => {
    if (!lastError) return 'first_time'
    
    const statusInfo = getConnectionStatusMessage(lastError)
    switch (statusInfo.status) {
      case 'expired':
        return 'expired'
      case 'error':
        return lastError.type === 'PERMISSION_DENIED' ? 'revoked' : 'failed'
      case 'disconnected':
        return 'first_time'
      default:
        return 'failed'
    }
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Connection Status */}
      <GoogleDriveConnectionStatus
        isConnected={isConnected}
        lastError={lastError}
        onReconnect={handleReconnect}
        onShowRecovery={handleShowRecovery}
      />

      {/* Google Picker */}
      {isConnected && (
        <GooglePicker
          onFilesSelected={onFilesSelected}
          onError={handlePickerError}
          userId={userId}
        />
      )}

      {/* Recovery Dialog */}
      <Dialog open={showRecovery} onOpenChange={setShowRecovery}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fix Google Drive Connection</DialogTitle>
          </DialogHeader>
          {lastError && userId && (
            <GooglePickerRecovery
              errorInfo={lastError}
              userId={userId}
              onRecoveryComplete={handleRecoveryComplete}
              onRetry={() => {
                setLastError(null)
                setShowRecovery(false)
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Auth Guide Dialog */}
      <Dialog open={showAuthGuide} onOpenChange={setShowAuthGuide}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Connect Google Drive</DialogTitle>
          </DialogHeader>
          <GoogleDriveAuthGuide
            scenario={getAuthGuideScenario() as any}
            onStartConnection={handleReconnect}
            onContactSupport={() => window.open('/help/contact-support', '_blank')}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}