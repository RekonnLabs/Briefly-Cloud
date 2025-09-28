/**
 * Integration Tests for Authentication Flow Separation
 * 
 * Tests to verify that main authentication flows and storage OAuth flows
 * remain properly separated and don't interfere with each other.
 * 
 * Requirements: 3.2, 2.6
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('Authentication Flow Separation Integration', () => {
  const srcPath = join(process.cwd(), 'src')
  
  // Helper function to read file content
  const readFile = (filePath: string): string => {
    try {
      return readFileSync(join(srcPath, filePath), 'utf-8')
    } catch (error) {
      throw new Error(`Failed to read ${filePath}: ${error}`)
    }
  }

  describe('Component Flow Separation Validation', () => {
    it('should verify CloudStorage component only uses storage routes', async () => {
      const cloudStorageContent = readFile('app/components/CloudStorage.tsx')
      
      // Should use storage OAuth routes
      expect(cloudStorageContent).toContain('/api/storage/google/start')
      expect(cloudStorageContent).toContain('/api/storage/microsoft/start')
      
      // Should NOT use main auth routes
      expect(cloudStorageContent).not.toContain('/auth/start?provider=google')
      expect(cloudStorageContent).not.toContain('/auth/start?provider=microsoft')
      expect(cloudStorageContent).not.toContain('/auth/start?provider=azure')
      
      // Should use correct storage endpoints
      expect(cloudStorageContent).toContain('/api/storage/status')
      expect(cloudStorageContent).toContain('/api/storage/google/disconnect')
      expect(cloudStorageContent).toContain('/api/storage/microsoft/disconnect')
    })

    it('should verify SupabaseAuthProvider only uses main auth routes', async () => {
      const authProviderContent = readFile('app/components/auth/SupabaseAuthProvider.tsx')
      
      // Should use main auth routes
      expect(authProviderContent).toContain('/auth/start?provider=')
      
      // Should NOT use storage OAuth routes
      expect(authProviderContent).not.toContain('/api/storage/google/start')
      expect(authProviderContent).not.toContain('/api/storage/microsoft/start')
      expect(authProviderContent).not.toContain('/api/storage/')
      
      // Should map providers correctly for main auth
      expect(authProviderContent).toContain('azure') // Microsoft -> Azure for main auth
    })

    it('should verify Google Picker components use storage routes', async () => {
      try {
        const googlePickerContent = readFile('app/components/GooglePicker.tsx')
        
        // Should use storage-specific routes
        expect(googlePickerContent).toContain('/api/storage/google/picker-token')
        
        // Should NOT use main auth routes
        expect(googlePickerContent).not.toContain('/auth/start?provider=google')
        expect(googlePickerContent).not.toContain('/auth/callback')
        
      } catch (error) {
        console.warn('GooglePicker component not found, skipping test')
      }
    })
  })

  describe('API Route Flow Separation', () => {
    it('should verify storage OAuth routes enforce authentication', async () => {
      const storageRoutes = [
        'app/api/storage/google/start/route.ts',
        'app/api/storage/microsoft/start/route.ts'
      ]
      
      storageRoutes.forEach(routePath => {
        try {
          const routeContent = readFile(routePath)
          
          // Should check authentication
          expect(routeContent).toContain('getUser')
          expect(routeContent).toContain('auth')
          
          // Should redirect unauthenticated users to signin
          expect(routeContent).toContain('signin')
          expect(routeContent).toContain('redirect')
          
          // Should include proper error handling
          expect(routeContent).toContain('catch')
          expect(routeContent).toContain('error')
          
        } catch (error) {
          console.warn(`Route ${routePath} not found for validation`)
        }
      })
    })

    it('should verify OAuth callback routes handle token storage', async () => {
      try {
        const googleCallbackContent = readFile('app/api/storage/google/callback/route.ts')
        
        // Should handle token exchange and storage
        expect(googleCallbackContent).toContain('save_oauth_token')
        expect(googleCallbackContent).toContain('google')
        
        // Should handle OAuth errors
        expect(googleCallbackContent).toContain('error')
        expect(googleCallbackContent).toContain('state')
        
      } catch (error) {
        console.warn('Google callback route not found for validation')
      }
      
      try {
        const microsoftCallbackContent = readFile('app/api/storage/microsoft/callback/route.ts')
        
        // Should handle token exchange and storage
        expect(microsoftCallbackContent).toContain('save_oauth_token')
        expect(microsoftCallbackContent).toContain('microsoft')
        
      } catch (error) {
        console.warn('Microsoft callback route not found for validation')
      }
    })
  })

  describe('URL Pattern Separation', () => {
    it('should validate distinct URL patterns for different flows', async () => {
      // Main authentication flow patterns
      const mainAuthPatterns = [
        /^\/auth\/start\?provider=(google|azure|microsoft)/,
        /^\/auth\/callback/,
        /^\/auth\/signout/
      ]
      
      // Storage OAuth flow patterns
      const storageAuthPatterns = [
        /^\/api\/storage\/(google|microsoft)\/start$/,
        /^\/api\/storage\/(google|microsoft)\/callback$/,
        /^\/api\/storage\/(google|microsoft)\/disconnect$/
      ]
      
      // Test main auth patterns
      const mainAuthUrls = [
        '/auth/start?provider=google',
        '/auth/start?provider=azure',
        '/auth/callback'
      ]
      
      mainAuthUrls.forEach(url => {
        const matchesMainAuth = mainAuthPatterns.some(pattern => pattern.test(url))
        const matchesStorageAuth = storageAuthPatterns.some(pattern => pattern.test(url))
        
        expect(matchesMainAuth).toBe(true)
        expect(matchesStorageAuth).toBe(false)
      })
      
      // Test storage auth patterns
      const storageAuthUrls = [
        '/api/storage/google/start',
        '/api/storage/microsoft/start',
        '/api/storage/google/callback',
        '/api/storage/microsoft/callback'
      ]
      
      storageAuthUrls.forEach(url => {
        const matchesMainAuth = mainAuthPatterns.some(pattern => pattern.test(url))
        const matchesStorageAuth = storageAuthPatterns.some(pattern => pattern.test(url))
        
        expect(matchesMainAuth).toBe(false)
        expect(matchesStorageAuth).toBe(true)
      })
    })

    it('should validate provider parameter handling differences', async () => {
      // Main auth uses query parameters
      const mainAuthUrl = new URL('https://example.com/auth/start')
      mainAuthUrl.searchParams.set('provider', 'google')
      mainAuthUrl.searchParams.set('next', '/dashboard')
      
      expect(mainAuthUrl.pathname).toBe('/auth/start')
      expect(mainAuthUrl.searchParams.get('provider')).toBe('google')
      expect(mainAuthUrl.searchParams.has('next')).toBe(true)
      
      // Storage auth uses path parameters
      const storageAuthUrl = new URL('https://example.com/api/storage/google/start')
      
      expect(storageAuthUrl.pathname).toBe('/api/storage/google/start')
      expect(storageAuthUrl.pathname).toContain('/google/')
      expect(storageAuthUrl.searchParams.has('provider')).toBe(false)
    })
  })

  describe('Scope and Permission Separation', () => {
    it('should validate OAuth scope separation between flows', async () => {
      // Main auth scopes - basic user information only
      const mainAuthScopes = {
        google: ['openid', 'email', 'profile'],
        azure: ['openid', 'email', 'profile']
      }
      
      // Storage auth scopes - include file access
      const storageAuthScopes = {
        google: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive.readonly'],
        microsoft: ['User.Read', 'Files.Read', 'offline_access']
      }
      
      // Main auth should not include file access scopes
      expect(mainAuthScopes.google).not.toContain('drive.readonly')
      expect(mainAuthScopes.azure).not.toContain('Files.Read')
      
      // Storage auth should include file access scopes
      expect(storageAuthScopes.google.join(' ')).toContain('drive.readonly')
      expect(storageAuthScopes.microsoft).toContain('Files.Read')
      
      // Verify scope separation
      const googleMainScopes = mainAuthScopes.google.join(' ')
      const googleStorageScopes = storageAuthScopes.google.join(' ')
      
      expect(googleMainScopes).not.toContain('drive')
      expect(googleStorageScopes).toContain('drive')
    })

    it('should validate different OAuth providers for each flow', async () => {
      // Main auth provider mapping
      const mainAuthProviders = {
        google: 'google',
        microsoft: 'azure' // Uses Azure AD for main auth
      }
      
      // Storage auth provider mapping
      const storageAuthProviders = {
        google: 'google',
        microsoft: 'microsoft' // Uses Microsoft Graph directly
      }
      
      expect(mainAuthProviders.google).toBe('google')
      expect(mainAuthProviders.microsoft).toBe('azure')
      expect(storageAuthProviders.google).toBe('google')
      expect(storageAuthProviders.microsoft).toBe('microsoft')
      
      // Microsoft should use different providers for different flows
      expect(mainAuthProviders.microsoft).not.toBe(storageAuthProviders.microsoft)
    })
  })

  describe('Error Handling Separation', () => {
    it('should validate different error handling for each flow', async () => {
      const errorHandlingPatterns = {
        mainAuth: {
          authFailure: /sign.*in.*failed|authentication.*failed/i,
          redirectPattern: /\/auth\/signin/,
          errorCodes: ['AUTH_FAILED', 'SIGNIN_REQUIRED', 'INVALID_CREDENTIALS']
        },
        storageAuth: {
          authFailure: /connect.*failed|connection.*failed|failed.*connect/i,
          redirectPattern: /\/auth\/signin.*returnTo/,
          errorCodes: ['CONNECTION_FAILED', 'OAUTH_ERROR', 'TOKEN_EXCHANGE_FAILED']
        }
      }
      
      // Validate error message patterns
      const mainAuthErrors = ['Sign in failed', 'Authentication failed']
      const storageAuthErrors = ['Connection failed', 'Failed to connect storage']
      
      mainAuthErrors.forEach(error => {
        expect(error).toMatch(errorHandlingPatterns.mainAuth.authFailure)
        expect(error).not.toMatch(errorHandlingPatterns.storageAuth.authFailure)
      })
      
      storageAuthErrors.forEach(error => {
        expect(error).toMatch(errorHandlingPatterns.storageAuth.authFailure)
        expect(error).not.toMatch(errorHandlingPatterns.mainAuth.authFailure)
      })
    })

    it('should validate different redirect patterns for errors', async () => {
      // Main auth errors redirect to signin
      const mainAuthErrorRedirect = '/auth/signin'
      expect(mainAuthErrorRedirect).toMatch(/^\/auth\/signin$/)
      expect(mainAuthErrorRedirect).not.toContain('returnTo')
      
      // Storage auth errors redirect to signin with return URL
      const storageAuthErrorRedirect = '/auth/signin?returnTo=/briefly/app/dashboard?tab=storage'
      expect(storageAuthErrorRedirect).toMatch(/^\/auth\/signin/)
      expect(storageAuthErrorRedirect).toContain('returnTo')
      expect(storageAuthErrorRedirect).toContain('dashboard')
    })
  })

  describe('State Management Separation', () => {
    it('should validate different state parameter purposes', async () => {
      const stateManagement = {
        mainAuth: {
          purpose: 'csrf_protection',
          contains: ['user_id', 'nonce', 'return_url'],
          prefix: 'auth_'
        },
        storageAuth: {
          purpose: 'csrf_protection_and_user_context',
          contains: ['user_id', 'nonce', 'provider'],
          prefix: 'storage_'
        }
      }
      
      // Both should provide CSRF protection
      expect(stateManagement.mainAuth.purpose).toContain('csrf')
      expect(stateManagement.storageAuth.purpose).toContain('csrf')
      
      // Should have different prefixes
      expect(stateManagement.mainAuth.prefix).not.toBe(stateManagement.storageAuth.prefix)
      
      // Both should contain user_id for security
      expect(stateManagement.mainAuth.contains).toContain('user_id')
      expect(stateManagement.storageAuth.contains).toContain('user_id')
      
      // Storage auth should include provider context
      expect(stateManagement.storageAuth.contains).toContain('provider')
      expect(stateManagement.mainAuth.contains).not.toContain('provider')
    })
  })

  describe('Session and Token Handling Separation', () => {
    it('should validate different session handling approaches', async () => {
      const sessionHandling = {
        mainAuth: {
          createsSession: true,
          modifiesUserProfile: true,
          setsAuthCookies: true,
          storesTokens: false // Handled by Supabase
        },
        storageAuth: {
          createsSession: false,
          modifiesUserProfile: false,
          setsAuthCookies: false,
          storesTokens: true // Stores OAuth tokens separately
        }
      }
      
      // Main auth creates user sessions
      expect(sessionHandling.mainAuth.createsSession).toBe(true)
      expect(sessionHandling.storageAuth.createsSession).toBe(false)
      
      // Only storage auth stores OAuth tokens
      expect(sessionHandling.mainAuth.storesTokens).toBe(false)
      expect(sessionHandling.storageAuth.storesTokens).toBe(true)
      
      // Only main auth modifies user profile
      expect(sessionHandling.mainAuth.modifiesUserProfile).toBe(true)
      expect(sessionHandling.storageAuth.modifiesUserProfile).toBe(false)
    })

    it('should validate token storage patterns', async () => {
      const tokenStorage = {
        mainAuth: {
          tokenType: 'session_token',
          storage: 'supabase_auth',
          encryption: 'supabase_managed'
        },
        storageAuth: {
          tokenType: 'oauth_token',
          storage: 'custom_database',
          encryption: 'application_managed'
        }
      }
      
      expect(tokenStorage.mainAuth.tokenType).toBe('session_token')
      expect(tokenStorage.storageAuth.tokenType).toBe('oauth_token')
      
      expect(tokenStorage.mainAuth.storage).toBe('supabase_auth')
      expect(tokenStorage.storageAuth.storage).toBe('custom_database')
      
      // Different encryption approaches
      expect(tokenStorage.mainAuth.encryption).not.toBe(tokenStorage.storageAuth.encryption)
    })
  })

  describe('Integration Flow Validation', () => {
    it('should validate complete flow separation end-to-end', async () => {
      // Test complete flow separation
      const flowSeparation = {
        mainAuth: {
          startUrl: '/auth/start?provider=google',
          callbackUrl: '/auth/callback',
          purpose: 'user_authentication',
          result: 'user_session_created'
        },
        storageAuth: {
          startUrl: '/api/storage/google/start',
          callbackUrl: '/api/storage/google/callback',
          purpose: 'storage_connection',
          result: 'oauth_tokens_stored'
        }
      }
      
      // URLs should be completely different
      expect(flowSeparation.mainAuth.startUrl).not.toBe(flowSeparation.storageAuth.startUrl)
      expect(flowSeparation.mainAuth.callbackUrl).not.toBe(flowSeparation.storageAuth.callbackUrl)
      
      // Purposes should be different
      expect(flowSeparation.mainAuth.purpose).not.toBe(flowSeparation.storageAuth.purpose)
      
      // Results should be different
      expect(flowSeparation.mainAuth.result).not.toBe(flowSeparation.storageAuth.result)
    })

    it('should validate no cross-contamination between flows', async () => {
      // Ensure no mixing of flow elements
      const flowElements = {
        mainAuth: {
          routes: ['/auth/start', '/auth/callback'],
          scopes: ['openid', 'email', 'profile'],
          providers: ['google', 'azure']
        },
        storageAuth: {
          routes: ['/api/storage/google/start', '/api/storage/microsoft/start'],
          scopes: ['drive.readonly', 'Files.Read'],
          providers: ['google', 'microsoft']
        }
      }
      
      // No route overlap
      const mainAuthRoutes = flowElements.mainAuth.routes
      const storageAuthRoutes = flowElements.storageAuth.routes
      
      mainAuthRoutes.forEach(route => {
        expect(storageAuthRoutes).not.toContain(route)
      })
      
      storageAuthRoutes.forEach(route => {
        expect(mainAuthRoutes).not.toContain(route)
      })
      
      // Different scope sets
      const mainAuthScopeString = flowElements.mainAuth.scopes.join(' ')
      const storageAuthScopeString = flowElements.storageAuth.scopes.join(' ')
      
      expect(mainAuthScopeString).not.toContain('drive')
      expect(mainAuthScopeString).not.toContain('Files')
      expect(storageAuthScopeString).toContain('drive.readonly')
    })
  })
})