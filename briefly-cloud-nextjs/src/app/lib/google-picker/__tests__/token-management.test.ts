/**
 * Google Picker Token Management Tests
 * 
 * Tests token generation, refresh logic, validation, and security measures
 * Requirements: 2.1, 2.2, 4.1, 4.2, 4.3
 */

import { 
  generatePickerToken, 
  validatePickerTokenResponse, 
  cleanupUserPickerTokens,
  getPickerErrorGuidance,
  type PickerTokenResponse,
  type PickerTokenError 
} from '../token-service'
import { TokenStore } from '@/app/lib/oauth/token-store'
import { 
  generateSecurePickerToken,
  validateTokenScope,
  cleanupPickerTokens 
} from '../security-service'
import { validateOAuthScope } from '../permission-validator'
import { logger } from '@/app/lib/logger'

// Mock dependencies
jest.mock('@/app/lib/oauth/token-store')
jest.mock('../security-service')
jest.mock('../permission-validator')
jest.mock('@/app/lib/logger')

const mockTokenStore = TokenStore as jest.Mocked<typeof TokenStore>
const mockGenerateSecurePickerToken = generateSecurePickerToken as jest.MockedFunction<typeof generateSecurePickerToken>
const mockValidateTokenScope = validateTokenScope as jest.MockedFunction<typeof validateTokenScope>
const mockValidateOAuthScope = validateOAuthScope as jest.MockedFunction<typeof validateOAuthScope>
const mockCleanupPickerTokens = cleanupPickerTokens as jest.MockedFunction<typeof cleanupPickerTokens>
const mockLogger = logger as jest.Mocked<typeof logger>

