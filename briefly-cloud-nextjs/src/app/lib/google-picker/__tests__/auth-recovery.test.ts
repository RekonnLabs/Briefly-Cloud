/**
 * Tests for Google Picker Authentication Recovery
 */

import { 
  getRecoveryFlow,
  getQuickRecoveryAction,
  requiresImmediateReauth,
  getConnectionStatusMessage,
  startRecovery,
  authRecoveryService,
  RecoveryFlowType,
  RECOVERY_FLOWS
} from '../auth-recovery'
import { 
  PickerErrorType,
  ErrorSeverity,
  PickerErrorInfo
} from '../error-handling'

describe('Google Picker Authentication Recovery', () => {
  const mockUserId = 'test-user-123'

  beforeEach(() => {
    // Clear any existing recovery progress
    authRecoveryService.clearRecoveryProgress(mockUserId)
  })

  describe('getRecoveryFlow', () => {
    it('should return TOKEN_EXPIRED flow for expired token errors', () => {
      const errorInfo: PickerErrorInfo = {
        type: PickerErrorType.TOKEN_EXPIRED,
        severity: ErrorSeverity.MEDIUM,
        userMessage: 'Token expired',
        technicalMessage: 'Access token expired',
        recoveryAction: 'reconnect' as const,
        canRetry: false,
        requiresReauth: true
      }

      const flow = getRecoveryFlow(errorInfo)
      expect(flow).toBeDefined()
      expect(flow?.type).toBe(RecoveryFlowType.TOKEN_EXPIRED)
      expect(flow?.title).toBe('Google Drive Access Expired')
      expect(flow?.steps).toHaveLength(3)
    })

    it('should return TOKEN_NOT_FOUND flow for missing token errors', () => {
      const errorInfo: PickerErrorInfo = {
        type: PickerErrorType.TOKEN_NOT_FOUND,
        severity: ErrorSeverity.MEDIUM,
        userMessage: 'No token found',
        technicalMessage: 'No valid token',
        recoveryAction: 'reconnect' as const,
        canRetry: false,
        requiresReauth: true
      }

      const flow = getRecoveryFlow(errorInfo)
      expect(flow).toBeDefined()
      expect(flow?.type).toBe(RecoveryFlowType.TOKEN_NOT_FOUND)
      expect(flow?.title).toBe('Google Drive Not Connected')
    })

    it('should return PERMISSION_DENIED flow for permission errors', () => {
      const errorInfo: PickerErrorInfo = {
        type: PickerErrorType.PERMISSION_DENIED,
        severity: ErrorSeverity.MEDIUM,
        userMessage: 'Permission denied',
        technicalMessage: 'Access denied',
        recoveryAction: 'reconnect' as const,
        canRetry: false,
        requiresReauth: true
      }

      const flow = getRecoveryFlow(errorInfo)
      expect(flow).toBeDefined()
      expect(flow?.type).toBe(RecoveryFlowType.PERMISSION_DENIED)
      expect(flow?.title).toBe('Permission Denied')
    })

    it('should return CONNECTION_LOST flow for network errors', () => {
      const errorInfo: PickerErrorInfo = {
        type: PickerErrorType.NETWORK_ERROR,
        severity: ErrorSeverity.LOW,
        userMessage: 'Network error',
        technicalMessage: 'Connection failed',
        recoveryAction: 'check_connection' as const,
        canRetry: true,
        requiresReauth: false
      }

      const flow = getRecoveryFlow(errorInfo)
      expect(flow).toBeDefined()
      expect(flow?.type).toBe(RecoveryFlowType.CONNECTION_LOST)
      expect(flow?.title).toBe('Connection Lost')
    })

    it('should return null for unknown error types', () => {
      const errorInfo: PickerErrorInfo = {
        type: PickerErrorType.UNKNOWN_ERROR,
        severity: ErrorSeverity.MEDIUM,
        userMessage: 'Unknown error',
        technicalMessage: 'Unknown error',
        recoveryAction: 'retry' as const,
        canRetry: true,
        requiresReauth: false
      }

      const flow = getRecoveryFlow(errorInfo)
      expect(flow).toBeNull()
    })
  })

  describe('getQuickRecoveryAction', () => {
    it('should return quick action for recoverable errors', () => {
      const errorInfo: PickerErrorInfo = {
        type: PickerErrorType.TOKEN_EXPIRED,
        severity: ErrorSeverity.MEDIUM,
        userMessage: 'Token expired',
        technicalMessage: 'Access token expired',
        recoveryAction: 'reconnect' as const,
        canRetry: false,
        requiresReauth: true
      }

      const action = getQuickRecoveryAction(errorInfo)
      expect(action).toBeDefined()
      expect(action?.actionText).toBe('Go to Storage Settings')
      expect(action?.actionType).toBe('link')
      expect(action?.actionUrl).toBe('/briefly/app/dashboard?tab=storage')
    })

    it('should return null for errors without recovery flows', () => {
      const errorInfo: PickerErrorInfo = {
        type: PickerErrorType.UNKNOWN_ERROR,
        severity: ErrorSeverity.MEDIUM,
        userMessage: 'Unknown error',
        technicalMessage: 'Unknown error',
        recoveryAction: 'retry' as const,
        canRetry: true,
        requiresReauth: false
      }

      const action = getQuickRecoveryAction(errorInfo)
      expect(action).toBeNull()
    })
  })

  describe('requiresImmediateReauth', () => {
    it('should return true for auth-related errors', () => {
      const authErrors = [
        PickerErrorType.TOKEN_EXPIRED,
        PickerErrorType.REFRESH_TOKEN_EXPIRED,
        PickerErrorType.TOKEN_NOT_FOUND,
        PickerErrorType.PERMISSION_DENIED
      ]

      authErrors.forEach(errorType => {
        const errorInfo: PickerErrorInfo = {
          type: errorType,
          severity: ErrorSeverity.MEDIUM,
          userMessage: 'Auth error',
          technicalMessage: 'Auth error',
          recoveryAction: 'reconnect' as const,
          canRetry: false,
          requiresReauth: true
        }

        expect(requiresImmediateReauth(errorInfo)).toBe(true)
      })
    })

    it('should return false for non-auth errors', () => {
      const errorInfo: PickerErrorInfo = {
        type: PickerErrorType.NETWORK_ERROR,
        severity: ErrorSeverity.LOW,
        userMessage: 'Network error',
        technicalMessage: 'Network error',
        recoveryAction: 'check_connection' as const,
        canRetry: true,
        requiresReauth: false
      }

      expect(requiresImmediateReauth(errorInfo)).toBe(false)
    })

    it('should return false if requiresReauth is false', () => {
      const errorInfo: PickerErrorInfo = {
        type: PickerErrorType.TOKEN_EXPIRED,
        severity: ErrorSeverity.MEDIUM,
        userMessage: 'Token error',
        technicalMessage: 'Token error',
        recoveryAction: 'retry' as const,
        canRetry: true,
        requiresReauth: false // This should make it return false
      }

      expect(requiresImmediateReauth(errorInfo)).toBe(false)
    })
  })

  describe('getConnectionStatusMessage', () => {
    it('should return disconnected status for TOKEN_NOT_FOUND', () => {
      const errorInfo: PickerErrorInfo = {
        type: PickerErrorType.TOKEN_NOT_FOUND,
        severity: ErrorSeverity.MEDIUM,
        userMessage: 'No token',
        technicalMessage: 'No token',
        recoveryAction: 'reconnect' as const,
        canRetry: false,
        requiresReauth: true
      }

      const status = getConnectionStatusMessage(errorInfo)
      expect(status.status).toBe('disconnected')
      expect(status.message).toBe('Google Drive is not connected to your account')
      expect(status.actionRequired).toBe(true)
    })

    it('should return expired status for TOKEN_EXPIRED', () => {
      const errorInfo: PickerErrorInfo = {
        type: PickerErrorType.TOKEN_EXPIRED,
        severity: ErrorSeverity.MEDIUM,
        userMessage: 'Token expired',
        technicalMessage: 'Token expired',
        recoveryAction: 'reconnect' as const,
        canRetry: false,
        requiresReauth: true
      }

      const status = getConnectionStatusMessage(errorInfo)
      expect(status.status).toBe('expired')
      expect(status.message).toBe('Your Google Drive connection has expired')
      expect(status.actionRequired).toBe(true)
    })

    it('should return error status for PERMISSION_DENIED', () => {
      const errorInfo: PickerErrorInfo = {
        type: PickerErrorType.PERMISSION_DENIED,
        severity: ErrorSeverity.MEDIUM,
        userMessage: 'Permission denied',
        technicalMessage: 'Permission denied',
        recoveryAction: 'reconnect' as const,
        canRetry: false,
        requiresReauth: true
      }

      const status = getConnectionStatusMessage(errorInfo)
      expect(status.status).toBe('error')
      expect(status.message).toBe('Google Drive access permissions have been revoked')
      expect(status.actionRequired).toBe(true)
    })
  })

  describe('startRecovery', () => {
    it('should start recovery flow and return progress', () => {
      const errorInfo: PickerErrorInfo = {
        type: PickerErrorType.TOKEN_EXPIRED,
        severity: ErrorSeverity.MEDIUM,
        userMessage: 'Token expired',
        technicalMessage: 'Token expired',
        recoveryAction: 'reconnect' as const,
        canRetry: false,
        requiresReauth: true
      }

      const progress = startRecovery(mockUserId, errorInfo)
      
      expect(progress).toBeDefined()
      expect(progress?.flowType).toBe(RecoveryFlowType.TOKEN_EXPIRED)
      expect(progress?.currentStepId).toBe('disconnect_current')
      expect(progress?.completedSteps).toHaveLength(0)
      expect(progress?.startedAt).toBeDefined()
    })

    it('should return null for errors without recovery flows', () => {
      const errorInfo: PickerErrorInfo = {
        type: PickerErrorType.UNKNOWN_ERROR,
        severity: ErrorSeverity.MEDIUM,
        userMessage: 'Unknown error',
        technicalMessage: 'Unknown error',
        recoveryAction: 'retry' as const,
        canRetry: true,
        requiresReauth: false
      }

      const progress = startRecovery(mockUserId, errorInfo)
      expect(progress).toBeNull()
    })
  })

  describe('AuthRecoveryService', () => {
    it('should track recovery progress correctly', () => {
      const progress = authRecoveryService.startRecoveryFlow(
        mockUserId,
        RecoveryFlowType.TOKEN_EXPIRED
      )

      expect(progress.flowType).toBe(RecoveryFlowType.TOKEN_EXPIRED)
      expect(progress.currentStepId).toBe('disconnect_current')
      expect(progress.completedSteps).toHaveLength(0)

      // Complete first step
      const updatedProgress = authRecoveryService.completeStep(mockUserId, 'disconnect_current')
      expect(updatedProgress?.completedSteps).toContain('disconnect_current')
      expect(updatedProgress?.currentStepId).toBe('reconnect_drive')
    })

    it('should detect when recovery is complete', () => {
      authRecoveryService.startRecoveryFlow(mockUserId, RecoveryFlowType.TOKEN_EXPIRED)
      
      // Complete all required steps
      authRecoveryService.completeStep(mockUserId, 'disconnect_current')
      authRecoveryService.completeStep(mockUserId, 'reconnect_drive')
      
      expect(authRecoveryService.isRecoveryComplete(mockUserId)).toBe(true)
    })

    it('should provide recovery statistics', () => {
      authRecoveryService.startRecoveryFlow(mockUserId, RecoveryFlowType.TOKEN_EXPIRED)
      authRecoveryService.startRecoveryFlow('user2', RecoveryFlowType.TOKEN_NOT_FOUND)
      
      const stats = authRecoveryService.getRecoveryStats()
      expect(stats.activeRecoveries).toBe(2)
      expect(stats.flowTypeDistribution[RecoveryFlowType.TOKEN_EXPIRED]).toBe(1)
      expect(stats.flowTypeDistribution[RecoveryFlowType.TOKEN_NOT_FOUND]).toBe(1)
    })

    it('should clear recovery progress', () => {
      authRecoveryService.startRecoveryFlow(mockUserId, RecoveryFlowType.TOKEN_EXPIRED)
      expect(authRecoveryService.getRecoveryProgress(mockUserId)).toBeDefined()
      
      authRecoveryService.clearRecoveryProgress(mockUserId)
      expect(authRecoveryService.getRecoveryProgress(mockUserId)).toBeNull()
    })
  })

  describe('Recovery Flow Definitions', () => {
    it('should have all required recovery flows defined', () => {
      const requiredFlows = [
        RecoveryFlowType.TOKEN_EXPIRED,
        RecoveryFlowType.TOKEN_NOT_FOUND,
        RecoveryFlowType.REFRESH_FAILED,
        RecoveryFlowType.PERMISSION_DENIED,
        RecoveryFlowType.CONNECTION_LOST,
        RecoveryFlowType.SCOPE_INSUFFICIENT
      ]

      requiredFlows.forEach(flowType => {
        expect(RECOVERY_FLOWS[flowType]).toBeDefined()
        expect(RECOVERY_FLOWS[flowType].steps.length).toBeGreaterThan(0)
      })
    })

    it('should have valid step structures in all flows', () => {
      Object.values(RECOVERY_FLOWS).forEach(flow => {
        expect(flow.title).toBeDefined()
        expect(flow.description).toBeDefined()
        expect(flow.steps).toBeDefined()
        expect(flow.steps.length).toBeGreaterThan(0)

        flow.steps.forEach(step => {
          expect(step.id).toBeDefined()
          expect(step.title).toBeDefined()
          expect(step.description).toBeDefined()
          expect(step.actionType).toBeDefined()
          expect(typeof step.isRequired).toBe('boolean')
        })
      })
    })

    it('should have at least one required step in each flow', () => {
      Object.values(RECOVERY_FLOWS).forEach(flow => {
        const requiredSteps = flow.steps.filter(step => step.isRequired)
        expect(requiredSteps.length).toBeGreaterThan(0)
      })
    })
  })
})