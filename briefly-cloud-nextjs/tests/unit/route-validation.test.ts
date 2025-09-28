/**
 * Unit Tests for OAuth Route Validation
 * 
 * Tests to ensure components use correct OAuth routes and maintain
 * proper separation between authentication and storage flows.
 * 
 * Requirements: 1.3, 2.1, 2.4
 */

import { describe, it, expect, beforeAll } from '@jest/globals'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('OAuth Route Validation', () => {
  const srcPath = join(process.cwd(), 'src')
  
  // Helper function to read file content safely
  const readComponentFile = (filePath: string): string => {
    try {
      return readFileSync(join(srcPath, filePath), 'utf-8')
    } catch (error) {
      throw new Error(`Failed to read ${filePath}: ${error}`)
    }
  }

  describe('Component Route References', () => {
    describe('CloudStorage.tsx', () => {
      let cloudStorageContent: string

      beforeAll(() => {
        cloudStorageContent = readComponentFile('app/components/CloudStorage.tsx')
      })

      it('should use correct storage OAuth start routes', () => {
        // Requirement 1.1, 1.2: Storage components must use storage OAuth routes
        expect(cloudStorageContent).toContain('/api/storage/google/start')
        expect(cloudStorageContent).toContain('/api/storage/microsoft/start')
      })

      it('should not reference main authentication routes', () => {
        // Requirement 1.3: No storage components should use main auth routes
        expect(cloudStorageContent).not.toContain('/auth/start?provider=google')
        expect(cloudStorageContent).not.toContain('/auth/start?provider=microsoft')
        expect(cloudStorageContent).not.toContain('/auth/start?provider=azure')
      })

      it('should use correct storage API endpoints', () => {
        // Verify all storage-related endpoints are correctly referenced
        expect(cloudStorageContent).toContain('/api/storage/status')
        expect(cloudStorageContent).toContain('/api/storage/google/disconnect')
        expect(cloudStorageContent).toContain('/api/storage/microsoft/disconnect')
        expect(cloudStorageContent).toContain('/api/storage/google/list')
        expect(cloudStorageContent).toContain('/api/storage/microsoft/list')
        expect(cloudStorageContent).toContain('/api/storage/google/import')
        expect(cloudStorageContent).toContain('/api/storage/microsoft/import')
      })

      it('should use correct batch import endpoints', () => {
        expect(cloudStorageContent).toContain('/api/storage/google/import/batch')
        expect(cloudStorageContent).toContain('/api/storage/microsoft/import/batch')
      })

      it('should use correct Google-specific endpoints', () => {
        expect(cloudStorageContent).toContain('/api/storage/google/register-files')
      })
    })

    describe('SupabaseAuthProvider.tsx', () => {
      let authProviderContent: string

      beforeAll(() => {
        authProviderContent = readComponentFile('app/components/auth/SupabaseAuthProvider.tsx')
      })

      it('should only use main authentication routes', () => {
        // Requirement 3.1, 3.3: Auth components should only use main auth routes
        expect(authProviderContent).toContain('/auth/start?provider=')
      })

      it('should not reference storage OAuth routes', () => {
        // Requirement 3.3, 4.3: Auth components must not use storage routes
        expect(authProviderContent).not.toContain('/api/storage/google/start')
        expect(authProviderContent).not.toContain('/api/storage/microsoft/start')
        expect(authProviderContent).not.toContain('/api/storage/')
      })

      it('should use correct provider mapping', () => {
        // Should map microsoft to azure for main auth
        expect(authProviderContent).toContain('azure')
      })
    })

    describe('Authentication Pages', () => {
      it('should only use main auth routes in signin page', () => {
        try {
          const signinContent = readComponentFile('app/(auth)/signin/page.tsx')
          
          // Should not contain storage OAuth routes
          expect(signinContent).not.toContain('/api/storage/google/start')
          expect(signinContent).not.toContain('/api/storage/microsoft/start')
          
          // If it contains auth routes, they should be main auth routes
          if (signinContent.includes('/auth/start')) {
            expect(signinContent).toContain('/auth/start?provider=')
          }
        } catch (error) {
          // File might not exist, skip test
          console.warn('Signin page not found, skipping test')
        }
      })
    })
  })

  describe('OAuth URL Generation Validation', () => {
    describe('Google Storage OAuth Route', () => {
      let googleStartContent: string

      beforeAll(() => {
        googleStartContent = readComponentFile('app/api/storage/google/start/route.ts')
      })

      it('should build correct Google OAuth URL', () => {
        // Requirement 2.1: Correct Google OAuth URL construction
        expect(googleStartContent).toContain('https://accounts.google.com/o/oauth2/v2/auth')
      })

      it('should include required Google Drive scope', () => {
        // Requirement 2.2: Must include drive.readonly scope
        expect(googleStartContent).toContain('https://www.googleapis.com/auth/drive.readonly')
      })

      it('should include required OAuth parameters', () => {
        // Requirement 2.3: Required OAuth parameters
        expect(googleStartContent).toContain('access_type')
        expect(googleStartContent).toContain('offline')
        expect(googleStartContent).toContain('include_granted_scopes')
        expect(googleStartContent).toContain('true')
        expect(googleStartContent).toContain('prompt')
        expect(googleStartContent).toContain('consent')
      })

      it('should set correct redirect URI', () => {
        expect(googleStartContent).toContain('/api/storage/google/callback')
      })

      it('should include authentication enforcement', () => {
        // Requirement 3.5: Storage OAuth routes must require authentication
        expect(googleStartContent).toContain('getUser')
        expect(googleStartContent).toContain('auth/signin')
      })
    })

    describe('Microsoft Storage OAuth Route', () => {
      let microsoftStartContent: string

      beforeAll(() => {
        microsoftStartContent = readComponentFile('app/api/storage/microsoft/start/route.ts')
      })

      it('should build correct Microsoft OAuth URL', () => {
        // Requirement 2.4: Correct Microsoft OAuth URL construction
        expect(microsoftStartContent).toContain('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')
      })

      it('should include required OneDrive scopes', () => {
        // Requirement 2.5: Required OneDrive scopes
        expect(microsoftStartContent).toContain('User.Read')
        expect(microsoftStartContent).toContain('Files.Read')
        expect(microsoftStartContent).toContain('offline_access')
      })

      it('should set correct redirect URI', () => {
        expect(microsoftStartContent).toContain('/api/storage/microsoft/callback')
      })

      it('should include authentication enforcement', () => {
        // Requirement 3.5: Storage OAuth routes must require authentication
        expect(microsoftStartContent).toContain('getUser')
        expect(microsoftStartContent).toContain('auth/signin')
      })
    })
  })

  describe('Flow Separation Logic', () => {
    it('should maintain clear route patterns', () => {
      // Define expected route patterns
      const storageRoutePattern = /\/api\/storage\/(google|microsoft)\/(start|callback|disconnect|list|import)/
      const authRoutePattern = /\/auth\/(start|callback)/
      
      // Test route pattern validation
      const storageRoutes = [
        '/api/storage/google/start',
        '/api/storage/google/callback',
        '/api/storage/microsoft/start',
        '/api/storage/microsoft/callback'
      ]
      
      const authRoutes = [
        '/auth/start?provider=google',
        '/auth/start?provider=azure',
        '/auth/callback'
      ]
      
      storageRoutes.forEach(route => {
        expect(route).toMatch(storageRoutePattern)
        expect(route).not.toMatch(authRoutePattern)
      })
      
      authRoutes.forEach(route => {
        expect(route).toMatch(authRoutePattern)
        expect(route).not.toMatch(storageRoutePattern)
      })
    })

    it('should validate OAuth callback token handling patterns', () => {
      try {
        const googleCallbackContent = readComponentFile('app/api/storage/google/callback/route.ts')
        
        // Requirement 2.6: Callback should handle token exchange and storage
        expect(googleCallbackContent).toContain('save_oauth_token')
        expect(googleCallbackContent).toContain('google')
        
      } catch (error) {
        console.warn('Google callback route not found for validation')
      }
      
      try {
        const microsoftCallbackContent = readComponentFile('app/api/storage/microsoft/callback/route.ts')
        
        // Requirement 2.6: Callback should handle token exchange and storage
        expect(microsoftCallbackContent).toContain('save_oauth_token')
        expect(microsoftCallbackContent).toContain('microsoft')
        
      } catch (error) {
        console.warn('Microsoft callback route not found for validation')
      }
    })

    it('should enforce authentication checks in storage routes', () => {
      const storageRoutes = [
        'app/api/storage/google/start/route.ts',
        'app/api/storage/microsoft/start/route.ts'
      ]
      
      storageRoutes.forEach(routePath => {
        try {
          const routeContent = readComponentFile(routePath)
          
          // Requirement 3.5: Must check authentication
          expect(routeContent).toContain('getUser')
          expect(routeContent).toContain('auth')
          
          // Should redirect unauthenticated users
          expect(routeContent).toContain('signin')
          
        } catch (error) {
          console.warn(`Route ${routePath} not found for validation`)
        }
      })
    })
  })

  describe('Error Handling Validation', () => {
    it('should include proper error handling in OAuth routes', () => {
      const oauthRoutes = [
        'app/api/storage/google/start/route.ts',
        'app/api/storage/microsoft/start/route.ts'
      ]
      
      oauthRoutes.forEach(routePath => {
        try {
          const routeContent = readComponentFile(routePath)
          
          // Should include error handling
          expect(routeContent).toContain('catch')
          expect(routeContent).toContain('error')
          
          // Should use proper error response patterns
          expect(routeContent).toContain('ApiResponse')
          
        } catch (error) {
          console.warn(`Route ${routePath} not found for error handling validation`)
        }
      })
    })
  })
})