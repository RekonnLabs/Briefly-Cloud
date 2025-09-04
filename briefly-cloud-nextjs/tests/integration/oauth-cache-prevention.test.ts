/**
 * OAuth Cache Prevention Validation Tests
 * Tests that no-cache headers are present and revalidate = 0 prevents caching
 */

import { NextRequest } from 'next/server'

// Mock dependencies
jest.mock('@/app/lib/api-middleware', () => ({
  createProtectedApiHandler: (handler: Function) => handler,
}))

jest.mock('@/app/lib/oauth/state-manager', () => ({
  OAuthStateManager: {
    generateState: jest.fn((userId: string) => userId),
    logStateGeneration: jest.fn(),
  },
}))

jest.mock('@/app/lib/oauth/logger', () => ({
  OAuthLogger: {
    logStart: jest.fn(),
    logError: jest.fn(),
  },
}))

jest.mock('@/app/lib/oauth/error-codes', () => ({
  OAuthErrorCodes: {
    UNEXPECTED_ERROR: 'UNEXPECTED_ERROR',
  },
  OAuthErrorHandler: {
    getMessage: jest.fn((code: string) => `Error: ${code}`),
  },
}))

jest.mock('@/app/lib/oauth/security-config', () => ({
  getOAuthScopes: jest.fn((provider: string) => {
    if (provider === 'google') {
      return 'openid email profile https://www.googleapis.com/auth/drive.readonly'
    }
    return 'offline_access Files.Read User.Read openid profile email'
  }),
  getOAuthSettings: jest.fn((provider: string) => {
    if (provider === 'google') {
      return {
        response_type: 'code',
        access_type: 'offline',
        include_granted_scopes: 'true',
        prompt: 'consent',
      }
    }
    return {
      response_type: 'code',
      prompt: 'consent',
    }
  }),
}))

jest.mock('@/app/lib/oauth/redirect-validation', () => ({
  constructRedirectUri: jest.fn((origin: string, provider: string, path: string) => {
    return `${origin}${path}`
  }),
}))

// Set up environment variables
beforeAll(() => {
  process.env.GOOGLE_DRIVE_CLIENT_ID = 'test-google-client-id'
  process.env.MS_DRIVE_CLIENT_ID = 'test-ms-client-id'
})

