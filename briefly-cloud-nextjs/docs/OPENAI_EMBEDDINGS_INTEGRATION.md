# OpenAI Embeddings Integration

This document describes the OpenAI embeddings integration implementation for Briefly Cloud, providing semantic search capabilities for document processing and AI chat functionality.

## Overview

The embeddings integration provides:
- **Single text embedding generation** using OpenAI's latest models
- **Batch embedding processing** for efficient bulk operations
- **Document chunk embedding** with database storage
- **BYOK (Bring Your Own Key)** support for Pro users
- **Retry logic** for failed requests
- **Rate limiting** and error handling
- **Cost tracking** and usage monitoring

## Architecture

### Core Components

1. **EmbeddingsService Class** (`/src/app/lib/embeddings.ts`)
   - Main service class for embedding operations
   - Supports both system and user-provided API keys
   - Implements retry logic and error handling

2. **API Routes**
   - `/api/embeddings` - Single text embedding generation
   - `/api/embeddings/batch` - Batch text embedding generation
   - `/api/embeddings/chunks/[fileId]` - Document chunk embedding

3. **Supporting Utilities**
   - Error handling and logging
   - Rate limiting and middleware
   - API response formatting

## Features

### Embedding Models

The integration supports OpenAI's latest embedding models:

| Model | Dimensions | Max Tokens | Cost per 1K tokens | Use Case |
|-------|------------|------------|-------------------|----------|
| `text-embedding-3-small` | 1536 | 8191 | $0.00002 | General use, cost-effective |
| `text-embedding-3-large` | 3072 | 8191 | $0.00013 | High accuracy, complex documents |
| `text-embedding-ada-002` | 1536 | 8191 | $0.0001 | Legacy support (deprecated) |

**Default Model**: `text-embedding-3-small` (recommended for most use cases)

### BYOK (Bring Your Own Key) Support

Pro BYOK users can use their own OpenAI API keys:

```typescript
// System API key (default)
const embeddingsService = createEmbeddingsService()

// User API key (BYOK)
const userEmbeddingsService = createUserEmbeddingsService(userApiKey)
```

The system automatically detects BYOK users and uses their stored API key when available.

### Retry Logic

Built-in retry mechanism for failed requests:
- **Max Retries**: 3 attempts
- **Retry Delay**: 1 second (with exponential backoff)
- **Retry Conditions**: Rate limits, temporary failures, network issues

### Batch Processing

Efficient batch processing for multiple texts:
- **Batch Size**: 100 texts per batch (configurable)
- **Rate Limiting**: Automatic delays between batches
- **Progress Tracking**: Detailed logging and performance metrics

## API Endpoints

### POST /api/embeddings

Generate embedding for a single text.

**Request Body:**
```json
{
  "text": "Your text content here",
  "model": "text-embedding-3-small",
  "dimensions": 1536
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "embedding": [0.1234, -0.5678, ...],
    "metadata": {
      "model": "text-embedding-3-small",
      "dimensions": 1536,
      "tokens": 15,
      "estimated_cost": 0.0000003,
      "is_user_key": false
    }
  }
}
```

### POST /api/embeddings/batch

Generate embeddings for multiple texts.

**Request Body:**
```json
{
  "texts": ["First text", "Second text", "Third text"],
  "model": "text-embedding-3-small",
  "include_similarities": false
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "embeddings": [
      {
        "index": 0,
        "embedding": [0.1234, -0.5678, ...],
        "dimensions": 1536,
        "tokens": 15
      }
    ],
    "metadata": {
      "total_texts": 3,
      "total_tokens": 45,
      "total_cost": 0.0000009,
      "processing_time": 1250
    }
  }
}
```

### POST /api/embeddings/chunks/[fileId]

Generate embeddings for document chunks and store in database.

**Request Body:**
```json
{
  "model": "text-embedding-3-small",
  "force_regenerate": false,
  "save_to_database": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "embeddings": [
      {
        "chunk_index": 0,
        "embedding": [0.1234, -0.5678, ...],
        "dimensions": 1536,
        "content_preview": "First chunk content..."
      }
    ],
    "metadata": {
      "file_id": "uuid",
      "total_chunks": 25,
      "total_tokens": 1250,
      "total_cost": 0.000025
    }
  }
}
```

## Usage Examples

### Basic Embedding Generation

```typescript
import { createEmbeddingsService } from '@/app/lib/embeddings'

const embeddingsService = createEmbeddingsService()
const result = await embeddingsService.generateEmbedding(
  "This is a test document for embedding generation."
)

console.log(`Generated ${result.dimensions}-dimensional embedding`)
console.log(`Used ${result.tokens} tokens`)
```

### Batch Processing

```typescript
const texts = [
  "First document content",
  "Second document content", 
  "Third document content"
]

const batchResult = await embeddingsService.generateBatchEmbeddings(texts)
console.log(`Processed ${batchResult.embeddings.length} texts`)
console.log(`Total cost: $${batchResult.totalCost}`)
```

### Document Chunk Processing

```typescript
const chunks = await getDocumentChunks(fileId, userId)
const storedChunks = await embeddingsService.generateAndStoreChunkEmbeddings(
  chunks,
  userId,
  fileId,
  'text-embedding-3-small'
)

console.log(`Stored ${storedChunks.length} chunk embeddings`)
```

