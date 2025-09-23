/**
 * OAuth Tokens Repository Integration Tests
 * 
 * Integration tests that verify the repository works with actual RPC functions
 * These tests require a database connection and deployed RPC functions
 */

import { oauthTokensRepo, type OAuthTokenData, type OAuthProvider } from '../oauth-tokens-repo'

// Skip integration tests if not in integration test environment
const isIntegrationTest = process.env.NODE_ENV === 'test' && process.env.INTEGRATION_TESTS === 'true'

const describeIntegration = isIntegrationTest ? describe : describe.skip

describeIntegration('OAuthTokensRepository Integration', () => {
  const testUserId = '12345678-1234-1234-1234-123456789012'
  const testProvider: OAuthProvider = 'google'
  const testTokenData: OAuthTokenData = {
    accessToken: 'integration-test-access-token',
    refreshToken: 'integration-test-refresh-token',
    expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
    scope: 'https://www.googleapis.com/auth/drive.file'
  }

  beforeEach(async () => {
    // Clean up any existing test data
    try {
      await oauthTokensRepo.deleteToken(testUserId, testProvider)
    } catch (error) {
      // Ignore errors if token doesn't exist
    }
  })

  afterEach(async () => {
    // Clean up test data
    try {
      await oauthTokensRepo.deleteToken(testUserId, testProvider)
    } catch (error) {
      // Ignore errors if token doesn't exist
    }
  })

  describe('Token Management Workflow', () => {
    it('should complete full token lifecycle', async () => {
      // 1. Verify token doesn't exist initially
      const initialExists = await oauthTokensRepo.tokenExists(testUserId, testProvider)
      expect(initialExists).toBe(false)

      const initialToken = await oauthTokensRepo.getToken(testUserId, testProvider)
      expect(initialToken).toBeNull()

      // 2. Save token
      await oauthTokensRepo.saveToken(testUserId, testProvider, testTokenData)

      // 3. Verify token exists
      const existsAfterSave = await oauthTokensRepo.tokenExists(testUserId, testProvider)
      expect(existsAfterSave).toBe(true)

      // 4. Retrieve token and verify data
      const retrievedToken = await oauthTokensRepo.getToken(testUserId, testProvider)
      expect(retrievedToken).not.toBeNull()
      expect(retrievedToken?.accessToken).toBe(testTokenData.accessToken)
      expect(retrievedToken?.refreshToken).toBe(testTokenData.refreshToken)
      expect(retrievedToken?.scope).toBe(testTokenData.scope)

      // 5. Check token status
      const tokenStatus = await oauthTokensRepo.getTokenStatus(testUserId, testProvider)
      expect(tokenStatus.exists).toBe(true)
      expect(tokenStatus.isExpired).toBe(false)
      expect(tokenStatus.expiresAt).toBeDefined()

      // 6. Verify connection status was updated
      const connectionStatus = await oauthTokensRepo.getConnectionStatus(testUserId, testProvider)
      expect(connectionStatus?.connected).toBe(true)

      // 7. Delete token
      await oauthTokensRepo.deleteToken(testUserId, testProvider)

      // 8. Verify token is deleted
      const existsAfterDelete = await oauthTokensRepo.tokenExists(testUserId, testProvider)
      expect(existsAfterDelete).toBe(false)

      const tokenAfterDelete = await oauthTokensRepo.getToken(testUserId, testProvider)
      expect(tokenAfterDelete).toBeNull()

      // 9. Verify connection status was updated to disconnected
      const connectionStatusAfterDelete = await oauthTokensRepo.getConnectionStatus(testUserId, testProvider)
      expect(connectionStatusAfterDelete?.connected).toBe(false)
    })

    it('should handle token without refresh token', async () => {
      const tokenWithoutRefresh: OAuthTokenData = {
        accessToken: 'test-access-token-no-refresh',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        scope: 'test-scope'
      }

      // Save token without refresh token
      await oauthTokensRepo.saveToken(testUserId, testProvider, tokenWithoutRefresh)

      // Retrieve and verify
      const retrievedToken = await oauthTokensRepo.getToken(testUserId, testProvider)
      expect(retrievedToken).not.toBeNull()
      expect(retrievedToken?.accessToken).toBe(tokenWithoutRefresh.accessToken)
      expect(retrievedToken?.refreshToken).toBeUndefined()
      expect(retrievedToken?.scope).toBe(tokenWithoutRefresh.scope)
    })

    it('should handle token update (upsert behavior)', async () => {
      // Save initial token
      await oauthTokensRepo.saveToken(testUserId, testProvider, testTokenData)

      // Update with new token data
      const updatedTokenData: OAuthTokenData = {
        accessToken: 'updated-access-token',
        refreshToken: 'updated-refresh-token',
        expiresAt: new Date(Date.now() + 7200000).toISOString(), // 2 hours from now
        scope: 'updated-scope'
      }

      await oauthTokensRepo.saveToken(testUserId, testProvider, updatedTokenData)

      // Verify updated data
      const retrievedToken = await oauthTokensRepo.getToken(testUserId, testProvider)
      expect(retrievedToken?.accessToken).toBe(updatedTokenData.accessToken)
      expect(retrievedToken?.refreshToken).toBe(updatedTokenData.refreshToken)
      expect(retrievedToken?.scope).toBe(updatedTokenData.scope)
    })

    it('should handle multiple providers for same user', async () => {
      const microsoftProvider: OAuthProvider = 'microsoft'
      const microsoftTokenData: OAuthTokenData = {
        accessToken: 'microsoft-access-token',
        refreshToken: 'microsoft-refresh-token',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        scope: 'https://graph.microsoft.com/Files.Read.All'
      }

      try {
        // Save tokens for both providers
        await oauthTokensRepo.saveToken(testUserId, testProvider, testTokenData)
        await oauthTokensRepo.saveToken(testUserId, microsoftProvider, microsoftTokenData)

        // Verify both tokens exist
        const googleExists = await oauthTokensRepo.tokenExists(testUserId, testProvider)
        const microsoftExists = await oauthTokensRepo.tokenExists(testUserId, microsoftProvider)
        
        expect(googleExists).toBe(true)
        expect(microsoftExists).toBe(true)

        // Verify correct tokens are retrieved
        const googleToken = await oauthTokensRepo.getToken(testUserId, testProvider)
        const microsoftToken = await oauthTokensRepo.getToken(testUserId, microsoftProvider)

        expect(googleToken?.accessToken).toBe(testTokenData.accessToken)
        expect(microsoftToken?.accessToken).toBe(microsoftTokenData.accessToken)

        // Verify all connection statuses
        const allStatuses = await oauthTokensRepo.getAllConnectionStatuses(testUserId)
        expect(allStatuses).toHaveLength(2)
        
        const googleStatus = allStatuses.find(s => s.provider === 'google')
        const microsoftStatus = allStatuses.find(s => s.provider === 'microsoft')
        
        expect(googleStatus?.connected).toBe(true)
        expect(microsoftStatus?.connected).toBe(true)

        // Clean up microsoft token
        await oauthTokensRepo.deleteToken(testUserId, microsoftProvider)
      } catch (error) {
        // Clean up microsoft token in case of error
        try {
          await oauthTokensRepo.deleteToken(testUserId, microsoftProvider)
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
        throw error
      }
    })
  })

  describe('Connection Status Management', () => {
    it('should manage connection status independently', async () => {
      // Update connection status without token
      await oauthTokensRepo.updateConnectionStatus(
        testUserId, 
        testProvider, 
        false, 
        'Test connection error'
      )

      // Verify connection status
      const status = await oauthTokensRepo.getConnectionStatus(testUserId, testProvider)
      expect(status?.connected).toBe(false)
      expect(status?.errorMessage).toBe('Test connection error')

      // Update to connected
      await oauthTokensRepo.updateConnectionStatus(testUserId, testProvider, true)

      const updatedStatus = await oauthTokensRepo.getConnectionStatus(testUserId, testProvider)
      expect(updatedStatus?.connected).toBe(true)
      expect(updatedStatus?.errorMessage).toBeUndefined()
      expect(updatedStatus?.lastSync).toBeDefined()
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid provider gracefully', async () => {
      // This should be caught by TypeScript, but test runtime behavior
      await expect(
        oauthTokensRepo.saveToken(testUserId, 'invalid' as OAuthProvider, testTokenData)
      ).rejects.toThrow()
    })

    it('should handle non-existent user gracefully', async () => {
      const nonExistentUserId = '00000000-0000-0000-0000-000000000000'
      
      // These operations should not throw errors even for non-existent users
      const exists = await oauthTokensRepo.tokenExists(nonExistentUserId, testProvider)
      expect(exists).toBe(false)

      const token = await oauthTokensRepo.getToken(nonExistentUserId, testProvider)
      expect(token).toBeNull()

      const status = await oauthTokensRepo.getTokenStatus(nonExistentUserId, testProvider)
      expect(status.exists).toBe(false)
    })
  })

  describe('Token Expiry Handling', () => {
    it('should correctly identify expired tokens', async () => {
      const expiredTokenData: OAuthTokenData = {
        accessToken: 'expired-access-token',
        refreshToken: 'expired-refresh-token',
        expiresAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        scope: 'test-scope'
      }

      // Save expired token
      await oauthTokensRepo.saveToken(testUserId, testProvider, expiredTokenData)

      // Check status
      const status = await oauthTokensRepo.getTokenStatus(testUserId, testProvider)
      expect(status.exists).toBe(true)
      expect(status.isExpired).toBe(true)
    })

    it('should correctly identify tokens expiring soon', async () => {
      const expiringSoonTokenData: OAuthTokenData = {
        accessToken: 'expiring-soon-access-token',
        refreshToken: 'expiring-soon-refresh-token',
        expiresAt: new Date(Date.now() + 120000).toISOString(), // 2 minutes from now
        scope: 'test-scope'
      }

      // Save token expiring soon
      await oauthTokensRepo.saveToken(testUserId, testProvider, expiringSoonTokenData)

      // Check status
      const status = await oauthTokensRepo.getTokenStatus(testUserId, testProvider)
      expect(status.exists).toBe(true)
      expect(status.isExpired).toBe(false)
      expect(status.expiresSoon).toBe(true)
    })
  })
})