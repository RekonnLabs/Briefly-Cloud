/**
 * Integration tests for schema-specific error handling in API routes
 */

import { handleSchemaError, withSchemaErrorHandling, SchemaError } from '../schema-errors'

describe('Schema Error Handling Integration', () => {
  describe('API Route Error Handling', () => {
    it('should handle database connection errors with schema context', async () => {
      const mockDatabaseOperation = jest.fn().mockRejectedValue({
        code: '42P01',
        message: 'relation "app.users" does not exist'
      })

      const context = {
        schema: 'app' as const,
        operation: 'get_user_profile',
        table: 'users',
        userId: 'test-user-123',
        correlationId: 'test-correlation-456'
      }

      await expect(
        withSchemaErrorHandling(mockDatabaseOperation, context)
      ).rejects.toThrow(SchemaError)

      try {
        await withSchemaErrorHandling(mockDatabaseOperation, context)
      } catch (error) {
        expect(error).toBeInstanceOf(SchemaError)
        expect(error.schema).toBe('app')
        expect(error.operation).toBe('get_user_profile')
        expect(error.table).toBe('users')
        expect(error.userId).toBe('test-user-123')
        expect(error.correlationId).toBe('test-correlation-456')
        expect(error.code).toBe('RELATION_NOT_EXISTS')
        expect(error.isRetryable).toBe(false)
      }
    })

    it('should handle RPC function errors for private schema operations', async () => {
      const mockRpcOperation = jest.fn().mockRejectedValue({
        code: '42883',
        message: 'function get_oauth_token(uuid, text) does not exist'
      })

      const context = {
        schema: 'private' as const,
        operation: 'rpc_get_oauth_token',
        userId: 'test-user-123',
        correlationId: 'oauth-callback-789'
      }

      try {
        await withSchemaErrorHandling(mockRpcOperation, context)
      } catch (error) {
        expect(error).toBeInstanceOf(SchemaError)
        expect(error.schema).toBe('private')
        expect(error.operation).toBe('rpc_get_oauth_token')
        expect(error.code).toBe('FUNCTION_NOT_EXISTS')
        expect(error.message).toContain('RPC function does not exist')
        expect(error.isRetryable).toBe(false)
      }
    })

    it('should handle permission denied errors with proper context', async () => {
      const mockPermissionError = jest.fn().mockRejectedValue({
        code: '42501',
        message: 'permission denied for table users'
      })

      const context = {
        schema: 'app' as const,
        operation: 'insert_user_record',
        table: 'users',
        userId: 'test-user-123'
      }

      try {
        await withSchemaErrorHandling(mockPermissionError, context)
      } catch (error) {
        expect(error).toBeInstanceOf(SchemaError)
        expect(error.code).toBe('PERMISSION_DENIED')
        expect(error.message).toContain('Permission denied for insert_user_record on app schema')
        expect(error.isRetryable).toBe(false)
      }
    })

    it('should handle network errors as retryable', async () => {
      const mockNetworkError = jest.fn().mockRejectedValue({
        message: 'network timeout occurred during database operation'
      })

      const context = {
        schema: 'app' as const,
        operation: 'chat_message_storage',
        table: 'chat_messages',
        userId: 'test-user-123'
      }

      try {
        await withSchemaErrorHandling(mockNetworkError, context)
      } catch (error) {
        expect(error).toBeInstanceOf(SchemaError)
        expect(error.code).toBe('NETWORK_ERROR')
        expect(error.message).toContain('Network error during app schema operation')
        expect(error.isRetryable).toBe(true)
      }
    })

    it('should handle Supabase PostgREST errors', async () => {
      const mockSupabaseError = jest.fn().mockRejectedValue({
        code: 'PGRST116',
        message: 'relation "app.missing_table" does not exist'
      })

      const context = {
        schema: 'app' as const,
        operation: 'table_query',
        table: 'missing_table'
      }

      try {
        await withSchemaErrorHandling(mockSupabaseError, context)
      } catch (error) {
        expect(error).toBeInstanceOf(SchemaError)
        expect(error.code).toBe('TABLE_NOT_FOUND')
        expect(error.message).toContain('Table not found in app schema')
        expect(error.isRetryable).toBe(false)
      }
    })
  })

  describe('Error Context Preservation', () => {
    it('should preserve original error information', () => {
      const originalError = new Error('Original database error')
      originalError.stack = 'Original stack trace'

      const context = {
        schema: 'app' as const,
        operation: 'test_operation',
        originalError
      }

      const schemaError = handleSchemaError(originalError, context)

      expect(schemaError.originalError).toBe(originalError)
      expect(schemaError.originalError.message).toBe('Original database error')
      expect(schemaError.originalError.stack).toBe('Original stack trace')
    })

    it('should handle errors without codes gracefully', () => {
      const genericError = new Error('Some generic error')

      const context = {
        schema: 'app' as const,
        operation: 'generic_operation'
      }

      const schemaError = handleSchemaError(genericError, context)

      expect(schemaError.code).toBe('GENERIC_SCHEMA_ERROR')
      expect(schemaError.message).toBe('[app] generic_operation: Some generic error')
      expect(schemaError.isRetryable).toBe(false)
    })
  })

  describe('Schema-Specific Error Patterns', () => {
    it('should categorize app schema errors correctly', () => {
      const appSchemaError = {
        code: '42P01',
        message: 'relation "app.files" does not exist'
      }

      const context = {
        schema: 'app' as const,
        operation: 'file_upload',
        table: 'files'
      }

      const schemaError = handleSchemaError(appSchemaError, context)

      expect(schemaError.schema).toBe('app')
      expect(schemaError.table).toBe('files')
      expect(schemaError.code).toBe('RELATION_NOT_EXISTS')
      expect(schemaError.message).toContain('app schema')
    })

    it('should categorize private schema RPC errors correctly', () => {
      const privateSchemaError = {
        message: 'RPC function save_oauth_token failed'
      }

      const context = {
        schema: 'private' as const,
        operation: 'rpc_save_oauth_token'
      }

      const schemaError = handleSchemaError(privateSchemaError, context)

      expect(schemaError.schema).toBe('private')
      expect(schemaError.code).toBe('RPC_ERROR')
      expect(schemaError.message).toContain('RPC function error in private schema')
    })

    it('should handle generic schema errors correctly', () => {
      const genericSchemaError = {
        code: 'PGRST116',
        message: 'relation not found'
      }

      const context = {
        schema: 'app' as const,
        operation: 'table_access_check',
        table: 'missing_table'
      }

      const schemaError = handleSchemaError(genericSchemaError, context)

      expect(schemaError.schema).toBe('app')
      expect(schemaError.code).toBe('TABLE_NOT_FOUND')
      expect(schemaError.message).toContain('app schema')
    })
  })
})