### Similarity Calculation

```typescript
import { calculateSimilarity } from '@/app/lib/embeddings'

const similarity = calculateSimilarity(embedding1, embedding2)
console.log(`Cosine similarity: ${similarity.toFixed(4)}`)
```

## Configuration

### Environment Variables

Required environment variables in `.env.local`:

```bash
# OpenAI API Configuration
OPENAI_API_KEY=your-openai-api-key-here

# Supabase Configuration (for BYOK user settings)
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-anon-key
```

### Embedding Configuration

Default configuration can be customized:

```typescript
const customConfig = {
  model: 'text-embedding-3-large',
  dimensions: 3072,
  batchSize: 50,
  maxRetries: 5,
  retryDelay: 2000
}

const embeddingsService = createEmbeddingsService(customConfig)
```

## Rate Limiting

API endpoints are protected with rate limiting:

| Endpoint | Rate Limit | Window |
|----------|------------|--------|
| `/api/embeddings` | 100 requests | 15 minutes |
| `/api/embeddings/batch` | 20 requests | 15 minutes |
| `/api/embeddings/chunks/[fileId]` | 10 requests | 1 hour |

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Remaining requests in window
- `X-RateLimit-Reset`: Window reset time (Unix timestamp)

## Error Handling

The integration handles various error scenarios:

### OpenAI API Errors
- **401 Unauthorized**: Invalid API key
- **429 Rate Limited**: OpenAI rate limit exceeded
- **400 Bad Request**: Invalid request parameters
- **500 Internal Error**: OpenAI service issues

### Application Errors
- **Validation errors**: Invalid input data
- **Authentication errors**: Missing or invalid user session
- **Database errors**: Supabase connection issues
- **Network errors**: Connection timeouts

### Error Response Format

```json
{
  "success": false,
  "error": "OPENAI_ERROR",
  "message": "Rate limit exceeded. Try again in 60 seconds.",
  "code": 429
}
```

## Performance Considerations

### Optimization Strategies

1. **Batch Processing**: Process multiple texts together to reduce API calls
2. **Caching**: Store embeddings in database to avoid regeneration
3. **Rate Limiting**: Respect OpenAI rate limits with automatic delays
4. **Connection Pooling**: Reuse HTTP connections for better performance

### Performance Metrics

The service tracks performance metrics:
- **Processing Time**: Time taken for embedding generation
- **Token Usage**: Number of tokens processed
- **Cost Tracking**: Estimated costs for operations
- **Success Rate**: Percentage of successful requests

## Security

### API Key Management
- System API keys stored securely in environment variables
- User API keys encrypted in database
- No API keys exposed to client-side code

### Input Validation
- Text length limits (max 100,000 characters)
- Batch size limits (max 100 texts)
- Model validation against allowed models

### Access Control
- Authentication required for all endpoints
- User-specific rate limiting
- Subscription tier enforcement

## Monitoring and Logging

### Structured Logging
All operations are logged with structured data:
- Request/response details
- Performance metrics
- Error information
- User context

### Usage Tracking
- API endpoint usage
- Token consumption
- Cost tracking
- Error rates

### Health Monitoring
- Service availability
- Response times
- Error rates
- Rate limit status

## Testing

### Verification Script
Run the verification script to check integration:

```bash
node verify-embeddings.js
```

### Manual Testing
Test API endpoints with curl:

```bash
# Single embedding
curl -X POST http://localhost:3000/api/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{"text": "Test document content"}'

# Batch embeddings
curl -X POST http://localhost:3000/api/embeddings/batch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{"texts": ["Text 1", "Text 2", "Text 3"]}'
```

## Troubleshooting

### Common Issues

1. **Invalid API Key**
   - Verify `OPENAI_API_KEY` in environment variables
   - Check API key permissions and billing status

2. **Rate Limit Exceeded**
   - Wait for rate limit window to reset
   - Consider upgrading OpenAI plan for higher limits

3. **Large Text Processing**
   - Split large texts into smaller chunks
   - Use batch processing for multiple texts

4. **BYOK Not Working**
   - Verify user has `pro_byok` subscription tier
   - Check user's API key is stored in `user_settings` table

### Debug Mode

Enable debug logging by setting environment variable:

```bash
LOG_LEVEL=DEBUG
```

## Future Enhancements

### Planned Features
- **Vector Database Integration**: ChromaDB for semantic search
- **Embedding Caching**: Redis cache for frequently used embeddings
- **Advanced Models**: Support for future OpenAI embedding models
- **Custom Dimensions**: Dynamic dimension configuration
- **Streaming**: Real-time embedding generation for large documents

### Performance Improvements
- **Connection Pooling**: HTTP connection reuse
- **Parallel Processing**: Concurrent batch processing
- **Smart Caching**: Intelligent embedding cache management
- **Compression**: Embedding compression for storage efficiency

## Conclusion

The OpenAI embeddings integration provides a robust, scalable solution for semantic document processing in Briefly Cloud. With comprehensive error handling, BYOK support, and performance optimization, it enables powerful AI-driven document search and chat functionality.

For additional support or questions, refer to the API documentation or contact the development team.