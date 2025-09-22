/**
 * Google Picker Error Handling Utilities
 * 
 * Provides comprehensive error categorization, handling, and recovery mechanisms
 * for Google Picker integration failures.
 */

import { logger } from '@/app/lib/logger'
import { PickerTokenError } from './token-service'

/**
 * Comprehensive error types for Google Picker operations
 */
export enum PickerErrorType {
  // API Loading Errors
  API_LOAD_FAILED = 'api_load_failed',
  PICKER_SCRIPT_LOAD_FAILED = 'picker_script_load_failed',
  GAPI_LOAD_FAILED = 'gapi_load_failed',
  
  // Token Related Errors
  TOKEN_EXPIRED = 'token_expired',
  TOKEN_REFRESH_FAILED = 'token_refresh_failed',
  TOKEN_NOT_FOUND = 'token_not_found',
  REFRESH_TOKEN_EXPIRED = 'refresh_token_expired',
  INVALID_CREDENTIALS = 'invalid_credentials',
  
  // Picker Initialization Errors
  PICKER_INIT_FAILED = 'picker_init_failed',
  PICKER_CONFIG_ERROR = 'picker_config_error',
  DEVELOPER_KEY_INVALID = 'developer_key_invalid',
  
  // File Selection Errors
  FILE_SELECTION_FAILED = 'file_selection_failed',
  FILE_ACCESS_DENIED = 'file_access_denied',
  QUOTA_EXCEEDED = 'quota_exceeded',
  
  // Network and Infrastructure Errors
  NETWORK_ERROR = 'network_error',
  TIMEOUT_ERROR = 'timeout_error',
  SERVICE_UNAVAILABLE = 'service_unavailable',
  
  // User Action Errors
  USER_CANCELLED = 'user_cancelled',
  PERMISSION_DENIED = 'permission_denied',
  
  // Generic Errors
  UNKNOWN_ERROR = 'unknown_error'
}

/**
 * Error severity levels for different error types
 */
export enum ErrorSeverity {
  LOW = 'low',        // User can retry, temporary issue
  MEDIUM = 'medium',  // Requires user action but recoverable
  HIGH = 'high',      // Requires re-authentication or admin action
  CRITICAL = 'critical' // System configuration issue
}

/**
 * Recovery action types for different error scenarios
 */
export enum RecoveryAction {
  RETRY = 'retry',
  RECONNECT = 'reconnect',
  REFRESH_PAGE = 'refresh_page',
  CONTACT_SUPPORT = 'contact_support',
  CHECK_CONNECTION = 'check_connection',
  WAIT_AND_RETRY = 'wait_and_retry',
  NO_ACTION = 'no_action'
}

/**
 * Structured error information with recovery guidance
 */
export interface PickerErrorInfo {
  type: PickerErrorType
  severity: ErrorSeverity
  userMessage: string
  technicalMessage: string
  recoveryAction: RecoveryAction
  canRetry: boolean
  requiresReauth: boolean
  retryDelay?: number // in milliseconds
  maxRetries?: number
  helpUrl?: string
}

/**
 * Error context for enhanced debugging and logging
 */
export interface ErrorContext {
  userId?: string
  operation: string
  timestamp: string
  userAgent?: string
  connectionType?: string
  retryAttempt?: number
  additionalData?: Record<string, any>
}

/**
 * Handle token-related errors from the token service
 */
