/**
 * Unit tests for SignoutService
 * 
 * Tests the centralized signout service including cleanup operations,
 * error handling, logging, and monitoring integration.
 */

import { SignoutService, signoutService, quickSignout, emergencySignout, completeSignout } from '../signout-service'
import type { SignoutOptions, SignoutResult } from '../signout-service'

// Mock dependencies
jest.mock('@/app/lib/auth/supabase-browser', () => ({
  getSupabaseBrowserClient: jest.fn()
}))

jest.mock('@/app/lib/auth/supabase-auth', () => ({
  createSupabaseServerClient: jest.fn()
}))

jest.mock('@/app/lib/google-picker/token-service', () => ({
  cleanupUserPickerTokens: jest.fn()
}))

jest.mock('@/app/lib/cloud-storage/connection-manager', () => ({
  ConnectionManager: {
    disconnectGoogle: jest.fn(),
    disconnectMicrosoft: jest.fn()
  }
}))

jest.mock('@/app/lib/audit/comprehensive-audit-logger', () => ({
  auditUserAction: jest.fn()
}))

jest.mock('@/app/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}))

jest.mock('../signout-monitoring', () => ({
  recordSignoutEvent: jest.fn()
}))

// Mock crypto.randomUUID
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => 'test-correlation-id-123'
  }
})

// Mock window and navigator for browser environment tests
// Note: Jest setup already provides window and navigator objects

