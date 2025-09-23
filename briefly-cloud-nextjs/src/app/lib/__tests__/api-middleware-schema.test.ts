/**
 * Tests for schema-aware API middleware enhancements
 */

// Mock Request and Response for Node.js environment
global.Request = global.Request || class MockRequest {
  constructor(public url: string, public init: any = {}) {
    this.method = init.method || 'GET'
    this.headers = new Map(Object.entries(init.headers || {}))
  }
  method: string
  headers: Map<string, string>
}

global.Response = global.Response || class MockResponse {
  constructor(public body: any, public init: any = {}) {
    this.status = init.status || 200
  }
  status: number
}

import { createProtectedApiHandler, createPublicApiHandler, ApiContext, PublicApiContext } from '../api-middleware'
import { SchemaError } from '../errors/schema-errors'
import { ApiResponse } from '../api-response'

// Mock dependencies
jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn()
    }
  }))
}))

jest.mock('../api-response', () => ({
  ApiResponse: {
    unauthorized: jest.fn(() => new Response('Unauthorized', { status: 401 })),
    serverError: jest.fn(() => new Response('Server Error', { status: 500 }))
  }
}))

jest.mock('../errors/schema-errors', () => ({
  SchemaError: class MockSchemaError extends Error {
    constructor(message: string, context: any, code?: string) {
      super(message)
      this.name = 'SchemaError'
      this.schema = context.schema
      this.operation = context.operation
      this.code = code || 'SCHEMA_ERROR'
    }
  },
  handleSchemaError: jest.fn((error, context) => new (jest.requireActual('../errors/schema-errors').SchemaError)('Test error', context)),
  logSchemaError: jest.fn()
}))

// Mock environment variables
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'

