# Repository Layer with Schema Awareness

This directory contains the repository layer implementation for the multi-tenant database architecture with `app`, `private`, and `public` schemas.

## BaseRepository Class

The `BaseRepository` class provides schema-aware database operations and should be extended by all concrete repository classes.

### Key Features

- **Schema-aware clients**: Access to `appClient`, `privateClient`, and `publicClient`
- **Helper methods**: `executeWithSchema`, `executeWithAppSchema`, `executeWithPrivateSchema`, `executeWithPublicSchema`
- **Error handling**: Comprehensive error handling with schema context
- **Input validation**: Built-in validation and sanitization methods
- **Type safety**: Full TypeScript support with proper interfaces

### Usage Example

```typescript
import { BaseRepository } from './base-repo'

export class MyRepository extends BaseRepository {
  async createRecord(data: any) {
    // Validate required fields
    this.validateRequiredFields(data, ['name', 'email'], 'record creation')
    
    // Sanitize input
    const sanitizedData = this.sanitizeInput(data)
    
    // Execute with app schema
    return this.executeWithAppSchema(async (client) => {
      const { data: result, error } = await client
        .from('my_table')
        .insert(sanitizedData)
        .select()
        .single()
        
      if (error) {
        this.handleDatabaseError(error, 'record creation')
      }
      
      return result
    })
  }
  
  async getOAuthToken(userId: string, provider: string) {
    // Use RPC function for private schema operations
    return this.executeWithAppSchema(async (client) => {
      const { data, error } = await client.rpc('get_oauth_token', {
        p_user_id: userId,
        p_provider: provider
      })
      
      if (error) {
        this.handleDatabaseError(error, 'OAuth token retrieval')
      }
      
      return data
    })
  }
}
```

## Schema Usage Guidelines

### App Schema (`app.*`)
- **Purpose**: Tenant-scoped application data
- **Tables**: `users`, `files`, `document_chunks`, `conversations`, `chat_messages`, etc.
- **Access**: Use `executeWithAppSchema()` or `this.appClient`

### Private Schema (`private.*`)
- **Purpose**: Secrets and system data
- **Tables**: `oauth_tokens`, `audit_logs`, `encryption_keys`, etc.
- **Access**: Use RPC functions via `executeWithAppSchema()` (RPC functions are in public schema but access private data)

### Public Schema (`public.*`)
- **Purpose**: Compatibility views and RPC functions
- **Content**: Views that map to app schema tables, RPC functions for private schema access
- **Access**: Use `executeWithPublicSchema()` or `this.publicClient` (rarely needed)

## Error Handling

The BaseRepository provides comprehensive error handling:

- **Database errors**: Automatically logged with schema context
- **Validation errors**: Clear messages for missing required fields
- **Schema errors**: Specific handling for schema-related issues (table not found, etc.)
- **Consistent format**: All errors follow the same structure

## Best Practices

1. **Always extend BaseRepository** for new repository classes
2. **Use schema-specific methods** (`executeWithAppSchema`, etc.)
3. **Validate inputs** using `validateRequiredFields()`
4. **Sanitize data** using `sanitizeInput()`
5. **Handle errors** using `handleDatabaseError()`
6. **Use RPC functions** for private schema operations
7. **Add TypeScript interfaces** for all data structures

## Migration from Legacy Repositories

When updating existing repositories:

1. Extend `BaseRepository` instead of direct Supabase client usage
2. Replace `supabaseAdmin` with appropriate schema client
3. Use `executeWithAppSchema()` for app schema operations
4. Replace direct private schema access with RPC functions
5. Add proper error handling and validation

See `example-usage.ts` for complete examples of how to implement repositories using the BaseRepository pattern.