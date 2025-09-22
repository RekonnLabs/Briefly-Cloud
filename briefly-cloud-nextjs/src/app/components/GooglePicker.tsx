'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/app/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/components/ui/dialog'
import { FileIcon, LoaderIcon, AlertTriangleIcon, RefreshCwIcon } from 'lucide-react'
import { toast } from 'sonner'
import { 
  handleTokenError, 
  handlePickerError, 
  createErrorContext,
  logPickerError,
  PickerErrorInfo,
  getErrorGuidance
} from '@/app/lib/google-picker/error-handling'
import { 
  withRetry, 
  canRetryOperation, 
  getRetryInfo,
  cancelRetry
} from '@/app/lib/google-picker/retry-service'
import {
  logPickerSessionStart,
  logFileSelectionSuccess,
  logFileSelectionCancelled,
  logFileSelectionFailure
} from '@/app/lib/google-picker/audit-service'
import { GooglePickerRecovery } from './GooglePickerRecovery'

// TypeScript interfaces for the component
interface GooglePickerProps {
  onFilesSelected: (files: SelectedFile[]) => void
  onError: (error: string) => void
  disabled?: boolean
  userId?: string // For recovery flows
}

interface SelectedFile {
  id: string
  name: string
  mimeType: string
  size: number
  downloadUrl?: string
}

// Extend window object to include Google APIs
declare global {
  interface Window {
    google?: {
      picker: {
        PickerBuilder: new () => GooglePickerBuilder
        ViewId: {
          DOCS: string
          SPREADSHEETS: string
          PRESENTATIONS: string
          PDFS: string
        }
        Action: {
          PICKED: string
          CANCEL: string
        }
      }
    }
    gapi?: {
      load: (api: string, options: { callback: () => void; onerror: () => void }) => void
    }
  }
}

interface GooglePickerBuilder {
  addView: (viewId: string) => GooglePickerBuilder
  setOAuthToken: (token: string) => GooglePickerBuilder
  setDeveloperKey: (key: string) => GooglePickerBuilder
  setCallback: (callback: (data: any) => void) => GooglePickerBuilder
  setTitle: (title: string) => GooglePickerBuilder
  setSize: (width: number, height: number) => GooglePickerBuilder
  build: () => GooglePicker
}

interface GooglePicker {
  setVisible: (visible: boolean) => void
}

