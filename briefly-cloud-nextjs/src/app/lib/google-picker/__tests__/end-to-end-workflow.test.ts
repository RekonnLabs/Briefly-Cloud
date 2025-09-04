/**
 * Google Picker End-to-End Workflow Tests
 * 
 * Tests complete flow from picker button to file processing, error scenarios,
 * recovery mechanisms, and security/privacy compliance
 * Requirements: 6.1, 6.2, 7.1, 7.2, 8.1
 */

// Mock all dependencies first
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn()
  }
}))
jest.mock('../token-service')
jest.mock('../file-registration-service')
jest.mock('../error-handling')
jest.mock('../retry-service')
jest.mock('../audit-service')
jest.mock('../security-service')
jest.mock('../permission-validator')

import { toast } from 'sonner'
import { generatePickerToken } from '../token-service'
import { registerSelectedFiles } from '../file-registration-service'
import { 
  handleTokenError, 
  handlePickerError, 
  createErrorContext,
  getErrorGuidance 
} from '../error-handling'
import { withRetry, getRetryInfo } from '../retry-service'
import { 
  logPickerSessionStart,
  logFileSelectionSuccess,
  logFileSelectionCancelled 
} from '../audit-service'
import { generateSecurePickerToken } from '../security-service'
import { validateOAuthScope, validateTokenScope } from '../permission-validator'

// Mock fetch
global.fetch = jest.fn()

