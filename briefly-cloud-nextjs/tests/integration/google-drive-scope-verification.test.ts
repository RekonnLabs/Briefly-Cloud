/**
 * Google Drive Scope Verification Test
 * Verifies that the OAuth configuration uses the correct drive.file scope
 */

import { getOAuthScopes, getOAuthSettings } from '../../src/app/lib/oauth/security-config'

describe('Google Drive Scope Verification', () => {
  it('should use drive.file scope instead of drive.readonly', () => {
    const scopes = getOAuthScopes('google')
    
    // Should include the new drive.file scope
    expect(scopes).toContain('https://www.googleapis.com/auth/drive.file')
    
    // Should NOT include the old drive.readonly scope
    expect(scopes).not.toContain('https://www.googleapis.com/auth/drive.readonly')
  })

  it('should include all required OAuth scopes', () => {
    const scopes = getOAuthScopes('google')
    const scopeArray = scopes.split(' ')
    
    // Should include all required scopes
    expect(scopeArray).toContain('openid')
    expect(scopeArray).toContain('email')
    expect(scopeArray).toContain('profile')
    expect(scopeArray).toContain('https://www.googleapis.com/auth/drive.file')
    
    // Should have exactly 4 scopes
    expect(scopeArray).toHaveLength(4)
  })

  it('should have correct OAuth settings for Google', () => {
    const settings = getOAuthSettings('google')
    
    expect(settings).toEqual({
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      response_type: 'code'
    })
  })

  it('should generate OAuth URL with drive.file scope', () => {
    const scopes = getOAuthScopes('google')
    const settings = getOAuthSettings('google')
    
    // Simulate OAuth URL generation
    const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    auth.searchParams.set('client_id', 'test-client-id')
    auth.searchParams.set('redirect_uri', 'http://localhost:3000/callback')
    auth.searchParams.set('scope', scopes)
    auth.searchParams.set('state', 'test-state')
    
    Object.entries(settings).forEach(([key, value]) => {
      auth.searchParams.set(key, value)
    })
    
    const url = auth.toString()
    
    // Verify the URL contains the correct scope (using + encoding for spaces)
    expect(url).toContain('scope=openid+email+profile+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.file')
    expect(url).toContain('access_type=offline')
    expect(url).toContain('prompt=consent')
    expect(url).not.toContain('drive.readonly')
  })

  it('should have security-focused scope descriptions', () => {
    const { getScopeDescriptions } = require('../../src/app/lib/oauth/security-config')
    const descriptions = getScopeDescriptions('google')
    
    expect(descriptions['https://www.googleapis.com/auth/drive.file']).toBe(
      'Access to files you select or create with this app'
    )
    
    // Should not have description for old scope
    expect(descriptions['https://www.googleapis.com/auth/drive.readonly']).toBeUndefined()
  })

  it('should validate scopes correctly', () => {
    const { validateScopes } = require('../../src/app/lib/oauth/security-config')
    
    // Valid scopes should pass
    const validScopes = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive.file']
    expect(validateScopes('google', validScopes)).toBe(true)
    
    // Invalid scopes should fail
    const invalidScopes = ['openid', 'https://www.googleapis.com/auth/drive.readonly']
    expect(validateScopes('google', invalidScopes)).toBe(false)
    
    // Extra scopes should fail
    const extraScopes = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive.file', 'extra-scope']
    expect(validateScopes('google', extraScopes)).toBe(false)
  })
})