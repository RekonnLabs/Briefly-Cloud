/**
 * Google Picker Authentication Recovery Service
 * 
 * Provides guided recovery flows for authentication issues,
 * helping users reconnect their Google Drive when tokens expire or fail.
 */

import { logger } from '@/app/lib/logger'
import { PickerErrorType, PickerErrorInfo } from './error-handling'
import { DEFAULT_POST_LOGIN_PATH } from '@/app/lib/auth/constants'

/**
 * Recovery flow types for different authentication scenarios
 */
export enum RecoveryFlowType {
  TOKEN_EXPIRED = 'token_expired',
  TOKEN_NOT_FOUND = 'token_not_found',
  REFRESH_FAILED = 'refresh_failed',
  PERMISSION_DENIED = 'permission_denied',
  CONNECTION_LOST = 'connection_lost',
  SCOPE_INSUFFICIENT = 'scope_insufficient'
}

/**
 * Recovery step information
 */
export interface RecoveryStep {
  id: string
  title: string
  description: string
  actionText?: string
  actionUrl?: string
  actionType: 'button' | 'link' | 'info' | 'external'
  isRequired: boolean
  estimatedTime?: string
  helpText?: string
}

/**
 * Complete recovery flow definition
 */
export interface RecoveryFlow {
  type: RecoveryFlowType
  title: string
  description: string
  severity: 'low' | 'medium' | 'high'
  estimatedTime: string
  steps: RecoveryStep[]
  preventionTips?: string[]
  troubleshootingUrl?: string
}

/**
 * Recovery flow definitions for different authentication issues
 */