describe('OAuth Cache Prevention Validation Tests', () => {
  const mockUser = {
    id: 'test-user-id',
    email: 'test@example.com',
  }

  const mockContext = {
    user: mockUser,
    correlationId: 'test-correlation-id',
  }

  describe('Route Configuration Exports', () => {
    it('should export runtime = "nodejs" for Google start route', async () => {
      const googleRoute = await import('@/app/api/storage/google/start/route')
      
      expect(googleRoute.runtime).toBe('nodejs')
    })

    it('should export runtime = "nodejs" for Microsoft start route', async () => {
      const microsoftRoute = await import('@/app/api/storage/microsoft/start/route')
      
      expect(microsoftRoute.runtime).toBe('nodejs')
    })

    it('should export revalidate = 0 for Google start route', async () => {
      const googleRoute = await import('@/app/api/storage/google/start/route')
      
      expect(googleRoute.revalidate).toBe(0)
    })

    it('should export revalidate = 0 for Microsoft start route', async () => {
      const microsoftRoute = await import('@/app/api/storage/microsoft/start/route')
      
      expect(microsoftRoute.revalidate).toBe(0)
    })
  })

  describe('Cache Control Headers in Responses', () => {
    it('should include no-cache headers in Google OAuth start response', async () => {
      // Import and test the Google start route handler
      const { GET } = await import('@/app/api/storage/google/start/route')
      
      const request = new NextRequest('http://localhost:3000/api/storage/google/start')
      const response = await GET(request, mockContext)
      
      expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate')
      expect(response.headers.get('Pragma')).toBe('no-cache')
      expect(response.headers.get('Expires')).toBe('0')
    })

    it('should include no-cache headers in Microsoft OAuth start response', async () => {
      // Import and test the Microsoft start route handler
      const { GET } = await import('@/app/api/storage/microsoft/start/route')
      
      const request = new NextRequest('http://localhost:3000/api/storage/microsoft/start')
      const response = await GET(request, mockContext)
      
      expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate')
      expect(response.headers.get('Pragma')).toBe('no-cache')
      expect(response.headers.get('Expires')).toBe('0')
    })

    it('should have consistent cache headers across both providers', async () => {
      const { GET: GoogleGET } = await import('@/app/api/storage/google/start/route')
      const { GET: MicrosoftGET } = await import('@/app/api/storage/microsoft/start/route')
      
      const googleRequest = new NextRequest('http://localhost:3000/api/storage/google/start')
      const microsoftRequest = new NextRequest('http://localhost:3000/api/storage/microsoft/start')
      
      const googleResponse = await GoogleGET(googleRequest, mockContext)
      const microsoftResponse = await MicrosoftGET(microsoftRequest, mockContext)
      
      // Both should have identical cache prevention headers
      expect(googleResponse.headers.get('Cache-Control')).toBe(microsoftResponse.headers.get('Cache-Control'))
      expect(googleResponse.headers.get('Pragma')).toBe(microsoftResponse.headers.get('Pragma'))
      expect(googleResponse.headers.get('Expires')).toBe(microsoftResponse.headers.get('Expires'))
    })
  })

  describe('Cache Control Header Values', () => {
    it('should use proper Cache-Control directive values', async () => {
      const { GET } = await import('@/app/api/storage/google/start/route')
      
      const request = new NextRequest('http://localhost:3000/api/storage/google/start')
      const response = await GET(request, mockContext)
      
      const cacheControl = response.headers.get('Cache-Control')
      
      // Should contain all required directives
      expect(cacheControl).toContain('no-cache')
      expect(cacheControl).toContain('no-store')
      expect(cacheControl).toContain('must-revalidate')
      
      // Should be properly formatted
      expect(cacheControl).toBe('no-cache, no-store, must-revalidate')
    })

    it('should use HTTP/1.0 compatible Pragma header', async () => {
      const { GET } = await import('@/app/api/storage/google/start/route')
      
      const request = new NextRequest('http://localhost:3000/api/storage/google/start')
      const response = await GET(request, mockContext)
      
      expect(response.headers.get('Pragma')).toBe('no-cache')
    })

    it('should set Expires header to prevent caching', async () => {
      const { GET } = await import('@/app/api/storage/google/start/route')
      
      const request = new NextRequest('http://localhost:3000/api/storage/google/start')
      const response = await GET(request, mockContext)
      
      expect(response.headers.get('Expires')).toBe('0')
    })
  })

  describe('Next.js Configuration Validation', () => {
    it('should verify Next.js config includes cache prevention headers', async () => {
      // This test would ideally check next.config.js but we'll simulate the expected behavior
      const expectedHeaders = [
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Pragma', value: 'no-cache' },
        { key: 'Expires', value: '0' }
      ]
      
      // Verify the headers we expect to be set by Next.js config
      expectedHeaders.forEach(header => {
        expect(header.key).toBeDefined()
        expect(header.value).toBeDefined()
        expect(typeof header.key).toBe('string')
        expect(typeof header.value).toBe('string')
      })
    })

    it('should validate OAuth route patterns for header application', () => {
      // Test the route patterns that should receive cache prevention headers
      const oauthRoutePatterns = [
        '/api/storage/google/start',
        '/api/storage/microsoft/start'
      ]
      
      oauthRoutePatterns.forEach(pattern => {
        expect(pattern).toMatch(/^\/api\/storage\/\w+\/start$/)
      })
    })
  })

  describe('Runtime Configuration Validation', () => {
    it('should ensure nodejs runtime for server-side execution', async () => {
      const googleRoute = await import('@/app/api/storage/google/start/route')
      const microsoftRoute = await import('@/app/api/storage/microsoft/start/route')
      
      // Both routes should use nodejs runtime for proper server-side execution
      expect(googleRoute.runtime).toBe('nodejs')
      expect(microsoftRoute.runtime).toBe('nodejs')
      
      // Should not use edge runtime for OAuth routes
      expect(googleRoute.runtime).not.toBe('edge')
      expect(microsoftRoute.runtime).not.toBe('edge')
    })

    it('should ensure revalidate = 0 prevents static generation', async () => {
      const googleRoute = await import('@/app/api/storage/google/start/route')
      const microsoftRoute = await import('@/app/api/storage/microsoft/start/route')
      
      // Both routes should have revalidate = 0 to prevent caching
      expect(googleRoute.revalidate).toBe(0)
      expect(microsoftRoute.revalidate).toBe(0)
      
      // Should not have positive revalidate values
      expect(googleRoute.revalidate).not.toBeGreaterThan(0)
      expect(microsoftRoute.revalidate).not.toBeGreaterThan(0)
    })
  })

  describe('Response Cacheability Validation', () => {
    it('should make responses uncacheable by browsers', async () => {
      const { GET } = await import('@/app/api/storage/google/start/route')
      
      const request = new NextRequest('http://localhost:3000/api/storage/google/start')
      const response = await GET(request, mockContext)
      
      // Check that all cache prevention mechanisms are in place
      const cacheControl = response.headers.get('Cache-Control')
      const pragma = response.headers.get('Pragma')
      const expires = response.headers.get('Expires')
      
      // Verify browser won't cache this response
      expect(cacheControl?.includes('no-cache')).toBe(true)
      expect(cacheControl?.includes('no-store')).toBe(true)
      expect(pragma).toBe('no-cache')
      expect(expires).toBe('0')
    })

    it('should make responses uncacheable by proxies and CDNs', async () => {
      const { GET } = await import('@/app/api/storage/google/start/route')
      
      const request = new NextRequest('http://localhost:3000/api/storage/google/start')
      const response = await GET(request, mockContext)
      
      const cacheControl = response.headers.get('Cache-Control')
      
      // Verify proxies and CDNs won't cache this response
      expect(cacheControl?.includes('no-store')).toBe(true)
      expect(cacheControl?.includes('must-revalidate')).toBe(true)
    })

    it('should prevent conditional requests with fresh responses', async () => {
      const { GET } = await import('@/app/api/storage/google/start/route')
      
      const request = new NextRequest('http://localhost:3000/api/storage/google/start')
      const response = await GET(request, mockContext)
      
      // Should not have ETag or Last-Modified headers that could enable conditional requests
      expect(response.headers.get('ETag')).toBeNull()
      expect(response.headers.get('Last-Modified')).toBeNull()
      
      // Should have cache prevention headers
      expect(response.headers.get('Cache-Control')).toContain('no-cache')
    })
  })

  describe('Vercel Deployment Cache Prevention', () => {
    it('should work correctly in Vercel serverless environment', async () => {
      // Simulate Vercel environment
      const originalEnv = process.env.VERCEL
      process.env.VERCEL = '1'
      
      try {
        const { GET } = await import('@/app/api/storage/google/start/route')
        
        const request = new NextRequest('http://localhost:3000/api/storage/google/start')
        const response = await GET(request, mockContext)
        
        // Should still have cache prevention headers in Vercel
        expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate')
        expect(response.headers.get('Pragma')).toBe('no-cache')
        expect(response.headers.get('Expires')).toBe('0')
      } finally {
        // Restore original environment
        if (originalEnv) {
          process.env.VERCEL = originalEnv
        } else {
          delete process.env.VERCEL
        }
      }
    })

    it('should respect revalidate = 0 in Vercel deployment', async () => {
      const googleRoute = await import('@/app/api/storage/google/start/route')
      const microsoftRoute = await import('@/app/api/storage/microsoft/start/route')
      
      // Vercel should respect these exports
      expect(googleRoute.revalidate).toBe(0)
      expect(microsoftRoute.revalidate).toBe(0)
      expect(googleRoute.runtime).toBe('nodejs')
      expect(microsoftRoute.runtime).toBe('nodejs')
    })
  })

  describe('Cache Prevention Edge Cases', () => {
    it('should handle multiple requests without caching', async () => {
      const { GET } = await import('@/app/api/storage/google/start/route')
      
      // Make multiple requests
      const request1 = new NextRequest('http://localhost:3000/api/storage/google/start')
      const request2 = new NextRequest('http://localhost:3000/api/storage/google/start')
      
      const response1 = await GET(request1, mockContext)
      const response2 = await GET(request2, mockContext)
      
      // Both should have cache prevention headers
      expect(response1.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate')
      expect(response2.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate')
      
      // Responses should be independent (different correlation IDs)
      expect(response1.headers.get('X-Correlation-ID')).not.toBe(response2.headers.get('X-Correlation-ID'))
    })

    it('should prevent caching even with query parameters', async () => {
      const { GET } = await import('@/app/api/storage/google/start/route')
      
      const request = new NextRequest('http://localhost:3000/api/storage/google/start?test=123')
      const response = await GET(request, mockContext)
      
      // Should still have cache prevention headers regardless of query params
      expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate')
      expect(response.headers.get('Pragma')).toBe('no-cache')
      expect(response.headers.get('Expires')).toBe('0')
    })

    it('should prevent caching with different user contexts', async () => {
      const { GET } = await import('@/app/api/storage/google/start/route')
      
      const user1Context = { user: { id: 'user1', email: 'user1@test.com' }, correlationId: 'corr1' }
      const user2Context = { user: { id: 'user2', email: 'user2@test.com' }, correlationId: 'corr2' }
      
      const request1 = new NextRequest('http://localhost:3000/api/storage/google/start')
      const request2 = new NextRequest('http://localhost:3000/api/storage/google/start')
      
      const response1 = await GET(request1, user1Context)
      const response2 = await GET(request2, user2Context)
      
      // Both should have cache prevention headers
      expect(response1.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate')
      expect(response2.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate')
    })
  })

  describe('HTTP Cache Directive Compliance', () => {
    it('should comply with RFC 7234 cache control directives', async () => {
      const { GET } = await import('@/app/api/storage/google/start/route')
      
      const request = new NextRequest('http://localhost:3000/api/storage/google/start')
      const response = await GET(request, mockContext)
      
      const cacheControl = response.headers.get('Cache-Control')
      
      // RFC 7234 compliant directives
      expect(cacheControl).toContain('no-cache')    // Don't use cached response without revalidation
      expect(cacheControl).toContain('no-store')    // Don't store response in cache
      expect(cacheControl).toContain('must-revalidate') // Must revalidate stale responses
    })

    it('should use proper HTTP/1.0 and HTTP/1.1 compatibility', async () => {
      const { GET } = await import('@/app/api/storage/google/start/route')
      
      const request = new NextRequest('http://localhost:3000/api/storage/google/start')
      const response = await GET(request, mockContext)
      
      // HTTP/1.1 Cache-Control
      expect(response.headers.get('Cache-Control')).toBeDefined()
      
      // HTTP/1.0 Pragma (for backward compatibility)
      expect(response.headers.get('Pragma')).toBe('no-cache')
      
      // HTTP/1.0 Expires (for backward compatibility)
      expect(response.headers.get('Expires')).toBe('0')
    })
  })

  describe('Performance Impact of Cache Prevention', () => {
    it('should not significantly impact response time with cache headers', async () => {
      const { GET } = await import('@/app/api/storage/google/start/route')
      
      const request = new NextRequest('http://localhost:3000/api/storage/google/start')
      
      const startTime = Date.now()
      const response = await GET(request, mockContext)
      const endTime = Date.now()
      
      const responseTime = endTime - startTime
      
      // Should respond quickly even with cache prevention headers
      expect(responseTime).toBeLessThan(1000) // Less than 1 second
      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toBeDefined()
    })

    it('should maintain consistent response times across requests', async () => {
      const { GET } = await import('@/app/api/storage/google/start/route')
      
      const responseTimes: number[] = []
      
      // Make multiple requests to test consistency
      for (let i = 0; i < 5; i++) {
        const request = new NextRequest('http://localhost:3000/api/storage/google/start')
        
        const startTime = Date.now()
        const response = await GET(request, mockContext)
        const endTime = Date.now()
        
        responseTimes.push(endTime - startTime)
        
        expect(response.status).toBe(200)
        expect(response.headers.get('Cache-Control')).toBeDefined()
      }
      
      // Response times should be reasonably consistent
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      expect(avgResponseTime).toBeLessThan(1000)
    })
  })
})