export function GooglePicker({ onFilesSelected, onError, disabled, userId }: GooglePickerProps) {
  // Component state management
  const [isLoading, setIsLoading] = useState(false)
  const [pickerLoaded, setPickerLoaded] = useState(false)
  const [currentError, setCurrentError] = useState<PickerErrorInfo | null>(null)
  const [showRecovery, setShowRecovery] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`)
  const [currentTokenId, setCurrentTokenId] = useState<string | undefined>()

  // Handle picker callback for file selection events
  const handlePickerCallback = useCallback((data: any) => {
    if (data.action === window.google!.picker.Action.PICKED) {
      // Extract file metadata from picker response
      const selectedFiles: SelectedFile[] = data.docs.map((doc: any) => ({
        id: doc.id,
        name: doc.name,
        mimeType: doc.mimeType,
        size: doc.sizeBytes ? parseInt(doc.sizeBytes) : 0,
        downloadUrl: doc.downloadUrl
      }))
      
      // Log successful file selection for audit
      if (userId) {
        logFileSelectionSuccess(
          userId,
          sessionId,
          selectedFiles.map(file => ({
            fileId: file.id,
            fileName: file.name,
            mimeType: file.mimeType,
            fileSize: file.size
          })),
          currentTokenId
        )
      }
      
      onFilesSelected(selectedFiles)
    } else if (data.action === window.google!.picker.Action.CANCEL) {
      // Log cancellation for audit
      if (userId) {
        logFileSelectionCancelled(userId, sessionId, currentTokenId)
      }
      console.log('User cancelled file selection')
    }
  }, [onFilesSelected, userId, sessionId, currentTokenId])

  // Load Google Picker API dynamically with error handling
  const loadPickerAPI = useCallback(async () => {
    if (window.google?.picker) {
      setPickerLoaded(true)
      return
    }

    return new Promise<void>((resolve, reject) => {
      const context = createErrorContext('load_picker_api', userId)
      
      // Load the Google APIs script first
      const script = document.createElement('script')
      script.src = 'https://apis.google.com/js/api.js'
      
      const timeout = setTimeout(() => {
        reject(new Error('Timeout loading Google APIs script'))
      }, 15000) // 15 second timeout
      
      script.onload = () => {
        clearTimeout(timeout)
        // Once the main API is loaded, load the picker API
        window.gapi!.load('picker', {
          callback: () => {
            setPickerLoaded(true)
            resolve()
          },
          onerror: () => {
            const error = new Error('Failed to load Google Picker API')
            const errorInfo = handlePickerError(error, context)
            logPickerError(errorInfo, context)
            reject(error)
          }
        })
      }
      
      script.onerror = () => {
        clearTimeout(timeout)
        const error = new Error('Failed to load Google APIs script')
        const errorInfo = handlePickerError(error, context)
        logPickerError(errorInfo, context)
        reject(error)
      }
      
      document.head.appendChild(script)
    })
  }, [userId])

  const openPicker = useCallback(async () => {
    const operationId = `picker-open-${Date.now()}`
    setIsLoading(true)
    setCurrentError(null)
    
    try {
      await withRetry(operationId, async () => {
        const context = createErrorContext('open_picker', userId, { retryCount })
        
        try {
          // Load Picker API if not already loaded
          if (!pickerLoaded) {
            await loadPickerAPI()
          }

          // Get picker token from our API
          const tokenResponse = await fetch('/api/storage/google/picker-token', {
            credentials: 'include'
          })

          if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text()
            let errorData
            try {
              errorData = JSON.parse(errorText)
            } catch {
              throw new Error(`HTTP ${tokenResponse.status}: ${errorText}`)
            }
            
            // Handle token-specific errors
            if (errorData.error && typeof errorData.error === 'object') {
              const tokenError = errorData.error
              const errorInfo = handleTokenError(tokenError, context)
              logPickerError(errorInfo, context)
              throw Object.assign(new Error(errorInfo.userMessage), { type: errorInfo.type })
            }
            
            throw new Error(errorData.message || 'Failed to get picker token')
          }

          const { data } = await tokenResponse.json()
          const { accessToken, tokenId } = data

          if (!accessToken) {
            throw new Error('No access token received')
          }

          // Store token ID for audit logging
          setCurrentTokenId(tokenId)

          // Log picker session start for audit
          if (userId) {
            logPickerSessionStart(userId, sessionId, tokenId, {
              userAgent: navigator.userAgent,
              // Note: IP address would be logged server-side for privacy
            })
          }

          // Create and configure the picker
          const picker = new window.google!.picker.PickerBuilder()
            .addView(window.google!.picker.ViewId.DOCS)
            .addView(window.google!.picker.ViewId.SPREADSHEETS)
            .addView(window.google!.picker.ViewId.PRESENTATIONS)
            .addView(window.google!.picker.ViewId.PDFS)
            .setOAuthToken(accessToken)
            .setDeveloperKey(process.env.NEXT_PUBLIC_GOOGLE_API_KEY!)
            .setCallback(handlePickerCallback)
            .setTitle('Select files to add to your knowledge base')
            .setSize(1051, 650)
            .build()

          picker.setVisible(true)
          
        } catch (error) {
          // Handle different types of errors
          if (error instanceof Error && 'type' in error) {
            // Already processed error
            throw error
          }
          
          const errorInfo = handlePickerError(error as Error, context)
          logPickerError(errorInfo, context)
          throw Object.assign(error as Error, { type: errorInfo.type })
        }
      })
      
      // Success - clear any previous errors
      setCurrentError(null)
      setRetryCount(0)
      
    } catch (error) {
      console.error('Failed to open Google Picker:', error)
      
      // Create error info for display
      const context = createErrorContext('open_picker_final', userId, { retryCount })
      let errorInfo: PickerErrorInfo
      
      if (error instanceof Error && 'type' in error) {
        // Token error
        errorInfo = handleTokenError(error as any, context)
      } else {
        // Generic picker error
        errorInfo = handlePickerError(error as Error, context)
      }
      
      setCurrentError(errorInfo)
      setRetryCount(prev => prev + 1)
      
      // Log failure for audit
      if (userId) {
        logFileSelectionFailure(userId, sessionId, errorInfo.type, currentTokenId)
      }

      // Show user-friendly error message
      const guidance = getErrorGuidance(errorInfo)
      toast.error(guidance.message)
      onError(errorInfo.userMessage)
      
      // Show recovery dialog for auth errors
      if (errorInfo.requiresReauth) {
        setShowRecovery(true)
      }
    } finally {
      setIsLoading(false)
    }
  }, [pickerLoaded, loadPickerAPI, handlePickerCallback, onError, userId, retryCount])

  // Handle manual retry
  const handleRetry = useCallback(() => {
    setCurrentError(null)
    setShowRecovery(false)
    openPicker()
  }, [openPicker])

  // Handle recovery completion
  const handleRecoveryComplete = useCallback(() => {
    setCurrentError(null)
    setShowRecovery(false)
    setRetryCount(0)
    toast.success('Connection restored! You can now try selecting files again.')
  }, [])

  // Handle reconnection request
  const handleReconnectRequest = useCallback(() => {
    // Navigate to Google Drive connection page
    window.location.href = '/api/storage/google/start'
  }, [])

  // Clean up retry state on unmount
  useEffect(() => {
    return () => {
      const operationId = `picker-open-${Date.now()}`
      cancelRetry(operationId)
    }
  }, [])

  // Get retry information for current operation
  const operationId = `picker-open-${Date.now()}`
  const retryInfo = getRetryInfo(operationId)

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          onClick={openPicker}
          disabled={disabled || isLoading}
          className="flex items-center gap-2"
          variant="outline"
        >
          {isLoading ? (
            <LoaderIcon className="h-4 w-4 animate-spin" />
          ) : currentError ? (
            <AlertTriangleIcon className="h-4 w-4" />
          ) : (
            <FileIcon className="h-4 w-4" />
          )}
          {isLoading 
            ? 'Loading...' 
            : currentError 
              ? 'Try Again' 
              : 'Add files from Google Drive'
          }
        </Button>

        {/* Manual retry button for failed operations */}
        {currentError && currentError.canRetry && !isLoading && (
          <Button
            onClick={handleRetry}
            variant="ghost"
            size="sm"
            className="flex items-center gap-1"
          >
            <RefreshCwIcon className="h-3 w-3" />
            Retry
          </Button>
        )}

        {/* Show recovery button for auth errors */}
        {currentError && currentError.requiresReauth && !showRecovery && (
          <>
            <Button
              onClick={() => setShowRecovery(true)}
              variant="outline"
              size="sm"
              className="flex items-center gap-1"
            >
              <AlertTriangleIcon className="h-3 w-3" />
              Fix Connection
            </Button>
            <Button
              onClick={handleReconnectRequest}
              variant="default"
              size="sm"
              className="flex items-center gap-1"
            >
              <RefreshCwIcon className="h-3 w-3" />
              Reconnect Now
            </Button>
          </>
        )}
      </div>

      {/* Retry status indicator */}
      {retryInfo.isRetrying && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
          <LoaderIcon className="h-3 w-3 animate-spin" />
          Retrying... (Attempt {retryInfo.attemptCount + 1})
          {retryInfo.nextRetryAt && (
            <span>Next attempt in {Math.ceil((new Date(retryInfo.nextRetryAt).getTime() - Date.now()) / 1000)}s</span>
          )}
        </div>
      )}

      {/* Recovery dialog */}
      <Dialog open={showRecovery} onOpenChange={setShowRecovery}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fix Google Drive Connection</DialogTitle>
          </DialogHeader>
          {currentError && userId && (
            <GooglePickerRecovery
              errorInfo={currentError}
              userId={userId}
              onRecoveryComplete={handleRecoveryComplete}
              onRetry={handleRetry}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
