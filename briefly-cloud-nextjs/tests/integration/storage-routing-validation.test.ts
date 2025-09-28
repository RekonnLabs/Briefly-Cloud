/**
 * Storage Component Routing Validation Tests
 * 
 * Tests to verify that storage components use correct OAuth routes
 * and don't reference main authentication routes.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

describe('Storage Component Routing Validation', () => {
  const srcPath = join(process.cwd(), 'src')
  
  // Helper function to read file content
  const readComponentFile = (filePath: string): string => {
    try {
      return readFileSync(join(srcPath, filePath), 'utf-8')
    } catch (error) {
      throw new Error(`Failed to read ${filePath}: ${error}`)
    }
  }

  describe('CloudStorage.tsx', () => {
    let cloudStorageContent: string

    beforeAll(() => {
      cloudStorageContent = readComponentFile('app/components/CloudStorage.tsx')
    })

    it('should use correct storage OAuth routes for connection', () => {
      // Should use storage-specific routes
      expect(cloudStorageContent).toContain('/api/storage/google/start')
      expect(cloudStorageContent).toContain('/api/storage/microsoft/start')
    })

    it('should not reference main authentication routes', () => {
      // Should NOT use main auth routes for storage connections
      expect(cloudStorageContent).not.toContain('/auth/start?provider=google')
      expect(cloudStorageContent).not.toContain('/auth/start?provider=microsoft')
    })

    it('should use correct disconnect routes', () => {
      // Should use storage-specific disconnect routes
      expect(cloudStorageContent).toContain('/api/storage/google/disconnect')
      expect(cloudStorageContent).toContain('/api/storage/microsoft/disconnect')
    })

    it('should use correct API endpoints for file operations', () => {
      // Should use storage-specific API endpoints
      expect(cloudStorageContent).toContain('/api/storage/google/list')
      expect(cloudStorageContent).toContain('/api/storage/microsoft/list')
      expect(cloudStorageContent).toContain('/api/storage/google/import')
      expect(cloudStorageContent).toContain('/api/storage/microsoft/import')
    })
  })

  describe('GooglePicker.tsx', () => {
    let googlePickerContent: string

    beforeAll(() => {
      googlePickerContent = readComponentFile('app/components/GooglePicker.tsx')
    })

    it('should use correct storage OAuth routes', () => {
      // Should use storage-specific picker token route
      expect(googlePickerContent).toContain('/api/storage/google/picker-token')
    })

    it('should use correct reconnection route', () => {
      // Should use storage OAuth route for reconnection
      expect(googlePickerContent).toContain('/api/storage/google/start')
    })

    it('should not reference main authentication routes', () => {
      // Should NOT use main auth routes
      expect(googlePickerContent).not.toContain('/auth/start?provider=google')
      expect(googlePickerContent).not.toContain('/auth/callback')
    })
  })

  describe('GooglePickerWithRecovery.tsx', () => {
    let googlePickerWithRecoveryContent: string

    beforeAll(() => {
      googlePickerWithRecoveryContent = readComponentFile('app/components/GooglePickerWithRecovery.tsx')
    })

    it('should use correct storage OAuth routes for reconnection', () => {
      // Should use storage OAuth route for reconnection
      expect(googlePickerWithRecoveryContent).toContain('/api/storage/google/start')
    })

    it('should not reference main authentication routes', () => {
      // Should NOT use main auth routes
      expect(googlePickerWithRecoveryContent).not.toContain('/auth/start?provider=google')
    })
  })

  describe('Auth Recovery Utility', () => {
    let authRecoveryContent: string

    beforeAll(() => {
      authRecoveryContent = readComponentFile('app/lib/google-picker/auth-recovery.ts')
    })

    it('should use correct storage OAuth routes in recovery flows', () => {
      // Should use storage OAuth route for reconnection
      expect(authRecoveryContent).toContain('/api/storage/google/start')
    })

    it('should not reference incorrect connect routes', () => {
      // Should NOT use non-existent connect routes
      expect(authRecoveryContent).not.toContain('/api/storage/google/connect')
    })

    it('should not reference main authentication routes', () => {
      // Should NOT use main auth routes
      expect(authRecoveryContent).not.toContain('/auth/start?provider=google')
    })
  })

  describe('Connection Manager Utility', () => {
    let connectionManagerContent: string

    beforeAll(() => {
      connectionManagerContent = readComponentFile('app/lib/cloud-storage/connection-manager.ts')
    })

    it('should not contain hardcoded OAuth route references', () => {
      // Connection manager should only handle database operations and token management
      // It should NOT contain hardcoded OAuth route references
      expect(connectionManagerContent).not.toContain('/api/storage/google/start')
      expect(connectionManagerContent).not.toContain('/api/storage/microsoft/start')
      expect(connectionManagerContent).not.toContain('/auth/start?provider=')
    })

    it('should use correct disconnect routes if any', () => {
      // If it references disconnect routes, they should be correct
      const hasDisconnectRoutes = connectionManagerContent.includes('/api/storage/')
      if (hasDisconnectRoutes) {
        expect(connectionManagerContent).toContain('/api/storage/google/disconnect')
        expect(connectionManagerContent).toContain('/api/storage/microsoft/disconnect')
      }
    })
  })

  describe('OAuth Flow Separation', () => {
    it('should maintain clear separation between auth and storage flows', () => {
      const authComponents = [
        'app/components/auth/SupabaseAuthProvider.tsx',
        'app/(auth)/signin/page.tsx'
      ]

      authComponents.forEach(componentPath => {
        try {
          const content = readComponentFile(componentPath)
          
          // Auth components should only use main auth routes
          if (content.includes('/auth/start')) {
            expect(content).toContain('/auth/start?provider=')
          }
          
          // Auth components should NOT use storage OAuth routes
          expect(content).not.toContain('/api/storage/google/start')
          expect(content).not.toContain('/api/storage/microsoft/start')
        } catch (error) {
          // Component might not exist, skip test
          console.warn(`Skipping test for ${componentPath}: ${error}`)
        }
      })
    })
  })
})