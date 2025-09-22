/**
 * Middleware Security Integration Tests
 * 
 * Tests to ensure middleware security functionality is maintained
 * after authentication loop fixes. Validates that security headers
 * and defense-in-depth principles continue working correctly.
 */

// Mock Next.js modules first
jest.mock('next/server', () => ({
  NextRequest: jest.fn().mockImplementation((url) => ({
    nextUrl: new URL(url),
    url,
    method: 'GET',
    headers: new Map(),
    cookies: new Map()
  })),
  NextResponse: {
    next: jest.fn(() => ({
      headers: new Map(),
      cookies: {
        getAll: jest.fn(() => []),
        set: jest.fn()
      }
    })),
    redirect: jest.fn(),
    json: jest.fn()
  }
}))

// Mock Supabase
jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn()
}))

// Mock security headers
jest.mock('../lib/security/headers', () => ({
  applySecurityHeaders: jest.fn()
}))

// Mock logger
jest.mock('../lib/logger', () => ({
  logger: {
    logSecurityEvent: jest.fn()
  }
}))

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const mockCreateServerClient = createServerClient as jest.MockedFunction<typeof createServerClient>
const mockApplySecurityHeaders = require('../lib/security/headers').applySecurityHeaders as jest.MockedFunction<any>
const mockLogger = require('../lib/logger').logger as jest.MockedFunction<any>

