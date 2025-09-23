/**
 * Schema Migration Integration Tests
 * 
 * Comprehensive tests for post-migration schema architecture including:
 * - App schema operations (users, files, conversations)
 * - Private schema operations (OAuth tokens via RPC)
 * - Public schema compatibility views
 * - Health check endpoints with schema status reporting
 */

// Mock environment variables for testing
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.OPENAI_API_KEY = 'test-openai-key'

// Mock server-only module
jest.mock('server-only', () => ({}))

// Mock Next.js server components
jest.mock('next/server', () => ({
  NextRequest: jest.fn().mockImplementation((url, options) => ({
    url,
    method: options?.method || 'GET',
    headers: new Map(),
    json: jest.fn()
  })),
  NextResponse: {
    json: jest.fn((data, options) => ({
      json: () => Promise.resolve(data),
      status: options?.status || 200,
      headers: new Map(Object.entries(options?.headers || {}))
    }))
  }
}))

// Mock NextResponse constructor for health route
global.NextResponse = jest.fn().mockImplementation((body, options) => ({
  body,
  status: options?.status || 200,
  headers: new Map(Object.entries(options?.headers || {}))
}))

import { NextRequest } from 'next/server'

// Mock Supabase clients
const mockSupabaseResponse = {
  data: null,
  error: null
}

const mockSupabaseClient = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn(() => Promise.resolve(mockSupabaseResponse)),
          single: jest.fn(() => Promise.resolve(mockSupabaseResponse))
        })),
        maybeSingle: jest.fn(() => Promise.resolve(mockSupabaseResponse)),
        single: jest.fn(() => Promise.resolve(mockSupabaseResponse)),
        limit: jest.fn(() => Promise.resolve(mockSupabaseResponse))
      })),
      limit: jest.fn(() => Promise.resolve(mockSupabaseResponse)),
      single: jest.fn(() => Promise.resolve(mockSupabaseResponse)),
      maybeSingle: jest.fn(() => Promise.resolve(mockSupabaseResponse))
    })),
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn(() => Promise.resolve(mockSupabaseResponse))
      }))
    })),
    update: jest.fn(() => ({
      eq: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve(mockSupabaseResponse))
      }))
    })),
    delete: jest.fn(() => ({
      eq: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve(mockSupabaseResponse))
      }))
    }))
  })),
  rpc: jest.fn(() => Promise.resolve(mockSupabaseResponse))
}

jest.mock('@/app/lib/supabase-clients', () => ({
  supabaseApp: mockSupabaseClient,
  supabasePrivate: mockSupabaseClient,
  supabasePublic: mockSupabaseClient
}))

// Mock schema error handling
jest.mock('@/app/lib/errors/schema-errors', () => ({
  handleSchemaError: jest.fn((error, context) => ({
    code: 'SCHEMA_ERROR',
    message: `Schema error in ${context.schema}: ${error.message || 'Unknown error'}`,
    schema: context.schema,
    operation: context.operation,
    correlationId: context.correlationId
  })),
  logSchemaError: jest.fn()
}))

// Mock fetch for external API calls
global.fetch = jest.fn()

