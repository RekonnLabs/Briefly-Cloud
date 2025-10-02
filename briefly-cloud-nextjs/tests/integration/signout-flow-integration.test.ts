/**
 * Integration tests for complete signout flow
 * 
 * Tests the end-to-end signout process including API routes,
 * service integration, component behavior, and error recovery.
 */

// Mock Request for testing
class MockRequest {
  url: string
  method: string
  headers: Map<string, string>
  private _body: string

  constructor(url: string, init: any = {}) {
    this.url = url
    this.method = init.method || 'GET'
    this.headers = new Map()
    this._body = init.body || ''
    
    if (init.headers) {
      Object.entries(init.headers).forEach(([key, value]) => {
        this.headers.set(key, value as string)
      })
    }
  }

  async text() {
    return this._body
  }

  get(name: string) {
    return this.headers.get(name)
  }
}

// Set up global Request before any imports
if (typeof global.Request === 'undefined') {
  global.Request = MockRequest as any
}

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextRequest } from 'next/server'
import { POST as signoutRouteHandler } from '@/app/api/auth/signout/route'
import { signoutService } from '@/app/lib/auth/signout-service'
import type { SignoutResult } from '@/app/lib/auth/signout-service'

// Mock dependencies for integration testing
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

jest.mock('@/app/lib/auth/signout-monitoring', () => ({
  recordSignoutEvent: jest.fn()
}))

jest.mock('next/headers', () => ({
  headers: jest.fn(() => Promise.resolve({
    get: jest.fn((name: string) => {
      if (name === 'user-agent') return 'test-integration-agent'
      if (name === 'x-forwarded-for') return '192.168.1.100'
      return null
    })
  }))
}))

// Mock crypto.randomUUID
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => 'integration-test-correlation-id'
  }
})