export function handleTokenError(error: PickerTokenError, context: ErrorContext): PickerErrorInfo {
  logger.warn('Token error in picker operation', {
    ...context,
    errorType: error.type,
    errorMessage: error.message,
    requiresReauth: error.requiresReauth
  })

  switch (error.type) {
    case 'TOKEN_NOT_FOUND':
      return {
        type: PickerErrorType.TOKEN_NOT_FOUND,
        severity: ErrorSeverity.MEDIUM,
        userMessage: 'Google Drive is not connected to your account.',
        technicalMessage: 'No valid Google Drive OAuth token found for user',
        recoveryAction: RecoveryAction.RECONNECT,
        canRetry: false,
        requiresReauth: true,
        helpUrl: '/help/connect-google-drive'
      }

    case 'TOKEN_REFRESH_FAILED':
      return {
        type: PickerErrorType.TOKEN_REFRESH_FAILED,
        severity: error.requiresReauth ? ErrorSeverity.MEDIUM : ErrorSeverity.LOW,
        userMessage: error.requiresReauth 
          ? 'Your Google Drive access has expired and needs to be renewed.'
          : 'Failed to refresh your Google Drive access. This is usually temporary.',
        technicalMessage: `Token refresh failed: ${error.message}`,
        recoveryAction: error.requiresReauth ? RecoveryAction.RECONNECT : RecoveryAction.RETRY,
        canRetry: !error.requiresReauth,
        requiresReauth: error.requiresReauth,
        retryDelay: error.requiresReauth ? undefined : 2000,
        maxRetries: error.requiresReauth ? 0 : 3
      }

    case 'REFRESH_TOKEN_EXPIRED':
      return {
        type: PickerErrorType.REFRESH_TOKEN_EXPIRED,
        severity: ErrorSeverity.MEDIUM,
        userMessage: 'Your Google Drive access has expired. Please reconnect to continue.',
        technicalMessage: 'Refresh token is invalid or expired',
        recoveryAction: RecoveryAction.RECONNECT,
        canRetry: false,
        requiresReauth: true,
        helpUrl: '/help/reconnect-google-drive'
      }

    case 'INVALID_CREDENTIALS':
      return {
        type: PickerErrorType.INVALID_CREDENTIALS,
        severity: ErrorSeverity.CRITICAL,
        userMessage: 'Google Drive integration is temporarily unavailable due to a configuration issue.',
        technicalMessage: 'Google OAuth credentials not properly configured',
        recoveryAction: RecoveryAction.CONTACT_SUPPORT,
        canRetry: false,
        requiresReauth: false,
        helpUrl: '/help/contact-support'
      }

    case 'NETWORK_ERROR':
      return {
        type: PickerErrorType.NETWORK_ERROR,
        severity: ErrorSeverity.LOW,
        userMessage: 'Network connection issue occurred while accessing Google Drive.',
        technicalMessage: `Network error during token operation: ${error.message}`,
        recoveryAction: RecoveryAction.CHECK_CONNECTION,
        canRetry: true,
        requiresReauth: false,
        retryDelay: 3000,
        maxRetries: 3
      }

    default:
      return {
        type: PickerErrorType.UNKNOWN_ERROR,
        severity: ErrorSeverity.MEDIUM,
        userMessage: 'An unexpected error occurred with Google Drive access.',
        technicalMessage: `Unknown token error: ${error.message}`,
        recoveryAction: RecoveryAction.RETRY,
        canRetry: true,
        requiresReauth: false,
        retryDelay: 2000,
        maxRetries: 2
      }
  }
}

/**
 * Handle Google Picker API and initialization errors
 */
