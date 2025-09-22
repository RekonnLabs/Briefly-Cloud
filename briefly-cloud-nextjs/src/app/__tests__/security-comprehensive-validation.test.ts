/**
 * Comprehensive Security Validation Tests
 * 
 * Final validation that authentication middleware loop fixes
 * maintain all security measures and defense-in-depth principles.
 * Validates requirements 10.1-10.5 comprehensively.
 */

describe('Comprehensive Security Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Requirement 10.1: Security Headers Functionality', () => {
    it('should verify applySecurityHeaders continues working in middleware', async () => {
      // Read actual middleware file
      const fs = require('fs')
      const middlewareContent = fs.readFileSync('middleware.ts', 'utf8')
      
      // Verify security headers are imported and used
      expect(middlewareContent).toContain('applySecurityHeaders')
      expect(middlewareContent).toContain("from './src/app/lib/security/headers'")
      
      // Verify function is called on responses
      expect(middlewareContent).toContain('applySecurityHeaders(res)')
      expect(middlewareContent).toContain('applySecurityHeaders(unauthorizedResponse)')
    })

    it('should verify security headers module is intact', () => {
      const { applySecurityHeaders, PRODUCTION_SECURITY_HEADERS } = require('../lib/security/headers')
      
      // Function should exist and be callable
      expect(typeof applySecurityHeaders).toBe('function')
      
      // All required headers should be defined
      const requiredHeaders = [
        'Strict-Transport-Security',
        'X-Content-Type-Options', 
        'X-Frame-Options',
        'Referrer-Policy',
        'X-XSS-Protection',
        'Permissions-Policy'
      ]
      
      requiredHeaders.forEach(header => {
        expect(PRODUCTION_SECURITY_HEADERS[header]).toBeDefined()
        expect(typeof PRODUCTION_SECURITY_HEADERS[header]).toBe('string')
      })
    })
  })

  describe('Requirement 10.2: CSP and Security Headers Configuration', () => {
    it('should verify CSP configuration remains properly configured', () => {
      const { CONTENT_SECURITY_POLICY } = require('../lib/security/headers')
      
      // Both CSP policies should exist
      expect(CONTENT_SECURITY_POLICY.basic).toBeDefined()
      expect(CONTENT_SECURITY_POLICY.strict).toBeDefined()
      
      // Should contain essential security directives
      expect(CONTENT_SECURITY_POLICY.basic).toContain("default-src 'self'")
      expect(CONTENT_SECURITY_POLICY.basic).toContain("frame-ancestors 'none'")
      
      // Should allow required external services
      expect(CONTENT_SECURITY_POLICY.basic).toContain('https://api.openai.com')
      expect(CONTENT_SECURITY_POLICY.basic).toContain('https://*.supabase.co')
      expect(CONTENT_SECURITY_POLICY.basic).toContain('https://api.stripe.com')
    })

    it('should verify security headers have proper values', () => {
      const { PRODUCTION_SECURITY_HEADERS } = require('../lib/security/headers')
      
      // HSTS should be properly configured
      expect(PRODUCTION_SECURITY_HEADERS['Strict-Transport-Security'])
        .toBe('max-age=31536000; includeSubDomains; preload')
      
      // Frame options should prevent clickjacking
      expect(PRODUCTION_SECURITY_HEADERS['X-Frame-Options']).toBe('DENY')
      
      // Content type options should prevent MIME sniffing
      expect(PRODUCTION_SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff')
      
      // Referrer policy should be privacy-preserving
      expect(PRODUCTION_SECURITY_HEADERS['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    })
  })

  describe('Requirement 10.3: Defense-in-Depth Principles', () => {
    it('should verify multiple authentication layers are maintained', async () => {
      const middlewareContent = require('fs').readFileSync('middleware.ts', 'utf8')
      
      // Layer 1: Middleware should exclude app routes from gating
      expect(middlewareContent).toContain('/briefly/app/')
      expect(middlewareContent).toContain('Silent token refresh only')
      
      // Layer 2: API protection should be maintained
      expect(middlewareContent).toContain('/api/secure/')
      expect(middlewareContent).toContain('getUser()')
      
      // Layer 3: Security logging should be present
      expect(middlewareContent).toContain('logSecurityEvent')
    })

    it('should verify open redirect protection is maintained', () => {
      const { clampNext } = require('../lib/auth/utils')
      
      // Test various attack vectors
      const testCases = [
        { input: 'https://evil.com', expected: '/briefly/app/dashboard' },
        { input: '//evil.com', expected: '/briefly/app/dashboard' },
        { input: 'javascript:alert(1)', expected: '/briefly/app/dashboard' },
        { input: '/briefly/app/dashboard', expected: '/briefly/app/dashboard' },
        { input: '/auth/signin', expected: '/auth/signin' }
      ]
      
      testCases.forEach(({ input, expected }) => {
        expect(clampNext(input)).toBe(expected)
      })
    })

    it('should verify security event logging is maintained', () => {
      const { logger } = require('../lib/logger')
      
      expect(typeof logger.logSecurityEvent).toBe('function')
      
      // Should handle security events without throwing
      expect(() => {
        logger.logSecurityEvent('Test security event', {
          endpoint: '/api/secure/test',
          ip: '127.0.0.1',
          securityEvent: true,
          severity: 'medium'
        })
      }).not.toThrow()
    })
  })

  describe('Requirement 10.4: Authentication Fixes Security Impact', () => {
    it('should verify authentication fixes do not compromise middleware security', async () => {
      const middlewareContent = require('fs').readFileSync('middleware.ts', 'utf8')
      
      // Should still apply security headers
      expect(middlewareContent).toContain('applySecurityHeaders')
      
      // Should still protect API routes
      expect(middlewareContent).toContain('/api/secure/')
      
      // Should still log security events
      expect(middlewareContent).toContain('logSecurityEvent')
      
      // Should still have proper error responses
      expect(middlewareContent).toContain('status: 401')
      expect(middlewareContent).toContain('WWW-Authenticate')
    })

    it('should verify cookie security is maintained after auth fixes', async () => {
      const middlewareContent = require('fs').readFileSync('middleware.ts', 'utf8')
      
      // Should have proper cookie configuration
      expect(middlewareContent).toContain('getAll()')
      expect(middlewareContent).toContain('setAll(')
      
      // Should not have malformed cookie syntax
      expect(middlewareContent).not.toContain('.o')
      expect(middlewareContent).toContain('cookiesToSet')
    })

    it('should verify path exclusions remain secure', async () => {
      const middlewareContent = require('fs').readFileSync('middleware.ts', 'utf8')
      
      // Critical security exclusions should be maintained
      const securityCriticalExclusions = [
        '/auth/',           // OAuth flow
        '/api/health',      // Health checks
        '/_next',           // Static files
        '/favicon'          // Static files
      ]
      
      securityCriticalExclusions.forEach(exclusion => {
        expect(middlewareContent).toContain(exclusion)
      })
    })
  })

  describe('Requirement 10.5: Overall Security Validation', () => {
    it('should verify no security regressions in configuration', () => {
      const { PRODUCTION_SECURITY_HEADERS } = require('../lib/security/headers')
      
      // Should not contain insecure values
      Object.entries(PRODUCTION_SECURITY_HEADERS).forEach(([name, value]) => {
        expect(value).toBeDefined()
        expect(value.length).toBeGreaterThan(0)
        
        // Should not contain obviously insecure keywords
        expect(value.toLowerCase()).not.toContain('unsafe-eval')
        expect(value.toLowerCase()).not.toContain('unsafe-inline')
      })
    })

    it('should verify security documentation is maintained', () => {
      const { SECURITY_HEADERS_DOCUMENTATION } = require('../lib/security/headers')
      
      expect(SECURITY_HEADERS_DOCUMENTATION).toBeDefined()
      
      // Key headers should be documented for compliance
      const criticalHeaders = [
        'Strict-Transport-Security',
        'X-Frame-Options',
        'X-Content-Type-Options'
      ]
      
      criticalHeaders.forEach(header => {
        expect(SECURITY_HEADERS_DOCUMENTATION[header]).toBeDefined()
        expect(SECURITY_HEADERS_DOCUMENTATION[header].purpose).toBeDefined()
        expect(SECURITY_HEADERS_DOCUMENTATION[header].compliance).toBeDefined()
      })
    })

    it('should verify environment-based security application works', () => {
      const { applySecurityHeaders } = require('../lib/security/headers')
      
      const mockResponse = { headers: { set: jest.fn() } }
      
      // Production should apply headers
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'
      
      applySecurityHeaders(mockResponse)
      expect(mockResponse.headers.set).toHaveBeenCalled()
      
      // Development should not apply headers
      mockResponse.headers.set.mockClear()
      process.env.NODE_ENV = 'development'
      
      applySecurityHeaders(mockResponse)
      expect(mockResponse.headers.set).not.toHaveBeenCalled()
      
      // Restore environment
      process.env.NODE_ENV = originalEnv
    })

    it('should verify complete security stack integration', async () => {
      // Test that all security components work together
      const middlewareContent = require('fs').readFileSync('middleware.ts', 'utf8')
      const { applySecurityHeaders } = require('../lib/security/headers')
      const { clampNext } = require('../lib/auth/utils')
      const { logger } = require('../lib/logger')
      
      // All components should be available and functional
      expect(middlewareContent).toContain('applySecurityHeaders')
      expect(typeof applySecurityHeaders).toBe('function')
      expect(typeof clampNext).toBe('function')
      expect(typeof logger.logSecurityEvent).toBe('function')
      
      // Integration should work without errors
      expect(() => {
        const mockResponse = { headers: { set: jest.fn() } }
        applySecurityHeaders(mockResponse, { environment: 'production' })
        
        const safeUrl = clampNext('https://evil.com')
        expect(safeUrl).toBe('/briefly/app/dashboard')
        
        logger.logSecurityEvent('Integration test', { test: true })
      }).not.toThrow()
    })
  })

  describe('Security Compliance Validation', () => {
    it('should verify audit trail capabilities are maintained', () => {
      const { logger } = require('../lib/logger')
      
      // Should support structured security logging
      const securityEvent = {
        correlationId: crypto.randomUUID(),
        endpoint: '/api/secure/test',
        method: 'GET',
        ip: '192.168.1.1',
        userAgent: 'Test Browser',
        timestamp: new Date().toISOString(),
        securityEvent: true,
        severity: 'high'
      }
      
      expect(() => {
        logger.logSecurityEvent('Security validation test', securityEvent)
      }).not.toThrow()
    })

    it('should verify error response security is maintained', async () => {
      const middlewareContent = require('fs').readFileSync('middleware.ts', 'utf8')
      
      // Should have proper error response structure
      expect(middlewareContent).toContain('error: \'Unauthorized\'')
      expect(middlewareContent).toContain('message: \'Authentication required')
      expect(middlewareContent).toContain('correlationId')
      
      // Should have proper security headers
      expect(middlewareContent).toContain('Content-Type')
      expect(middlewareContent).toContain('WWW-Authenticate')
      expect(middlewareContent).toContain('X-Correlation-ID')
    })

    it('should verify production security readiness', () => {
      // Verify all security components are production-ready
      const { PRODUCTION_SECURITY_HEADERS, applySecurityHeaders } = require('../lib/security/headers')
      
      // Should have comprehensive security headers
      expect(Object.keys(PRODUCTION_SECURITY_HEADERS).length).toBeGreaterThan(5)
      
      // Should handle production environment correctly
      const mockResponse = { headers: { set: jest.fn() } }
      
      expect(() => {
        applySecurityHeaders(mockResponse, { environment: 'production' })
      }).not.toThrow()
    })
  })
})