describe('Signout Flow Integration Tests', () => {
  let mockSupabaseBrowser: any
  let mockSupabaseServer: any
  let mockCleanupPickerTokens: any
  let mockConnectionManager: any
  let mockAuditUserAction: any
  let mockRecordSignoutEvent: any

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Setup comprehensive mocks
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
    mockRecordSignoutEvent = require('@/app/lib/auth/signout-monitoring').recordSignoutEvent

    require('@/app/lib/auth/supabase-browser').getSupabaseBrowserClient.mockReturnValue(mockSupabaseBrowser)
    require('@/app/lib/auth/supabase-auth').createSupabaseServerClient.mockReturnValue(mockSupabaseServer)

    // Default successful responses
    mockSupabaseBrowser.auth.getUser.mockResolvedValue({
      data: { 
        user: { id: 'integration-test-user' },
        session: { access_token: 'integration-test-token-12345678' }
      }
    })
    mockSupabaseBrowser.auth.signOut.mockResolvedValue({ error: null })
    mockSupabaseServer.auth.getUser.mockResolvedValue({
      data: { 
        user: { id: 'integration-test-user' },
        session: { access_token: 'integration-test-token-12345678' }
      }
    })
    mockSupabaseServer.auth.signOut.mockResolvedValue({ error: null })
    
    mockCleanupPickerTokens.mockResolvedValue(undefined)
    mockConnectionManager.disconnectGoogle.mockResolvedValue(undefined)
    mockConnectionManager.disconnectMicrosoft.mockResolvedValue(undefined)
    mockAuditUserAction.mockResolvedValue(undefined)
    mockRecordSignoutEvent.mockResolvedValue(undefined)

    // Set environment
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000'
  })

  describe('complete successful signout flow', () => {
    it('should handle end-to-end signout with all components working together', async () => {
      // Mock browser environment
      Object.defineProperty(global, 'window', {
        value: { location: { origin: 'http://localhost:3000' } },
        writable: true
      })
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'integration-test-browser' },
        writable: true
      })

      // Step 1: Service layer signout
      const serviceResult = await signoutService.signOut({
        showLoading: true,
        revokeProviderTokens: true
      })

      expect(serviceResult.success).toBe(true)
      expect(serviceResult.cleanup.pickerTokens).toBe(true)
      expect(serviceResult.cleanup.storageCredentials).toBe(true)
      expect(serviceResult.cleanup.sessionData).toBe(true)

      // Step 2: API route handling
      const request = new NextRequest('http://localhost:3000/api/auth/signout', {
        method: 'POST',
        body: JSON.stringify({
          options: {
            revokeProviderTokens: true
          }
        }),
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'integration-test-browser'
        }
      })

      const response = await signoutRouteHandler(request)

      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toContain('/auth/signin')
      expect(response.headers.get('location')).toContain('message=signout_success')
      expect(response.headers.get('X-Signout-Status')).toBe('success')
      expect(response.headers.get('X-Correlation-Id')).toBe('integration-test-correlation-id')

      // Verify all cleanup tasks were executed
      expect(mockCleanupPickerTokens).toHaveBeenCalledWith('integration-test-user')
      expect(mockConnectionManager.disconnectGoogle).toHaveBeenCalledWith('integration-test-user', {
        revokeAtProvider: true,
        cancelRunningJobs: false
      })
      expect(mockConnectionManager.disconnectMicrosoft).toHaveBeenCalledWith('integration-test-user', {
        revokeAtProvider: true,
        cancelRunningJobs: false
      })

      // Verify audit logging
      expect(mockAuditUserAction).toHaveBeenCalledWith(
        'user.logout',
        'integration-test-user',
        true,
        'integration-test-correlation-id',
        expect.objectContaining({
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
        'integration-test-user',
        'integrat', // First 8 chars of session token
        'integration-test-correlation-id',
        expect.objectContaining({
          revokeProviderTokens: true
        }),
        serviceResult,
        expect.any(Number),
        'integration-test-browser',
        expect.any(String),
        undefined
      )

      // Cleanup
      delete (global as any).window
      delete (global as any).navigator
    })
  })

  describe('error recovery scenarios', () => {
    it('should handle partial cleanup failures gracefully', async () => {
      // Mock partial failures
      const pickerError = new Error('Google Picker service unavailable')
      const googleError = new Error('Google Drive API rate limited')
      
      mockCleanupPickerTokens.mockRejectedValue(pickerError)
      mockConnectionManager.disconnectGoogle.mockRejectedValue(googleError)
      // Microsoft cleanup succeeds
      mockConnectionManager.disconnectMicrosoft.mockResolvedValue(undefined)

      Object.defineProperty(global, 'window', {
        value: { location: { origin: 'http://localhost:3000' } },
        writable: true
      })

      const result = await signoutService.signOut()

      // Should still succeed overall
      expect(result.success).toBe(true)
      expect(result.cleanup.pickerTokens).toBe(false)
      expect(result.cleanup.storageCredentials).toBe(false) // Google failed
      expect(result.cleanup.sessionData).toBe(true)
      expect(result.cleanup.errors).toHaveLength(2)
      expect(result.cleanup.errors[0]).toContain('Google Picker service unavailable')
      expect(result.cleanup.errors[1]).toContain('Google Drive API rate limited')

      // Verify audit logging still occurs with partial success
      expect(mockAuditUserAction).toHaveBeenCalledWith(
        'user.logout',
        'integration-test-user',
        true, // Still successful overall
        'integration-test-correlation-id',
        expect.objectContaining({
          cleanupTasks: {
            pickerTokens: false,
            storageCredentials: false,
            sessionData: true
          }
        }),
        'low'
      )

      delete (global as any).window
    })

    it('should handle complete signout failure with forceRedirect', async () => {
      // Mock complete Supabase failure
      const supabaseError = new Error('Authentication service down')
      mockSupabaseBrowser.auth.signOut.mockResolvedValue({ error: supabaseError })

      Object.defineProperty(global, 'window', {
        value: { location: { origin: 'http://localhost:3000' } },
        writable: true
      })

      const result = await signoutService.signOut({ forceRedirect: true })

      // Should force success for redirect
      expect(result.success).toBe(true)
      expect(result.error).toBe('Client-side signout failed: Authentication service down')

      // API route should handle this gracefully
      const request = new NextRequest('http://localhost:3000/api/auth/signout', {
        method: 'POST',
        body: JSON.stringify({
          options: { forceRedirect: true }
        }),
        headers: { 'Content-Type': 'application/json' }
      })

      const response = await signoutRouteHandler(request)

      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toContain('message=signout_error')
      expect(response.headers.get('X-Signout-Status')).toBe('error')

      // Verify error audit logging
      expect(mockAuditUserAction).toHaveBeenCalledWith(
        'user.logout',
        'integration-test-user',
        false,
        'integration-test-correlation-id',
        expect.objectContaining({
          error: 'Client-side signout failed: Authentication service down'
        }),
        'medium'
      )

      delete (global as any).window
    })

    it('should handle network timeouts and retry scenarios', async () => {
      // Mock timeout error
      const timeoutError = new Error('Request timeout')
      mockSupabaseBrowser.auth.signOut.mockRejectedValue(timeoutError)

      Object.defineProperty(global, 'window', {
        value: { location: { origin: 'http://localhost:3000' } },
        writable: true
      })

      // First attempt fails
      const firstResult = await signoutService.signOut()
      expect(firstResult.success).toBe(false)
      expect(firstResult.error).toBe('Request timeout')

      // Reset mock for retry
      mockSupabaseBrowser.auth.signOut.mockResolvedValue({ error: null })

      // Retry with forceRedirect should succeed
      const retryResult = await signoutService.signOut({ forceRedirect: true })
      expect(retryResult.success).toBe(true)

      delete (global as any).window
    })
  })

  describe('security and validation', () => {
    it('should validate and sanitize error messages in API responses', async () => {
      // Mock error with sensitive information
      const sensitiveError = new Error('Database connection failed: host=db.internal.com user=admin password=secret123')
      mockSupabaseBrowser.auth.signOut.mockResolvedValue({ error: sensitiveError })

      const request = new NextRequest('http://localhost:3000/api/auth/signout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      const response = await signoutRouteHandler(request)

      expect(response.status).toBe(302)
      const location = response.headers.get('location')
      expect(location).toContain('error=service_unavailable')
      expect(location).not.toContain('password')
      expect(location).not.toContain('secret123')
      expect(location).not.toContain('db.internal.com')
    })

    it('should prevent open redirect attacks via returnUrl validation', async () => {
      const maliciousRequest = new NextRequest('http://localhost:3000/api/auth/signout', {
        method: 'POST',
        body: JSON.stringify({
          returnUrl: 'https://evil.com/steal-tokens'
        }),
        headers: { 'Content-Type': 'application/json' }
      })

      const response = await signoutRouteHandler(maliciousRequest)

      expect(response.status).toBe(302)
      const location = response.headers.get('location')
      expect(location).toContain('/auth/signin')
      expect(location).not.toContain('evil.com')
    })

    it('should handle missing or invalid user sessions gracefully', async () => {
      // Mock no user session
      mockSupabaseBrowser.auth.getUser.mockResolvedValue({
        data: { user: null, session: null }
      })
      mockSupabaseServer.auth.getUser.mockResolvedValue({
        data: { user: null, session: null }
      })

      const request = new NextRequest('http://localhost:3000/api/auth/signout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      const response = await signoutRouteHandler(request)

      // Should still redirect successfully
      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toContain('/auth/signin')
      expect(response.headers.get('X-Signout-Status')).toBe('success')

      // Should not attempt user-specific cleanup
      expect(mockCleanupPickerTokens).not.toHaveBeenCalled()
      expect(mockConnectionManager.disconnectGoogle).not.toHaveBeenCalled()
      expect(mockAuditUserAction).not.toHaveBeenCalled()
    })
  })

  describe('monitoring and observability', () => {
    it('should track signout performance metrics', async () => {
      Object.defineProperty(global, 'window', {
        value: { location: { origin: 'http://localhost:3000' } },
        writable: true
      })

      const startTime = Date.now()
      await signoutService.signOut({ showLoading: true })
      const endTime = Date.now()

      // Verify monitoring was called with duration
      expect(mockRecordSignoutEvent).toHaveBeenCalledWith(
        'integration-test-user',
        expect.any(String),
        'integration-test-correlation-id',
        expect.any(Object),
        expect.any(Object),
        expect.any(Number), // duration should be reasonable
        expect.any(String),
        expect.any(String),
        undefined
      )

      // Check that duration is reasonable (should be less than test timeout)
      const call = mockRecordSignoutEvent.mock.calls[0]
      const duration = call[5]
      expect(duration).toBeGreaterThan(0)
      expect(duration).toBeLessThan(5000) // Should complete within 5 seconds

      delete (global as any).window
    })

    it('should correlate logs across service and API layers', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/signout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      await signoutRouteHandler(request)

      // Verify correlation ID is consistent across all logging calls
      const auditCall = mockAuditUserAction.mock.calls[0]
      const monitoringCall = mockRecordSignoutEvent.mock.calls[0]

      expect(auditCall[3]).toBe('integration-test-correlation-id') // correlationId in audit
      expect(monitoringCall[2]).toBe('integration-test-correlation-id') // correlationId in monitoring
    })
  })
})