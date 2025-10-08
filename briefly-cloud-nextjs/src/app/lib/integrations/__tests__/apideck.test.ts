/**
 * Tests for Apideck integration
 */

// Mock environment variables
const mockEnv = {
  APIDECK_API_KEY: 'test-key',
  APIDECK_APP_ID: 'test-app-id',
  APIDECK_API_BASE_URL: 'https://api.test.com',
  APIDECK_VAULT_BASE_URL: 'https://vault.test.com',
  APIDECK_REDIRECT_URL: 'https://app.test.com/callback'
}

// Mock fetch
global.fetch = jest.fn()

describe('Apideck Integration', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = process.env
    process.env = { ...originalEnv, ...mockEnv }
    jest.clearAllMocks()
    // Clear module cache to ensure fresh imports with new env vars
    jest.resetModules()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('validateApideckConfig', () => {
    it('should pass validation with all required env vars', () => {
      const { validateApideckConfig } = require('../apideck')
      
      expect(() => validateApideckConfig()).not.toThrow()
    })

    it('should fail validation if required env vars are missing', () => {
      delete process.env.APIDECK_API_KEY
      
      const { validateApideckConfig } = require('../apideck')
      
      expect(() => validateApideckConfig()).toThrow('Missing Apideck env: APIDECK_API_KEY')
    })
  })

  describe('createVaultSession', () => {
    beforeEach(() => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ session_id: 'test-session' })
      })
    })

    it('should create session with APP_ID as application_id', async () => {
      const { Apideck } = require('../apideck')
      
      await Apideck.createVaultSession('test-consumer', 'https://redirect.com')
      
      expect(global.fetch).toHaveBeenCalledWith(
        'https://vault.test.com/sessions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-key',
            'x-apideck-app-id': 'test-app-id',
            'x-apideck-consumer-id': 'test-consumer',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            application_id: 'test-app-id',  // Uses APP_ID as application_id
            unified_api: 'file-storage',
            redirect_uri: 'https://redirect.com'
          })
        })
      )
    })

    it('should use direct headers instead of apideckHeaders function', async () => {
      const { Apideck } = require('../apideck')
      
      await Apideck.createVaultSession('test-consumer', 'https://redirect.com')
      
      // Verify headers are set directly in the createVaultSession method
      expect(global.fetch).toHaveBeenCalledWith(
        'https://vault.test.com/sessions',
        expect.objectContaining({
          headers: {
            'Authorization': 'Bearer test-key',
            'x-apideck-app-id': 'test-app-id',
            'x-apideck-consumer-id': 'test-consumer',
            'Content-Type': 'application/json'
          }
        })
      )
    })
  })
})