describe('Schema-Aware API Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation()
    jest.spyOn(console, 'error').mockImplementation()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('createProtectedApiHandler', () => {
    it('should include schema context in API context', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' }
      const mockSupabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({ data: { user: mockUser }, error: null })
        }
      }

      require('@supabase/ssr').createServerClient.mockReturnValue(mockSupabase)

      const mockHandler = jest.fn(async (request: Request, context: ApiContext) => {
        // Verify schema context is present
        expect(context.schemaContext).toBeDefined()
        expect(context.schemaContext.primarySchema).toBe('app')
        expect(context.schemaContext.operations).toEqual([])
        expect(typeof context.schemaContext.addOperation).toBe('function')
        expect(typeof context.schemaContext.logSchemaError).toBe('function')
        
        return new Response('OK', { status: 200 })
      })

      const handler = createProtectedApiHandler(mockHandler)
      const request = new Request('https://example.com/api/test')
      
      await handler(request)
      
      expect(mockHandler).toHaveBeenCalled()
    })

    it('should determine correct primary schema based on path', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' }
      const mockSupabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({ data: { user: mockUser }, error: null })
        }
      }

      require('@supabase/ssr').createServerClient.mockReturnValue(mockSupabase)

      const testCases = [
        { path: '/api/storage/google/callback', expectedSchema: 'private' },
        { path: '/api/auth/signin', expectedSchema: 'private' },
        { path: '/api/health', expectedSchema: 'public' },
        { path: '/api/upload', expectedSchema: 'app' },
        { path: '/api/chat', expectedSchema: 'app' }
      ]

      for (const testCase of testCases) {
        const mockHandler = jest.fn(async (request: Request, context: ApiContext) => {
          expect(context.schemaContext.primarySchema).toBe(testCase.expectedSchema)
          return new Response('OK', { status: 200 })
        })

        const handler = createProtectedApiHandler(mockHandler)
        const request = new Request(`https://example.com${testCase.path}`)
        
        await handler(request)
      }
    })

    it('should track successful operations', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' }
      const mockSupabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({ data: { user: mockUser }, error: null })
        }
      }

      require('@supabase/ssr').createServerClient.mockReturnValue(mockSupabase)

      const mockHandler = jest.fn(async (request: Request, context: ApiContext) => {
        // Simulate a successful operation
        context.schemaContext.addOperation({
          schema: 'app',
          operation: 'test-operation',
          table: 'test-table',
          success: true,
          duration: 100
        })
        
        return new Response('OK', { status: 200 })
      })

      const handler = createProtectedApiHandler(mockHandler)
      const request = new Request('https://example.com/api/test')
      
      await handler(request)
      
      // Verify performance logging was called
      expect(console.log).toHaveBeenCalledWith(
        '[schema-performance]',
        expect.stringContaining('correlationId')
      )
    })

    it('should handle schema errors properly', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' }
      const mockSupabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({ data: { user: mockUser }, error: null })
        }
      }

      require('@supabase/ssr').createServerClient.mockReturnValue(mockSupabase)

      const schemaError = new SchemaError('Test schema error', {
        schema: 'app',
        operation: 'test-operation',
        correlationId: 'test-correlation-id'
      })

      const mockHandler = jest.fn(async () => {
        throw schemaError
      })

      const handler = createProtectedApiHandler(mockHandler)
      const request = new Request('https://example.com/api/test')
      
      const response = await handler(request)
      
      expect(response.status).toBe(500)
      expect(console.error).toHaveBeenCalledWith(
        '[schema-error]',
        expect.objectContaining({
          schema: 'app',
          operation: 'test-operation'
        })
      )
    })
  })

  describe('createPublicApiHandler', () => {
    it('should include schema context in public API context', async () => {
      const mockHandler = jest.fn(async (request: Request, context: PublicApiContext) => {
        // Verify schema context is present
        expect(context.schemaContext).toBeDefined()
        expect(context.schemaContext.primarySchema).toBe('public')
        expect(context.schemaContext.operations).toEqual([])
        expect(typeof context.schemaContext.addOperation).toBe('function')
        expect(typeof context.schemaContext.logSchemaError).toBe('function')
        expect(context.correlationId).toBeDefined()
        
        return new Response('OK', { status: 200 })
      })

      const handler = createPublicApiHandler(mockHandler)
      const request = new Request('https://example.com/api/health')
      
      await handler(request)
      
      expect(mockHandler).toHaveBeenCalled()
    })

    it('should handle errors with schema context', async () => {
      const mockHandler = jest.fn(async () => {
        throw new Error('Test error')
      })

      const handler = createPublicApiHandler(mockHandler)
      const request = new Request('https://example.com/api/health')
      
      const response = await handler(request)
      
      expect(response.status).toBe(500)
      expect(console.error).toHaveBeenCalledWith(
        '[public-api:error]',
        expect.objectContaining({
          correlationId: expect.any(String),
          error: expect.objectContaining({
            name: 'Error',
            message: 'Test error'
          })
        })
      )
    })

    it('should log performance metrics for public endpoints', async () => {
      const mockHandler = jest.fn(async (request: Request, context: PublicApiContext) => {
        context.schemaContext.addOperation({
          schema: 'public',
          operation: 'health-check',
          success: true,
          duration: 50
        })
        
        return new Response('OK', { status: 200 })
      })

      const handler = createPublicApiHandler(mockHandler)
      const request = new Request('https://example.com/api/health')
      
      await handler(request)
      
      // Verify performance logging was called
      expect(console.log).toHaveBeenCalledWith(
        '[schema-performance]',
        expect.stringContaining('correlationId')
      )
    })
  })

  describe('Schema Context Functionality', () => {
    it('should track multiple operations', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' }
      const mockSupabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({ data: { user: mockUser }, error: null })
        }
      }

      require('@supabase/ssr').createServerClient.mockReturnValue(mockSupabase)

      const mockHandler = jest.fn(async (request: Request, context: ApiContext) => {
        // Add multiple operations
        context.schemaContext.addOperation({
          schema: 'app',
          operation: 'read-user',
          table: 'users',
          success: true,
          duration: 50
        })
        
        context.schemaContext.addOperation({
          schema: 'app',
          operation: 'create-file',
          table: 'files',
          success: true,
          duration: 100
        })
        
        return new Response('OK', { status: 200 })
      })

      const handler = createProtectedApiHandler(mockHandler)
      const request = new Request('https://example.com/api/test')
      
      await handler(request)
      
      // Verify performance metrics include both operations
      const performanceCall = (console.log as jest.Mock).mock.calls.find(
        call => call[0] === '[schema-performance]'
      )
      
      expect(performanceCall).toBeDefined()
      const metrics = JSON.parse(performanceCall[1])
      expect(metrics.operationCount).toBe(3) // 2 manual + 1 automatic success
      expect(metrics.schemaBreakdown.app).toBe(3)
    })

    it('should handle schema error logging', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' }
      const mockSupabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({ data: { user: mockUser }, error: null })
        }
      }

      require('@supabase/ssr').createServerClient.mockReturnValue(mockSupabase)

      const mockHandler = jest.fn(async (request: Request, context: ApiContext) => {
        // Test schema error logging
        const error = new Error('Database connection failed')
        const schemaError = context.schemaContext.logSchemaError(
          error,
          'test-operation',
          'app',
          'users'
        )
        
        expect(schemaError).toBeInstanceOf(SchemaError)
        return new Response('OK', { status: 200 })
      })

      const handler = createProtectedApiHandler(mockHandler)
      const request = new Request('https://example.com/api/test')
      
      await handler(request)
      
      // Verify schema error was logged
      const { logSchemaError } = require('../errors/schema-errors')
      expect(logSchemaError).toHaveBeenCalled()
    })
  })
})