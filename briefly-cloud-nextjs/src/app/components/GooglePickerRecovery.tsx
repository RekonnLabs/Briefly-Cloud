'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Badge } from '@/app/components/ui/badge'
import { Progress } from '@/app/components/ui/progress'
import { 
  AlertCircleIcon, 
  CheckCircleIcon, 
  ExternalLinkIcon, 
  RefreshCwIcon,
  ClockIcon,
  ArrowRightIcon,
  InfoIcon
} from 'lucide-react'
import { 
  RecoveryFlow, 
  RecoveryStep, 
  RecoveryProgress,
  getRecoveryGuidance,
  startRecovery,
  completeRecoveryStep,
  authRecoveryService
} from '@/app/lib/google-picker/auth-recovery'
import { PickerErrorInfo } from '@/app/lib/google-picker/error-handling'

interface GooglePickerRecoveryProps {
  errorInfo: PickerErrorInfo
  userId: string
  onRecoveryComplete?: () => void
  onRetry?: () => void
  className?: string
}

export function GooglePickerRecovery({ 
  errorInfo, 
  userId, 
  onRecoveryComplete, 
  onRetry,
  className 
}: GooglePickerRecoveryProps) {
  const [recoveryProgress, setRecoveryProgress] = useState<RecoveryProgress | null>(null)
  const [isStartingRecovery, setIsStartingRecovery] = useState(false)
  
  const recoveryGuidance = getRecoveryGuidance(errorInfo)

  // Load existing recovery progress on mount
  useEffect(() => {
    const existingProgress = authRecoveryService.getRecoveryProgress(userId)
    setRecoveryProgress(existingProgress)
  }, [userId])

  // Handle starting recovery flow
  const handleStartRecovery = async () => {
    if (!recoveryGuidance.hasRecoveryFlow) return

    setIsStartingRecovery(true)
    try {
      const progress = startRecovery(userId, errorInfo)
      setRecoveryProgress(progress)
    } finally {
      setIsStartingRecovery(false)
    }
  }

  // Handle completing a recovery step
  const handleCompleteStep = (stepId: string) => {
    const updatedProgress = completeRecoveryStep(userId, stepId)
    setRecoveryProgress(updatedProgress)

    // Check if recovery is complete
    if (updatedProgress && authRecoveryService.isRecoveryComplete(userId)) {
      setTimeout(() => {
        authRecoveryService.clearRecoveryProgress(userId)
        setRecoveryProgress(null)
        onRecoveryComplete?.()
      }, 1000)
    }
  }

  // Handle step actions
  const handleStepAction = (step: RecoveryStep) => {
    if (step.actionType === 'button') {
      if (step.id === 'test_picker' || step.id === 'retry_connection') {
        onRetry?.()
      } else if (step.id === 'refresh_page') {
        window.location.reload()
      }
      handleCompleteStep(step.id)
    } else if (step.actionType === 'link' && step.actionUrl) {
      window.location.href = step.actionUrl
      handleCompleteStep(step.id)
    } else if (step.actionType === 'external' && step.actionUrl) {
      window.open(step.actionUrl, '_blank', 'noopener,noreferrer')
      // Don't auto-complete external steps - user needs to manually mark as done
    } else if (step.actionType === 'info') {
      handleCompleteStep(step.id)
    }
  }

  // Render severity badge
  const renderSeverityBadge = (severity: string) => {
    const variants = {
      low: 'default',
      medium: 'secondary', 
      high: 'destructive'
    } as const

    const colors = {
      low: 'text-blue-600',
      medium: 'text-yellow-600',
      high: 'text-red-600'
    } as const

    return (
      <Badge variant={variants[severity as keyof typeof variants] || 'default'}>
        <AlertCircleIcon className={`h-3 w-3 mr-1 ${colors[severity as keyof typeof colors]}`} />
        {severity.charAt(0).toUpperCase() + severity.slice(1)} Priority
      </Badge>
    )
  }

  // Render recovery step
  const renderRecoveryStep = (step: RecoveryStep, index: number, isActive: boolean, isCompleted: boolean) => {
    const stepNumber = index + 1
    
    return (
      <div key={step.id} className={`flex gap-4 p-4 rounded-lg border ${
        isActive ? 'border-blue-200 bg-blue-50' : 
        isCompleted ? 'border-green-200 bg-green-50' : 
        'border-gray-200 bg-gray-50'
      }`}>
        {/* Step indicator */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
          isCompleted ? 'bg-green-500 text-white' :
          isActive ? 'bg-blue-500 text-white' :
          'bg-gray-300 text-gray-600'
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
          
          {step.helpText && (
            <div className="flex items-start gap-2 p-2 bg-blue-50 rounded text-xs text-blue-700 mb-3">
              <InfoIcon className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>{step.helpText}</span>
            </div>
          )}

          {/* Step action */}
          {step.actionText && isActive && !isCompleted && (
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
                  onClick={() => handleCompleteStep(step.id)}
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
  }

  // If no recovery flow is available, show simple retry option
  if (!recoveryGuidance.hasRecoveryFlow) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircleIcon className="h-5 w-5 text-red-500" />
            Connection Issue
          </CardTitle>
          <CardDescription>
            {errorInfo.userMessage}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {errorInfo.canRetry && onRetry && (
              <Button onClick={onRetry} className="flex items-center gap-1">
                <RefreshCwIcon className="h-4 w-4" />
                Try Again
              </Button>
            )}
            <Button variant="outline" asChild>
              <a href="/help/contact-support" target="_blank" rel="noopener noreferrer">
                Get Help
                <ExternalLinkIcon className="h-4 w-4 ml-1" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const flow = recoveryGuidance.flow!

  // Show recovery flow initiation
  if (!recoveryProgress) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertCircleIcon className="h-5 w-5 text-orange-500" />
              {flow.title}
            </CardTitle>
            {renderSeverityBadge(flow.severity)}
          </div>
          <CardDescription>{flow.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <ClockIcon className="h-4 w-4" />
              Estimated time: {flow.estimatedTime}
            </div>
            <div>
              {flow.steps.filter(s => s.isRequired).length} required steps
            </div>
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={handleStartRecovery}
              disabled={isStartingRecovery}
              className="flex items-center gap-1"
            >
              {isStartingRecovery ? (
                <RefreshCwIcon className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRightIcon className="h-4 w-4" />
              )}
              Start Recovery Process
            </Button>
            
            {recoveryGuidance.quickAction && (
              <Button variant="outline" asChild>
                <a 
                  href={recoveryGuidance.quickAction.url}
                  target={recoveryGuidance.quickAction.type === 'external' ? '_blank' : undefined}
                  rel={recoveryGuidance.quickAction.type === 'external' ? 'noopener noreferrer' : undefined}
                >
                  {recoveryGuidance.quickAction.text}
                  {recoveryGuidance.quickAction.type === 'external' && (
                    <ExternalLinkIcon className="h-4 w-4 ml-1" />
                  )}
                </a>
              </Button>
            )}
          </div>

          {flow.troubleshootingUrl && (
            <div className="pt-2 border-t">
              <Button variant="link" size="sm" asChild className="p-0 h-auto">
                <a href={flow.troubleshootingUrl} target="_blank" rel="noopener noreferrer">
                  View detailed troubleshooting guide
                  <ExternalLinkIcon className="h-3 w-3 ml-1" />
                </a>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // Show active recovery flow
  const currentStepIndex = flow.steps.findIndex(step => step.id === recoveryProgress.currentStepId)
  const completedStepsCount = recoveryProgress.completedSteps.length
  const totalRequiredSteps = flow.steps.filter(step => step.isRequired).length
  const progressPercentage = (completedStepsCount / flow.steps.length) * 100

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <RefreshCwIcon className="h-5 w-5 text-blue-500" />
            Recovery in Progress
          </CardTitle>
          <Badge variant="outline">
            Step {currentStepIndex + 1} of {flow.steps.length}
          </Badge>
        </div>
        <CardDescription>{flow.title}</CardDescription>
        
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Progress</span>
            <span>{completedStepsCount} of {flow.steps.length} steps completed</span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {flow.steps.map((step, index) => {
          const isActive = step.id === recoveryProgress.currentStepId
          const isCompleted = recoveryProgress.completedSteps.includes(step.id)
          
          return renderRecoveryStep(step, index, isActive, isCompleted)
        })}

        {/* Prevention tips */}
        {flow.preventionTips && flow.preventionTips.length > 0 && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h5 className="font-medium text-blue-900 mb-2">Prevention Tips</h5>
            <ul className="text-sm text-blue-700 space-y-1">
              {flow.preventionTips.map((tip, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-blue-500 mt-1">•</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Additional help */}
        {flow.troubleshootingUrl && (
          <div className="pt-4 border-t">
            <Button variant="link" size="sm" asChild className="p-0 h-auto">
              <a href={flow.troubleshootingUrl} target="_blank" rel="noopener noreferrer">
                Need more help? View detailed troubleshooting guide
                <ExternalLinkIcon className="h-3 w-3 ml-1" />
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}