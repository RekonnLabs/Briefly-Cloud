/**
 * Tests for Google Picker Error Handling
 */

import { 
  handleTokenError, 
  handlePickerError,
  PickerErrorType,
  ErrorSeverity,
  createErrorContext,
  getErrorGuidance
} from '../error-handling'
import { PickerTokenError } from '../token-service'

describe('Google Picker Error Handling', () => {
  const mockUserId = 'test-user-123'
  
  describe('handleTokenError', () => {
    it('should handle TOKEN_NOT_FOUND error correctly', () => {
      const tokenError: PickerTokenError = {
        type: 'TOKEN_NOT_FOUND',
        message: 'No valid Google Drive token found',
        requiresReauth: true
      }
      
      const context = createErrorContext('test_operation', mockUserId)
      const result = handleTokenError(tokenError, context)
      
      expect(result.type).toBe(PickerErrorType.TOKEN_NOT_FOUND)
      expect(result.severity).toBe(ErrorSeverity.MEDIUM)
      expect(result.requiresReauth).toBe(true)
      expect(result.canRetry).toBe(false)
      expect(result.userMessage).toContain('Google Drive is not connected')
    })

    it('should handle TOKEN_REFRESH_FAILED with reauth required', () => {
      const tokenError: PickerTokenError = {
        type: 'TOKEN_REFRESH_FAILED',
        message: 'Token refresh failed',
        requiresReauth: true
      }
      
      const context = createErrorContext('test_operation', mockUserId)
      const result = handleTokenError(tokenError, context)
      
      expect(result.type).toBe(PickerErrorType.TOKEN_REFRESH_FAILED)
      expect(result.severity).toBe(ErrorSeverity.MEDIUM)
      expect(result.requiresReauth).toBe(true)
      expect(result.canRetry).toBe(false)
    })

    it('should handle TOKEN_REFRESH_FAILED without reauth required', () => {
      const tokenError: PickerTokenError = {
        type: 'TOKEN_REFRESH_FAILED',
        message: 'Temporary token refresh failure',
        requiresReauth: false
      }
      
      const context = createErrorContext('test_operation', mockUserId)
      const result = handleTokenError(tokenError, context)
      
      expect(result.type).toBe(PickerErrorType.TOKEN_REFRESH_FAILED)
      expect(result.severity).toBe(ErrorSeverity.LOW)
      expect(result.requiresReauth).toBe(false)
      expect(result.canRetry).toBe(true)
      expect(result.retryDelay).toBe(2000)
      expect(result.maxRetries).toBe(3)
    })

    it('should handle NETWORK_ERROR correctly', () => {
      const tokenError: PickerTokenError = {
        type: 'NETWORK_ERROR',
        message: 'Network connection failed',
        requiresReauth: false
      }
      
      const context = createErrorContext('test_operation', mockUserId)
      const result = handleTokenError(tokenError, context)
      
      expect(result.type).toBe(PickerErrorType.NETWORK_ERROR)
      expect(result.severity).toBe(ErrorSeverity.LOW)
      expect(result.canRetry).toBe(true)
      expect(result.retryDelay).toBe(3000)
      expect(result.maxRetries).toBe(3)
    })

    it('should handle INVALID_CREDENTIALS as critical error', () => {
      const tokenError: PickerTokenError = {
        type: 'INVALID_CREDENTIALS',
        message: 'OAuth credentials not configured',
        requiresReauth: false
      }
      
      const context = createErrorContext('test_operation', mockUserId)
      const result = handleTokenError(tokenError, context)
      
      expect(result.type).toBe(PickerErrorType.INVALID_CREDENTIALS)
      expect(result.severity).toBe(ErrorSeverity.CRITICAL)
      expect(result.canRetry).toBe(false)
      expect(result.requiresReauth).toBe(false)
    })
  })

  describe('handlePickerError', () => {
    it('should handle API loading errors', () => {
      const error = new Error('Failed to load Google APIs script')
      const context = createErrorContext('load_api', mockUserId)
      const result = handlePickerError(error, context)
      
      expect(result.type).toBe(PickerErrorType.PICKER_SCRIPT_LOAD_FAILED)
      expect(result.severity).toBe(ErrorSeverity.LOW)
      expect(result.canRetry).toBe(true)
      expect(result.retryDelay).toBe(2000)
      expect(result.maxRetries).toBe(3)
    })

    it('should handle picker initialization errors', () => {
      const error = new Error('Picker initialization failed')
      const context = createErrorContext('init_picker', mockUserId)
      const result = handlePickerError(error, context)
      
      expect(result.type).toBe(PickerErrorType.PICKER_INIT_FAILED)
      expect(result.severity).toBe(ErrorSeverity.MEDIUM)
      expect(result.canRetry).toBe(true)
      expect(result.retryDelay).toBe(1000)
      expect(result.maxRetries).toBe(2)
    })

    it('should handle developer key errors as critical', () => {
      const error = new Error('Invalid developer key provided')
      const context = createErrorContext('init_picker', mockUserId)
      const result = handlePickerError(error, context)
      
      expect(result.type).toBe(PickerErrorType.DEVELOPER_KEY_INVALID)
      expect(result.severity).toBe(ErrorSeverity.CRITICAL)
      expect(result.canRetry).toBe(false)
      expect(result.requiresReauth).toBe(false)
    })

    it('should handle permission errors', () => {
      const error = new Error('Permission denied accessing files')
      const context = createErrorContext('access_files', mockUserId)
      const result = handlePickerError(error, context)
      
      expect(result.type).toBe(PickerErrorType.PERMISSION_DENIED)
      expect(result.severity).toBe(ErrorSeverity.MEDIUM)
      expect(result.canRetry).toBe(false)
      expect(result.requiresReauth).toBe(true)
    })

    it('should handle quota exceeded errors', () => {
      const error = new Error('API quota exceeded for this request')
      const context = createErrorContext('api_call', mockUserId)
      const result = handlePickerError(error, context)
      
      expect(result.type).toBe(PickerErrorType.QUOTA_EXCEEDED)
      expect(result.severity).toBe(ErrorSeverity.LOW)
      expect(result.canRetry).toBe(true)
      expect(result.retryDelay).toBe(10000)
      expect(result.maxRetries).toBe(1)
    })

    it('should handle network errors', () => {
      const error = new Error('Network timeout occurred')
      const context = createErrorContext('network_call', mockUserId)
      const result = handlePickerError(error, context)
      
      expect(result.type).toBe(PickerErrorType.NETWORK_ERROR)
      expect(result.severity).toBe(ErrorSeverity.LOW)
      expect(result.canRetry).toBe(true)
      expect(result.retryDelay).toBe(3000)
      expect(result.maxRetries).toBe(3)
    })

    it('should handle unknown errors with fallback', () => {
      const error = new Error('Some unexpected error occurred')
      const context = createErrorContext('unknown_operation', mockUserId)
      const result = handlePickerError(error, context)
      
      expect(result.type).toBe(PickerErrorType.UNKNOWN_ERROR)
      expect(result.severity).toBe(ErrorSeverity.MEDIUM)
      expect(result.canRetry).toBe(true)
      expect(result.retryDelay).toBe(2000)
      expect(result.maxRetries).toBe(2)
    })
  })

  describe('createErrorContext', () => {
    it('should create proper error context', () => {
      const context = createErrorContext('test_operation', mockUserId, { extra: 'data' })
      
      expect(context.operation).toBe('test_operation')
      expect(context.userId).toBe(mockUserId)
      expect(context.timestamp).toBeDefined()
      expect(context.additionalData).toEqual({ extra: 'data' })
    })

    it('should work without optional parameters', () => {
      const context = createErrorContext('test_operation')
      
      expect(context.operation).toBe('test_operation')
      expect(context.userId).toBeUndefined()
      expect(context.timestamp).toBeDefined()
      expect(context.additionalData).toBeUndefined()
    })
  })

  describe('getErrorGuidance', () => {
    it('should provide retry guidance for retryable errors', () => {
      const errorInfo = {
        type: PickerErrorType.NETWORK_ERROR,
        severity: ErrorSeverity.LOW,
        userMessage: 'Network error occurred',
        technicalMessage: 'Network timeout',
        recoveryAction: 'check_connection' as const,
        canRetry: true,
        requiresReauth: false,
        retryDelay: 3000,
        maxRetries: 3
      }
      
      const guidance = getErrorGuidance(errorInfo)
      
      expect(guidance.title).toBe('Connection Issue')
      expect(guidance.actionText).toBe('Check Connection & Retry')
      expect(guidance.actionType).toBe('button')
      expect(guidance.canRetry).toBe(true)
    })

    it('should provide reconnect guidance for auth errors', () => {
      const errorInfo = {
        type: PickerErrorType.TOKEN_EXPIRED,
        severity: ErrorSeverity.MEDIUM,
        userMessage: 'Token has expired',
        technicalMessage: 'Access token expired',
        recoveryAction: 'reconnect' as const,
        canRetry: false,
        requiresReauth: true
      }
      
      const guidance = getErrorGuidance(errorInfo)
      
      expect(guidance.title).toBe('Reconnection Required')
      expect(guidance.actionText).toBe('Reconnect Google Drive')
      expect(guidance.actionType).toBe('button')
      expect(guidance.canRetry).toBe(false)
    })

    it('should provide support guidance for critical errors', () => {
      const errorInfo = {
        type: PickerErrorType.INVALID_CREDENTIALS,
        severity: ErrorSeverity.CRITICAL,
        userMessage: 'Configuration issue',
        technicalMessage: 'Invalid credentials',
        recoveryAction: 'contact_support' as const,
        canRetry: false,
        requiresReauth: false,
        helpUrl: '/help/contact-support'
      }
      
      const guidance = getErrorGuidance(errorInfo)
      
      expect(guidance.title).toBe('Service Issue')
      expect(guidance.actionText).toBe('Contact Support')
      expect(guidance.actionType).toBe('link')
      expect(guidance.actionUrl).toBe('/help/contact-support')
      expect(guidance.canRetry).toBe(false)
    })
  })
})