export const RECOVERY_FLOWS: Record<RecoveryFlowType, RecoveryFlow> = {
  [RecoveryFlowType.TOKEN_EXPIRED]: {
    type: RecoveryFlowType.TOKEN_EXPIRED,
    title: 'Google Drive Access Expired',
    description: 'Your Google Drive access has expired and needs to be renewed. This is normal and happens periodically for security.',
    severity: 'medium',
    estimatedTime: '1-2 minutes',
    steps: [
      {
        id: 'disconnect_current',
        title: 'Disconnect Current Connection',
        description: 'First, we need to remove the expired connection to Google Drive.',
        actionText: 'Go to Storage Settings',
        actionUrl: `${DEFAULT_POST_LOGIN_PATH}?tab=storage`,
        actionType: 'link',
        isRequired: true,
        estimatedTime: '30 seconds',
        helpText: 'Look for the Google Drive section and click "Disconnect"'
      },
      {
        id: 'reconnect_drive',
        title: 'Reconnect Google Drive',
        description: 'Connect your Google Drive account again with fresh permissions.',
        actionText: 'Connect Google Drive',
        actionUrl: '/api/storage/google/start',
        actionType: 'external',
        isRequired: true,
        estimatedTime: '1 minute',
        helpText: 'You will be redirected to Google to authorize access'
      },
      {
        id: 'verify_connection',
        title: 'Verify Connection',
        description: 'Test that the file picker works with your renewed connection.',
        actionText: 'Test File Picker',
        actionType: 'button',
        isRequired: false,
        estimatedTime: '30 seconds',
        helpText: 'Try opening the file picker to ensure everything works'
      }
    ],
    preventionTips: [
      'Google Drive connections expire periodically for security',
      'You will be notified when reconnection is needed',
      'Keep your browser cookies enabled for seamless experience'
    ],
    troubleshootingUrl: '/help/google-drive-connection-issues'
  },

  [RecoveryFlowType.TOKEN_NOT_FOUND]: {
    type: RecoveryFlowType.TOKEN_NOT_FOUND,
    title: 'Google Drive Not Connected',
    description: 'Your Google Drive account is not connected to Briefly Cloud. You need to connect it first to use the file picker.',
    severity: 'medium',
    estimatedTime: '2-3 minutes',
    steps: [
      {
        id: 'go_to_storage',
        title: 'Open Storage Settings',
        description: 'Navigate to the storage settings page to connect your Google Drive.',
        actionText: 'Go to Storage Settings',
        actionUrl: `${DEFAULT_POST_LOGIN_PATH}?tab=storage`,
        actionType: 'link',
        isRequired: true,
        estimatedTime: '30 seconds'
      },
      {
        id: 'connect_drive',
        title: 'Connect Google Drive',
        description: 'Click the "Connect Google Drive" button and authorize access to your files.',
        actionText: 'Connect Google Drive',
        actionUrl: '/api/storage/google/start',
        actionType: 'external',
        isRequired: true,
        estimatedTime: '1-2 minutes',
        helpText: 'You will need to sign in to Google and grant permissions'
      },
      {
        id: 'confirm_connection',
        title: 'Confirm Connection',
        description: 'Verify that Google Drive appears as connected in your storage settings.',
        actionType: 'info',
        isRequired: true,
        estimatedTime: '30 seconds',
        helpText: 'You should see a green "Connected" status next to Google Drive'
      }
    ],
    preventionTips: [
      'Connect your cloud storage accounts for seamless file access',
      'You only need to connect once unless you disconnect manually',
      'Connections are secure and use industry-standard OAuth'
    ],
    troubleshootingUrl: '/help/connecting-google-drive'
  },

  [RecoveryFlowType.REFRESH_FAILED]: {
    type: RecoveryFlowType.REFRESH_FAILED,
    title: 'Connection Refresh Failed',
    description: 'We could not refresh your Google Drive connection. This might be due to changed permissions or a temporary issue.',
    severity: 'medium',
    estimatedTime: '2-3 minutes',
    steps: [
      {
        id: 'check_google_account',
        title: 'Check Google Account Status',
        description: 'Ensure you can access your Google Drive directly and that your account is active.',
        actionText: 'Open Google Drive',
        actionUrl: 'https://drive.google.com',
        actionType: 'external',
        isRequired: true,
        estimatedTime: '1 minute',
        helpText: 'Make sure you can see your files and that your account is working normally'
      },
      {
        id: 'disconnect_and_reconnect',
        title: 'Disconnect and Reconnect',
        description: 'Remove the current connection and establish a fresh one.',
        actionText: 'Go to Storage Settings',
        actionUrl: `${DEFAULT_POST_LOGIN_PATH}?tab=storage`,
        actionType: 'link',
        isRequired: true,
        estimatedTime: '1-2 minutes',
        helpText: 'Disconnect Google Drive, then connect it again'
      },
      {
        id: 'test_picker',
        title: 'Test File Picker',
        description: 'Try using the file picker to ensure the connection is working properly.',
        actionText: 'Test File Picker',
        actionType: 'button',
        isRequired: false,
        estimatedTime: '30 seconds'
      }
    ],
    preventionTips: [
      'Avoid changing Google account passwords without reconnecting',
      'Don\'t revoke app permissions from Google account settings',
      'Keep your browser up to date for best compatibility'
    ],
    troubleshootingUrl: '/help/connection-refresh-issues'
  },

  [RecoveryFlowType.PERMISSION_DENIED]: {
    type: RecoveryFlowType.PERMISSION_DENIED,
    title: 'Permission Denied',
    description: 'Google Drive is denying access to your files. This might be due to changed permissions or account restrictions.',
    severity: 'high',
    estimatedTime: '3-5 minutes',
    steps: [
      {
        id: 'check_google_permissions',
        title: 'Check Google Account Permissions',
        description: 'Review the permissions granted to Briefly Cloud in your Google account.',
        actionText: 'Check Google Permissions',
        actionUrl: 'https://myaccount.google.com/permissions',
        actionType: 'external',
        isRequired: true,
        estimatedTime: '2 minutes',
        helpText: 'Look for Briefly Cloud and ensure it has access to Google Drive'
      },
      {
        id: 'revoke_and_reconnect',
        title: 'Revoke and Reconnect',
        description: 'Remove Briefly Cloud from your Google permissions, then reconnect with fresh permissions.',
        actionText: 'Reconnect After Revoking',
        actionUrl: '/api/storage/google/start?force=true',
        actionType: 'external',
        isRequired: true,
        estimatedTime: '2-3 minutes',
        helpText: 'This will establish a completely fresh connection'
      },
      {
        id: 'verify_file_access',
        title: 'Verify File Access',
        description: 'Test that you can now access and select files from Google Drive.',
        actionText: 'Test File Access',
        actionType: 'button',
        isRequired: false,
        estimatedTime: '1 minute'
      }
    ],
    preventionTips: [
      'Don\'t manually revoke permissions from Google account settings',
      'Ensure your Google account has access to the files you want to use',
      'Check if your organization has restrictions on third-party apps'
    ],
    troubleshootingUrl: '/help/permission-issues'
  },

  [RecoveryFlowType.CONNECTION_LOST]: {
    type: RecoveryFlowType.CONNECTION_LOST,
    title: 'Connection Lost',
    description: 'The connection to Google Drive has been lost. This might be due to network issues or service interruptions.',
    severity: 'low',
    estimatedTime: '1-2 minutes',
    steps: [
      {
        id: 'check_internet',
        title: 'Check Internet Connection',
        description: 'Ensure you have a stable internet connection.',
        actionText: 'Test Connection',
        actionUrl: 'https://www.google.com',
        actionType: 'external',
        isRequired: true,
        estimatedTime: '30 seconds',
        helpText: 'Try loading a website to verify your internet connection'
      },
      {
        id: 'retry_connection',
        title: 'Retry Connection',
        description: 'Try connecting to Google Drive again.',
        actionText: 'Retry File Picker',
        actionType: 'button',
        isRequired: true,
        estimatedTime: '30 seconds'
      },
      {
        id: 'refresh_if_needed',
        title: 'Refresh Page if Needed',
        description: 'If the issue persists, try refreshing the page.',
        actionText: 'Refresh Page',
        actionType: 'button',
        isRequired: false,
        estimatedTime: '30 seconds',
        helpText: 'This will reload the page and reset the connection'
      }
    ],
    preventionTips: [
      'Ensure stable internet connection when using file picker',
      'Try again if you encounter temporary network issues',
      'Contact support if problems persist'
    ],
    troubleshootingUrl: '/help/connection-issues'
  },

  [RecoveryFlowType.SCOPE_INSUFFICIENT]: {
    type: RecoveryFlowType.SCOPE_INSUFFICIENT,
    title: 'Insufficient Permissions',
    description: 'Briefly Cloud doesn\'t have sufficient permissions to access your Google Drive files. This requires reconnection with proper permissions.',
    severity: 'high',
    estimatedTime: '2-3 minutes',
    steps: [
      {
        id: 'understand_permissions',
        title: 'Understand Required Permissions',
        description: 'Briefly Cloud needs permission to access files you explicitly select from Google Drive.',
        actionType: 'info',
        isRequired: true,
        estimatedTime: '30 seconds',
        helpText: 'We only access files you choose - never browse or access other files'
      },
      {
        id: 'disconnect_current',
        title: 'Disconnect Current Connection',
        description: 'Remove the current connection that has insufficient permissions.',
        actionText: 'Go to Storage Settings',
        actionUrl: `${DEFAULT_POST_LOGIN_PATH}?tab=storage`,
        actionType: 'link',
        isRequired: true,
        estimatedTime: '30 seconds'
      },
      {
        id: 'reconnect_full_permissions',
        title: 'Reconnect with Full Permissions',
        description: 'Connect again and ensure you grant all requested permissions.',
        actionText: 'Connect with Full Permissions',
        actionUrl: '/api/storage/google/start',
        actionType: 'external',
        isRequired: true,
        estimatedTime: '1-2 minutes',
        helpText: 'Make sure to click "Allow" for all permission requests'
      }
    ],
    preventionTips: [
      'Always grant all requested permissions during connection',
      'Permissions are minimal and only for files you select',
      'Don\'t partially grant permissions as it will cause issues'
    ],
    troubleshootingUrl: '/help/permission-requirements'
  }
}