export function handlePickerError(error: Error, context: ErrorContext): PickerErrorInfo {
  const errorMessage = error.message.toLowerCase()
  
  logger.error('Picker operation error', {
    ...context,
    errorMessage: error.message,
    errorStack: error.stack
  })

  // API Loading Errors
  if (errorMessage.includes('failed to load google apis') || errorMessage.includes('script')) {
    return {
      type: PickerErrorType.PICKER_SCRIPT_LOAD_FAILED,
      severity: ErrorSeverity.LOW,
      userMessage: 'Failed to load Google file picker. This is usually a temporary network issue.',
      technicalMessage: `Google APIs script loading failed: ${error.message}`,
      recoveryAction: RecoveryAction.RETRY,
      canRetry: true,
      requiresReauth: false,
      retryDelay: 2000,
      maxRetries: 3
    }
  }

  if (errorMessage.includes('failed to load google picker api') || errorMessage.includes('gapi')) {
    return {
      type: PickerErrorType.GAPI_LOAD_FAILED,
      severity: ErrorSeverity.LOW,
      userMessage: 'Google Picker service is temporarily unavailable. Please try again.',
      technicalMessage: `Google Picker API loading failed: ${error.message}`,
      recoveryAction: RecoveryAction.WAIT_AND_RETRY,
      canRetry: true,
      requiresReauth: false,
      retryDelay: 5000,
      maxRetries: 2
    }
  }

  // Picker Initialization Errors
  if (errorMessage.includes('picker') && (errorMessage.includes('init') || errorMessage.includes('build'))) {
    return {
      type: PickerErrorType.PICKER_INIT_FAILED,
      severity: ErrorSeverity.MEDIUM,
      userMessage: 'Failed to initialize the file picker. Please try again.',
      technicalMessage: `Picker initialization failed: ${error.message}`,
      recoveryAction: RecoveryAction.RETRY,
      canRetry: true,
      requiresReauth: false,
      retryDelay: 1000,
      maxRetries: 2
    }
  }

  // Developer Key Issues
  if (errorMessage.includes('developer key') || errorMessage.includes('api key')) {
    return {
      type: PickerErrorType.DEVELOPER_KEY_INVALID,
      severity: ErrorSeverity.CRITICAL,
      userMessage: 'File picker service is temporarily unavailable due to a configuration issue.',
      technicalMessage: `Invalid or missing Google API developer key: ${error.message}`,
      recoveryAction: RecoveryAction.CONTACT_SUPPORT,
      canRetry: false,
      requiresReauth: false,
      helpUrl: '/help/contact-support'
    }
  }

  // Permission and Access Errors
  if (errorMessage.includes('permission') || errorMessage.includes('access denied')) {
    return {
      type: PickerErrorType.PERMISSION_DENIED,
      severity: ErrorSeverity.MEDIUM,
      userMessage: 'Permission denied accessing Google Drive. Please check your account permissions.',
      technicalMessage: `Permission denied: ${error.message}`,
      recoveryAction: RecoveryAction.RECONNECT,
      canRetry: false,
      requiresReauth: true,
      helpUrl: '/help/google-drive-permissions'
    }
  }

  // Quota and Rate Limiting
  if (errorMessage.includes('quota') || errorMessage.includes('rate limit') || errorMessage.includes('too many requests')) {
    return {
      type: PickerErrorType.QUOTA_EXCEEDED,
      severity: ErrorSeverity.LOW,
      userMessage: 'Google Drive usage limit reached. Please wait a moment and try again.',
      technicalMessage: `API quota exceeded: ${error.message}`,
      recoveryAction: RecoveryAction.WAIT_AND_RETRY,
      canRetry: true,
      requiresReauth: false,
      retryDelay: 10000,
      maxRetries: 1
    }
  }

  // Network Errors
  if (errorMessage.includes('network') || errorMessage.includes('fetch') || errorMessage.includes('timeout')) {
    return {
      type: PickerErrorType.NETWORK_ERROR,
      severity: ErrorSeverity.LOW,
      userMessage: 'Network connection issue. Please check your internet connection and try again.',
      technicalMessage: `Network error: ${error.message}`,
      recoveryAction: RecoveryAction.CHECK_CONNECTION,
      canRetry: true,
      requiresReauth: false,
      retryDelay: 3000,
      maxRetries: 3
    }
  }

  // Service Unavailable
  if (errorMessage.includes('service unavailable') || errorMessage.includes('server error') || errorMessage.includes('503')) {
    return {
      type: PickerErrorType.SERVICE_UNAVAILABLE,
      severity: ErrorSeverity.LOW,
      userMessage: 'Google Drive service is temporarily unavailable. Please try again in a few minutes.',
      technicalMessage: `Service unavailable: ${error.message}`,
      recoveryAction: RecoveryAction.WAIT_AND_RETRY,
      canRetry: true,
      requiresReauth: false,
      retryDelay: 30000,
      maxRetries: 1
    }
  }

  // Generic fallback
  return {
    type: PickerErrorType.UNKNOWN_ERROR,
    severity: ErrorSeverity.MEDIUM,
    userMessage: 'An unexpected error occurred with the file picker. Please try again.',
    technicalMessage: `Unknown picker error: ${error.message}`,
    recoveryAction: RecoveryAction.RETRY,
    canRetry: true,
    requiresReauth: false,
    retryDelay: 2000,
    maxRetries: 2
  }
}

/**
 * Handle file selection and processing errors
 */