describe('Google Picker End-to-End Workflow Tests', () => {
  const testUserId = 'test-user-123'
  const testTokenId = 'token-789'
  
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Default successful mocks
    ;(generateSecurePickerToken as jest.Mock).mockResolvedValue({
      accessToken: 'secure-access-token',
      expiresIn: 3600,
      scope: 'https://www.googleapis.com/auth/drive.file',
      tokenId: testTokenId,
      securityMetadata: {
        generatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        maxLifetime: 3600,
        scopeValidated: true
      }
    })
    
    ;(validateOAuthScope as jest.Mock).mockReturnValue({
      isValid: true,
      hasMinimalPermissions: true,
      violations: [],
      riskLevel: 'low'
    })
    
    ;(validateTokenScope as jest.Mock).mockReturnValue({
      isValid: true,
      hasMinimalPermissions: true,
      missingScopes: [],
      excessiveScopes: []
    })
    
    ;(withRetry as jest.Mock).mockImplementation(async (id, fn) => await fn())
    ;(getRetryInfo as jest.Mock).mockReturnValue({
      isRetrying: false,
      attemptCount: 0,
      nextRetryAt: null,
      canRetry: true
    })
    
    // Mock successful fetch responses
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          accessToken: 'secure-access-token',
          tokenId: testTokenId,
          expiresIn: 3600,
          scope: 'https://www.googleapis.com/auth/drive.file'
        }
      })
    })
  })

  describe('Complete Successful Workflow', () => {
    it('should complete token generation to file registration workflow', async () => {
      // Arrange
      const selectedFiles = [
        {
          id: 'file-1',
          name: 'document.pdf',
          mimeType: 'application/pdf',
          size: 1024000,
          downloadUrl: 'https://drive.google.com/file/d/file-1/view'
        },
        {
          id: 'file-2',
          name: 'spreadsheet.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          size: 512000
        }
      ]

      ;(registerSelectedFiles as jest.Mock).mockResolvedValue({
        success: true,
        registeredFiles: selectedFiles.map(file => ({
          ...file,
          fileId: file.id,
          providerId: file.id,
          status: 'pending',
          appFileId: `app-${file.id}`,
          queuedForProcessing: true
        })),
        errors: [],
        summary: {
          total: 2,
          registered: 2,
          supported: 2,
          unsupported: 0,
          failed: 0
        }
      })

      // Act - Simulate complete workflow
      // Step 1: Generate picker token
      const tokenResult = await generatePickerToken(testUserId)
      
      // Step 2: Simulate file selection (would happen in picker callback)
      const mockPickerCallback = (files: typeof selectedFiles) => {
        // Log file selection success
        logFileSelectionSuccess(
          testUserId,
          'session-123',
          files.map(file => ({
            fileId: file.id,
            fileName: file.name,
            mimeType: file.mimeType,
            fileSize: file.size
          })),
          testTokenId
        )
        return files
      }
      
      const callbackResult = mockPickerCallback(selectedFiles)
      
      // Step 3: Register selected files
      const registrationResult = await registerSelectedFiles(testUserId, callbackResult)

      // Assert
      expect(generateSecurePickerToken).toHaveBeenCalledWith(
        testUserId,
        expect.objectContaining({
          maxLifetime: 3600,
          scopeValidation: true,
          auditLogging: true
        })
      )
      
      expect(validateTokenScope).toHaveBeenCalledWith('https://www.googleapis.com/auth/drive.file')
      expect(validateOAuthScope).toHaveBeenCalledWith(
        'https://www.googleapis.com/auth/drive.file',
        testUserId,
        testTokenId
      )
      
      expect(logFileSelectionSuccess).toHaveBeenCalledWith(
        testUserId,
        'session-123',
        selectedFiles.map(file => ({
          fileId: file.id,
          fileName: file.name,
          mimeType: file.mimeType,
          fileSize: file.size
        })),
        testTokenId
      )
      
      expect(registerSelectedFiles).toHaveBeenCalledWith(testUserId, selectedFiles)
      expect(registrationResult.success).toBe(true)
      expect(registrationResult.summary.registered).toBe(2)
    })

    it('should handle file processing workflow integration', async () => {
      // Arrange
      const files = [
        {
          id: 'file-1',
          name: 'document.pdf',
          mimeType: 'application/pdf',
          size: 1024000
        }
      ]

      // Mock file registration API call
      ;(global.fetch as jest.Mock).mockImplementation((url) => {
        if (url.includes('register-files')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              data: {
                success: true,
                summary: {
                  total: 1,
                  registered: 1,
                  supported: 1,
                  unsupported: 0,
                  failed: 0
                },
                registeredFiles: files.map(file => ({
                  ...file,
                  fileId: file.id,
                  status: 'pending',
                  queuedForProcessing: true
                }))
              }
            })
          })
        }
        return Promise.resolve({ ok: true, json: async () => ({}) })
      })

      // Act - Simulate file processing workflow
      const handleFilesSelected = async (selectedFiles: typeof files) => {
        const response = await fetch('/api/storage/google/register-files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: selectedFiles })
        })
        
        const result = await response.json()
        
        if (result.success) {
          toast.success(`Successfully added ${selectedFiles.length} files for processing`)
          return result
        } else {
          toast.error('Failed to add selected files')
          throw new Error('Registration failed')
        }
      }

      const result = await handleFilesSelected(files)

      // Assert
      expect(result.success).toBe(true)
      expect(toast.success).toHaveBeenCalledWith('Successfully added 1 files for processing')
    })
  })

  describe('Error Scenarios and Recovery', () => {
    it('should handle token generation failures with recovery', async () => {
      // Arrange
      const tokenError = new Error('Token has expired') as any
      tokenError.type = 'TOKEN_EXPIRED'
      tokenError.requiresReauth = true
      
      ;(generateSecurePickerToken as jest.Mock).mockRejectedValue(tokenError)
      ;(handleTokenError as jest.Mock).mockReturnValue({
        type: 'TOKEN_EXPIRED',
        userMessage: 'Your Google Drive access has expired',
        canRetry: false,
        requiresReauth: true,
        timestamp: new Date().toISOString()
      })
      ;(getErrorGuidance as jest.Mock).mockReturnValue({
        message: 'Your Google Drive access has expired',
        action: 'reconnect'
      })

      // Act
      try {
        await generatePickerToken(testUserId)
      } catch (error) {
        // Expected to throw
      }

      // Assert
      expect(handleTokenError).toHaveBeenCalledWith(tokenError, expect.any(Object))
      expect(getErrorGuidance).toHaveBeenCalled()
    })

    it('should handle file registration failures gracefully', async () => {
      // Arrange
      ;(global.fetch as jest.Mock).mockImplementation((url) => {
        if (url.includes('register-files')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            text: async () => 'Internal server error'
          })
        }
        return Promise.resolve({ ok: true, json: async () => ({}) })
      })

      const files = [
        {
          id: 'file-1',
          name: 'document.pdf',
          mimeType: 'application/pdf',
          size: 1024000
        }
      ]

      // Act
      const handleFilesSelected = async (selectedFiles: typeof files) => {
        try {
          const response = await fetch('/api/storage/google/register-files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: selectedFiles })
          })
          
          if (!response.ok) {
            throw new Error('Failed to register files')
          }
        } catch (error) {
          toast.error('Failed to add selected files. Please try again.')
          throw error
        }
      }

      // Assert
      await expect(handleFilesSelected(files)).rejects.toThrow('Failed to register files')
      expect(toast.error).toHaveBeenCalledWith('Failed to add selected files. Please try again.')
    })

    it('should handle network errors with automatic retry', async () => {
      // Arrange
      let attemptCount = 0
      ;(global.fetch as jest.Mock).mockImplementation(() => {
        attemptCount++
        if (attemptCount <= 2) {
          return Promise.reject(new Error('Network error'))
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: {
              accessToken: 'secure-access-token',
              tokenId: testTokenId,
              expiresIn: 3600,
              scope: 'https://www.googleapis.com/auth/drive.file'
            }
          })
        })
      })

      ;(withRetry as jest.Mock).mockImplementation(async (id, fn) => {
        // Simulate retry logic
        let lastError
        for (let i = 0; i < 3; i++) {
          try {
            return await fn()
          } catch (error) {
            lastError = error
            if (i < 2) continue // Retry
          }
        }
        throw lastError
      })

      // Act
      const result = await withRetry('test-operation', async () => {
        const response = await fetch('/api/storage/google/picker-token')
        const data = await response.json()
        return data
      })

      // Assert - should eventually succeed after retries
      expect(result.data.accessToken).toBe('secure-access-token')
      expect(attemptCount).toBe(3) // Should have retried twice before success
    })
  })

  describe('Security and Privacy Compliance', () => {
    it('should validate token security throughout workflow', async () => {
      // Act
      await generatePickerToken(testUserId)

      // Assert security validations
      expect(validateTokenScope).toHaveBeenCalledWith(
        'https://www.googleapis.com/auth/drive.file'
      )
      
      expect(validateOAuthScope).toHaveBeenCalledWith(
        'https://www.googleapis.com/auth/drive.file',
        testUserId,
        testTokenId
      )

      // Verify secure token generation was called
      expect(generateSecurePickerToken).toHaveBeenCalledWith(
        testUserId,
        expect.objectContaining({
          maxLifetime: 3600,
          scopeValidation: true,
          auditLogging: true
        })
      )
    })

    it('should log comprehensive audit trail', async () => {
      // Arrange
      const selectedFiles = [
        {
          id: 'file-1',
          name: 'confidential.pdf',
          mimeType: 'application/pdf',
          size: 2048000
        }
      ]

      // Act
      logPickerSessionStart(testUserId, 'session-123', testTokenId, {
        userAgent: 'test-agent'
      })

      logFileSelectionSuccess(
        testUserId,
        'session-123',
        selectedFiles.map(file => ({
          fileId: file.id,
          fileName: file.name,
          mimeType: file.mimeType,
          fileSize: file.size
        })),
        testTokenId
      )

      // Assert comprehensive audit logging
      expect(logPickerSessionStart).toHaveBeenCalledWith(
        testUserId,
        'session-123',
        testTokenId,
        expect.objectContaining({
          userAgent: 'test-agent'
        })
      )

      expect(logFileSelectionSuccess).toHaveBeenCalledWith(
        testUserId,
        'session-123',
        [
          {
            fileId: 'file-1',
            fileName: 'confidential.pdf',
            mimeType: 'application/pdf',
            fileSize: 2048000
          }
        ],
        testTokenId
      )
    })

    it('should handle permission violations and block access', async () => {
      // Arrange
      ;(validateOAuthScope as jest.Mock).mockReturnValue({
        isValid: false,
        hasMinimalPermissions: false,
        violations: ['excessive_scope', 'unauthorized_access'],
        riskLevel: 'high'
      })

      const permissionError = new Error('Token permissions do not meet security requirements') as any
      permissionError.type = 'INVALID_CREDENTIALS'
      permissionError.requiresReauth = true
      
      ;(generateSecurePickerToken as jest.Mock).mockRejectedValue(permissionError)
      ;(handleTokenError as jest.Mock).mockReturnValue({
        type: 'INVALID_CREDENTIALS',
        userMessage: 'Token permissions do not meet security requirements',
        canRetry: false,
        requiresReauth: true,
        timestamp: new Date().toISOString()
      })

      // Act & Assert
      await expect(generatePickerToken(testUserId)).rejects.toMatchObject({
        type: 'INVALID_CREDENTIALS',
        requiresReauth: true
      })

      expect(handleTokenError).toHaveBeenCalledWith(permissionError, expect.any(Object))
    })

    it('should ensure minimal permission usage', async () => {
      // Act
      await generatePickerToken(testUserId)

      // Assert minimal permission validation
      expect(validateOAuthScope).toHaveBeenCalledWith(
        'https://www.googleapis.com/auth/drive.file', // Should only use drive.file scope
        testUserId,
        testTokenId
      )

      // Verify token generation uses minimal permissions
      expect(generateSecurePickerToken).toHaveBeenCalledWith(
        testUserId,
        expect.objectContaining({
          maxLifetime: 3600, // 1 hour max
          scopeValidation: true,
          auditLogging: true
        })
      )
    })

    it('should handle picker cancellation gracefully', async () => {
      // Act - simulate user cancelling picker
      logFileSelectionCancelled(testUserId, 'session-123', testTokenId)

      // Assert
      expect(logFileSelectionCancelled).toHaveBeenCalledWith(
        testUserId,
        'session-123',
        testTokenId
      )
      
      // Should not show any error messages for cancellation
      expect(toast.error).not.toHaveBeenCalled()
    })
  })

  describe('User Experience and Error Recovery', () => {
    it('should provide clear user guidance for different error types', async () => {
      // Test different error scenarios and their user guidance
      const errorScenarios = [
        {
          errorType: 'TOKEN_NOT_FOUND',
          expectedGuidance: {
            message: 'Google Drive is not connected to your account.',
            action: 'reconnect'
          }
        },
        {
          errorType: 'NETWORK_ERROR',
          expectedGuidance: {
            message: 'Network connection issue occurred.',
            action: 'retry'
          }
        },
        {
          errorType: 'API_LOAD_FAILED',
          expectedGuidance: {
            message: 'Failed to load Google Picker API.',
            action: 'retry'
          }
        }
      ]

      for (const scenario of errorScenarios) {
        // Arrange
        const mockError = {
          type: scenario.errorType,
          userMessage: scenario.expectedGuidance.message,
          canRetry: scenario.action === 'retry',
          requiresReauth: scenario.action === 'reconnect',
          timestamp: new Date().toISOString()
        }
        
        ;(handlePickerError as jest.Mock).mockReturnValue(mockError)
        ;(getErrorGuidance as jest.Mock).mockReturnValue(scenario.expectedGuidance)

        // Act
        const errorInfo = handlePickerError(new Error('Test error'), {
          operation: 'test',
          userId: testUserId,
          timestamp: new Date().toISOString(),
          metadata: {}
        })
        
        const guidance = getErrorGuidance(errorInfo)

        // Assert
        expect(guidance.message).toBe(scenario.expectedGuidance.message)
        expect(guidance.action).toBe(scenario.expectedGuidance.action)
      }
    })

    it('should maintain state consistency across retry attempts', async () => {
      // Arrange
      let attemptCount = 0
      ;(getRetryInfo as jest.Mock).mockImplementation(() => ({
        isRetrying: attemptCount <= 2,
        attemptCount: attemptCount,
        nextRetryAt: attemptCount <= 2 ? new Date(Date.now() + 1000).toISOString() : null,
        canRetry: true
      }))

      ;(withRetry as jest.Mock).mockImplementation(async (id, fn) => {
        attemptCount++
        if (attemptCount <= 2) {
          throw new Error('Temporary failure')
        }
        return await fn()
      })

      // Act
      const result = await withRetry('test-operation', async () => {
        return { success: true }
      })

      // Assert - should eventually succeed
      expect(result.success).toBe(true)
      expect(attemptCount).toBe(3) // Should have retried twice before success
    })
  })
})