describe('Middleware Security Integration', () => {
  let mockSupabaseClient: any

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks()
    
    // Setup Supabase client mock
    mockSupabaseClient = {
      auth: {
        getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })),
        getUser: jest.fn(() => Promise.resolve({ data: { user: null }, error: null }))
      }
    }
    
    mockCreateServerClient.mockReturnValue(mockSupabaseClient)
    
    // Set production environment
    process.env.NODE_ENV = 'production'
  })

  describe('Security Headers Application', () => {
    it('should apply security headers to all non-excluded responses', async () => {
      const { middleware } = await import('../../middleware')
      
      const request = new NextRequest('https://briefly.rekonnlabs.com/protected-route')
      await middleware(request)
      
      // Verify applySecurityHeaders was called
      expect(mockApplySecurityHeaders).toHaveBeenCalled()
    })

    it('should apply security headers to API error responses', async () => {
      // Mock user as null for API protection
      mockSupabaseClient.auth.getUser.mockResolvedValue({ 
        data: { user: null }, 
        error: null 
      })
      
      const { middleware } = await import('../../middleware')
      
      const request = new NextRequest('https://briefly.rekonnlabs.com/api/secure/test')
      const response = await middleware(request)
      
      // Should return 401 response
      expect(response.status).toBe(401)
      
      // Verify security headers were applied to error response
      expect(mockApplySecurityHeaders).toHaveBeenCalledWith(expect.any(NextResponse))
    })

    it('should not apply security headers to excluded routes', async () => {
      const { middleware } = await import('../../middleware')
      
      const excludedRoutes = [
        '/_next/static/test.js',
        '/favicon.ico',
        '/auth/signin',
        '/briefly/app/dashboard',
        '/api/health'
      ]
      
      for (const route of excludedRoutes) {
        mockApplySecurityHeaders.mockClear()
        
        const request = new NextRequest(`https://briefly.rekonnlabs.com${route}`)
        await middleware(request)
        
        // Security headers should not be applied to excluded routes
        expect(mockApplySecurityHeaders).not.toHaveBeenCalled()
      }
    })
  })

  describe('Defense-in-Depth Validation', () => {
    it('should maintain security logging for unauthorized API access', async () => {
      // Mock user as null for API protection
      mockSupabaseClient.auth.getUser.mockResolvedValue({ 
        data: { user: null }, 
        error: null 
      })
      
      const { middleware } = await import('../../middleware')
      
      const request = new NextRequest('https://briefly.rekonnlabs.com/api/secure/sensitive-data', {
        headers: {
          'user-agent': 'Test Browser',
          'x-forwarded-for': '192.168.1.1'
        }
      })
      
      const response = await middleware(request)
      
      // Verify security event was logged
      expect(mockLogger.logSecurityEvent).toHaveBeenCalledWith(
        'Unauthorized API access attempt',
        expect.objectContaining({
          endpoint: '/api/secure/sensitive-data',
          method: 'GET',
          ip: '192.168.1.1',
          userAgent: 'Test Browser',
          securityEvent: true,
          severity: 'medium'
        })
      )
      
      // Verify proper error response
      expect(response.status).toBe(401)
      const responseBody = await response.json()
      expect(responseBody.error).toBe('Unauthorized')
      expect(responseBody.correlationId).toBeDefined()
    })

    it('should maintain silent token refresh without compromising security', async () => {
      const { middleware } = await import('../../middleware')
      
      const request = new NextRequest('https://briefly.rekonnlabs.com/some-route')
      await middleware(request)
      
      // Verify silent session refresh was called
      expect(mockSupabaseClient.auth.getSession).toHaveBeenCalled()
      
      // Verify security headers were still applied
      expect(mockApplySecurityHeaders).toHaveBeenCalled()
    })

    it('should handle authentication errors gracefully while maintaining security', async () => {
      // Mock authentication error
      mockSupabaseClient.auth.getSession.mockRejectedValue(new Error('Auth service unavailable'))
      
      const { middleware } = await import('../../middleware')
      
      const request = new NextRequest('https://briefly.rekonnlabs.com/protected-route')
      
      // Should not throw error
      await expect(middleware(request)).resolves.not.toThrow()
      
      // Security headers should still be applied
      expect(mockApplySecurityHeaders).toHaveBeenCalled()
    })
  })

  describe('Security Configuration Maintenance', () => {
    it('should maintain proper cookie configuration for security', async () => {
      const { middleware } = await import('../../middleware')
      
      const request = new NextRequest('https://briefly.rekonnlabs.com/test')
      await middleware(request)
      
      // Verify Supabase client was created with proper cookie configuration
      expect(mockCreateServerClient).toHaveBeenCalledWith(
        expect.any(String), // SUPABASE_URL
        expect.any(String), // SUPABASE_ANON_KEY
        expect.objectContaining({
          cookies: expect.objectContaining({
            getAll: expect.any(Function),
            setAll: expect.any(Function)
          })
        })
      )
    })

    it('should maintain canonical host redirect for security', async () => {
      // Set production environment
      process.env.NODE_ENV = 'production'
      
      const { middleware } = await import('../../middleware')
      
      const request = new NextRequest('https://wrong-host.com/test')
      const response = await middleware(request)
      
      // Should redirect to canonical host
      expect(response.status).toBe(308)
      expect(response.headers.get('location')).toContain('briefly.rekonnlabs.com')
    })

    it('should maintain proper API route protection', async () => {
      // Mock authenticated user for non-secure API
      mockSupabaseClient.auth.getUser.mockResolvedValue({ 
        data: { user: { id: 'user-123' } }, 
        error: null 
      })
      
      const { middleware } = await import('../../middleware')
      
      // Test secure API route with authenticated user
      const secureRequest = new NextRequest('https://briefly.rekonnlabs.com/api/secure/data')
      const secureResponse = await middleware(secureRequest)
      
      // Should allow access for authenticated user
      expect(secureResponse.status).not.toBe(401)
      
      // Security headers should still be applied
      expect(mockApplySecurityHeaders).toHaveBeenCalled()
    })
  })

  describe('Security Headers Consistency', () => {
    it('should apply security headers consistently across different response types', async () => {
      const { middleware } = await import('../../middleware')
      
      // Test different scenarios
      const scenarios = [
        { path: '/protected-route', expectedCalls: 1 },
        { path: '/api/secure/test', expectedCalls: 1 }, // Will be 401 but still gets headers
        { path: '/another-protected', expectedCalls: 1 }
      ]
      
      for (const scenario of scenarios) {
        mockApplySecurityHeaders.mockClear()
        
        const request = new NextRequest(`https://briefly.rekonnlabs.com${scenario.path}`)
        await middleware(request)
        
        expect(mockApplySecurityHeaders).toHaveBeenCalledTimes(scenario.expectedCalls)
      }
    })

    it('should not interfere with existing response headers', async () => {
      const { middleware } = await import('../../middleware')
      
      const request = new NextRequest('https://briefly.rekonnlabs.com/api/secure/test')
      const response = await middleware(request)
      
      // Verify API-specific headers are preserved
      expect(response.headers.get('Content-Type')).toBe('application/json')
      expect(response.headers.get('WWW-Authenticate')).toBe('Bearer')
      expect(response.headers.get('X-Correlation-ID')).toBeDefined()
      
      // Verify security headers were applied
      expect(mockApplySecurityHeaders).toHaveBeenCalledWith(expect.any(NextResponse))
    })
  })

  describe('Error Handling and Security', () => {
    it('should maintain security even when Supabase operations fail', async () => {
      // Mock Supabase failure
      mockSupabaseClient.auth.getSession.mockRejectedValue(new Error('Network error'))
      mockSupabaseClient.auth.getUser.mockRejectedValue(new Error('Network error'))
      
      const { middleware } = await import('../../middleware')
      
      const request = new NextRequest('https://briefly.rekonnlabs.com/protected-route')
      const response = await middleware(request)
      
      // Should still apply security headers even on auth failure
      expect(mockApplySecurityHeaders).toHaveBeenCalled()
      
      // Should not expose internal errors
      expect(response.status).not.toBe(500)
    })

    it('should handle malformed requests securely', async () => {
      const { middleware } = await import('../../middleware')
      
      // Test with malformed URL
      const request = new NextRequest('https://briefly.rekonnlabs.com/api/secure/test%00%01')
      
      // Should not throw error
      await expect(middleware(request)).resolves.not.toThrow()
      
      // Security headers should still be applied
      expect(mockApplySecurityHeaders).toHaveBeenCalled()
    })
  })
})