/**
 * Determine the appropriate recovery flow for an error
 */
export function getRecoveryFlow(errorInfo: PickerErrorInfo): RecoveryFlow | null {
  switch (errorInfo.type) {
    case PickerErrorType.TOKEN_EXPIRED:
    case PickerErrorType.REFRESH_TOKEN_EXPIRED:
      return RECOVERY_FLOWS[RecoveryFlowType.TOKEN_EXPIRED]

    case PickerErrorType.TOKEN_NOT_FOUND:
      return RECOVERY_FLOWS[RecoveryFlowType.TOKEN_NOT_FOUND]

    case PickerErrorType.TOKEN_REFRESH_FAILED:
      return RECOVERY_FLOWS[RecoveryFlowType.REFRESH_FAILED]

    case PickerErrorType.PERMISSION_DENIED:
    case PickerErrorType.FILE_ACCESS_DENIED:
      return RECOVERY_FLOWS[RecoveryFlowType.PERMISSION_DENIED]

    case PickerErrorType.NETWORK_ERROR:
    case PickerErrorType.SERVICE_UNAVAILABLE:
      return RECOVERY_FLOWS[RecoveryFlowType.CONNECTION_LOST]

    case PickerErrorType.INVALID_CREDENTIALS:
      return RECOVERY_FLOWS[RecoveryFlowType.SCOPE_INSUFFICIENT]

    default:
      return null // No specific recovery flow for this error type
  }
}

