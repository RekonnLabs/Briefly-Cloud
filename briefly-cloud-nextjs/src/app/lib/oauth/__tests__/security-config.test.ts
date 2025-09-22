/**
 * Tests for OAuth Security Configuration
 */

import { 
  OAuthSecurityConfig, 
  getOAuthScopes, 
  getOAuthSettings, 
  getScopeDescriptions,
  validateScopes,
  getSecurityImplications
} from '../security-config'

describe('OAuth Security Configuration', () => {
  describe('getOAuthScopes', () => {
    it('should return correct scopes for Google', () => {
      const scopes = getOAuthScopes('google')
      expect(scopes).toBe('openid email profile https://www.googleapis.com/auth/drive.readonly')
    })

    it('should return correct scopes for Microsoft', () => {
      const scopes = getOAuthScopes('microsoft')
      expect(scopes).toBe('offline_access Files.Read User.Read openid profile email')
    })

    it('should throw error for unsupported provider', () => {
      expect(() => getOAuthScopes('unsupported' as any)).toThrow('Unsupported OAuth provider: unsupported')
    })
  })

  describe('getOAuthSettings', () => {
    it('should return correct settings for Google', () => {
      const settings = getOAuthSettings('google')
      expect(settings).toEqual({
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        response_type: 'code'
      })
    })

    it('should return correct settings for Microsoft', () => {
      const settings = getOAuthSettings('microsoft')
      expect(settings.response_type).toBe('code')
      expect(settings.tenant).toBeDefined()
    })
  })

  describe('validateScopes', () => {
    it('should validate allowed Google scopes', () => {
      const validScopes = ['openid', 'email', 'profile']
      expect(validateScopes('google', validScopes)).toBe(true)
    })

    it('should reject invalid Google scopes', () => {
      const invalidScopes = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive']
      expect(validateScopes('google', invalidScopes)).toBe(false)
    })

    it('should validate allowed Microsoft scopes', () => {
      const validScopes = ['offline_access', 'Files.Read', 'User.Read']
      expect(validateScopes('microsoft', validScopes)).toBe(true)
    })

    it('should reject invalid Microsoft scopes', () => {
      const invalidScopes = ['offline_access', 'Files.ReadWrite', 'User.Read']
      expect(validateScopes('microsoft', invalidScopes)).toBe(false)
    })
  })

  describe('getScopeDescriptions', () => {
    it('should return scope descriptions for Google', () => {
      const descriptions = getScopeDescriptions('google')
      expect(descriptions['openid']).toBe('Basic identity verification')
      expect(descriptions['https://www.googleapis.com/auth/drive.readonly']).toBe('Read-only access to your Google Drive files')
    })

    it('should return scope descriptions for Microsoft', () => {
      const descriptions = getScopeDescriptions('microsoft')
      expect(descriptions['offline_access']).toBe('Maintain access when you are not actively using the app')
      expect(descriptions['Files.Read']).toBe('Read-only access to your OneDrive files')
    })
  })

  describe('getSecurityImplications', () => {
    it('should return security implications for Google', () => {
      const implications = getSecurityImplications('google')
      expect(implications.dataAccess).toContain('Read-only access to Google Drive')
      expect(implications.compliance).toContain('GDPR compliant')
    })

    it('should return security implications for Microsoft', () => {
      const implications = getSecurityImplications('microsoft')
      expect(implications.dataAccess).toContain('Read-only access to OneDrive')
      expect(implications.compliance).toContain('GDPR compliant')
    })
  })

  describe('Security Configuration Structure', () => {
    it('should have minimal required scopes for Google', () => {
      const config = OAuthSecurityConfig.google
      expect(config.scopes).toContain('openid')
      expect(config.scopes).toContain('email')
      expect(config.scopes).toContain('profile')
      expect(config.scopes).toContain('https://www.googleapis.com/auth/drive.readonly')
      // Should not contain write permissions
      expect(config.scopes).not.toContain('https://www.googleapis.com/auth/drive')
    })

    it('should have minimal required scopes for Microsoft', () => {
      const config = OAuthSecurityConfig.microsoft
      expect(config.scopes).toContain('offline_access')
      expect(config.scopes).toContain('Files.Read')
      expect(config.scopes).toContain('User.Read')
      expect(config.scopes).toContain('openid')
      // Should not contain write permissions
      expect(config.scopes).not.toContain('Files.ReadWrite')
      expect(config.scopes).not.toContain('Files.ReadWrite.All')
    })

    it('should have proper security settings for Google', () => {
      const config = OAuthSecurityConfig.google
      expect(config.settings.access_type).toBe('offline')
      expect(config.settings.prompt).toBe('consent')
      expect(config.settings.response_type).toBe('code')
    })

    it('should have proper security settings for Microsoft', () => {
      const config = OAuthSecurityConfig.microsoft
      expect(config.settings.response_type).toBe('code')
    })
  })
})