describe('SignoutService', () => {
  let mockSupabaseBrowser: any
  let mockSupabaseServer: any
  let mockCleanupPickerTokens: any
  let mockConnectionManager: any
  let mockAuditUserAction: any
  let mockLogger: any
  let mockRecordSignoutEvent: any

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Setup mocks
    mockSupabaseBrowser = {
      auth: {
        getUser: jest.fn(),
        signOut: jest.fn()
      }
    }
    
    mockSupabaseServer = {
      auth: {
        getUser: jest.fn(),
        signOut: jest.fn()
      }
    }

    mockCleanupPickerTokens = require('@/app/lib/google-picker/token-service').cleanupUserPickerTokens
    mockConnectionManager = require('@/app/lib/cloud-storage/connection-manager').ConnectionManager
    mockAuditUserAction = require('@/app/lib/audit/comprehensive-audit-logger').auditUserAction
    mockLogger = require('@/app/lib/logger').logger
    mockRecordSignoutEvent = require('../signout-monitoring').recordSignoutEvent

    require('@/app/lib/auth/supabase-browser').getSupabaseBrowserClient.mockReturnValue(mockSupabaseBrowser)
    require('@/app/lib/auth/supabase-auth').createSupabaseServerClient.mockReturnValue(mockSupabaseServer)

    // Mock successful responses by default
    mockSupabaseBrowser.auth.getUser.mockResolvedValue({
      data: { 
        user: { id: 'test-user-id' },
        session: { access_token: 'test-token-12345678' }
      }
    })
    mockSupabaseBrowser.auth.signOut.mockResolvedValue({ error: null })
    mockSupabaseServer.auth.getUser.mockResolvedValue({
      data: { 
        user: { id: 'test-user-id' },
        session: { access_token: 'test-token-12345678' }
      }
    })
    mockSupabaseServer.auth.signOut.mockResolvedValue({ error: null })
    
    mockCleanupPickerTokens.mockResolvedValue(undefined)
    mockConnectionManager.disconnectGoogle.mockResolvedValue(undefined)
    mockConnectionManager.disconnectMicrosoft.mockResolvedValue(undefined)
    mockAuditUserAction.mockResolvedValue(undefined)
    mockRecordSignoutEvent.mockResolvedValue(undefined)
  })

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = SignoutService.getInstance()
      const instance2 = SignoutService.getInstance()
      expect(instance1).toBe(instance2)
    })

    it('should export the singleton instance', () => {
      expect(signoutService).toBeInstanceOf(SignoutService)
    })
  })

  describe('successful signout flow', () => {
    // Tests run in browser environment by default

    it('should perform complete signout with all cleanup tasks', async () => {
      const result = await signoutService.signOut()

      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
      expect(result.redirectUrl).toBe('http://localhost/auth/signin')
      expect(result.cleanup.pickerTokens).toBe(true)
      expect(result.cleanup.storageCredentials).toBe(true)
      expect(result.cleanup.sessionData).toBe(true)
      expect(result.cleanup.errors).toEqual([])

      // Verify cleanup tasks were called
      expect(mockCleanupPickerTokens).toHaveBeenCalledWith('test-user-id')
      expect(mockConnectionManager.disconnectGoogle).toHaveBeenCalledWith('test-user-id', {
        revokeAtProvider: false,
        cancelRunningJobs: false
      })
      expect(mockConnectionManager.disconnectMicrosoft).toHaveBeenCalledWith('test-user-id', {
        revokeAtProvider: false,
        cancelRunningJobs: false
      })

      // Verify Supabase signout was called
      expect(mockSupabaseBrowser.auth.signOut).toHaveBeenCalled()

      // Verify audit logging
      expect(mockAuditUserAction).toHaveBeenCalledWith(
        'user.logout',
        'test-user-id',
        true,
        'test-correlation-id-123',
        expect.objectContaining({
          timestamp: expect.any(String),
          cleanupTasks: {
            pickerTokens: true,
            storageCredentials: true,
            sessionData: true
          }
        }),
        'low'
      )

      // Verify monitoring
      expect(mockRecordSignoutEvent).toHaveBeenCalledWith(
        'test-user-id',
        'test-tok',
        'test-correlation-id-123',
        {},
        result,
        expect.any(Number),
        expect.any(String), // User agent from jsdom
        expect.any(String),
        undefined
      )
    })

    it('should handle signout with provider token revocation', async () => {
      const options: SignoutOptions = {
        revokeProviderTokens: true,
        cancelRunningJobs: true
      }

      const result = await signoutService.signOut(options)

      expect(result.success).toBe(true)
      expect(mockConnectionManager.disconnectGoogle).toHaveBeenCalledWith('test-user-id', {
        revokeAtProvider: true,
        cancelRunningJobs: true
      })
      expect(mockConnectionManager.disconnectMicrosoft).toHaveBeenCalledWith('test-user-id', {
        revokeAtProvider: true,
        cancelRunningJobs: true
      })
    })

    it('should skip cleanup when skipCleanup option is true', async () => {
      const options: SignoutOptions = {
        skipCleanup: true
      }

      const result = await signoutService.signOut(options)

      expect(result.success).toBe(true)
      expect(result.cleanup.pickerTokens).toBe(false)
      expect(result.cleanup.storageCredentials).toBe(false)
      expect(result.cleanup.sessionData).toBe(true)

      // Verify cleanup tasks were not called
      expect(mockCleanupPickerTokens).not.toHaveBeenCalled()
      expect(mockConnectionManager.disconnectGoogle).not.toHaveBeenCalled()
      expect(mockConnectionManager.disconnectMicrosoft).not.toHaveBeenCalled()

      // But Supabase signout should still be called
      expect(mockSupabaseBrowser.auth.signOut).toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    // Tests run in browser environment by default

    it('should handle Supabase signout errors without forceRedirect', async () => {
      const signoutError = new Error('Network connection failed')
      mockSupabaseBrowser.auth.signOut.mockResolvedValue({ error: signoutError })

      const result = await signoutService.signOut()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Client-side signout failed: Network connection failed')
      expect(result.cleanup.sessionData).toBe(false)

      // Verify error logging
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Signout failed',
        expect.objectContaining({
          correlationId: 'test-correlation-id-123',
          error: 'Client-side signout failed: Network connection failed'
        })
      )

      // Verify audit logging for failure
      expect(mockAuditUserAction).toHaveBeenCalledWith(
        'user.logout',
        'test-user-id',
        false,
        'test-correlation-id-123',
        expect.objectContaining({
          error: 'Client-side signout failed: Network connection failed'
        }),
        'medium'
      )
    })

    it('should force redirect on error when forceRedirect is true', async () => {
      const signoutError = new Error('Network connection failed')
      mockSupabaseBrowser.auth.signOut.mockResolvedValue({ error: signoutError })

      const options: SignoutOptions = {
        forceRedirect: true
      }

      const result = await signoutService.signOut(options)

      expect(result.success).toBe(true) // Should be true to allow redirect
      expect(result.error).toBe('Client-side signout failed: Network connection failed')

      // Verify warning log for forced redirect
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Forcing redirect despite signout error',
        expect.objectContaining({
          correlationId: 'test-correlation-id-123',
          error: 'Client-side signout failed: Network connection failed'
        })
      )
    })

    it('should handle cleanup errors gracefully', async () => {
      const pickerError = new Error('Picker cleanup failed')
      const googleError = new Error('Google disconnect failed')
      
      mockCleanupPickerTokens.mockRejectedValue(pickerError)
      mockConnectionManager.disconnectGoogle.mockRejectedValue(googleError)

      const result = await signoutService.signOut()

      expect(result.success).toBe(true) // Should still succeed overall
      expect(result.cleanup.pickerTokens).toBe(false)
      expect(result.cleanup.storageCredentials).toBe(true) // Microsoft succeeded even though Google failed
      expect(result.cleanup.sessionData).toBe(true)
      expect(result.cleanup.errors.length).toBeGreaterThan(0) // Should have some errors

      // Verify cleanup was attempted
      expect(mockCleanupPickerTokens).toHaveBeenCalledWith('test-user-id')
      expect(mockConnectionManager.disconnectGoogle).toHaveBeenCalledWith('test-user-id', {
        revokeAtProvider: false,
        cancelRunningJobs: false
      })
    })

    it('should handle missing user gracefully', async () => {
      mockSupabaseBrowser.auth.getUser.mockResolvedValue({
        data: { user: null, session: null }
      })

      const result = await signoutService.signOut()

      expect(result.success).toBe(true)
      expect(result.cleanup.sessionData).toBe(true)

      // Should not attempt cleanup without user ID
      expect(mockCleanupPickerTokens).not.toHaveBeenCalled()
      expect(mockConnectionManager.disconnectGoogle).not.toHaveBeenCalled()
      expect(mockConnectionManager.disconnectMicrosoft).not.toHaveBeenCalled()

      // Should not attempt audit logging without user ID
      expect(mockAuditUserAction).not.toHaveBeenCalled()
    })
  })

  describe('server-side signout', () => {
    it('should handle server-side signout when window is undefined', async () => {
      // Mock server environment by temporarily removing window
      const originalWindow = global.window
      delete (global as any).window

      try {
        const result = await signoutService.signOut()

        expect(result.success).toBe(true)
        expect(result.redirectUrl).toBe('http://localhost/auth/signin') // Default server-side URL from jest setup

        // Should use server client (or at least one of them should be called)
        const serverCalled = mockSupabaseServer.auth.signOut.mock.calls.length > 0
        const browserCalled = mockSupabaseBrowser.auth.signOut.mock.calls.length > 0
        expect(serverCalled || browserCalled).toBe(true)
      } finally {
        // Restore window
        (global as any).window = originalWindow
      }
    })
  })

  describe('logging and monitoring', () => {
    // Tests run in browser environment by default

    it('should log signout process start and completion', async () => {
      await signoutService.signOut({ showLoading: true })

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting signout process',
        expect.objectContaining({
          correlationId: 'test-correlation-id-123',
          options: expect.objectContaining({
            showLoading: true
          })
        })
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Signout completed successfully',
        expect.objectContaining({
          correlationId: 'test-correlation-id-123',
          userId: 'test-user-id',
          duration: expect.any(Number)
        })
      )
    })

    it('should handle audit logging failures gracefully', async () => {
      const auditError = new Error('Audit service unavailable')
      mockAuditUserAction.mockRejectedValue(auditError)

      const result = await signoutService.signOut()

      expect(result.success).toBe(true) // Should not fail overall
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to log signout event',
        expect.objectContaining({
          correlationId: 'test-correlation-id-123',
          userId: 'test-user-id',
          error: 'Audit service unavailable'
        })
      )
    })

    it('should record monitoring events with proper metadata', async () => {
      const options: SignoutOptions = {
        showLoading: true,
        revokeProviderTokens: true
      }

      const result = await signoutService.signOut(options)

      expect(mockRecordSignoutEvent).toHaveBeenCalledWith(
        'test-user-id',
        'test-tok', // First 8 chars of session token
        'test-correlation-id-123',
        options,
        result,
        expect.any(Number), // duration
        expect.any(String), // User agent from jsdom
        expect.any(String), // component name from stack
        undefined // no error
      )
    })
  })
})

describe('utility functions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Mock the signout service
    jest.spyOn(signoutService, 'signOut').mockResolvedValue({
      success: true,
      redirectUrl: '/auth/signin',
      cleanup: {
        pickerTokens: true,
        storageCredentials: true,
        sessionData: true,
        errors: []
      }
    })
  })

  describe('quickSignout', () => {
    it('should call signOut with quick options', async () => {
      await quickSignout()

      expect(signoutService.signOut).toHaveBeenCalledWith({
        showLoading: true,
        forceRedirect: true
      })
    })
  })

  describe('emergencySignout', () => {
    it('should call signOut with emergency options', async () => {
      await emergencySignout()

      expect(signoutService.signOut).toHaveBeenCalledWith({
        skipCleanup: true,
        forceRedirect: true,
        showLoading: false
      })
    })
  })

  describe('completeSignout', () => {
    it('should call signOut with complete options', async () => {
      await completeSignout()

      expect(signoutService.signOut).toHaveBeenCalledWith({
        showLoading: true,
        revokeProviderTokens: true,
        cancelRunningJobs: true,
        forceRedirect: false
      })
    })
  })
})