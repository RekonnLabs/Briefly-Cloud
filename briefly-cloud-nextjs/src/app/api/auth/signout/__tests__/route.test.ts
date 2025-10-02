/**
 * Tests for enhanced signout API route
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

// Mock dependencies before imports
jest.mock('@/app/lib/auth/signout-service', () => ({
  signoutService: {
    signOut: jest.fn()
  }
}))

jest.mock('@/app/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}))

jest.mock('@/app/lib/auth/supabase-auth', () => ({
  createSupabaseServerClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn(() => ({
        data: { user: { id: 'test-user-id' } }
      }))
    }
  }))
}))

jest.mock('next/headers', () => ({
  headers: jest.fn(() => Promise.resolve({
    get: jest.fn((name: string) => {
      if (name === 'user-agent') return 'test-agent'
      if (name === 'x-forwarded-for') return '127.0.0.1'
      return null
    })
  }))
}))

// Mock crypto.randomUUID
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => 'test-correlation-id'
  }
})

// Mock NextRequest
const mockNextRequest = (url: string, options: any = {}) => ({
  url,
  method: options.method || 'POST',
  text: jest.fn().mockResolvedValue(options.body || ''),
  headers: new Map([
    ['user-agent', 'test-agent'],
    ['x-forwarded-for', '127.0.0.1']
  ])
})

import { POST, GET } from '../route'

describe('Enhanced Signout API Route', () => {
  const mockSignoutService = require('@/app/lib/auth/signout-service').signoutService

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000'
  })

  describe('POST /api/auth/signout', () => {
    it('should handle successful signout and redirect', async () => {
      // Mock successful signout
      mockSignoutService.signOut.mockResolvedValue({
        success: true,
        redirectUrl: '/auth/signin',
        cleanup: {
          pickerTokens: true,
          storageCredentials: true,
          sessionData: true,
          errors: []
        }
      })

      const request = mockNextRequest('http://localhost:3000/api/auth/signout', {
        method: 'POST'
      }) as any

      const response = await POST(request)

      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toContain('/auth/signin')
      expect(response.headers.get('location')).toContain('message=signout_success')
      expect(response.headers.get('X-Signout-Status')).toBe('success')
      expect(response.headers.get('X-Correlation-Id')).toBe('test-correlation-id')
    })

    it('should handle signout failure and still redirect', async () => {
      // Mock failed signout
      mockSignoutService.signOut.mockResolvedValue({
        success: false,
        error: 'Network error',
        redirectUrl: '/auth/signin',
        cleanup: {
          pickerTokens: false,
          storageCredentials: false,
          sessionData: false,
          errors: ['Network error']
        }
      })

      const request = mockNextRequest('http://localhost:3000/api/auth/signout', {
        method: 'POST'
      }) as any

      const response = await POST(request)

      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toContain('/auth/signin')
      expect(response.headers.get('location')).toContain('message=signout_error')
      expect(response.headers.get('X-Signout-Status')).toBe('error')
      expect(response.headers.get('X-Signout-Error')).toBe('Network error')
    })

    it('should handle timeout errors gracefully', async () => {
      // Mock timeout
      mockSignoutService.signOut.mockRejectedValue(new Error('Signout operation timed out'))

      const request = mockNextRequest('http://localhost:3000/api/auth/signout', {
        method: 'POST'
      }) as any

      const response = await POST(request)

      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toContain('/auth/signin')
      expect(response.headers.get('X-Signout-Status')).toBe('error')
      expect(response.headers.get('X-Signout-Error')).toBe('Internal server error')
    })

    it('should parse request body options correctly', async () => {
      mockSignoutService.signOut.mockResolvedValue({
        success: true,
        redirectUrl: '/auth/signin',
        cleanup: {
          pickerTokens: true,
          storageCredentials: true,
          sessionData: true,
          errors: []
        }
      })

      const requestBody = JSON.stringify({
        options: {
          revokeProviderTokens: true,
          cancelRunningJobs: true
        }
      })

      const request = mockNextRequest('http://localhost:3000/api/auth/signout', {
        method: 'POST',
        body: requestBody
      }) as any

      await POST(request)

      expect(mockSignoutService.signOut).toHaveBeenCalledWith({
        forceRedirect: true,
        showLoading: false,
        revokeProviderTokens: true,
        cancelRunningJobs: true
      })
    })

    it('should sanitize error messages for security', async () => {
      mockSignoutService.signOut.mockResolvedValue({
        success: false,
        error: 'Database connection failed with sensitive info',
        redirectUrl: '/auth/signin',
        cleanup: {
          pickerTokens: false,
          storageCredentials: false,
          sessionData: false,
          errors: []
        }
      })

      const request = mockNextRequest('http://localhost:3000/api/auth/signout', {
        method: 'POST'
      }) as any

      const response = await POST(request)

      expect(response.headers.get('location')).toContain('error=service_unavailable')
      expect(response.headers.get('location')).not.toContain('sensitive')
    })

    it('should validate return URLs to prevent open redirects', async () => {
      mockSignoutService.signOut.mockResolvedValue({
        success: true,
        redirectUrl: '/auth/signin',
        cleanup: {
          pickerTokens: true,
          storageCredentials: true,
          sessionData: true,
          errors: []
        }
      })

      const requestBody = JSON.stringify({
        returnUrl: 'https://evil.com/steal-tokens'
      })

      const request = mockNextRequest('http://localhost:3000/api/auth/signout', {
        method: 'POST',
        body: requestBody
      }) as any

      const response = await POST(request)

      // Should ignore malicious return URL and use default
      expect(response.headers.get('location')).toContain('/auth/signin')
      expect(response.headers.get('location')).not.toContain('evil.com')
    })
  })

  describe('GET /api/auth/signout', () => {
    it('should delegate to POST handler', async () => {
      mockSignoutService.signOut.mockResolvedValue({
        success: true,
        redirectUrl: '/auth/signin',
        cleanup: {
          pickerTokens: true,
          storageCredentials: true,
          sessionData: true,
          errors: []
        }
      })

      const request = mockNextRequest('http://localhost:3000/api/auth/signout', {
        method: 'GET'
      }) as any

      const response = await GET(request)

      expect(response.status).toBe(302)
      expect(mockSignoutService.signOut).toHaveBeenCalled()
    })
  })
})