describe('Google Picker Token Management', () => {
  const testUserId = 'test-user-123'
  const testTokenId = 'token-456'
  
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Default successful mocks
    mockValidateTokenScope.mockReturnValue({
      isValid: true,
      hasMinimalPermissions: true,
      missingScopes: [],
      excessiveScopes: []
    })
    
    mockValidateOAuthScope.mockReturnValue({
      isValid: true,
      hasMinimalPermissions: true,
      violations: [],
      riskLevel: 'low'
    })
  })

  describe('generatePickerToken', () => {
    describe('with fresh tokens', () => {
      it('should generate token successfully with valid stored token', async () => {
        // Arrange
        const mockSecureToken = {
          accessToken: 'fresh-access-token',
          expiresIn: 3600,
          scope: 'https://www.googleapis.com/auth/drive.file',
          tokenId: testTokenId,
          securityMetadata: {
            generatedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
            maxLifetime: 3600,
            scopeValidated: true
          }
        }
        
        mockGenerateSecurePickerToken.mockResolvedValue(mockSecureToken)

        // Act
        const result = await generatePickerToken(testUserId)

        // Assert
        expect(result).toEqual({
          accessToken: 'fresh-access-token',
          expiresIn: 3600,
          scope: 'https://www.googleapis.com/auth/drive.file',
          tokenId: testTokenId,
          securityMetadata: {
            generatedAt: mockSecureToken.securityMetadata.generatedAt,
            maxLifetime: 3600,
            scopeValidated: true
          }
        })
        
        expect(mockGenerateSecurePickerToken).toHaveBeenCalledWith(testUserId, {
          maxLifetime: 3600,
          scopeValidation: true,
          auditLogging: true
        })
        
        expect(mockValidateTokenScope).toHaveBeenCalledWith(mockSecureToken.scope)
        expect(mockValidateOAuthScope).toHaveBeenCalledWith(mockSecureToken.scope, testUserId, testTokenId)
        expect(mockLogger.info).toHaveBeenCalledWith('Generating secure picker token', { userId: testUserId })
      })

      it('should apply custom security options', async () => {
        // Arrange
        const customOptions = {
          maxLifetime: 1800, // 30 minutes
          scopeValidation: false,
          auditLogging: false
        }
        
        const mockSecureToken = {
          accessToken: 'custom-token',
          expiresIn: 1800,
          scope: 'https://www.googleapis.com/auth/drive.file',
          tokenId: testTokenId,
          securityMetadata: {
            generatedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 1800000).toISOString(),
            maxLifetime: 1800,
            scopeValidated: false
          }
        }
        
        mockGenerateSecurePickerToken.mockResolvedValue(mockSecureToken)

        // Act
        await generatePickerToken(testUserId, customOptions)

        // Assert
        expect(mockGenerateSecurePickerToken).toHaveBeenCalledWith(testUserId, {
          maxLifetime: 3600, // Default override
          scopeValidation: true, // Default override
          auditLogging: true, // Default override
          ...customOptions
        })
      })

      it('should log successful token generation event', async () => {
        // Arrange
        const mockSecureToken = {
          accessToken: 'test-token',
          expiresIn: 3600,
          scope: 'https://www.googleapis.com/auth/drive.file',
          tokenId: testTokenId,
          securityMetadata: {
            generatedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
            maxLifetime: 3600,
            scopeValidated: true
          }
        }
        
        mockGenerateSecurePickerToken.mockResolvedValue(mockSecureToken)

        // Act
        await generatePickerToken(testUserId)

        // Assert
        expect(mockLogger.info).toHaveBeenCalledWith('Token refresh successful', 
          expect.objectContaining({
            event: 'picker_token_refresh',
            userId: testUserId,
            success: true,
            timestamp: expect.any(String),
            expiresAt: mockSecureToken.securityMetadata.expiresAt,
            timeUntilExpiry: 3600
          })
        )
      })
    })

    describe('with expired tokens requiring refresh', () => {
      it('should handle token refresh successfully', async () => {
        // Arrange
        const mockRefreshedToken = {
          accessToken: 'refreshed-access-token',
          expiresIn: 3600,
          scope: 'https://www.googleapis.com/auth/drive.file',
          tokenId: testTokenId,
          securityMetadata: {
            generatedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
            maxLifetime: 3600,
            scopeValidated: true
          }
        }
        
        mockGenerateSecurePickerToken.mockResolvedValue(mockRefreshedToken)

        // Act
        const result = await generatePickerToken(testUserId)

        // Assert
        expect(result.accessToken).toBe('refreshed-access-token')
        expect(result.expiresIn).toBe(3600)
        expect(mockLogger.info).toHaveBeenCalledWith('Token refresh successful', expect.any(Object))
      })

      it('should handle refresh token expiration', async () => {
        // Arrange
        const refreshError = new Error('Refresh token invalid')
        mockGenerateSecurePickerToken.mockRejectedValue(refreshError)

        // Act & Assert
        await expect(generatePickerToken(testUserId)).rejects.toMatchObject({
          type: 'REFRESH_TOKEN_EXPIRED',
          message: 'Your Google Drive access has expired. Please reconnect your Google Drive.',
          requiresReauth: true
        })
        
        expect(mockLogger.warn).toHaveBeenCalledWith('Re-authentication required for picker token', 
          expect.objectContaining({
            userId: testUserId,
            error: 'Refresh token invalid',
            action: 'delete_stored_token'
          })
        )
      })

      it('should handle network errors during refresh', async () => {
        // Arrange
        const networkError = new Error('fetch failed - network timeout')
        mockGenerateSecurePickerToken.mockRejectedValue(networkError)

        // Act & Assert
        await expect(generatePickerToken(testUserId)).rejects.toMatchObject({
          type: 'NETWORK_ERROR',
          message: 'Network error occurred while generating token. Please try again.',
          requiresReauth: false
        })
        
        expect(mockLogger.error).toHaveBeenCalledWith('Network error during token generation', 
          expect.objectContaining({
            userId: testUserId,
            error: 'fetch failed - network timeout',
            retryable: true
          })
        )
      })
    })

    describe('token validation and security', () => {
      it('should reject tokens with invalid scope', async () => {
        // Arrange
        const mockSecureToken = {
          accessToken: 'invalid-scope-token',
          expiresIn: 3600,
          scope: 'https://www.googleapis.com/auth/drive.readonly',
          tokenId: testTokenId,
          securityMetadata: {
            generatedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
            maxLifetime: 3600,
            scopeValidated: false
          }
        }
        
        mockGenerateSecurePickerToken.mockResolvedValue(mockSecureToken)
        mockValidateTokenScope.mockReturnValue({
          isValid: false,
          hasMinimalPermissions: false,
          missingScopes: ['https://www.googleapis.com/auth/drive.file'],
          excessiveScopes: []
        })

        // Act & Assert
        await expect(generatePickerToken(testUserId)).rejects.toMatchObject({
          type: 'INVALID_CREDENTIALS',
          message: 'Token does not have required permissions for file picker.',
          requiresReauth: true
        })
        
        expect(mockLogger.error).toHaveBeenCalledWith('Token scope validation failed', 
          expect.objectContaining({
            userId: testUserId,
            tokenId: testTokenId,
            missingScopes: ['https://www.googleapis.com/auth/drive.file'],
            hasMinimalPermissions: false
          })
        )
      })

      it('should reject tokens failing permission validation', async () => {
        // Arrange
        const mockSecureToken = {
          accessToken: 'permission-violation-token',
          expiresIn: 3600,
          scope: 'https://www.googleapis.com/auth/drive',
          tokenId: testTokenId,
          securityMetadata: {
            generatedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
            maxLifetime: 3600,
            scopeValidated: true
          }
        }
        
        mockGenerateSecurePickerToken.mockResolvedValue(mockSecureToken)
        mockValidateOAuthScope.mockReturnValue({
          isValid: false,
          hasMinimalPermissions: false,
          violations: ['excessive_scope'],
          riskLevel: 'high'
        })

        // Act & Assert
        await expect(generatePickerToken(testUserId)).rejects.toMatchObject({
          type: 'INVALID_CREDENTIALS',
          message: 'Token permissions do not meet security requirements.',
          requiresReauth: true
        })
        
        expect(mockLogger.error).toHaveBeenCalledWith('Permission validation failed', 
          expect.objectContaining({
            userId: testUserId,
            tokenId: testTokenId,
            violations: ['excessive_scope'],
            riskLevel: 'high'
          })
        )
      })

      it('should warn about elevated permissions but allow medium risk tokens', async () => {
        // Arrange
        const mockSecureToken = {
          accessToken: 'elevated-permissions-token',
          expiresIn: 3600,
          scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata',
          tokenId: testTokenId,
          securityMetadata: {
            generatedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
            maxLifetime: 3600,
            scopeValidated: true
          }
        }
        
        mockGenerateSecurePickerToken.mockResolvedValue(mockSecureToken)
        mockValidateOAuthScope.mockReturnValue({
          isValid: true,
          hasMinimalPermissions: true,
          violations: ['additional_metadata_scope'],
          riskLevel: 'medium'
        })

        // Act
        const result = await generatePickerToken(testUserId)

        // Assert
        expect(result.accessToken).toBe('elevated-permissions-token')
        expect(mockLogger.warn).toHaveBeenCalledWith('Token has elevated permissions', 
          expect.objectContaining({
            userId: testUserId,
            tokenId: testTokenId,
            currentScope: mockSecureToken.scope,
            violations: ['additional_metadata_scope']
          })
        )
      })
    })

    describe('error handling', () => {
      it('should handle missing Google Drive token', async () => {
        // Arrange
        const noTokenError = new Error('No valid Google Drive token found')
        mockGenerateSecurePickerToken.mockRejectedValue(noTokenError)

        // Act & Assert
        await expect(generatePickerToken(testUserId)).rejects.toMatchObject({
          type: 'TOKEN_NOT_FOUND',
          message: 'No valid Google Drive token found. Please reconnect your Google Drive.',
          requiresReauth: true
        })
        
        expect(mockLogger.warn).toHaveBeenCalledWith('No valid Google Drive token found for picker', { userId: testUserId })
      })

      it('should handle invalid credentials configuration', async () => {
        // Arrange
        const configError = new Error('credentials not configured')
        mockGenerateSecurePickerToken.mockRejectedValue(configError)

        // Act & Assert
        await expect(generatePickerToken(testUserId)).rejects.toMatchObject({
          type: 'INVALID_CREDENTIALS',
          message: 'Google Drive integration is not properly configured.',
          requiresReauth: false
        })
        
        expect(mockLogger.error).toHaveBeenCalledWith('Google OAuth credentials not configured', 
          expect.objectContaining({
            userId: testUserId,
            error: 'credentials not configured',
            requiredEnvVars: ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET']
          })
        )
      })

      it('should handle generic errors with fallback', async () => {
        // Arrange
        const genericError = new Error('Unexpected database error')
        mockGenerateSecurePickerToken.mockRejectedValue(genericError)

        // Act & Assert
        await expect(generatePickerToken(testUserId)).rejects.toMatchObject({
          type: 'TOKEN_REFRESH_FAILED',
          message: 'Failed to generate picker token. Please try again.',
          requiresReauth: false
        })
        
        expect(mockLogger.error).toHaveBeenCalledWith('Unexpected error generating secure picker token', 
          expect.objectContaining({
            userId: testUserId,
            error: 'Unexpected database error'
          })
        )
      })

      it('should log failed token generation events', async () => {
        // Arrange
        const error = new Error('Token refresh failed')
        mockGenerateSecurePickerToken.mockRejectedValue(error)

        // Act
        try {
          await generatePickerToken(testUserId)
        } catch (e) {
          // Expected to throw
        }

        // Assert
        expect(mockLogger.warn).toHaveBeenCalledWith('Token refresh failed', 
          expect.objectContaining({
            event: 'picker_token_refresh',
            userId: testUserId,
            success: false,
            timestamp: expect.any(String),
            errorType: 'Token refresh failed'
          })
        )
      })
    })
  })

  describe('validatePickerTokenResponse', () => {
    it('should validate complete token response', () => {
      // Arrange
      const validToken: PickerTokenResponse = {
        accessToken: 'valid-token',
        expiresIn: 3600,
        scope: 'https://www.googleapis.com/auth/drive.file'
      }

      // Act & Assert
      expect(validatePickerTokenResponse(validToken)).toBe(true)
    })

    it('should reject token response with missing access token', () => {
      // Arrange
      const invalidToken = {
        accessToken: '',
        expiresIn: 3600,
        scope: 'https://www.googleapis.com/auth/drive.file'
      } as PickerTokenResponse

      // Act & Assert
      expect(validatePickerTokenResponse(invalidToken)).toBe(false)
    })

    it('should reject token response with invalid expiration', () => {
      // Arrange
      const invalidToken: PickerTokenResponse = {
        accessToken: 'valid-token',
        expiresIn: 0,
        scope: 'https://www.googleapis.com/auth/drive.file'
      }

      // Act & Assert
      expect(validatePickerTokenResponse(invalidToken)).toBe(false)
    })

    it('should reject token response with missing scope', () => {
      // Arrange
      const invalidToken = {
        accessToken: 'valid-token',
        expiresIn: 3600,
        scope: ''
      } as PickerTokenResponse

      // Act & Assert
      expect(validatePickerTokenResponse(invalidToken)).toBe(false)
    })
  })

  describe('cleanupUserPickerTokens', () => {
    it('should cleanup tokens successfully', async () => {
      // Arrange
      const mockCleanupResult = {
        tokensProcessed: 3,
        tokensRevoked: 2,
        errors: []
      }
      mockCleanupPickerTokens.mockResolvedValue(mockCleanupResult)

      // Act
      await cleanupUserPickerTokens(testUserId)

      // Assert
      expect(mockCleanupPickerTokens).toHaveBeenCalledWith(testUserId)
      expect(mockLogger.info).toHaveBeenCalledWith('Cleaning up picker tokens for user', { userId: testUserId })
      expect(mockLogger.info).toHaveBeenCalledWith('Picker token cleanup completed', {
        userId: testUserId,
        tokensProcessed: 3,
        tokensRevoked: 2,
        errors: []
      })
    })

    it('should handle cleanup errors gracefully', async () => {
      // Arrange
      const cleanupError = new Error('Cleanup service unavailable')
      mockCleanupPickerTokens.mockRejectedValue(cleanupError)

      // Act
      await cleanupUserPickerTokens(testUserId)

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to cleanup picker tokens', {
        userId: testUserId,
        error: 'Cleanup service unavailable'
      })
    })
  })

  describe('getPickerErrorGuidance', () => {
    it('should provide guidance for TOKEN_NOT_FOUND error', () => {
      // Arrange
      const error: PickerTokenError = {
        type: 'TOKEN_NOT_FOUND',
        message: 'No token found',
        requiresReauth: true
      }

      // Act
      const guidance = getPickerErrorGuidance(error)

      // Assert
      expect(guidance).toEqual({
        userMessage: 'Google Drive is not connected to your account.',
        actionRequired: 'Please connect your Google Drive account in the storage settings.',
        canRetry: false
      })
    })

    it('should provide guidance for REFRESH_TOKEN_EXPIRED error', () => {
      // Arrange
      const error: PickerTokenError = {
        type: 'REFRESH_TOKEN_EXPIRED',
        message: 'Refresh token expired',
        requiresReauth: true
      }

      // Act
      const guidance = getPickerErrorGuidance(error)

      // Assert
      expect(guidance).toEqual({
        userMessage: 'Your Google Drive access has expired.',
        actionRequired: 'Please reconnect your Google Drive account to continue.',
        canRetry: false
      })
    })

    it('should provide guidance for TOKEN_REFRESH_FAILED with reauth required', () => {
      // Arrange
      const error: PickerTokenError = {
        type: 'TOKEN_REFRESH_FAILED',
        message: 'Refresh failed',
        requiresReauth: true
      }

      // Act
      const guidance = getPickerErrorGuidance(error)

      // Assert
      expect(guidance).toEqual({
        userMessage: 'Failed to refresh your Google Drive access.',
        actionRequired: 'Please reconnect your Google Drive account.',
        canRetry: false
      })
    })

    it('should provide guidance for TOKEN_REFRESH_FAILED without reauth required', () => {
      // Arrange
      const error: PickerTokenError = {
        type: 'TOKEN_REFRESH_FAILED',
        message: 'Temporary refresh failure',
        requiresReauth: false
      }

      // Act
      const guidance = getPickerErrorGuidance(error)

      // Assert
      expect(guidance).toEqual({
        userMessage: 'Failed to refresh your Google Drive access.',
        actionRequired: 'Please try again in a few moments.',
        canRetry: true
      })
    })

    it('should provide guidance for NETWORK_ERROR', () => {
      // Arrange
      const error: PickerTokenError = {
        type: 'NETWORK_ERROR',
        message: 'Network timeout',
        requiresReauth: false
      }

      // Act
      const guidance = getPickerErrorGuidance(error)

      // Assert
      expect(guidance).toEqual({
        userMessage: 'Network connection issue occurred.',
        actionRequired: 'Please check your internet connection and try again.',
        canRetry: true
      })
    })

    it('should provide guidance for INVALID_CREDENTIALS', () => {
      // Arrange
      const error: PickerTokenError = {
        type: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials',
        requiresReauth: false
      }

      // Act
      const guidance = getPickerErrorGuidance(error)

      // Assert
      expect(guidance).toEqual({
        userMessage: 'Google Drive integration is temporarily unavailable.',
        actionRequired: 'Please try again later or contact support if the issue persists.',
        canRetry: true
      })
    })

    it('should provide default guidance for unknown error types', () => {
      // Arrange
      const error = {
        type: 'UNKNOWN_ERROR' as any,
        message: 'Unknown error',
        requiresReauth: false
      }

      // Act
      const guidance = getPickerErrorGuidance(error)

      // Assert
      expect(guidance).toEqual({
        userMessage: 'An unexpected error occurred.',
        actionRequired: 'Please try again or contact support if the issue persists.',
        canRetry: true
      })
    })
  })
})