/**
 * Recovery progress tracking
 */
export interface RecoveryProgress {
  flowType: RecoveryFlowType
  currentStepId: string
  completedSteps: string[]
  startedAt: string
  estimatedCompletion?: string
}

/**
 * Recovery service for managing authentication recovery flows
 */
export class AuthRecoveryService {
  private recoveryProgress = new Map<string, RecoveryProgress>()

  /**
   * Start a recovery flow for a user
   */
  startRecoveryFlow(
    userId: string,
    flowType: RecoveryFlowType,
    errorContext?: any
  ): RecoveryProgress {
    const flow = RECOVERY_FLOWS[flowType]
    const firstStep = flow.steps[0]

    const progress: RecoveryProgress = {
      flowType,
      currentStepId: firstStep.id,
      completedSteps: [],
      startedAt: new Date().toISOString()
    }

    this.recoveryProgress.set(userId, progress)

    logger.info('Recovery flow started', {
      userId,
      flowType,
      firstStepId: firstStep.id,
      errorContext
    })

    return progress
  }

  /**
   * Mark a recovery step as completed
   */
  completeStep(userId: string, stepId: string): RecoveryProgress | null {
    const progress = this.recoveryProgress.get(userId)
    if (!progress) {
      return null
    }

    const flow = RECOVERY_FLOWS[progress.flowType]
    const currentStepIndex = flow.steps.findIndex(step => step.id === stepId)
    
    if (currentStepIndex === -1) {
      return progress
    }

    // Mark step as completed
    if (!progress.completedSteps.includes(stepId)) {
      progress.completedSteps.push(stepId)
    }

    // Move to next step if available
    const nextStepIndex = currentStepIndex + 1
    if (nextStepIndex < flow.steps.length) {
      progress.currentStepId = flow.steps[nextStepIndex].id
    }

    logger.info('Recovery step completed', {
      userId,
      stepId,
      flowType: progress.flowType,
      nextStepId: progress.currentStepId,
      completedCount: progress.completedSteps.length,
      totalSteps: flow.steps.length
    })

    return progress
  }

  /**
   * Get current recovery progress for a user
   */
  getRecoveryProgress(userId: string): RecoveryProgress | null {
    return this.recoveryProgress.get(userId) || null
  }

  /**
   * Check if recovery flow is complete
   */
  isRecoveryComplete(userId: string): boolean {
    const progress = this.recoveryProgress.get(userId)
    if (!progress) {
      return false
    }

    const flow = RECOVERY_FLOWS[progress.flowType]
    const requiredSteps = flow.steps.filter(step => step.isRequired)
    
    return requiredSteps.every(step => 
      progress.completedSteps.includes(step.id)
    )
  }

  /**
   * Clear recovery progress for a user
   */
  clearRecoveryProgress(userId: string): void {
    this.recoveryProgress.delete(userId)
    
    logger.info('Recovery progress cleared', { userId })
  }

  /**
   * Get recovery statistics for monitoring
   */
  getRecoveryStats(): {
    activeRecoveries: number
    flowTypeDistribution: Record<RecoveryFlowType, number>
    averageCompletionTime?: number
  } {
    const activeRecoveries = this.recoveryProgress.size
    const flowTypeDistribution = {} as Record<RecoveryFlowType, number>

    // Initialize distribution
    Object.values(RecoveryFlowType).forEach(type => {
      flowTypeDistribution[type] = 0
    })

    // Count flow types
    for (const progress of this.recoveryProgress.values()) {
      flowTypeDistribution[progress.flowType]++
    }

    return {
      activeRecoveries,
      flowTypeDistribution
    }
  }
}

/**
 * Global recovery service instance
 */
