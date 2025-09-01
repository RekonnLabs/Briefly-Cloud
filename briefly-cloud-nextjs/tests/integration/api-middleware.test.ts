/**
 * Authentication and Middleware Integration Tests
 * Tests the createProtectedApiHandler middleware functionality
 */

import { NextRequest, NextResponse } from 'next/server'
import { createProtectedApiHandler, createPublicApiHandler, type ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-response'

// Mock dependencies
jest.mock('@/app/lib/auth/supabase-auth', () => ({
  getAuthenticatedUser: jest.fn(),
}))

jest.mock('@/app/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/app/lib/error-handler', () => ({
  ErrorHandler: {
    handleError: jest.fn((error, context) => {
      return NextResponse.json({
        success: false,
        error: { message: 'Internal server error', code: 'INTERNAL_ERROR' },
        correlationId: context.correlationId,
        timestamp: new Date().toISOString()
      }, { status: 500 })
    }),
    isRetryableError: jest.fn(() => false),
  },
}))

jest.mock('@/app/lib/audit/comprehensive-audit-logger', () => ({
  auditApiAccess: jest.fn().mockResolvedValue(undefined),
  auditSystemError: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/app/lib/security', () => ({
  createSecurityMiddleware: jest.fn(() => (req: NextRequest, res: NextResponse) => res),
  RateLimiter: {
    isRateLimited: jest.fn(() => false),
    getRemainingRequests: jest.fn(() => 10),
  },
  InputSanitizer: {
    sanitizeString: jest.fn((str: string) => str),
  },
  securitySchemas: {},
  validateEnvironment: jest.fn(),
}))

describe('API Middleware Integration Tests', () => {
  const mockUser = {
    id: 'test-user-id',
    email: 'test@example.com',
    full_name: 'Test User',
    subscription_tier: 'free' as const,
    subscription_status: 'active',
    usage_count: 5,
    usage_limit: 100,
    features_enabled: { ai_chat: true },
    permissions: { can_upload: true },
    last_login_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('createProtectedApiHandler', () => {
    it('should provide user context correctly for authenticated requests', async () => {
      const { getAuthenticatedUser } = require('@/app/lib/auth/supabase-auth')
      getAuthenticatedUser.mockResolvedValue(mockUser)

      let receivedContext: ApiContext | null = null
      const mockHandler = jest.fn(async (request: NextRequest, context: ApiContext) => {
        receivedContext = context
        return ApiResponse.ok({ message: 'Success' })
      })

      const handler = createProtectedApiHandler(mockHandler)
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'GET',
        headers: { 'user-agent': 'test-agent' }
      })

      const response = await handler(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(mockHandler).toHaveBeenCalledTimes(1)
      expect(receivedContext).not.toBeNull()
      expect(receivedContext?.user).toEqual(mockUser)
      expect(receivedContext?.correlationId).toMatch(/^req_\d+_[a-z0-9]+$/)
      expect(receivedContext?.startTime).toBeGreaterThan(0)
      expect(receivedContext?.metadata).toMatchObject({
        method: 'GET',
        url: 'http://localhost:3000/api/test',
        userAgent: 'test-agent'
      })
    })

    it('should return 401 for unauthenticated requests', async () => {
      const { getAuthenticatedUser } = require('@/app/lib/auth/supabase-auth')
      getAuthenticatedUser.mockRejectedValue(new Error('Unauthorized'))

      const mockHandler = jest.fn()
      const handler = createProtectedApiHandler(mockHandler)
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'GET'
      })

      const response = await handler(request)
      const result = await response.json()

      expect(response.status).toBe(401)
      expect(result.success).toBe(false)
      expect(result.error.code).toBe('UNAUTHORIZED')
      expect(result.error.message).toBe('Authentication required')
      expect(result.correlationId).toMatch(/^req_\d+_[a-z0-9]+$/)
      expect(result.timestamp).toBeDefined()
      expect(mockHandler).not.toHaveBeenCalled()
    })

    it('should generate and include correlation ID in responses', async () => {
      const { getAuthenticatedUser } = require('@/app/lib/auth/supabase-auth')
      getAuthenticatedUser.mockResolvedValue(mockUser)

      const mockHandler = jest.fn(async (request: NextRequest, context: ApiContext) => {
        return ApiResponse.ok({ correlationId: context.correlationId })
      })

      const handler = createProtectedApiHandler(mockHandler)
      const request = new NextRequest('http://localhost:3000/api/test')

      const response = await handler(request)
      const result = await response.json()
      const correlationId = response.headers.get('X-Correlation-ID')

      expect(correlationId).toMatch(/^req_\d+_[a-z0-9]+$/)
      expect(result.data.correlationId).toBe(correlationId)
      expect(result.correlationId).toBe(correlationId)
    })

    it('should handle authentication errors gracefully', async () => {
      const { getAuthenticatedUser } = require('@/app/lib/auth/supabase-auth')
      getAuthenticatedUser.mockRejectedValue(new Error('Database connection failed'))

      const mockHandler = jest.fn()
      const handler = createProtectedApiHandler(mockHandler)
      const request = new NextRequest('http://localhost:3000/api/test')

      const response = await handler(request)
      const result = await response.json()

      expect(response.status).toBe(401)
      expect(result.success).toBe(false)
      expect(result.error.code).toBe('AUTH_ERROR')
      expect(result.error.message).toBe('Authentication failed')
      expect(result.correlationId).toBeDefined()
      expect(mockHandler).not.toHaveBeenCalled()
    })

    it('should handle rate limiting', async () => {
      const { getAuthenticatedUser } = require('@/app/lib/auth/supabase-auth')
      const { RateLimiter } = require('@/app/lib/security')
      
      getAuthenticatedUser.mockResolvedValue(mockUser)
      RateLimiter.isRateLimited.mockReturnValue(true)
      RateLimiter.getRemainingRequests.mockReturnValue(0)

      const mockHandler = jest.fn()
      const handler = createProtectedApiHandler(mockHandler, {
        rateLimit: {
          windowMs: 60000,
          maxRequests: 10
        }
      })
      const request = new NextRequest('http://localhost:3000/api/test')

      const response = await handler(request)
      const result = await response.json()

      expect(response.status).toBe(429)
      expect(result.success).toBe(false)
      expect(result.error.code).toBe('RATE_LIMIT_EXCEEDED')
      expect(result.error.message).toBe('Too many requests. Please try again later.')
      expect(response.headers.get('Retry-After')).toBe('60')
      expect(response.headers.get('X-RateLimit-Limit')).toBe('10')
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('0')
      expect(mockHandler).not.toHaveBeenCalled()
    })

    it('should handle CORS configuration', async () => {
      const { getAuthenticatedUser } = require('@/app/lib/auth/supabase-auth')
      getAuthenticatedUser.mockResolvedValue(mockUser)

      const mockHandler = jest.fn(async () => ApiResponse.ok())
      const handler = createProtectedApiHandler(mockHandler, {
        cors: {
          origin: ['https://allowed-domain.com'],
          methods: ['GET', 'POST']
        }
      })

      // Test with disallowed origin
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: { 'origin': 'https://malicious-domain.com' }
      })

      const response = await handler(request)
      const result = await response.json()

      expect(response.status).toBe(403)
      expect(result.success).toBe(false)
      expect(result.error.code).toBe('CORS_ERROR')
      expect(result.error.message).toBe('Origin not allowed')
      expect(mockHandler).not.toHaveBeenCalled()
    })

    it('should handle handler errors with centralized error handling', async () => {
      const { getAuthenticatedUser } = require('@/app/lib/auth/supabase-auth')
      const { ErrorHandler } = require('@/app/lib/error-handler')
      
      getAuthenticatedUser.mockResolvedValue(mockUser)

      const mockHandler = jest.fn(async () => {
        throw new Error('Handler error')
      })

      const handler = createProtectedApiHandler(mockHandler)
      const request = new NextRequest('http://localhost:3000/api/test')

      const response = await handler(request)
      const result = await response.json()

      expect(response.status).toBe(500)
      expect(result.success).toBe(false)
      expect(result.error.code).toBe('INTERNAL_ERROR')
      expect(ErrorHandler.handleError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          user: mockUser,
          correlationId: expect.stringMatching(/^req_\d+_[a-z0-9]+$/),
          startTime: expect.any(Number),
          metadata: expect.any(Object)
        })
      )
    })

    it('should audit API access for successful requests', async () => {
      const { getAuthenticatedUser } = require('@/app/lib/auth/supabase-auth')
      const { auditApiAccess } = require('@/app/lib/audit/comprehensive-audit-logger')
      
      getAuthenticatedUser.mockResolvedValue(mockUser)

      const mockHandler = jest.fn(async () => ApiResponse.ok())
      const handler = createProtectedApiHandler(mockHandler)
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: {
          'user-agent': 'test-agent',
          'x-forwarded-for': '192.168.1.1'
        }
      })

      await handler(request)

      expect(auditApiAccess).toHaveBeenCalledWith(
        '/api/test',
        mockUser.id,
        true, // success
        expect.stringMatching(/^req_\d+_[a-z0-9]+$/),
        expect.any(Number), // duration
        '192.168.1.1',
        'test-agent'
      )
    })

    it('should audit system errors', async () => {
      const { getAuthenticatedUser } = require('@/app/lib/auth/supabase-auth')
      const { auditSystemError } = require('@/app/lib/audit/comprehensive-audit-logger')
      
      getAuthenticatedUser.mockResolvedValue(mockUser)

      const mockHandler = jest.fn(async () => {
        throw new Error('Test error')
      })

      const handler = createProtectedApiHandler(mockHandler)
      const request = new NextRequest('http://localhost:3000/api/test')

      await handler(request)

      expect(auditSystemError).toHaveBeenCalledWith(
        'Error',
        expect.stringMatching(/^req_\d+_[a-z0-9]+$/),
        expect.any(Number), // duration
        mockUser.id,
        '/api/test',
        expect.objectContaining({
          method: 'GET',
          error: 'Test error'
        })
      )
    })

    it('should log performance warnings for slow requests', async () => {
      const { getAuthenticatedUser } = require('@/app/lib/auth/supabase-auth')
      const { logger } = require('@/app/lib/logger')
      
      getAuthenticatedUser.mockResolvedValue(mockUser)

      const mockHandler = jest.fn(async () => {
        // Simulate slow request
        await new Promise(resolve => setTimeout(resolve, 1100))
        return ApiResponse.ok()
      })

      const handler = createProtectedApiHandler(mockHandler, {
        performanceMonitoring: true
      })
      const request = new NextRequest('http://localhost:3000/api/test')

      await handler(request)

      expect(logger.warn).toHaveBeenCalledWith(
        'Slow API request detected',
        expect.objectContaining({
          correlationId: expect.stringMatching(/^req_\d+_[a-z0-9]+$/),
          method: 'GET',
          url: 'http://localhost:3000/api/test',
          duration: expect.any(Number),
          userId: mockUser.id
        })
      )
    })
  })

  describe('createPublicApiHandler', () => {
    it('should work without authentication', async () => {
      const mockHandler = jest.fn(async (request: NextRequest, context: ApiContext) => {
        expect(context.user).toBeNull()
        return ApiResponse.ok({ message: 'Public endpoint' })
      })

      const handler = createPublicApiHandler(mockHandler)
      const request = new NextRequest('http://localhost:3000/api/public')

      const response = await handler(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.message).toBe('Public endpoint')
      expect(mockHandler).toHaveBeenCalledTimes(1)
    })

    it('should still provide correlation ID and metadata', async () => {
      let receivedContext: ApiContext | null = null
      const mockHandler = jest.fn(async (request: NextRequest, context: ApiContext) => {
        receivedContext = context
        return ApiResponse.ok()
      })

      const handler = createPublicApiHandler(mockHandler)
      const request = new NextRequest('http://localhost:3000/api/public', {
        headers: { 'user-agent': 'test-agent' }
      })

      await handler(request)

      expect(receivedContext).not.toBeNull()
      expect(receivedContext?.user).toBeNull()
      expect(receivedContext?.correlationId).toMatch(/^req_\d+_[a-z0-9]+$/)
      expect(receivedContext?.metadata).toMatchObject({
        method: 'GET',
        url: 'http://localhost:3000/api/public',
        userAgent: 'test-agent'
      })
    })
  })

  describe('Input Validation', () => {
    it('should validate JSON input when schema is provided', async () => {
      const { getAuthenticatedUser } = require('@/app/lib/auth/supabase-auth')
      getAuthenticatedUser.mockResolvedValue(mockUser)

      const mockSchema = {
        parse: jest.fn((data) => {
          if (!data.name) throw new Error('Name is required')
          return data
        })
      }

      const mockHandler = jest.fn(async () => ApiResponse.ok())
      const handler = createProtectedApiHandler(mockHandler, {
        validation: { schema: mockSchema }
      })

      // Test with invalid data
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ invalid: 'data' })
      })

      const response = await handler(request)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error.code).toBe('VALIDATION_ERROR')
      expect(result.error.message).toBe('Invalid input data')
      expect(mockHandler).not.toHaveBeenCalled()
    })

    it('should sanitize input when sanitization is enabled', async () => {
      const { getAuthenticatedUser } = require('@/app/lib/auth/supabase-auth')
      const { InputSanitizer } = require('@/app/lib/security')
      
      getAuthenticatedUser.mockResolvedValue(mockUser)
      InputSanitizer.sanitizeString.mockImplementation((str: string) => str.replace(/<script>/g, ''))

      const mockSchema = {
        parse: jest.fn((data) => data)
      }

      const mockHandler = jest.fn(async () => ApiResponse.ok())
      const handler = createProtectedApiHandler(mockHandler, {
        validation: { 
          schema: mockSchema,
          sanitize: true
        }
      })

      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: '<script>alert("xss")</script>test' })
      })

      await handler(request)

      expect(InputSanitizer.sanitizeString).toHaveBeenCalledWith('<script>alert("xss")</script>test')
      expect(mockHandler).toHaveBeenCalled()
    })
  })

  describe('Security Headers', () => {
    it('should apply security headers to responses', async () => {
      const { getAuthenticatedUser } = require('@/app/lib/auth/supabase-auth')
      const { createSecurityMiddleware } = require('@/app/lib/security')
      
      getAuthenticatedUser.mockResolvedValue(mockUser)

      const mockSecurityMiddleware = jest.fn((req, res) => {
        res.headers.set('X-Content-Type-Options', 'nosniff')
        return res
      })
      createSecurityMiddleware.mockReturnValue(mockSecurityMiddleware)

      const mockHandler = jest.fn(async () => ApiResponse.ok())
      const handler = createProtectedApiHandler(mockHandler)
      const request = new NextRequest('http://localhost:3000/api/test')

      const response = await handler(request)

      expect(createSecurityMiddleware).toHaveBeenCalled()
      expect(mockSecurityMiddleware).toHaveBeenCalledWith(request, expect.any(Object))
      expect(response.headers.get('X-Correlation-ID')).toBeDefined()
    })
  })
})