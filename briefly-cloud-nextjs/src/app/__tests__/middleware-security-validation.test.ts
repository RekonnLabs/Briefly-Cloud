/**
 * Middleware Security Validation Tests
 * 
 * Tests to validate that middleware continues to apply security headers
 * and maintain security configuration after authentication loop fixes.
 * Validates requirements 10.1-10.5.
 */

describe('Middleware Security Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Middleware Security Headers Integration', () => {
    it('should import and use applySecurityHeaders function', async () => {
      // Read middleware file to verify it imports and uses security headers
      const fs = require('fs')
      const path = require('path')
      
      const middlewarePath = path.join(process.cwd(), 'middleware.ts')
      const middlewareContent = fs.readFileSync(middlewarePath, 'utf8')
      
      // Verify security headers import
      expect(middlewareContent).toContain('applySecurityHeaders')
      expect(middlewareContent).toContain("from './src/app/lib/security/headers'")
      
      // Verify security headers are applied
      expect(middlewareContent).toContain('applySecurityHeaders(')
    })

    it('should apply security headers to regular responses', async () => {
      const middlewareContent = require('fs').readFileSync(
        require('path').join(process.cwd(), 'middleware.ts'), 
        'utf8'
      )
      
      // Should apply security headers to the main response
      expect(middlewareContent).toContain('applySecurityHeaders(res)')
    })

    it('should apply security headers to error responses', async () => {
      const middlewareContent = require('fs').readFileSync(
        require('path').join(process.cwd(), 'middleware.ts'), 
        'utf8'
      )
      
      // Should apply security headers to unauthorized responses
      expect(middlewareContent).toContain('applySecurityHeaders(unauthorizedResponse)')
    })
  })

  describe('Middleware Security Configuration', () => {
    it('should maintain proper path exclusions for security', async () => {
      const middlewareContent = require('fs').readFileSync(
        require('path').join(process.cwd(), 'middleware.ts'), 
        'utf8'
      )
      
      // Verify critical path exclusions are maintained
      const requiredExclusions = [
        '/_next',
        '/favicon',
        '/robots.txt',
        '/auth/',
        '/api/health'
      ]
      
      requiredExclusions.forEach(exclusion => {
        expect(middlewareContent).toContain(exclusion)
      })
    })

    it('should maintain security logging for unauthorized access', async () => {
      const middlewareContent = require('fs').readFileSync(
        require('path').join(process.cwd(), 'middleware.ts'), 
        'utf8'
      )
      
      // Should log security events
      expect(middlewareContent).toContain('logSecurityEvent')
      expect(middlewareContent).toContain('Unauthorized API access attempt')
    })

    it('should maintain proper error response structure', async () => {
      const middlewareContent = require('fs').readFileSync(
        require('path').join(process.cwd(), 'middleware.ts'), 
        'utf8'
      )
      
      // Should include proper error response fields
      expect(middlewareContent).toContain('error: \'Unauthorized\'')
      expect(middlewareContent).toContain('correlationId')
      expect(middlewareContent).toContain('WWW-Authenticate')
    })
  })

  describe('Security Headers Application Logic', () => {
    it('should apply security headers in production environment', () => {
      // Mock production environment
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'
      
      const { applySecurityHeaders } = require('../lib/security/headers')
      const mockResponse = {
        headers: {
          set: jest.fn()
        }
      }
      
      applySecurityHeaders(mockResponse)
      
      // Should have called set for each security header
      expect(mockResponse.headers.set).toHaveBeenCalled()
      
      // Restore environment
      process.env.NODE_ENV = originalEnv
    })

    it('should not apply security headers in development environment', () => {
      // Mock development environment
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'
      
      const { applySecurityHeaders } = require('../lib/security/headers')
      const mockResponse = {
        headers: {
          set: jest.fn()
        }
      }
      
      applySecurityHeaders(mockResponse)
      
      // Should not have called set in development
      expect(mockResponse.headers.set).not.toHaveBeenCalled()
      
      // Restore environment
      process.env.NODE_ENV = originalEnv
    })
  })

  describe('Defense-in-Depth Security Validation', () => {
    it('should maintain API route protection logic', async () => {
      const middlewareContent = require('fs').readFileSync(
        require('path').join(process.cwd(), 'middleware.ts'), 
        'utf8'
      )
      
      // Should protect /api/secure/ routes
      expect(middlewareContent).toContain('/api/secure/')
      expect(middlewareContent).toContain('getUser()')
      expect(middlewareContent).toContain('status: 401')
    })

    it('should maintain silent token refresh', async () => {
      const middlewareContent = require('fs').readFileSync(
        require('path').join(process.cwd(), 'middleware.ts'), 
        'utf8'
      )
      
      // Should perform silent session refresh
      expect(middlewareContent).toContain('getSession()')
      expect(middlewareContent).toContain('Silent token refresh')
    })

    it('should maintain cookie security configuration', async () => {
      const middlewareContent = require('fs').readFileSync(
        require('path').join(process.cwd(), 'middleware.ts'), 
        'utf8'
      )
      
      // Should have proper cookie configuration
      expect(middlewareContent).toContain('getAll()')
      expect(middlewareContent).toContain('setAll(')
      expect(middlewareContent).toContain('cookiesToSet')
    })
  })

  describe('Security Regression Prevention', () => {
    it('should not have insecure configurations', async () => {
      const { PRODUCTION_SECURITY_HEADERS } = require('../lib/security/headers')
      
      // Check for potentially insecure values
      Object.entries(PRODUCTION_SECURITY_HEADERS).forEach(([name, value]) => {
        // Should not contain obviously insecure keywords
        expect(value.toLowerCase()).not.toContain('unsafe-eval')
        expect(value.toLowerCase()).not.toContain('unsafe-inline')
        
        // Should not be empty
        expect(value.length).toBeGreaterThan(0)
      })
    })

    it('should maintain open redirect protection', () => {
      const { clampNext } = require('../lib/auth/utils')
      
      // Test that open redirect protection still works
      const maliciousUrls = [
        'https://evil.com',
        '//evil.com',
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>'
      ]
      
      maliciousUrls.forEach(url => {
        expect(clampNext(url)).toBe('/briefly/app/dashboard')
      })
    })

    it('should maintain proper CORS and security headers', () => {
      const { PRODUCTION_SECURITY_HEADERS } = require('../lib/security/headers')
      
      // Verify key security headers are present and secure
      expect(PRODUCTION_SECURITY_HEADERS['X-Frame-Options']).toBe('DENY')
      expect(PRODUCTION_SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff')
      expect(PRODUCTION_SECURITY_HEADERS['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    })
  })

  describe('Compliance and Audit Requirements', () => {
    it('should maintain security event logging structure', () => {
      const { logger } = require('../lib/logger')
      
      // Test security event logging
      const mockEvent = {
        correlationId: 'test-123',
        endpoint: '/api/secure/test',
        method: 'GET',
        ip: '192.168.1.1',
        userAgent: 'Test Browser',
        timestamp: new Date().toISOString(),
        securityEvent: true,
        severity: 'medium'
      }
      
      expect(() => {
        logger.logSecurityEvent('Test unauthorized access', mockEvent)
      }).not.toThrow()
    })

    it('should maintain security headers documentation', () => {
      const { SECURITY_HEADERS_DOCUMENTATION } = require('../lib/security/headers')
      
      // Verify documentation exists for compliance
      const requiredHeaders = [
        'Strict-Transport-Security',
        'X-Content-Type-Options',
        'X-Frame-Options',
        'Referrer-Policy'
      ]
      
      requiredHeaders.forEach(header => {
        expect(SECURITY_HEADERS_DOCUMENTATION[header]).toBeDefined()
        expect(SECURITY_HEADERS_DOCUMENTATION[header].purpose).toBeDefined()
        expect(SECURITY_HEADERS_DOCUMENTATION[header].compliance).toBeDefined()
      })
    })

    it('should maintain proper HTTP status codes for security responses', async () => {
      const middlewareContent = require('fs').readFileSync(
        require('path').join(process.cwd(), 'middleware.ts'), 
        'utf8'
      )
      
      // Should use proper 401 status for unauthorized access
      expect(middlewareContent).toContain('status: 401')
      
      // Should use proper 308 status for canonical redirects
      expect(middlewareContent).toContain('308')
    })
  })

  describe('Performance and Security Balance', () => {
    it('should maintain efficient security header application', () => {
      const { applySecurityHeaders, PRODUCTION_SECURITY_HEADERS } = require('../lib/security/headers')
      
      // Should not apply too many headers (performance consideration)
      const headerCount = Object.keys(PRODUCTION_SECURITY_HEADERS).length
      expect(headerCount).toBeLessThan(20) // Reasonable limit
      expect(headerCount).toBeGreaterThan(3) // Minimum security
    })

    it('should maintain environment-based security application', () => {
      const { applySecurityHeaders } = require('../lib/security/headers')
      
      // Function should handle different environments
      const mockResponse = { headers: { set: jest.fn() } }
      
      // Should not throw for any environment
      expect(() => applySecurityHeaders(mockResponse, { environment: 'production' })).not.toThrow()
      expect(() => applySecurityHeaders(mockResponse, { environment: 'development' })).not.toThrow()
      expect(() => applySecurityHeaders(mockResponse, { environment: 'test' })).not.toThrow()
    })
  })
})