export const authRecoveryService = new AuthRecoveryService()

/**
 * Utility functions for recovery flows
 */

/**
 * Get user-friendly recovery guidance
 */
export function getRecoveryGuidance(errorInfo: PickerErrorInfo): {
  hasRecoveryFlow: boolean
  flow?: RecoveryFlow
  quickAction?: {
    text: string
    url: string
    type: 'button' | 'link' | 'external'
  }
} {
  const flow = getRecoveryFlow(errorInfo)
  
  if (!flow) {
    return { hasRecoveryFlow: false }
  }

  // Get the first required step as quick action
  const firstRequiredStep = flow.steps.find(step => step.isRequired)
  const quickAction = firstRequiredStep ? {
    text: firstRequiredStep.actionText || 'Start Recovery',
    url: firstRequiredStep.actionUrl || '#',
    type: firstRequiredStep.actionType as 'button' | 'link' | 'external'
  } : undefined

  return {
    hasRecoveryFlow: true,
    flow,
    quickAction
  }
}

/**
 * Start recovery flow for user
 */
export function startRecovery(
  userId: string,
  errorInfo: PickerErrorInfo
): RecoveryProgress | null {
  const flow = getRecoveryFlow(errorInfo)
  if (!flow) {
    return null
  }

  return authRecoveryService.startRecoveryFlow(userId, flow.type, {
    errorType: errorInfo.type,
    errorMessage: errorInfo.userMessage
  })
}

/**
 * Get quick recovery action for immediate user guidance
 */
export function getQuickRecoveryAction(errorInfo: PickerErrorInfo): {
  actionText: string
  actionUrl: string
  actionType: 'button' | 'link' | 'external'
  description: string
} | null {
  const flow = getRecoveryFlow(errorInfo)
  if (!flow) {
    return null
  }

  const firstRequiredStep = flow.steps.find(step => step.isRequired)
  if (!firstRequiredStep) {
    return null
  }

  return {
    actionText: firstRequiredStep.actionText || 'Start Recovery',
    actionUrl: firstRequiredStep.actionUrl || '#',
    actionType: firstRequiredStep.actionType as 'button' | 'link' | 'external',
    description: firstRequiredStep.description
  }
}

/**
 * Check if error requires immediate re-authentication
 */
export function requiresImmediateReauth(errorInfo: PickerErrorInfo): boolean {
  return errorInfo.requiresReauth && [
    PickerErrorType.TOKEN_EXPIRED,
    PickerErrorType.REFRESH_TOKEN_EXPIRED,
    PickerErrorType.TOKEN_NOT_FOUND,
    PickerErrorType.PERMISSION_DENIED
  ].includes(errorInfo.type)
}

/**
 * Get connection status message for UI display
 */
export function getConnectionStatusMessage(errorInfo: PickerErrorInfo): {
  status: 'connected' | 'expired' | 'disconnected' | 'error'
  message: string
  actionRequired: boolean
} {
  switch (errorInfo.type) {
    case PickerErrorType.TOKEN_NOT_FOUND:
      return {
        status: 'disconnected',
        message: 'Google Drive is not connected to your account',
        actionRequired: true
      }

    case PickerErrorType.TOKEN_EXPIRED:
    case PickerErrorType.REFRESH_TOKEN_EXPIRED:
      return {
        status: 'expired',
        message: 'Your Google Drive connection has expired',
        actionRequired: true
      }

    case PickerErrorType.TOKEN_REFRESH_FAILED:
      return {
        status: 'error',
        message: 'Failed to refresh Google Drive connection',
        actionRequired: errorInfo.requiresReauth
      }

    case PickerErrorType.PERMISSION_DENIED:
      return {
        status: 'error',
        message: 'Google Drive access permissions have been revoked',
        actionRequired: true
      }

    default:
      return {
        status: 'error',
        message: 'Google Drive connection issue detected',
        actionRequired: false
      }
  }
}

/**
 * Complete recovery step
 */
export function completeRecoveryStep(
  userId: string,
  stepId: string
): RecoveryProgress | null {
  return authRecoveryService.completeStep(userId, stepId)
}

/**
 * Check if user has active recovery
 */
export function hasActiveRecovery(userId: string): boolean {
  return authRecoveryService.getRecoveryProgress(userId) !== null
}
