# Vector Similarity RPC Function Deployment

This document describes the deployment of the vector similarity search RPC function for the document chunks repository.

## Overview

The `search_document_chunks_by_similarity` RPC function provides vector similarity search functionality for document chunks stored in the `app.document_chunks` table. This function is used by the DocumentChunksRepository for semantic search capabilities.

## Function Details

### Function Signature
```sql
search_document_chunks_by_similarity(
  query_embedding vector(1536),
  user_id UUID,
  similarity_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10,
  file_ids UUID[] DEFAULT NULL
)
```

### Parameters
- `query_embedding`: The embedding vector to search for (1536 dimensions for OpenAI text-embedding-3-large)
- `user_id`: UUID of the user to filter results (ensures user isolation)
- `similarity_threshold`: Minimum similarity score (0.0 to 1.0, default 0.7)
- `match_count`: Maximum number of results to return (default 10)
- `file_ids`: Optional array of file IDs to filter results

### Returns
Table with columns:
- `id`: Chunk ID
- `file_id`: File UUID
- `owner_id`: User UUID
- `chunk_index`: Chunk position in file
- `content`: Chunk text content
- `embedding`: Chunk embedding vector
- `token_count`: Number of tokens in chunk
- `created_at`: Creation timestamp
- `similarity`: Similarity score (0.0 to 1.0)

## Prerequisites

### Database Extensions
The function requires the `vector` extension for PostgreSQL:

```sql
-- Enable vector extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;
```

### Table Schema
The function expects the `app.document_chunks` table to have:
- `embedding` column of type `vector(1536)`
- Proper indexes for performance

### Recommended Indexes
```sql
-- Index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding 
ON app.document_chunks USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Index for user filtering
CREATE INDEX IF NOT EXISTS idx_document_chunks_owner_id 
ON app.document_chunks (owner_id);

-- Composite index for user + file filtering
CREATE INDEX IF NOT EXISTS idx_document_chunks_owner_file 
ON app.document_chunks (owner_id, file_id);
```

## Deployment Steps

### 1. Deploy the RPC Function
Execute the SQL file in your Supabase database:

```bash
# Using Supabase CLI
supabase db push --db-url "your-database-url"

# Or execute the SQL directly
psql "your-database-url" -f database/vector-similarity-rpc.sql
```

### 2. Verify Deployment
Test the function with a sample query:

```sql
-- Test the function (replace with actual values)
SELECT * FROM search_document_chunks_by_similarity(
  '[0.1,0.2,0.3,...]'::vector(1536),  -- Sample embedding
  'user-uuid-here'::UUID,              -- User ID
  0.7,                                  -- Similarity threshold
  5,                                    -- Match count
  NULL                                  -- File IDs (all files)
);
```

### 3. Test with Repository
The DocumentChunksRepository will automatically use this function when available:

```typescript
const searchInput: SearchChunksInput = {
  userId: 'user-uuid',
  query: 'search query',
  embedding: [0.1, 0.2, 0.3, ...], // 1536-dimensional vector
  limit: 5,
  similarityThreshold: 0.8
}

const results = await chunksRepo.searchByVector(searchInput)
```

## Security Features

### User Isolation
- Function enforces user isolation by filtering on `owner_id`
- Only returns chunks belonging to the specified user
- Prevents cross-user data access

### Permission Model
- Function uses `SECURITY DEFINER` for controlled access
- Granted only to `authenticated` and `service_role` users
- No public access to prevent unauthorized usage

### Search Path
- Uses explicit schema references (`app.document_chunks`)
- Prevents schema injection attacks
- Maintains consistent behavior across environments

## Performance Considerations

### Vector Index
The function performance depends on proper vector indexing:
- Uses IVFFlat index for approximate nearest neighbor search
- Adjust `lists` parameter based on data size (typically sqrt(rows))
- Consider HNSW index for better performance with larger datasets

### Query Optimization
- Function uses cosine distance (`<=>` operator) for similarity
- Results ordered by distance for optimal performance
- Similarity threshold filters results early in the query

### Monitoring
Monitor function performance:
- Query execution time
- Index usage statistics
- Memory consumption for large result sets

## Troubleshooting

### Common Issues

1. **Function Not Found**
   - Verify function was deployed successfully
   - Check function permissions
   - Repository will fallback to text search

2. **Vector Extension Missing**
   ```sql
   ERROR: type "vector" does not exist
   ```
   Solution: Enable the vector extension

3. **Performance Issues**
   - Check if vector indexes exist
   - Monitor query execution plans
   - Consider adjusting similarity threshold

4. **Permission Errors**
   ```sql
   ERROR: permission denied for function search_document_chunks_by_similarity
   ```
   Solution: Verify function permissions are granted correctly

### Debug Queries
```sql
-- Check if function exists
SELECT proname, proargnames, prosrc 
FROM pg_proc 
WHERE proname = 'search_document_chunks_by_similarity';

-- Check function permissions
SELECT grantee, privilege_type 
FROM information_schema.routine_privileges 
WHERE routine_name = 'search_document_chunks_by_similarity';

-- Check vector extension
SELECT * FROM pg_extension WHERE extname = 'vector';
```

## Fallback Behavior

If the RPC function is not available:
- Repository automatically falls back to text search
- Warning logged: "Vector similarity RPC function not available, falling back to text search"
- Application continues to function normally
- Consider deploying the function for better search quality

## Future Enhancements

### Potential Improvements
1. **Hybrid Search**: Combine vector and text search results
2. **Metadata Filtering**: Add support for filtering by chunk metadata
3. **Reranking**: Implement secondary ranking based on recency or relevance
4. **Caching**: Add result caching for frequently searched embeddings
5. **Analytics**: Track search patterns and performance metrics

This RPC function provides the foundation for semantic search capabilities in the Briefly Cloud application while maintaining security and performance standards.