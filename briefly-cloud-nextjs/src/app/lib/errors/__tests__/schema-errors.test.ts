/**
 * Tests for schema-specific error handling
 */

import { 
  SchemaError, 
  handleSchemaError, 
  logSchemaError, 
  withSchemaErrorHandling,
  extractSchemaContext,
  POSTGRES_ERROR_CODES,
  SUPABASE_ERROR_CODES
} from '../schema-errors'

describe('SchemaError', () => {
  it('should create a schema error with proper context', () => {
    const context = {
      schema: 'app' as const,
      operation: 'test_operation',
      table: 'users',
      userId: 'test-user-id',
      correlationId: 'test-correlation-id'
    }

    const error = new SchemaError('Test error message', context, 'TEST_CODE', true)

    expect(error.name).toBe('SchemaError')
    expect(error.message).toBe('[app] test_operation: Test error message')
    expect(error.schema).toBe('app')
    expect(error.operation).toBe('test_operation')
    expect(error.table).toBe('users')
    expect(error.userId).toBe('test-user-id')
    expect(error.correlationId).toBe('test-correlation-id')
    expect(error.code).toBe('TEST_CODE')
    expect(error.isRetryable).toBe(true)
  })

  it('should serialize to JSON properly', () => {
    const context = {
      schema: 'private' as const,
      operation: 'rpc_call',
      userId: 'user-123'
    }

    const error = new SchemaError('RPC failed', context, 'RPC_ERROR')
    const json = error.toJSON()

    expect(json.name).toBe('SchemaError')
    expect(json.schema).toBe('private')
    expect(json.operation).toBe('rpc_call')
    expect(json.userId).toBe('user-123')
    expect(json.code).toBe('RPC_ERROR')
    expect(json.isRetryable).toBe(false)
  })
})

describe('handleSchemaError', () => {
  it('should handle PostgreSQL relation not exists error', () => {
    const originalError = {
      code: POSTGRES_ERROR_CODES.RELATION_NOT_EXISTS,
      message: 'relation "app.nonexistent_table" does not exist'
    }

    const context = {
      schema: 'app' as const,
      operation: 'select_query',
      table: 'nonexistent_table',
      originalError
    }

    const schemaError = handleSchemaError(originalError, context)

    expect(schemaError).toBeInstanceOf(SchemaError)
    expect(schemaError.code).toBe('RELATION_NOT_EXISTS')
    expect(schemaError.message).toContain('does not exist in app schema')
    expect(schemaError.isRetryable).toBe(false)
  })

  it('should handle Supabase table not found error', () => {
    const originalError = {
      code: SUPABASE_ERROR_CODES.TABLE_NOT_FOUND,
      message: 'relation "public.missing_table" does not exist'
    }

    const context = {
      schema: 'public' as const,
      operation: 'table_query',
      table: 'missing_table',
      originalError
    }

    const schemaError = handleSchemaError(originalError, context)

    expect(schemaError.code).toBe('TABLE_NOT_FOUND')
    expect(schemaError.message).toContain('Table not found in public schema')
    expect(schemaError.isRetryable).toBe(false)
  })

  it('should handle permission denied errors', () => {
    const originalError = {
      code: POSTGRES_ERROR_CODES.PERMISSION_DENIED,
      message: 'permission denied for table users'
    }

    const context = {
      schema: 'app' as const,
      operation: 'insert_user',
      table: 'users',
      userId: 'user-123',
      originalError
    }

    const schemaError = handleSchemaError(originalError, context)

    expect(schemaError.code).toBe('PERMISSION_DENIED')
    expect(schemaError.message).toContain('Permission denied for insert_user on app schema')
    expect(schemaError.isRetryable).toBe(false)
  })

  it('should handle network errors as retryable', () => {
    const originalError = {
      message: 'network timeout occurred'
    }

    const context = {
      schema: 'app' as const,
      operation: 'database_query',
      originalError
    }

    const schemaError = handleSchemaError(originalError, context)

    expect(schemaError.code).toBe('NETWORK_ERROR')
    expect(schemaError.message).toContain('Network error during app schema operation')
    expect(schemaError.isRetryable).toBe(true)
  })

  it('should handle RPC-specific errors', () => {
    const originalError = {
      message: 'function get_oauth_token does not exist'
    }

    const context = {
      schema: 'private' as const,
      operation: 'rpc_get_oauth_token',
      originalError
    }

    const schemaError = handleSchemaError(originalError, context)

    expect(schemaError.code).toBe('RPC_ERROR')
    expect(schemaError.message).toContain('RPC function error in private schema')
    expect(schemaError.isRetryable).toBe(false)
  })

  it('should handle generic errors', () => {
    const originalError = {
      message: 'some unknown error'
    }

    const context = {
      schema: 'app' as const,
      operation: 'unknown_operation',
      originalError
    }

    const schemaError = handleSchemaError(originalError, context)

    expect(schemaError.code).toBe('GENERIC_SCHEMA_ERROR')
    expect(schemaError.message).toBe('[app] unknown_operation: some unknown error')
    expect(schemaError.isRetryable).toBe(false)
  })
})