export function handleFileSelectionError(error: Error, context: ErrorContext): PickerErrorInfo {
  const errorMessage = error.message.toLowerCase()
  
  logger.error('File selection error', {
    ...context,
    errorMessage: error.message
  })

  if (errorMessage.includes('access denied') || errorMessage.includes('permission')) {
    return {
      type: PickerErrorType.FILE_ACCESS_DENIED,
      severity: ErrorSeverity.MEDIUM,
      userMessage: 'Access denied to selected files. Please check file permissions or try different files.',
      technicalMessage: `File access denied: ${error.message}`,
      recoveryAction: RecoveryAction.RETRY,
      canRetry: true,
      requiresReauth: false,
      helpUrl: '/help/file-permissions'
    }
  }

  return {
    type: PickerErrorType.FILE_SELECTION_FAILED,
    severity: ErrorSeverity.LOW,
    userMessage: 'Failed to process selected files. Please try selecting them again.',
    technicalMessage: `File selection failed: ${error.message}`,
    recoveryAction: RecoveryAction.RETRY,
    canRetry: true,
    requiresReauth: false,
    retryDelay: 1000,
    maxRetries: 2
  }
}

/**
 * Get user-friendly error message with recovery instructions
 */
export function getErrorGuidance(errorInfo: PickerErrorInfo): {
  title: string
  message: string
  actionText: string
  actionType: 'button' | 'link' | 'info'
  actionUrl?: string
  canRetry: boolean
} {
  const baseGuidance = {
    canRetry: errorInfo.canRetry
  }

  switch (errorInfo.recoveryAction) {
    case RecoveryAction.RETRY:
      return {
        ...baseGuidance,
        title: 'Temporary Issue',
        message: errorInfo.userMessage,
        actionText: 'Try Again',
        actionType: 'button'
      }

    case RecoveryAction.RECONNECT:
      return {
        ...baseGuidance,
        title: 'Reconnection Required',
        message: errorInfo.userMessage,
        actionText: 'Reconnect Google Drive',
        actionType: 'button'
      }

    case RecoveryAction.CHECK_CONNECTION:
      return {
        ...baseGuidance,
        title: 'Connection Issue',
        message: errorInfo.userMessage,
        actionText: 'Check Connection & Retry',
        actionType: 'button'
      }

    case RecoveryAction.WAIT_AND_RETRY:
      return {
        ...baseGuidance,
        title: 'Service Temporarily Unavailable',
        message: errorInfo.userMessage,
        actionText: 'Wait and Try Again',
        actionType: 'button'
      }

    case RecoveryAction.CONTACT_SUPPORT:
      return {
        ...baseGuidance,
        title: 'Service Issue',
        message: errorInfo.userMessage,
        actionText: 'Contact Support',
        actionType: 'link',
        actionUrl: errorInfo.helpUrl || '/help/contact-support'
      }

    case RecoveryAction.REFRESH_PAGE:
      return {
        ...baseGuidance,
        title: 'Page Refresh Required',
        message: errorInfo.userMessage,
        actionText: 'Refresh Page',
        actionType: 'button'
      }

    case RecoveryAction.NO_ACTION:
      return {
        ...baseGuidance,
        title: 'Information',
        message: errorInfo.userMessage,
        actionText: 'OK',
        actionType: 'info'
      }

    default:
      return {
        ...baseGuidance,
        title: 'Error',
        message: errorInfo.userMessage,
        actionText: 'OK',
        actionType: 'info'
      }
  }
}

/**
 * Create error context for logging and debugging
 */
export function createErrorContext(
  operation: string,
  userId?: string,
  additionalData?: Record<string, any>
): ErrorContext {
  return {
    userId,
    operation,
    timestamp: new Date().toISOString(),
    userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
    connectionType: typeof navigator !== 'undefined' && 'connection' in navigator 
      ? (navigator as any).connection?.effectiveType 
      : undefined,
    additionalData
  }
}

/**
 * Log error with structured context for monitoring
 */
export function logPickerError(errorInfo: PickerErrorInfo, context: ErrorContext): void {
  const logData = {
    event: 'picker_error',
    errorType: errorInfo.type,
    severity: errorInfo.severity,
    recoveryAction: errorInfo.recoveryAction,
    canRetry: errorInfo.canRetry,
    requiresReauth: errorInfo.requiresReauth,
    userMessage: errorInfo.userMessage,
    technicalMessage: errorInfo.technicalMessage,
    ...context
  }

  switch (errorInfo.severity) {
    case ErrorSeverity.CRITICAL:
      logger.error('Critical picker error', logData)
      break
    case ErrorSeverity.HIGH:
      logger.error('High severity picker error', logData)
      break
    case ErrorSeverity.MEDIUM:
      logger.warn('Medium severity picker error', logData)
      break
    case ErrorSeverity.LOW:
    default:
      logger.info('Low severity picker error', logData)
      break
  }
}
