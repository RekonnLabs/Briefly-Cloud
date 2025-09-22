'use client'

import { useState } from 'react'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Badge } from '@/app/components/ui/badge'
import { 
  AlertCircleIcon, 
  CheckCircleIcon, 
  ExternalLinkIcon, 
  RefreshCwIcon,
  ArrowRightIcon,
  InfoIcon,
  ShieldIcon,
  ClockIcon
} from 'lucide-react'

interface GoogleDriveAuthGuideProps {
  scenario: 'first_time' | 'expired' | 'revoked' | 'failed' | 'network_issue'
  onStartConnection?: () => void
  onContactSupport?: () => void
  className?: string
}

interface GuideStep {
  id: string
  title: string
  description: string
  actionText?: string
  actionUrl?: string
  actionType: 'button' | 'link' | 'external' | 'info'
  estimatedTime?: string
  isRequired: boolean
}

const AUTH_GUIDES = {
  first_time: {
    title: 'Connect Google Drive',
    description: 'Connect your Google Drive account to start importing and selecting files.',
    severity: 'info' as const,
    estimatedTime: '2-3 minutes',
    steps: [
      {
        id: 'start_connection',
        title: 'Start Connection Process',
        description: 'Click the "Connect Google Drive" button to begin the authorization process.',
        actionText: 'Connect Google Drive',
        actionType: 'button' as const,
        estimatedTime: '30 seconds',
        isRequired: true
      },
      {
        id: 'google_signin',
        title: 'Sign in to Google',
        description: 'You will be redirected to Google to sign in with your account.',
        actionType: 'info' as const,
        estimatedTime: '1 minute',
        isRequired: true
      },
      {
        id: 'grant_permissions',
        title: 'Grant Permissions',
        description: 'Allow Briefly Cloud to access files you select from Google Drive. We only access files you explicitly choose.',
        actionType: 'info' as const,
        estimatedTime: '30 seconds',
        isRequired: true
      },
      {
        id: 'verify_connection',
        title: 'Verify Connection',
        description: 'You will be redirected back to Briefly Cloud with Google Drive connected.',
        actionType: 'info' as const,
        estimatedTime: '30 seconds',
        isRequired: true
      }
    ]
  },

  expired: {
    title: 'Renew Google Drive Access',
    description: 'Your Google Drive access has expired and needs to be renewed. This is normal and happens periodically for security.',
    severity: 'warning' as const,
    estimatedTime: '1-2 minutes',
    steps: [
      {
        id: 'understand_expiration',
        title: 'Why Did This Happen?',
        description: 'Google Drive connections expire periodically for security. Your files are safe and this is a normal process.',
        actionType: 'info' as const,
        isRequired: false
      },
      {
        id: 'disconnect_current',
        title: 'Disconnect Current Connection',
        description: 'First, remove the expired connection from your storage settings.',
        actionText: 'Go to Storage Settings',
        actionUrl: '/briefly/app/dashboard?tab=storage',
        actionType: 'link' as const,
        estimatedTime: '30 seconds',
        isRequired: true
      },
      {
        id: 'reconnect_drive',
        title: 'Reconnect Google Drive',
        description: 'Connect your Google Drive account again with fresh permissions.',
        actionText: 'Reconnect Google Drive',
        actionType: 'button' as const,
        estimatedTime: '1 minute',
        isRequired: true
      },
      {
        id: 'test_connection',
        title: 'Test the Connection',
        description: 'Try using the file picker to ensure everything works properly.',
        actionType: 'info' as const,
        estimatedTime: '30 seconds',
        isRequired: false
      }
    ]
  },

  revoked: {
    title: 'Restore Google Drive Access',
    description: 'Google Drive access has been revoked. This might have happened if you changed permissions in your Google account.',
    severity: 'error' as const,
    estimatedTime: '3-5 minutes',
    steps: [
      {
        id: 'check_google_permissions',
        title: 'Check Google Account Permissions',
        description: 'Review the permissions granted to Briefly Cloud in your Google account settings.',
        actionText: 'Check Google Permissions',
        actionUrl: 'https://myaccount.google.com/permissions',
        actionType: 'external' as const,
        estimatedTime: '2 minutes',
        isRequired: true
      },
      {
        id: 'remove_old_permissions',
        title: 'Remove Old Permissions (if any)',
        description: 'If you see Briefly Cloud in your Google permissions, remove it to start fresh.',
        actionType: 'info' as const,
        estimatedTime: '1 minute',
        isRequired: false
      },
      {
        id: 'reconnect_fresh',
        title: 'Reconnect with Fresh Permissions',
        description: 'Connect your Google Drive account again with completely fresh permissions.',
        actionText: 'Reconnect Google Drive',
        actionType: 'button' as const,
        estimatedTime: '2 minutes',
        isRequired: true
      },
      {
        id: 'verify_access',
        title: 'Verify File Access',
        description: 'Test that you can now access and select files from Google Drive.',
        actionType: 'info' as const,
        estimatedTime: '1 minute',
        isRequired: false
      }
    ]
  },

  failed: {
    title: 'Fix Connection Issues',
    description: 'The connection to Google Drive failed. This is usually due to a temporary issue that can be resolved.',
    severity: 'warning' as const,
    estimatedTime: '2-3 minutes',
    steps: [
      {
        id: 'check_browser',
        title: 'Check Browser Settings',
        description: 'Ensure cookies are enabled and you are not in incognito/private mode.',
        actionType: 'info' as const,
        estimatedTime: '30 seconds',
        isRequired: true
      },
      {
        id: 'check_google_access',
        title: 'Verify Google Drive Access',
        description: 'Make sure you can access Google Drive directly in your browser.',
        actionText: 'Open Google Drive',
        actionUrl: 'https://drive.google.com',
        actionType: 'external' as const,
        estimatedTime: '1 minute',
        isRequired: true
      },
      {
        id: 'retry_connection',
        title: 'Retry Connection',
        description: 'Try connecting to Google Drive again.',
        actionText: 'Retry Connection',
        actionType: 'button' as const,
        estimatedTime: '1 minute',
        isRequired: true
      },
      {
        id: 'contact_support',
        title: 'Contact Support (if needed)',
        description: 'If the issue persists, our support team can help troubleshoot.',
        actionText: 'Contact Support',
        actionUrl: '/help/contact-support',
        actionType: 'link' as const,
        isRequired: false
      }
    ]
  },

  network_issue: {
    title: 'Resolve Network Issues',
    description: 'There seems to be a network connectivity issue preventing Google Drive access.',
    severity: 'warning' as const,
    estimatedTime: '1-2 minutes',
    steps: [
      {
        id: 'check_internet',
        title: 'Check Internet Connection',
        description: 'Ensure you have a stable internet connection.',
        actionText: 'Test Connection',
        actionUrl: 'https://www.google.com',
        actionType: 'external' as const,
        estimatedTime: '30 seconds',
        isRequired: true
      },
      {
        id: 'check_firewall',
        title: 'Check Firewall/VPN',
        description: 'Temporarily disable VPN or check if your firewall is blocking Google services.',
        actionType: 'info' as const,
        estimatedTime: '1 minute',
        isRequired: false
      },
      {
        id: 'retry_after_network',
        title: 'Retry Connection',
        description: 'Once your network is stable, try connecting again.',
        actionText: 'Retry Connection',
        actionType: 'button' as const,
        estimatedTime: '30 seconds',
        isRequired: true
      }
    ]
  }
}

