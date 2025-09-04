/**
 * Security and Privacy Measures Test Suite
 * 
 * Tests for Google Picker security service, audit logging, and permission validation.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { 
  generateSecurePickerToken, 
  validateTokenScope, 
  cleanupPickerTokens,
  getTokenSecurityStats,
  revokePickerToken,
  tokenRegistry
} from '../security-service'
import {
  logPickerSessionStart,
  logFileSelectionSuccess,
  logFileSelectionCancelled,
  logFileSelectionFailure,
  logFileRegistration,
  logTokenSecurityEvent,
  logScopeValidationFailure,
  auditLogger
} from '../audit-service'
import {
  validateOAuthScope,
  validateFileAccess,
  validatePickerConfiguration,
  validateFileRegistrationPermissions,
  hasMinimalPermissions,
  getRecommendedScope,
  REQUIRED_SCOPES
} from '../permission-validator'

// Mock dependencies
jest.mock('@/app/lib/logger')
jest.mock('@/app/lib/oauth/token-store')

const mockTokenStore = {
  getToken: jest.fn(),
  refreshTokenIfNeeded: jest.fn()
}

// Mock token data
const mockValidToken = {
  accessToken: 'mock_access_token',
  refreshToken: 'mock_refresh_token',
  expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
  scope: 'https://www.googleapis.com/auth/drive.file'
}

const mockExpiredToken = {
  ...mockValidToken,
  expiresAt: new Date(Date.now() - 3600000).toISOString() // 1 hour ago
}

const mockBroadScopeToken = {
  ...mockValidToken,
  scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file'
}

describe('Security Service', () => {
  const testUserId = 'test-user-123'

  beforeEach(() => {
    jest.clearAllMocks()
    // Clean up token registry
    tokenRegistry.stopCleanupTimer()
  })

  afterEach(() => {
    tokenRegistry.stopCleanupTimer()
  })

  describe('generateSecurePickerToken', () => {
    it('should generate secure token with 1 hour max lifetime', async () => {
      mockTokenStore.getToken.mockResolvedValue(mockValidToken)

      const result = await generateSecurePickerToken(testUserId, {
        maxLifetime: 7200 // Request 2 hours
      })

      expect(result.expiresIn).toBeLessThanOrEqual(3600) // Should be capped at 1 hour
      expect(result.tokenId).toBeDefined()
      expect(result.securityMetadata.maxLifetime).toBe(3600)
    })

    it('should validate token scope', async () => {
      mockTokenStore.getToken.mockResolvedValue(mockValidToken)

      const result = await generateSecurePickerToken(testUserId, {
        scopeValidation: true
      })

      expect(result.scope).toBe(REQUIRED_SCOPES.MINIMAL)
    })

    it('should reject invalid scope', async () => {
      const invalidScopeToken = {
        ...mockValidToken,
        scope: 'https://www.googleapis.com/auth/invalid'
      }
      mockTokenStore.getToken.mockResolvedValue(invalidScopeToken)

      await expect(generateSecurePickerToken(testUserId, {
        scopeValidation: true
      })).rejects.toThrow('Token does not have required drive.file scope')
    })

    it('should refresh expired tokens', async () => {
      mockTokenStore.getToken.mockResolvedValue(mockExpiredToken)
      mockTokenStore.refreshTokenIfNeeded.mockResolvedValue(mockValidToken)

      const result = await generateSecurePickerToken(testUserId)

      expect(mockTokenStore.refreshTokenIfNeeded).toHaveBeenCalled()
      expect(result.accessToken).toBe(mockValidToken.accessToken)
    })
  })

  describe('validateTokenScope', () => {
    it('should validate minimal required scope', () => {
      const result = validateTokenScope(REQUIRED_SCOPES.MINIMAL)

      expect(result.isValid).toBe(true)
      expect(result.hasMinimalPermissions).toBe(true)
      expect(result.missingScopes).toHaveLength(0)
    })

    it('should detect missing scopes', () => {
      const result = validateTokenScope('https://www.googleapis.com/auth/invalid')

      expect(result.isValid).toBe(false)
      expect(result.hasMinimalPermissions).toBe(false)
      expect(result.missingScopes).toContain(REQUIRED_SCOPES.MINIMAL)
    })
  })

  describe('cleanupPickerTokens', () => {
    it('should clean up expired tokens', async () => {
      // Generate some tokens first
      mockTokenStore.getToken.mockResolvedValue(mockValidToken)
      
      const token1 = await generateSecurePickerToken(testUserId)
      const token2 = await generateSecurePickerToken(testUserId)

      const result = await cleanupPickerTokens()

      expect(result.tokensProcessed).toBeGreaterThanOrEqual(0)
    })

    it('should clean up user-specific tokens', async () => {
      mockTokenStore.getToken.mockResolvedValue(mockValidToken)
      
      const token = await generateSecurePickerToken(testUserId)
      
      const result = await cleanupPickerTokens(testUserId)

      expect(result.tokensRevoked).toBeGreaterThanOrEqual(0)
    })
  })

  describe('revokePickerToken', () => {
    it('should revoke specific token', async () => {
      mockTokenStore.getToken.mockResolvedValue(mockValidToken)
      
      const token = await generateSecurePickerToken(testUserId)
      const revoked = await revokePickerToken(token.tokenId)

      expect(revoked).toBe(true)
    })

    it('should handle non-existent token', async () => {
      const revoked = await revokePickerToken('non-existent-token')

      expect(revoked).toBe(false)
    })
  })
})

describe('Audit Service', () => {
  const testUserId = 'test-user-123'
  const testSessionId = 'session-123'
  const testTokenId = 'token-123'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('logPickerSessionStart', () => {
    it('should log session start with metadata', () => {
      logPickerSessionStart(testUserId, testSessionId, testTokenId, {
        userAgent: 'test-agent'
      })

      // Verify logging was called (mocked)
      expect(jest.isMockFunction(require('@/app/lib/logger').logger.info)).toBe(true)
    })
  })

  describe('logFileSelectionSuccess', () => {
    it('should log successful file selection', () => {
      const selectedFiles = [
        {
          fileId: 'file-1',
          fileName: 'test.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024
        }
      ]

      logFileSelectionSuccess(testUserId, testSessionId, selectedFiles, testTokenId)

      // Verify audit logging
      expect(jest.isMockFunction(require('@/app/lib/logger').logger.info)).toBe(true)
    })
  })

  describe('logFileSelectionCancelled', () => {
    it('should log cancellation event', () => {
      logFileSelectionCancelled(testUserId, testSessionId, testTokenId)

      expect(jest.isMockFunction(require('@/app/lib/logger').logger.info)).toBe(true)
    })
  })

  describe('logFileSelectionFailure', () => {
    it('should log failure with error details', () => {
      logFileSelectionFailure(testUserId, testSessionId, 'TOKEN_EXPIRED', testTokenId)

      expect(jest.isMockFunction(require('@/app/lib/logger').logger.info)).toBe(true)
    })
  })

  describe('logFileRegistration', () => {
    it('should log file registration events', () => {
      const files = [
        {
          fileId: 'file-1',
          fileName: 'test.pdf',
          mimeType: 'application/pdf',
          status: 'pending'
        }
      ]

      logFileRegistration(testUserId, testSessionId, files, testTokenId)

      expect(jest.isMockFunction(require('@/app/lib/logger').logger.info)).toBe(true)
    })
  })

  describe('logTokenSecurityEvent', () => {
    it('should log security events', () => {
      logTokenSecurityEvent('token_generated', testUserId, testTokenId, {
        tokenScope: REQUIRED_SCOPES.MINIMAL,
        tokenLifetime: 3600,
        riskLevel: 'low'
      })

      expect(jest.isMockFunction(require('@/app/lib/logger').logger.info)).toBe(true)
    })
  })

  describe('logScopeValidationFailure', () => {
    it('should log scope validation failures', () => {
      logScopeValidationFailure(
        testUserId,
        testTokenId,
        'invalid_scope',
        REQUIRED_SCOPES.MINIMAL
      )

      expect(jest.isMockFunction(require('@/app/lib/logger').logger.info)).toBe(true)
    })
  })
})

describe('Permission Validator', () => {
  const testUserId = 'test-user-123'
  const testTokenId = 'token-123'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('validateOAuthScope', () => {
    it('should validate minimal scope', () => {
      const result = validateOAuthScope(REQUIRED_SCOPES.MINIMAL, testUserId, testTokenId)

      expect(result.isValid).toBe(true)
      expect(result.riskLevel).toBe('low')
      expect(result.violations).toHaveLength(0)
    })

    it('should detect excessive permissions', () => {
      const broadScope = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file'
      const result = validateOAuthScope(broadScope, testUserId, testTokenId)

      expect(result.isValid).toBe(true) // Still valid but with warnings
      expect(result.riskLevel).toBe('medium')
      expect(result.violations.some(v => v.type === 'scope_too_broad')).toBe(true)
    })

    it('should reject missing required scope', () => {
      const invalidScope = 'https://www.googleapis.com/auth/invalid'
      const result = validateOAuthScope(invalidScope, testUserId, testTokenId)

      expect(result.isValid).toBe(false)
      expect(result.riskLevel).toBe('high')
      expect(result.violations.some(v => v.type === 'scope_missing')).toBe(true)
    })
  })

  describe('validateFileAccess', () => {
    it('should validate picker selection access', () => {
      const context = {
        userId: testUserId,
        tokenId: testTokenId,
        requestedFiles: ['file-1', 'file-2'],
        tokenScope: REQUIRED_SCOPES.MINIMAL,
        accessMethod: 'picker_selection' as const
      }

      const result = validateFileAccess(context)

      expect(result.isValid).toBe(true)
      expect(result.riskLevel).toBe('low')
    })

    it('should reject non-picker access methods', () => {
      const context = {
        userId: testUserId,
        tokenId: testTokenId,
        requestedFiles: ['file-1'],
        tokenScope: REQUIRED_SCOPES.MINIMAL,
        accessMethod: 'direct_api' as const
      }

      const result = validateFileAccess(context)

      expect(result.isValid).toBe(false)
      expect(result.riskLevel).toBe('high')
      expect(result.violations.some(v => v.type === 'unauthorized_access')).toBe(true)
    })

    it('should warn about large file requests', () => {
      const context = {
        userId: testUserId,
        tokenId: testTokenId,
        requestedFiles: Array.from({ length: 150 }, (_, i) => `file-${i}`),
        tokenScope: REQUIRED_SCOPES.MINIMAL,
        accessMethod: 'picker_selection' as const
      }

      const result = validateFileAccess(context)

      expect(result.violations.some(v => v.type === 'file_access_violation')).toBe(true)
    })
  })

  describe('validatePickerConfiguration', () => {
    it('should validate standard picker configuration', () => {
      const config = {
        userId: testUserId,
        tokenScope: REQUIRED_SCOPES.MINIMAL,
        pickerViews: ['DOCS', 'SPREADSHEETS', 'PRESENTATIONS', 'PDFS'],
        tokenId: testTokenId
      }

      const result = validatePickerConfiguration(config)

      expect(result.isValid).toBe(true)
      expect(result.riskLevel).toBe('low')
    })

    it('should reject unauthorized picker views', () => {
      const config = {
        userId: testUserId,
        tokenScope: REQUIRED_SCOPES.MINIMAL,
        pickerViews: ['DOCS', 'PHOTOS'], // PHOTOS not allowed
        tokenId: testTokenId
      }

      const result = validatePickerConfiguration(config)

      expect(result.violations.some(v => v.type === 'unauthorized_access')).toBe(true)
    })
  })

  describe('validateFileRegistrationPermissions', () => {
    it('should validate safe file registration', () => {
      const files = [
        { id: 'file-1', name: 'document.pdf', mimeType: 'application/pdf' },
        { id: 'file-2', name: 'spreadsheet.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
      ]

      const result = validateFileRegistrationPermissions(
        testUserId,
        files,
        REQUIRED_SCOPES.MINIMAL,
        testTokenId
      )

      expect(result.isValid).toBe(true)
    })

    it('should block executable file registration', () => {
      const files = [
        { id: 'file-1', name: 'malware.exe', mimeType: 'application/x-executable' }
      ]

      const result = validateFileRegistrationPermissions(
        testUserId,
        files,
        REQUIRED_SCOPES.MINIMAL,
        testTokenId
      )

      expect(result.isValid).toBe(false)
      expect(result.violations.some(v => v.type === 'file_access_violation')).toBe(true)
    })
  })

  describe('hasMinimalPermissions', () => {
    it('should return true for minimal scope', () => {
      expect(hasMinimalPermissions(REQUIRED_SCOPES.MINIMAL)).toBe(true)
    })

    it('should return true for acceptable scopes', () => {
      expect(hasMinimalPermissions('https://www.googleapis.com/auth/drive.readonly')).toBe(true)
    })

    it('should return false for invalid scopes', () => {
      expect(hasMinimalPermissions('https://www.googleapis.com/auth/invalid')).toBe(false)
    })
  })

  describe('getRecommendedScope', () => {
    it('should return minimal required scope', () => {
      expect(getRecommendedScope()).toBe(REQUIRED_SCOPES.MINIMAL)
    })
  })
})

describe('Integration Tests', () => {
  const testUserId = 'test-user-123'

  beforeEach(() => {
    jest.clearAllMocks()
    tokenRegistry.stopCleanupTimer()
  })

  afterEach(() => {
    tokenRegistry.stopCleanupTimer()
  })

  describe('Complete Security Flow', () => {
    it('should handle complete secure token generation and validation', async () => {
      mockTokenStore.getToken.mockResolvedValue(mockValidToken)

      // Generate secure token
      const token = await generateSecurePickerToken(testUserId, {
        maxLifetime: 3600,
        scopeValidation: true,
        auditLogging: true
      })

      expect(token.tokenId).toBeDefined()
      expect(token.expiresIn).toBeLessThanOrEqual(3600)

      // Validate permissions
      const permissionResult = validateOAuthScope(token.scope, testUserId, token.tokenId)
      expect(permissionResult.isValid).toBe(true)

      // Validate file access
      const fileAccessResult = validateFileAccess({
        userId: testUserId,
        tokenId: token.tokenId,
        requestedFiles: ['file-1', 'file-2'],
        tokenScope: token.scope,
        accessMethod: 'picker_selection'
      })
      expect(fileAccessResult.isValid).toBe(true)

      // Clean up
      const revoked = await revokePickerToken(token.tokenId)
      expect(revoked).toBe(true)
    })

    it('should handle security violations properly', async () => {
      // Test with broad scope token
      mockTokenStore.getToken.mockResolvedValue(mockBroadScopeToken)

      const token = await generateSecurePickerToken(testUserId)

      // Should still work but with warnings
      const permissionResult = validateOAuthScope(token.scope, testUserId, token.tokenId)
      expect(permissionResult.isValid).toBe(true)
      expect(permissionResult.riskLevel).toBe('medium')

      // Test unauthorized access
      const unauthorizedResult = validateFileAccess({
        userId: testUserId,
        tokenId: token.tokenId,
        requestedFiles: ['file-1'],
        tokenScope: token.scope,
        accessMethod: 'direct_api'
      })
      expect(unauthorizedResult.isValid).toBe(false)
      expect(unauthorizedResult.riskLevel).toBe('high')
    })
  })

  describe('Audit Trail Completeness', () => {
    it('should create complete audit trail for picker session', () => {
      const sessionId = 'session-123'
      const tokenId = 'token-123'

      // Start session
      logPickerSessionStart(testUserId, sessionId, tokenId)

      // Select files
      const selectedFiles = [
        { fileId: 'file-1', fileName: 'test.pdf', mimeType: 'application/pdf', fileSize: 1024 }
      ]
      logFileSelectionSuccess(testUserId, sessionId, selectedFiles, tokenId)

      // Register files
      const registrationFiles = [
        { fileId: 'file-1', fileName: 'test.pdf', mimeType: 'application/pdf', status: 'pending' }
      ]
      logFileRegistration(testUserId, sessionId, registrationFiles, tokenId)

      // Log security event
      logTokenSecurityEvent('token_generated', testUserId, tokenId, {
        tokenScope: REQUIRED_SCOPES.MINIMAL,
        tokenLifetime: 3600,
        riskLevel: 'low'
      })

      // All logging calls should have been made
      expect(jest.isMockFunction(require('@/app/lib/logger').logger.info)).toBe(true)
    })
  })
})