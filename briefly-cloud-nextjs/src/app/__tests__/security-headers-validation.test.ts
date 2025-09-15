/**
 * Security Headers Validation Tests
 * 
 * Tests to ensure security headers and configuration are properly maintained
 * after authentication middleware fixes. Validates requirements 10.1-10.5.
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
    redirect: jest.fn((url) => ({
      url,
      status: 302,
      headers: new Map()
    })),
    json: jest.fn((data) => ({
      status: 200,
      headers: new Map([['Content-Type', 'application/json']]),
      json: () => Promise.resolve(data)
    }))
  }
}))

import { NextRequest, NextResponse } from 'next/server'
import { applySecurityHeaders, PRODUCTION_SECURITY_HEADERS, CONTENT_SECURITY_POLICY } from '../lib/security/headers'

// Mock the middleware function
jest.mock('../lib/auth/supabase-server-readonly', () => ({
  createServerClientReadOnly: jest.fn(() => ({
    auth: {
      getUser: jest.fn(() => Promise.resolve({ data: { user: null }, error: null }))
    }
  }))
}))

describe('Security Headers Validation', () => {
  let mockRequest: NextRequest
  let mockResponse: NextResponse

  beforeEach(() => {
    // Reset environment
    process.env.NODE_ENV = 'production'
    
    // Create mock request
    mockRequest = new NextRequest('https://briefly.rekonnlabs.com/test') as any
    
    // Create mock response with proper headers map
    mockResponse = {
      headers: new Map(),
      cookies: {
        getAll: jest.fn(() => []),
        set: jest.fn()
      }
    } as any
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Security Headers Application', () => {
    it('should apply all production security headers in production environment', () => {
      // Apply security headers
      applySecurityHeaders(mockResponse, { environment: 'production' })

      // Verify all expected headers are present
      Object.entries(PRODUCTION_SECURITY_HEADERS).forEach(([name, value]) => {
        expect(mockResponse.headers.get(name)).toBe(value)
      })
    })

    it('should not apply security headers in development environment', () => {
      // Apply security headers in development
      applySecurityHeaders(mockResponse, { environment: 'development' })

      // Verify no security headers are applied
      Object.keys(PRODUCTION_SECURITY_HEADERS).forEach(name => {
        expect(mockResponse.headers.get(name)).toBeNull()
      })
    })

    it('should apply CSP when requested', () => {
      // Apply security headers with CSP
      applySecurityHeaders(mockResponse, { 
        environment: 'production',
        includeCSP: true,
        cspPolicy: 'basic'
      })

      // Verify CSP header is present
      expect(mockResponse.headers.get('Content-Security-Policy')).toBe(CONTENT_SECURITY_POLICY.basic)
    })

    it('should apply strict CSP when requested', () => {
      // Apply security headers with strict CSP
      applySecurityHeaders(mockResponse, { 
        environment: 'production',
        includeCSP: true,
        cspPolicy: 'strict'
      })

      // Verify strict CSP header is present
      expect(mockResponse.headers.get('Content-Security-Policy')).toBe(CONTENT_SECURITY_POLICY.strict)
    })
  })

  describe('Individual Security Headers', () => {
    beforeEach(() => {
      applySecurityHeaders(mockResponse, { environment: 'production' })
    })

    it('should set Strict-Transport-Security header correctly', () => {
      const header = mockResponse.headers.get('Strict-Transport-Security')
      expect(header).toBe('max-age=31536000; includeSubDomains; preload')
    })

    it('should set X-Content-Type-Options header correctly', () => {
      const header = mockResponse.headers.get('X-Content-Type-Options')
      expect(header).toBe('nosniff')
    })

    it('should set X-Frame-Options header correctly', () => {
      const header = mockResponse.headers.get('X-Frame-Options')
      expect(header).toBe('DENY')
    })

    it('should set Referrer-Policy header correctly', () => {
      const header = mockResponse.headers.get('Referrer-Policy')
      expect(header).toBe('strict-origin-when-cross-origin')
    })

    it('should set X-XSS-Protection header correctly', () => {
      const header = mockResponse.headers.get('X-XSS-Protection')
      expect(header).toBe('1; mode=block')
    })

    it('should set Permissions-Policy header correctly', () => {
      const header = mockResponse.headers.get('Permissions-Policy')
      expect(header).toBe('camera=(), microphone=(), geolocation=(), payment=()')
    })
  })

  describe('Middleware Security Integration', () => {
    // Mock the actual middleware function for testing
    const mockMiddleware = async (req: NextRequest) => {
      const { pathname } = req.nextUrl

      // Hard excludes
      if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/favicon') ||
        pathname.startsWith('/robots.txt') ||
        pathname.startsWith('/sitemap.xml') ||
        pathname.startsWith('/images/') ||
        pathname.startsWith('/auth/') ||
        pathname.startsWith('/briefly/app/') ||
        pathname.startsWith('/api/storage/google/callback') ||
        pathname.startsWith('/api/storage/microsoft/callback') ||
        pathname.startsWith('/api/billing/webhook') ||
        pathname.startsWith('/api/health')
      ) {
        return NextResponse.next()
      }

      const res = NextResponse.next()
      
      // Apply security headers
      applySecurityHeaders(res)
      
      return res
    }

    it('should apply security headers through middleware for protected routes', async () => {
      const request = new NextRequest('https://briefly.rekonnlabs.com/protected')
      const response = await mockMiddleware(request)

      // Verify security headers are applied
      Object.entries(PRODUCTION_SECURITY_HEADERS).forEach(([name, value]) => {
        expect(response.headers.get(name)).toBe(value)
      })
    })

    it('should not interfere with excluded routes', async () => {
      const excludedPaths = [
        '/_next/static/test.js',
        '/favicon.ico',
        '/robots.txt',
        '/auth/signin',
        '/briefly/app/dashboard',
        '/api/health',
        '/api/storage/google/callback'
      ]

      for (const path of excludedPaths) {
        const request = new NextRequest(`https://briefly.rekonnlabs.com${path}`)
        const response = await mockMiddleware(request)

        // Should return NextResponse.next() without modification
        expect(response).toBeInstanceOf(NextResponse)
      }
    })
  })

  describe('API Route Security Headers', () => {
    it('should apply security headers to API error responses', () => {
      // Simulate unauthorized API response
      const unauthorizedResponse = new NextResponse(
        JSON.stringify({ 
          error: 'Unauthorized', 
          message: 'Authentication required to access this resource',
          correlationId: 'test-id'
        }), 
        { 
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'WWW-Authenticate': 'Bearer',
            'X-Correlation-ID': 'test-id'
          }
        }
      )
      
      // Apply security headers
      applySecurityHeaders(unauthorizedResponse)
      
      // Verify security headers are present along with API headers
      Object.entries(PRODUCTION_SECURITY_HEADERS).forEach(([name, value]) => {
        expect(unauthorizedResponse.headers.get(name)).toBe(value)
      })
      
      // Verify API-specific headers are preserved
      expect(unauthorizedResponse.headers.get('Content-Type')).toBe('application/json')
      expect(unauthorizedResponse.headers.get('WWW-Authenticate')).toBe('Bearer')
      expect(unauthorizedResponse.headers.get('X-Correlation-ID')).toBe('test-id')
    })
  })

  describe('Defense-in-Depth Validation', () => {
    it('should maintain security headers across different response types', () => {
      const responseTypes = [
        NextResponse.next(),
        NextResponse.redirect('https://briefly.rekonnlabs.com/auth/signin'),
        new NextResponse('OK', { status: 200 }),
        new NextResponse('Unauthorized', { status: 401 }),
        new NextResponse('Internal Server Error', { status: 500 })
      ]

      responseTypes.forEach(response => {
        applySecurityHeaders(response)
        
        // All responses should have security headers
        Object.entries(PRODUCTION_SECURITY_HEADERS).forEach(([name, value]) => {
          expect(response.headers.get(name)).toBe(value)
        })
      })
    })

    it('should not compromise existing functionality', () => {
      // Test that security headers don't interfere with normal operations
      const response = NextResponse.json({ success: true })
      
      // Apply security headers
      applySecurityHeaders(response)
      
      // Verify original functionality is preserved
      expect(response.headers.get('Content-Type')).toContain('application/json')
      
      // Verify security headers are added
      Object.entries(PRODUCTION_SECURITY_HEADERS).forEach(([name, value]) => {
        expect(response.headers.get(name)).toBe(value)
      })
    })
  })

  describe('Security Configuration Validation', () => {
    it('should have proper HSTS configuration', () => {
      const hstsHeader = PRODUCTION_SECURITY_HEADERS['Strict-Transport-Security']
      
      // Verify HSTS includes required directives
      expect(hstsHeader).toContain('max-age=31536000') // 1 year
      expect(hstsHeader).toContain('includeSubDomains')
      expect(hstsHeader).toContain('preload')
    })

    it('should have proper frame options for clickjacking protection', () => {
      const frameOptions = PRODUCTION_SECURITY_HEADERS['X-Frame-Options']
      
      // Should deny all framing
      expect(frameOptions).toBe('DENY')
    })

    it('should have proper referrer policy for privacy', () => {
      const referrerPolicy = PRODUCTION_SECURITY_HEADERS['Referrer-Policy']
      
      // Should use strict policy
      expect(referrerPolicy).toBe('strict-origin-when-cross-origin')
    })

    it('should restrict dangerous permissions', () => {
      const permissionsPolicy = PRODUCTION_SECURITY_HEADERS['Permissions-Policy']
      
      // Should deny access to sensitive APIs
      expect(permissionsPolicy).toContain('camera=()')
      expect(permissionsPolicy).toContain('microphone=()')
      expect(permissionsPolicy).toContain('geolocation=()')
      expect(permissionsPolicy).toContain('payment=()')
    })
  })

  describe('CSP Configuration Validation', () => {
    it('should have secure basic CSP configuration', () => {
      const basicCSP = CONTENT_SECURITY_POLICY.basic
      
      // Should include required directives
      expect(basicCSP).toContain("default-src 'self'")
      expect(basicCSP).toContain("frame-ancestors 'none'")
      expect(basicCSP).toContain('https://api.openai.com')
      expect(basicCSP).toContain('https://*.supabase.co')
      expect(basicCSP).toContain('https://api.stripe.com')
    })

    it('should have secure strict CSP configuration', () => {
      const strictCSP = CONTENT_SECURITY_POLICY.strict
      
      // Should be more restrictive
      expect(strictCSP).toContain("default-src 'self'")
      expect(strictCSP).toContain("script-src 'self'") // No unsafe-inline
      expect(strictCSP).toContain("style-src 'self'") // No unsafe-inline
      expect(strictCSP).toContain("base-uri 'self'")
      expect(strictCSP).toContain("form-action 'self'")
    })
  })
})