export function GoogleDriveAuthGuide({ 
  scenario, 
  onStartConnection, 
  onContactSupport,
  className 
}: GoogleDriveAuthGuideProps) {
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set())
  
  const guide = AUTH_GUIDES[scenario]

  const handleStepAction = (step: GuideStep) => {
    if (step.actionType === 'button') {
      if (step.id === 'start_connection' || step.id === 'reconnect_drive' || step.id === 'retry_connection') {
        onStartConnection?.()
      } else if (step.id === 'contact_support') {
        onContactSupport?.()
      }
      markStepCompleted(step.id)
    } else if (step.actionType === 'link' && step.actionUrl) {
      window.location.href = step.actionUrl
      markStepCompleted(step.id)
    } else if (step.actionType === 'external' && step.actionUrl) {
      window.open(step.actionUrl, '_blank', 'noopener,noreferrer')
      // Don't auto-complete external steps
    } else if (step.actionType === 'info') {
      markStepCompleted(step.id)
    }
  }

  const markStepCompleted = (stepId: string) => {
    setCompletedSteps(prev => new Set(prev).add(stepId))
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'info':
        return 'border-l-blue-500'
      case 'warning':
        return 'border-l-yellow-500'
      case 'error':
        return 'border-l-red-500'
      default:
        return 'border-l-gray-300'
    }
  }

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'info':
        return <Badge variant="default" className="bg-blue-100 text-blue-800">Setup Required</Badge>
      case 'warning':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Action Needed</Badge>
      case 'error':
        return <Badge variant="destructive">Issue Detected</Badge>
      default:
        return <Badge variant="outline">Unknown</Badge>
    }
  }

  return (
    <Card className={`border-l-4 ${getSeverityColor(guide.severity)} ${className}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldIcon className="h-5 w-5 text-blue-600" />
            <div>
              <CardTitle className="text-lg">{guide.title}</CardTitle>
              <CardDescription>{guide.description}</CardDescription>
            </div>
          </div>
          {getSeverityBadge(guide.severity)}
        </div>
        
        <div className="flex items-center gap-4 text-sm text-gray-600 mt-2">
          <div className="flex items-center gap-1">
            <ClockIcon className="h-4 w-4" />
            Estimated time: {guide.estimatedTime}
          </div>
          <div>
            {guide.steps.filter(s => s.isRequired).length} required steps
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {guide.steps.map((step, index) => {
          const isCompleted = completedSteps.has(step.id)
          const stepNumber = index + 1

          return (
            <div
              key={step.id}
              className={`flex gap-4 p-4 rounded-lg border ${
                isCompleted ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
              }`}
            >
              {/* Step indicator */}
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                isCompleted ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                {isCompleted ? (
                  <CheckCircleIcon className="h-4 w-4" />
                ) : (
                  stepNumber
                )}
              </div>

              {/* Step content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="font-medium text-gray-900">{step.title}</h4>
                  {step.isRequired && (
                    <Badge variant="outline" className="text-xs">Required</Badge>
                  )}
                  {step.estimatedTime && (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <ClockIcon className="h-3 w-3" />
                      {step.estimatedTime}
                    </div>
                  )}
                </div>
                
                <p className="text-sm text-gray-600 mb-3">{step.description}</p>

                {/* Step action */}
                {step.actionText && !isCompleted && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={step.actionType === 'external' ? 'outline' : 'default'}
                      onClick={() => handleStepAction(step)}
                      className="flex items-center gap-1"
                    >
                      {step.actionText}
                      {step.actionType === 'external' && (
                        <ExternalLinkIcon className="h-3 w-3" />
                      )}
                      {step.actionType === 'link' && (
                        <ArrowRightIcon className="h-3 w-3" />
                      )}
                    </Button>
                    
                    {step.actionType === 'external' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => markStepCompleted(step.id)}
                      >
                        Mark as Done
                      </Button>
                    )}
                  </div>
                )}

                {isCompleted && (
                  <div className="flex items-center gap-1 text-sm text-green-600">
                    <CheckCircleIcon className="h-4 w-4" />
                    Completed
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* Security note */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-start gap-2">
            <InfoIcon className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-700">
              <strong>Security Note:</strong> Briefly Cloud only accesses files you explicitly select. 
              We never browse or access other files in your Google Drive. Your privacy and security are our top priority.
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
