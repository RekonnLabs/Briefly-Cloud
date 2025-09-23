/**
 * Schema-specific error handling for post-migration API fixes
 * Provides structured error handling with schema context information
 */

export interface SchemaErrorContext {
  schema: 'app' | 'private' | 'public'
  operation: string
  table?: string
  userId?: string
  correlationId?: string
  originalError?: Error | any
}

export class SchemaError extends Error {
  public readonly schema: 'app' | 'private' | 'public'
  public readonly operation: string
  public readonly table?: string
  public readonly userId?: string
  public readonly correlationId?: string
  public readonly originalError?: Error | any
  public readonly code: string
  public readonly isRetryable: boolean

  constructor(
    message: string,
    context: SchemaErrorContext,
    code?: string,
    isRetryable = false
  ) {
    super(`[${context.schema}] ${context.operation}: ${message}`)
    this.name = 'SchemaError'
    this.schema = context.schema
    this.operation = context.operation
    this.table = context.table
    this.userId = context.userId
    this.correlationId = context.correlationId
    this.originalError = context.originalError
    this.code = code || 'SCHEMA_ERROR'
    this.isRetryable = isRetryable
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      schema: this.schema,
      operation: this.operation,
      table: this.table,
      userId: this.userId,
      correlationId: this.correlationId,
      code: this.code,
      isRetryable: this.isRetryable,
      stack: this.stack
    }
  }
}

/**
 * Common PostgreSQL error codes that indicate schema-related issues
 */
export const POSTGRES_ERROR_CODES = {
  RELATION_NOT_EXISTS: '42P01',
  SCHEMA_NOT_EXISTS: '3F000',
  PERMISSION_DENIED: '42501',
  FUNCTION_NOT_EXISTS: '42883',
  COLUMN_NOT_EXISTS: '42703',
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502',
  CHECK_VIOLATION: '23514'
} as const

/**
 * Supabase/PostgREST error codes
 */
export const SUPABASE_ERROR_CODES = {
  TABLE_NOT_FOUND: 'PGRST116',
  PERMISSION_DENIED: 'PGRST301',
  ROW_NOT_FOUND: 'PGRST116',
  INVALID_REQUEST: 'PGRST102'
} as const

/**
 * Handle schema-specific errors with proper categorization and context
 */
export function handleSchemaError(
  error: any,
  context: SchemaErrorContext
): SchemaError {
  const errorCode = error?.code || error?.error_code || 'UNKNOWN'
  const errorMessage = error?.message || error?.error_description || 'Unknown error'

  // Handle PostgreSQL relation/schema errors
  if (errorCode === POSTGRES_ERROR_CODES.RELATION_NOT_EXISTS) {
    return new SchemaError(
      `Table or view "${context.table || 'unknown'}" does not exist in ${context.schema} schema. Check schema configuration and migrations.`,
      context,
      'RELATION_NOT_EXISTS',
      false
    )
  }

  if (errorCode === POSTGRES_ERROR_CODES.SCHEMA_NOT_EXISTS) {
    return new SchemaError(
      `Schema "${context.schema}" does not exist. Check database configuration.`,
      context,
      'SCHEMA_NOT_EXISTS',
      false
    )
  }

  if (errorCode === POSTGRES_ERROR_CODES.FUNCTION_NOT_EXISTS) {
    return new SchemaError(
      `RPC function does not exist. Check if migration scripts have been deployed.`,
      context,
      'FUNCTION_NOT_EXISTS',
      false
    )
  }

  if (errorCode === POSTGRES_ERROR_CODES.PERMISSION_DENIED) {
    return new SchemaError(
      `Permission denied for ${context.operation} on ${context.schema} schema. Check RLS policies and user permissions.`,
      context,
      'PERMISSION_DENIED',
      false
    )
  }

  // Handle Supabase/PostgREST errors
  if (errorCode === SUPABASE_ERROR_CODES.TABLE_NOT_FOUND) {
    return new SchemaError(
      `Table not found in ${context.schema} schema. Verify schema configuration and table existence.`,
      context,
      'TABLE_NOT_FOUND',
      false
    )
  }

  if (errorCode === SUPABASE_ERROR_CODES.PERMISSION_DENIED) {
    return new SchemaError(
      `Access denied to ${context.schema} schema resources. Check authentication and RLS policies.`,
      context,
      'ACCESS_DENIED',
      false
    )
  }

  // Handle data integrity errors (potentially retryable)
  if (errorCode === POSTGRES_ERROR_CODES.UNIQUE_VIOLATION) {
    return new SchemaError(
      `Unique constraint violation in ${context.schema} schema. Record may already exist.`,
      context,
      'UNIQUE_VIOLATION',
      false
    )
  }

  if (errorCode === POSTGRES_ERROR_CODES.FOREIGN_KEY_VIOLATION) {
    return new SchemaError(
      `Foreign key constraint violation in ${context.schema} schema. Referenced record may not exist.`,
      context,
      'FOREIGN_KEY_VIOLATION',
      false
    )
  }

  if (errorCode === POSTGRES_ERROR_CODES.NOT_NULL_VIOLATION) {
    return new SchemaError(
      `Required field missing in ${context.schema} schema operation.`,
      context,
      'NOT_NULL_VIOLATION',
      false
    )
  }

  // Handle network/connection errors (retryable)
  if (errorMessage.includes('network') || errorMessage.includes('timeout') || errorMessage.includes('connection')) {
    return new SchemaError(
      `Network error during ${context.schema} schema operation: ${errorMessage}`,
      context,
      'NETWORK_ERROR',
      true
    )
  }

  // Handle RPC-specific errors
  if (context.operation.includes('rpc') || context.operation.includes('RPC')) {
    return new SchemaError(
      `RPC function error in ${context.schema} schema: ${errorMessage}`,
      context,
      'RPC_ERROR',
      false
    )
  }

  // Generic schema error
  return new SchemaError(
    `${errorMessage}`,
    context,
    'GENERIC_SCHEMA_ERROR',
    false
  )
}

/**
 * Log schema errors with structured context for debugging and monitoring
 */
export function logSchemaError(error: SchemaError): void {
  const logData = {
    timestamp: new Date().toISOString(),
    error: {
      name: error.name,
      message: error.message,
      code: error.code,
      isRetryable: error.isRetryable
    },
    context: {
      schema: error.schema,
      operation: error.operation,
      table: error.table,
      userId: error.userId,
      correlationId: error.correlationId
    },
    originalError: error.originalError ? {
      name: error.originalError.name,
      message: error.originalError.message,
      code: error.originalError.code,
      stack: error.originalError.stack
    } : null
  }

  console.error('Schema Error:', JSON.stringify(logData, null, 2))
}

/**
 * Utility to wrap repository operations with schema error handling
 */
export async function withSchemaErrorHandling<T>(
  operation: () => Promise<T>,
  context: SchemaErrorContext
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    const schemaError = handleSchemaError(error, context)
    logSchemaError(schemaError)
    throw schemaError
  }
}

/**
 * Extract schema context from API request for error handling
 */
export function extractSchemaContext(
  request: Request,
  operation: string,
  schema: 'app' | 'private' | 'public',
  table?: string
): Partial<SchemaErrorContext> {
  const url = new URL(request.url)
  const correlationId = request.headers.get('x-correlation-id') || 
                       request.headers.get('x-request-id') ||
                       crypto.randomUUID()

  return {
    schema,
    operation,
    table,
    correlationId
  }
}