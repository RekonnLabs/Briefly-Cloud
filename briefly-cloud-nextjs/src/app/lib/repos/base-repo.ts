/**
 * Base Repository Class with Schema Awareness
 * 
 * This base class provides schema-aware database operations for the multi-tenant
 * database architecture with app, private, and public schemas.
 */

import { supabaseApp, supabasePrivate } from '@/app/lib/supabase-clients'
import type { SupabaseApp, SupabasePrivate } from '@/app/lib/supabase-clients'
import { createError } from '@/app/lib/api-errors'

// TypeScript interfaces for repository operations
export interface RepositoryError {
  code: string
  message: string
  details?: any
}

export interface RepositoryResult<T> {
  data: T | null
  error: RepositoryError | null
}

export interface RepositoryListResult<T> {
  data: T[]
  count: number
  error: RepositoryError | null
}

export interface SchemaOperation<T> {
  (client: SupabaseApp | SupabasePrivate): Promise<T>
}

/**
 * Base repository class providing schema-aware database operations
 */
export abstract class BaseRepository {
  /**
   * Get the app schema client for tenant-scoped operations
   * @returns Supabase client configured for app schema
   */
  protected get appClient(): SupabaseApp {
    return supabaseApp
  }

  /**
   * Get the private schema client for secrets and system data
   * @returns Supabase client configured for private schema
   */
  protected get privateClient(): SupabasePrivate {
    return supabasePrivate
  }



  /**
   * Execute an operation with a specific schema client
   * @param schema - The schema to use ('app' or 'private')
   * @param operation - The operation to execute with the schema client
   * @returns Promise resolving to the operation result
   */
  protected async executeWithSchema<T>(
    schema: 'app' | 'private',
    operation: SchemaOperation<T>
  ): Promise<T> {
    try {
      const client = this.getClientForSchema(schema)
      return await operation(client)
    } catch (error) {
      throw this.handleRepositoryError(error, schema, operation.name || 'unknown')
    }
  }

  /**
   * Execute an operation with the app schema client
   * @param operation - The operation to execute
   * @returns Promise resolving to the operation result
   */
  protected async executeWithAppSchema<T>(operation: SchemaOperation<T>): Promise<T> {
    return this.executeWithSchema('app', operation)
  }

  /**
   * Execute an operation with the private schema client
   * @param operation - The operation to execute
   * @returns Promise resolving to the operation result
   */
  protected async executeWithPrivateSchema<T>(operation: SchemaOperation<T>): Promise<T> {
    return this.executeWithSchema('private', operation)
  }



  /**
   * Handle database errors with proper context
   * @param error - The error that occurred
   * @param context - Additional context about the operation
   * @returns Formatted repository error
   */
  protected handleDatabaseError(error: any, context: string): never {
    // Log the error with schema context
    console.error(`Repository error in ${context}:`, {
      error: error.message || error,
      code: error.code,
      details: error.details,
      hint: error.hint,
      context
    })

    // Throw a standardized error
    throw createError.databaseError(`Database operation failed: ${context}`, error)
  }

  /**
   * Handle repository-specific errors
   * @param error - The error that occurred
   * @param schema - The schema where the error occurred
   * @param operation - The operation that failed
   * @returns Formatted repository error
   */
  protected handleRepositoryError(error: any, schema: string, operation: string): never {
    const context = `${schema} schema - ${operation}`
    
    // Check for common database error codes
    if (error.code === 'PGRST116') {
      throw createError.databaseError(
        `Table not found in ${schema} schema. Check schema configuration.`,
        error
      )
    }
    
    if (error.code === '42P01') {
      throw createError.databaseError(
        `Relation does not exist in ${schema} schema.`,
        error
      )
    }

    // Handle other errors
    return this.handleDatabaseError(error, context)
  }

  /**
   * Get the appropriate client for a schema
   * @param schema - The schema name
   * @returns The corresponding Supabase client
   */
  private getClientForSchema(schema: 'app' | 'private'): SupabaseApp | SupabasePrivate {
    switch (schema) {
      case 'app':
        return this.appClient
      case 'private':
        return this.privateClient
      default:
        throw new Error(`Unknown schema: ${schema}`)
    }
  }

  /**
   * Validate that required fields are present
   * @param data - The data to validate
   * @param requiredFields - Array of required field names
   * @param context - Context for error messages
   */
  protected validateRequiredFields(
    data: Record<string, any>, 
    requiredFields: string[], 
    context: string
  ): void {
    const missingFields = requiredFields.filter(field => 
      data[field] === undefined || data[field] === null || data[field] === ''
    )

    if (missingFields.length > 0) {
      throw createError.validation(
        `Missing required fields in ${context}: ${missingFields.join(', ')}`,
        { missingFields, context }
      )
    }
  }

  /**
   * Sanitize input data by removing undefined values
   * @param data - The data to sanitize
   * @returns Sanitized data object
   */
  protected sanitizeInput(data: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {}
    
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        sanitized[key] = value
      }
    }
    
    return sanitized
  }

  /**
   * Build a safe query with proper error handling
   * @param queryBuilder - Function that builds the query
   * @param context - Context for error messages
   * @returns Query result with error handling
   */
  protected async executeSafeQuery<T>(
    queryBuilder: () => Promise<{ data: T | null; error: any; count?: number }>,
    context: string
  ): Promise<{ data: T | null; error: RepositoryError | null; count?: number }> {
    try {
      const result = await queryBuilder()
      
      if (result.error) {
        return {
          data: null,
          error: {
            code: result.error.code || 'DATABASE_ERROR',
            message: result.error.message || 'Database operation failed',
            details: result.error
          },
          count: result.count
        }
      }

      return {
        data: result.data,
        error: null,
        count: result.count
      }
    } catch (error: any) {
      return {
        data: null,
        error: {
          code: 'REPOSITORY_ERROR',
          message: `Repository operation failed: ${context}`,
          details: error
        }
      }
    }
  }
}

// Export types for use in concrete repositories
export type { SupabaseApp, SupabasePrivate }