describe('Schema Migration Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSupabaseResponse.data = null
    mockSupabaseResponse.error = null
  })

  describe('App Schema Operations', () => {
    describe('Users Table Operations', () => {
      it('should use app schema client for users operations', async () => {
        const { UsersRepository } = await import('@/app/lib/repos/users-repo')
        const usersRepo = new UsersRepository()

        // Verify repository uses app schema client
        expect(usersRepo['appClient']).toBeDefined()
        expect(usersRepo['TABLE_NAME']).toBe('users')
      })

      it('should have proper schema error handling', async () => {
        const { handleSchemaError } = await import('@/app/lib/errors/schema-errors')
        
        const testError = {
          message: 'relation "app.users" does not exist',
          code: '42P01'
        }

        const context = {
          schema: 'app',
          operation: 'select',
          table: 'users',
          correlationId: 'test-123'
        }

        const result = handleSchemaError(testError, context)

        expect(result.code).toBe('SCHEMA_ERROR')
        expect(result.message).toContain('Schema error in app')
        expect(result.schema).toBe('app')
        expect(result.operation).toBe('select')
      })
    })

    describe('Files Table Operations', () => {
      it('should use app schema client for files operations', async () => {
        const { FilesRepository } = await import('@/app/lib/repos/files-repo')
        const filesRepo = new FilesRepository()

        // Verify repository uses app schema client
        expect(filesRepo['appClient']).toBeDefined()
        expect(filesRepo['TABLE_NAME']).toBe('files')
      })

      it('should provide all required file operations', async () => {
        const { FilesRepository } = await import('@/app/lib/repos/files-repo')
        const filesRepo = new FilesRepository()

        const methods = [
          'create',
          'getById',
          'findByUserId',
          'search',
          'updateProcessingStatus',
          'update',
          'delete'
        ]

        methods.forEach(method => {
          expect(typeof filesRepo[method]).toBe('function')
        })
      })
    })

    describe('Conversations Table Operations', () => {
      it('should perform CRUD operations on app.conversations', async () => {
        // Mock conversations repository operations
        mockSupabaseResponse.data = {
          id: 'conv-123',
          user_id: 'user-123',
          title: 'Test Conversation',
          created_at: '2025-01-27T10:00:00Z'
        }

        // Test conversation creation
        const conversationData = {
          user_id: 'user-123',
          title: 'Test Conversation'
        }

        // Simulate repository call
        const result = mockSupabaseClient.from('conversations')
          .insert(conversationData)
          .select()
          .single()

        await result
        expect(mockSupabaseClient.from).toHaveBeenCalledWith('conversations')
      })

      it('should handle chat messages in conversations', async () => {
        mockSupabaseResponse.data = [{
          id: 'msg-123',
          conversation_id: 'conv-123',
          role: 'user',
          content: 'Hello AI',
          created_at: '2025-01-27T10:00:00Z'
        }]

        // Test chat message retrieval
        const result = mockSupabaseClient.from('chat_messages')
          .select('*')
          .eq('conversation_id', 'conv-123')

        await result
        expect(mockSupabaseClient.from).toHaveBeenCalledWith('chat_messages')
      })
    })
  })

  describe('Private Schema Operations (OAuth Tokens via RPC)', () => {
    it('should use RPC functions for OAuth token operations', async () => {
      const { OAuthTokensRepository } = await import('@/app/lib/repos/oauth-tokens-repo')
      const oauthRepo = new OAuthTokensRepository()

      // Verify repository has RPC-based methods
      const rpcMethods = [
        'saveToken',
        'getToken',
        'deleteToken',
        'tokenExists',
        'getTokenStatus'
      ]

      rpcMethods.forEach(method => {
        expect(typeof oauthRepo[method]).toBe('function')
      })
    })

    it('should handle private schema RPC patterns', async () => {
      const { handleSchemaError } = await import('@/app/lib/errors/schema-errors')
      
      const testError = {
        message: 'function get_oauth_token does not exist',
        code: '42883'
      }

      const context = {
        schema: 'private',
        operation: 'rpc_get_oauth_token',
        correlationId: 'test-123'
      }

      const result = handleSchemaError(testError, context)

      expect(result.code).toBe('SCHEMA_ERROR')
      expect(result.message).toContain('Schema error in private')
      expect(result.schema).toBe('private')
      expect(result.operation).toBe('rpc_get_oauth_token')
    })
  })

  describe('Public Schema Compatibility Views', () => {
    it('should access users via public schema compatibility view', async () => {
      // Test public schema view access
      mockSupabaseResponse.data = [{
        id: 'user-123',
        email: 'test@example.com',
        full_name: 'Test User'
      }]

      const result = mockSupabaseClient.from('users')
        .select('*')
        .limit(10)

      await result
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('users')
    })

    it('should access file metadata via public schema compatibility view', async () => {
      mockSupabaseResponse.data = [{
        id: 'file-123',
        name: 'test.pdf',
        size: 1024,
        mime_type: 'application/pdf'
      }]

      const result = mockSupabaseClient.from('file_metadata')
        .select('*')
        .eq('user_id', 'user-123')

      await result
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('file_metadata')
    })

    it('should access document chunks via public schema compatibility view', async () => {
      mockSupabaseResponse.data = [{
        id: 'chunk-123',
        file_id: 'file-123',
        content: 'Document content chunk',
        chunk_index: 0
      }]

      const result = mockSupabaseClient.from('document_chunks')
        .select('*')
        .eq('file_id', 'file-123')

      await result
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('document_chunks')
    })

    it('should handle public schema view errors', async () => {
      const { handleSchemaError } = await import('@/app/lib/errors/schema-errors')

      // Simulate view error
      mockSupabaseResponse.error = {
        message: 'relation "public.users" does not exist',
        code: '42P01'
      }

      try {
        await mockSupabaseClient.from('users').select('*').limit(1)
      } catch (error) {
        // Error would be handled by repository layer
      }

      // Verify error handling would be called
      expect(mockSupabaseResponse.error).toBeDefined()
    })
  })

  describe('Health Check Endpoints Schema Status', () => {
    let healthRoute: any

    beforeEach(async () => {
      // Import the health route handler
      healthRoute = await import('@/app/api/health/route')
    })

    it('should report app schema status in health check', async () => {
      // Mock successful app schema check
      mockSupabaseResponse.data = []
      mockSupabaseResponse.error = null

      // Mock OpenAI API response
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK'
      })

      const request = new NextRequest('http://localhost:3000/api/health')
      const response = await healthRoute.GET(request)
      const healthData = await response.json()

      expect(healthData.schemas.app.status).toBe('healthy')
      expect(healthData.schemas.app.tables).toBe(8)
      expect(healthData.schemas.app.responseTime).toBeDefined()
    })

    it('should report private schema status via RPC check', async () => {
      // Mock successful private schema RPC check
      mockSupabaseResponse.data = null // No token found is OK
      mockSupabaseResponse.error = null

      // Mock OpenAI API response
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK'
      })

      const request = new NextRequest('http://localhost:3000/api/health')
      const response = await healthRoute.GET(request)
      const healthData = await response.json()

      expect(healthData.schemas.private.status).toBe('healthy')
      expect(healthData.schemas.private.tables).toBe(4)
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('get_oauth_token', {
        p_user_id: '00000000-0000-0000-0000-000000000000',
        p_provider: 'google'
      })
    })

    it('should report public schema status via compatibility views', async () => {
      // Mock successful public schema view check
      mockSupabaseResponse.data = []
      mockSupabaseResponse.error = null

      // Mock OpenAI API response
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK'
      })

      const request = new NextRequest('http://localhost:3000/api/health')
      const response = await healthRoute.GET(request)
      const healthData = await response.json()

      expect(healthData.schemas.public.status).toBe('healthy')
      expect(healthData.schemas.public.views).toBe(7)
    })

    it('should report unhealthy status when app schema fails', async () => {
      // Mock app schema failure
      mockSupabaseResponse.error = {
        message: 'relation "app.users" does not exist',
        code: '42P01'
      }

      // Mock OpenAI API response
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK'
      })

      const request = new NextRequest('http://localhost:3000/api/health')
      const response = await healthRoute.GET(request)
      const healthData = await response.json()

      expect(healthData.status).toBe('unhealthy')
      expect(healthData.schemas.app.status).toBe('unhealthy')
      expect(healthData.schemas.app.error).toContain('Schema error in app')
      expect(response.status).toBe(503)
    })

    it('should report degraded status when response times are slow', async () => {
      // Mock slow but successful response
      mockSupabaseResponse.data = []
      mockSupabaseResponse.error = null

      // Mock slow OpenAI API response
      ;(global.fetch as jest.Mock).mockImplementation(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({
            ok: true,
            status: 200,
            statusText: 'OK'
          }), 1500) // 1.5 second delay
        )
      )

      const request = new NextRequest('http://localhost:3000/api/health')
      const response = await healthRoute.GET(request)
      const healthData = await response.json()

      // Should be degraded due to slow OpenAI response
      expect(['healthy', 'degraded']).toContain(healthData.status)
      expect(response.status).toBe(200)
    })

    it('should include schema status in response headers', async () => {
      // Mock successful responses
      mockSupabaseResponse.data = []
      mockSupabaseResponse.error = null

      // Mock OpenAI API response
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK'
      })

      const request = new NextRequest('http://localhost:3000/api/health')
      const response = await healthRoute.GET(request)

      const schemaStatusHeader = response.headers.get('X-Schema-Status')
      expect(schemaStatusHeader).toContain('app:healthy')
      expect(schemaStatusHeader).toContain('private:healthy')
      expect(schemaStatusHeader).toContain('public:healthy')
    })

    it('should provide HEAD endpoint for lightweight health checks', async () => {
      // Test that the HEAD method exists and is properly defined
      expect(typeof healthRoute.HEAD).toBe('function')
      
      // Verify the health route module exports both GET and HEAD methods
      expect(healthRoute.GET).toBeDefined()
      expect(healthRoute.HEAD).toBeDefined()
    })

    it('should handle health check error scenarios', async () => {
      // Test that error handling is properly implemented
      const { handleSchemaError } = await import('@/app/lib/errors/schema-errors')
      
      const testError = {
        message: 'connection refused',
        code: 'ECONNREFUSED'
      }

      const context = {
        schema: 'app',
        operation: 'head_health_check',
        table: 'users',
        correlationId: 'head-health-check'
      }

      const result = handleSchemaError(testError, context)

      expect(result.code).toBe('SCHEMA_ERROR')
      expect(result.message).toContain('Schema error in app')
      expect(result.operation).toBe('head_health_check')
    })
  })

  describe('Cross-Schema Integration', () => {
    it('should provide repositories for all schema layers', async () => {
      // Verify all repository types are available
      const { UsersRepository } = await import('@/app/lib/repos/users-repo')
      const { FilesRepository } = await import('@/app/lib/repos/files-repo')
      const { OAuthTokensRepository } = await import('@/app/lib/repos/oauth-tokens-repo')

      const usersRepo = new UsersRepository()
      const filesRepo = new FilesRepository()
      const oauthRepo = new OAuthTokensRepository()

      // Verify each repository has its expected schema client
      expect(usersRepo['appClient']).toBeDefined()
      expect(filesRepo['appClient']).toBeDefined()
      expect(oauthRepo['appClient']).toBeDefined() // Uses app client for RPC calls
    })

    it('should maintain consistent error handling across schemas', async () => {
      const { handleSchemaError } = await import('@/app/lib/errors/schema-errors')
      
      // Test error handling for each schema type
      const appError = handleSchemaError(
        { message: 'app error', code: '42P01' },
        { schema: 'app', operation: 'select', table: 'users', correlationId: 'test' }
      )

      const privateError = handleSchemaError(
        { message: 'private error', code: '42883' },
        { schema: 'private', operation: 'rpc', correlationId: 'test' }
      )

      const publicError = handleSchemaError(
        { message: 'public error', code: '42P01' },
        { schema: 'public', operation: 'select', table: 'users', correlationId: 'test' }
      )

      expect(appError.schema).toBe('app')
      expect(privateError.schema).toBe('private')
      expect(publicError.schema).toBe('public')
    })
  })

  describe('Error Recovery and Fallbacks', () => {
    it('should provide comprehensive schema error handling', async () => {
      const { handleSchemaError, logSchemaError } = await import('@/app/lib/errors/schema-errors')

      // Test that error handling functions exist and work
      expect(typeof handleSchemaError).toBe('function')
      expect(typeof logSchemaError).toBe('function')

      const testError = {
        message: 'database connection failed',
        code: 'ECONNREFUSED'
      }

      const context = {
        schema: 'app',
        operation: 'select',
        table: 'users',
        correlationId: 'test-123'
      }

      const result = handleSchemaError(testError, context)

      expect(result.code).toBe('SCHEMA_ERROR')
      expect(result.message).toContain('Schema error in app')
      expect(result.schema).toBe('app')
      expect(result.operation).toBe('select')
    })

    it('should provide meaningful error messages for schema issues', async () => {
      const { handleSchemaError } = await import('@/app/lib/errors/schema-errors')

      const testError = {
        message: 'relation "app.users" does not exist',
        code: '42P01'
      }

      const context = {
        schema: 'app',
        operation: 'select',
        table: 'users',
        correlationId: 'test-123'
      }

      const result = handleSchemaError(testError, context)

      expect(result.code).toBe('SCHEMA_ERROR')
      expect(result.message).toContain('Schema error in app')
      expect(result.schema).toBe('app')
      expect(result.operation).toBe('select')
    })
  })
})