describe('withSchemaErrorHandling', () => {
  it('should execute operation successfully', async () => {
    const mockOperation = jest.fn().mockResolvedValue('success')
    const context = {
      schema: 'app' as const,
      operation: 'test_operation'
    }

    const result = await withSchemaErrorHandling(mockOperation, context)

    expect(result).toBe('success')
    expect(mockOperation).toHaveBeenCalledTimes(1)
  })

  it('should catch and transform errors', async () => {
    const originalError = {
      code: POSTGRES_ERROR_CODES.RELATION_NOT_EXISTS,
      message: 'relation does not exist'
    }
    
    const mockOperation = jest.fn().mockRejectedValue(originalError)
    const context = {
      schema: 'app' as const,
      operation: 'failing_operation',
      table: 'missing_table'
    }

    await expect(withSchemaErrorHandling(mockOperation, context))
      .rejects.toThrow(SchemaError)

    await expect(withSchemaErrorHandling(mockOperation, context))
      .rejects.toHaveProperty('code', 'RELATION_NOT_EXISTS')
  })
})

describe('extractSchemaContext', () => {
  // Mock crypto.randomUUID for Node.js environment
  const mockRandomUUID = jest.fn(() => 'mock-uuid-123')
  
  beforeAll(() => {
    // Mock crypto.randomUUID
    Object.defineProperty(global, 'crypto', {
      value: { randomUUID: mockRandomUUID },
      writable: true
    })
  })

  it('should extract context from request', () => {
    const mockRequest = {
      url: 'https://example.com/api/test',
      headers: {
        get: jest.fn((name: string) => {
          if (name === 'x-correlation-id') return 'test-correlation-123'
          return null
        })
      }
    } as any

    const context = extractSchemaContext(mockRequest, 'test_operation', 'app', 'users')

    expect(context.schema).toBe('app')
    expect(context.operation).toBe('test_operation')
    expect(context.table).toBe('users')
    expect(context.correlationId).toBe('test-correlation-123')
  })

  it('should generate correlation ID if not provided', () => {
    const mockRequest = {
      url: 'https://example.com/api/test',
      headers: {
        get: jest.fn(() => null)
      }
    } as any

    const context = extractSchemaContext(mockRequest, 'test_operation', 'private')

    expect(context.schema).toBe('private')
    expect(context.operation).toBe('test_operation')
    expect(context.correlationId).toBe('mock-uuid-123')
    expect(mockRandomUUID).toHaveBeenCalled()
  })

  it('should handle x-request-id header', () => {
    const mockRequest = {
      url: 'https://example.com/api/test',
      headers: {
        get: jest.fn((name: string) => {
          if (name === 'x-request-id') return 'request-456'
          return null
        })
      }
    } as any

    const context = extractSchemaContext(mockRequest, 'test_operation', 'public')

    expect(context.correlationId).toBe('request-456')
  })
})

describe('logSchemaError', () => {
  let consoleSpy: jest.SpyInstance

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'error').mockImplementation()
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  it('should log schema error with structured data', () => {
    const context = {
      schema: 'app' as const,
      operation: 'test_operation',
      table: 'users',
      userId: 'user-123',
      correlationId: 'corr-456'
    }

    const error = new SchemaError('Test error', context, 'TEST_CODE')
    logSchemaError(error)

    expect(consoleSpy).toHaveBeenCalledTimes(1)
    const logCall = consoleSpy.mock.calls[0]
    expect(logCall[0]).toBe('Schema Error:')
    
    const loggedData = logCall[1]
    expect(loggedData).toContain('"schema": "app"')
    expect(loggedData).toContain('"operation": "test_operation"')
    expect(loggedData).toContain('"userId": "user-123"')
    expect(loggedData).toContain('"correlationId": "corr-456"')
  })
})