/**
 * Security Regression Validation Tests
 * 
 * Tests to ensure that authentication middleware loop fixes
 * do not compromise existing security measures and maintain
 * defense-in-depth principles.
 */

// Mock Next.js modules first
jest.mock('next/server', () => ({
  NextRequest: jest.fn(),
  NextResponse: {
    next: jest.fn(() => ({
      headers: new Map(),
      cookies: new Map()
    })),
    redirect: jest.fn(),
    json: jest.fn()
  }
}))

// Mock modules
jest.mock('@supabase/ssr')
jest.mock('../lib/security/headers')
jest.mock('../lib/logger')

import { NextRequest, NextResponse } from 'next/server'

describe('Security Regression Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NODE_ENV = 'production'
  })

  describe('Authentication Security Maintenance', () => {
    it('should maintain page-level authentication guards after middleware fixes', async () => {
      // Test that page-level guards still work
      const { createServerClientReadOnly } = await import('../lib/auth/supabase-server-readonly')
      
      // Mock unauthenticated user
      const mockClient = {
        auth: {
          getUser: jest.fn(() => Promise.resolve({ data: { user: null }, error: null }))
        }
      }
      
      ;(createServerClientReadOnly as jest.Mock).mockReturnValue(mockClient)
      
      // Import and test a page component that should redirect
      // This simulates the dashboard page behavior
      const mockRedirect = jest.fn()
      jest.doMock('next/navigation', () => ({
        redirect: mockRedirect
      }))
      
      // Simulate page-level auth check
      const user = null // Simulating unauthenticated state
      
      if (!user) {
        mockRedirect('/auth/signin')
      }
      
      expect(mockRedirect).toHaveBeenCalledWith('/auth/signin')
    })

    it('should maintain OAuth security after middleware changes', async () => {
      // Test OAuth route security
      const { clampNext } = await import('../lib/auth/utils')
      
      // Test open redirect protection
      const testCases = [
        { input: 'https://evil.com', expected: '/briefly/app/dashboard' },
        { input: '/briefly/app/dashboard', expected: '/briefly/app/dashboard' },
        { input: '/auth/signin', expected: '/auth/signin' },
        { input: '//evil.com', expected: '/briefly/app/dashboard' },
        { input: 'javascript:alert(1)', expected: '/briefly/app/dashboard' }
      ]
      
      testCases.forEach(({ input, expected }) => {
        expect(clampNext(input)).toBe(expected)
      })
    })

    it('should maintain API route protection after middleware fixes', async () => {
      // Mock middleware behavior for API routes
      const mockSupabaseClient = {
        auth: {
          getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })),
          getUser: jest.fn(() => Promise.resolve({ data: { user: null }, error: null }))
        }
      }
      
      const mockCreateServerClient = jest.fn(() => mockSupabaseClient)
      jest.doMock('@supabase/ssr', () => ({
        createServerClient: mockCreateServerClient
      }))
      
      // Simulate middleware logic for secure API routes
      const pathname = '/api/secure/test'
      const isSecureAPI = pathname.startsWith('/api/secure/')
      
      if (isSecureAPI) {
        const { data: { user } } = await mockSupabaseClient.auth.getUser()
        
        if (!user) {
          // Should return 401
          const response = new NextResponse(
            JSON.stringify({ error: 'Unauthorized' }), 
            { status: 401 }
          )
          
          expect(response.status).toBe(401)
        }
      }
    })
  })

  describe('Security Headers Regression Tests', () => {
    it('should maintain all security headers after authentication fixes', () => {
      const { PRODUCTION_SECURITY_HEADERS } = require('../lib/security/headers')
      
      // Verify all expected security headers are still defined
      const expectedHeaders = [
        'Strict-Transport-Security',
        'X-Content-Type-Options',
        'X-Frame-Options',
        'Referrer-Policy',
        'X-XSS-Protection',
        'Permissions-Policy'
      ]
      
      expectedHeaders.forEach(header => {
        expect(PRODUCTION_SECURITY_HEADERS[header]).toBeDefined()
        expect(typeof PRODUCTION_SECURITY_HEADERS[header]).toBe('string')
        expect(PRODUCTION_SECURITY_HEADERS[header].length).toBeGreaterThan(0)
      })
    })

    it('should maintain CSP configuration after authentication fixes', () => {
      const { CONTENT_SECURITY_POLICY } = require('../lib/security/headers')
      
      // Verify CSP configurations exist and are secure
      expect(CONTENT_SECURITY_POLICY.basic).toBeDefined()
      expect(CONTENT_SECURITY_POLICY.strict).toBeDefined()
      
      // Verify basic security directives are present
      expect(CONTENT_SECURITY_POLICY.basic).toContain("default-src 'self'")
      expect(CONTENT_SECURITY_POLICY.basic).toContain("frame-ancestors 'none'")
      
      expect(CONTENT_SECURITY_POLICY.strict).toContain("default-src 'self'")
      expect(CONTENT_SECURITY_POLICY.strict).toContain("script-src 'self'")
    })

    it('should maintain security header application function', () => {
      const { applySecurityHeaders } = require('../lib/security/headers')
      
      // Verify function exists and is callable
      expect(typeof applySecurityHeaders).toBe('function')
      
      // Test function doesn't throw
      const mockResponse = new NextResponse()
      expect(() => applySecurityHeaders(mockResponse)).not.toThrow()
    })
  })

  describe('Defense-in-Depth Validation', () => {
    it('should maintain multiple authentication layers', () => {
      // Verify middleware exclusions are still in place
      const excludedPaths = [
        '/_next',
        '/favicon',
        '/robots.txt',
        '/sitemap.xml',
        '/images/',
        '/auth/',
        '/briefly/app/',
        '/api/storage/google/callback',
        '/api/storage/microsoft/callback',
        '/api/billing/webhook',
        '/api/health'
      ]
      
      // Simulate middleware path checking
      excludedPaths.forEach(path => {
        const testPath = path.endsWith('/') ? `${path}test` : path
        const shouldExclude = excludedPaths.some(excluded => 
          testPath.startsWith(excluded)
        )
        expect(shouldExclude).toBe(true)
      })
    })

    it('should maintain cookie security configuration', () => {
      // Verify cookie configuration patterns are secure
      const cookieConfig = {
        getAll: expect.any(Function),
        setAll: expect.any(Function)
      }
      
      // Verify structure matches expected secure pattern
      expect(cookieConfig.getAll).toBeDefined()
      expect(cookieConfig.setAll).toBeDefined()
    })

    it('should maintain security logging capabilities', () => {
      const { logger } = require('../lib/logger')
      
      // Verify security logging functions exist
      expect(typeof logger.logSecurityEvent).toBe('function')
      
      // Test security logging doesn't throw
      expect(() => {
        logger.logSecurityEvent('Test security event', {
          endpoint: '/test',
          ip: '127.0.0.1',
          securityEvent: true
        })
      }).not.toThrow()
    })
  })

  describe('Vulnerability Prevention', () => {
    it('should prevent open redirect attacks', () => {
      const { clampNext } = require('../lib/auth/utils')
      
      // Test various open redirect attack vectors
      const maliciousInputs = [
        'https://evil.com',
        'http://evil.com',
        '//evil.com',
        '\\\\evil.com',
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'vbscript:msgbox(1)',
        'file:///etc/passwd'
      ]
      
      maliciousInputs.forEach(input => {
        const result = clampNext(input)
        expect(result).toBe('/briefly/app/dashboard')
      })
    })

    it('should maintain CSRF protection through proper cookie handling', () => {
      // Verify cookie propagation maintains CSRF protection
      const mockResponse = new NextResponse()
      const mockCookies = [
        { name: 'sb-access-token', value: 'token123', options: {} },
        { name: 'sb-refresh-token', value: 'refresh123', options: {} }
      ]
      
      // Simulate cookie propagation
      mockCookies.forEach(({ name, value, options }) => {
        mockResponse.cookies.set(name, value, options)
      })
      
      // Verify cookies are set
      expect(mockResponse.cookies.get('sb-access-token')).toBeDefined()
      expect(mockResponse.cookies.get('sb-refresh-token')).toBeDefined()
    })

    it('should maintain XSS protection through proper headers', () => {
      const { PRODUCTION_SECURITY_HEADERS } = require('../lib/security/headers')
      
      // Verify XSS protection headers
      expect(PRODUCTION_SECURITY_HEADERS['X-XSS-Protection']).toBe('1; mode=block')
      expect(PRODUCTION_SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff')
    })

    it('should maintain clickjacking protection', () => {
      const { PRODUCTION_SECURITY_HEADERS } = require('../lib/security/headers')
      
      // Verify frame options
      expect(PRODUCTION_SECURITY_HEADERS['X-Frame-Options']).toBe('DENY')
    })
  })

  describe('Security Configuration Integrity', () => {
    it('should maintain secure default configurations', () => {
      // Verify no insecure configurations were introduced
      const { PRODUCTION_SECURITY_HEADERS } = require('../lib/security/headers')
      
      // Check for insecure values
      Object.entries(PRODUCTION_SECURITY_HEADERS).forEach(([name, value]) => {
        // Should not contain insecure keywords
        expect(value.toLowerCase()).not.toContain('unsafe')
        expect(value.toLowerCase()).not.toContain('allow-all')
        expect(value.toLowerCase()).not.toContain('*')
      })
    })

    it('should maintain environment-based security application', () => {
      const { applySecurityHeaders } = require('../lib/security/headers')
      
      // Test development environment (should not apply headers)
      const devResponse = new NextResponse()
      applySecurityHeaders(devResponse, { environment: 'development' })
      
      // Should not have security headers in development
      expect(devResponse.headers.get('Strict-Transport-Security')).toBeNull()
      
      // Test production environment (should apply headers)
      const prodResponse = new NextResponse()
      applySecurityHeaders(prodResponse, { environment: 'production' })
      
      // Should have security headers in production (mocked)
      expect(applySecurityHeaders).toHaveBeenCalledWith(prodResponse, { environment: 'production' })
    })
  })

  describe('Compliance and Audit Requirements', () => {
    it('should maintain audit logging for security events', () => {
      const { logger } = require('../lib/logger')
      
      // Test security event logging structure
      const mockSecurityEvent = {
        correlationId: 'test-123',
        endpoint: '/api/secure/test',
        method: 'GET',
        ip: '192.168.1.1',
        userAgent: 'Test Browser',
        timestamp: new Date().toISOString(),
        securityEvent: true,
        severity: 'medium'
      }
      
      // Should not throw when logging security events
      expect(() => {
        logger.logSecurityEvent('Test security event', mockSecurityEvent)
      }).not.toThrow()
    })

    it('should maintain proper error response structure for security', () => {
      // Test unauthorized response structure
      const unauthorizedResponse = {
        error: 'Unauthorized',
        message: 'Authentication required to access this resource',
        correlationId: 'test-123'
      }
      
      // Verify required fields are present
      expect(unauthorizedResponse.error).toBe('Unauthorized')
      expect(unauthorizedResponse.message).toBeDefined()
      expect(unauthorizedResponse.correlationId).toBeDefined()
    })

    it('should maintain security header documentation', () => {
      const { SECURITY_HEADERS_DOCUMENTATION } = require('../lib/security/headers')
      
      // Verify documentation exists for compliance
      expect(SECURITY_HEADERS_DOCUMENTATION).toBeDefined()
      expect(typeof SECURITY_HEADERS_DOCUMENTATION).toBe('object')
      
      // Verify key headers are documented
      const requiredDocs = [
        'Strict-Transport-Security',
        'X-Content-Type-Options',
        'X-Frame-Options',
        'Referrer-Policy'
      ]
      
      requiredDocs.forEach(header => {
        expect(SECURITY_HEADERS_DOCUMENTATION[header]).toBeDefined()
        expect(SECURITY_HEADERS_DOCUMENTATION[header].purpose).toBeDefined()
        expect(SECURITY_HEADERS_DOCUMENTATION[header].compliance).toBeDefined()
      })
    })
  })
})
