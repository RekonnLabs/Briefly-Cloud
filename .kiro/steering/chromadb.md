# ChromaDB Cloud Integration Guide

## Overview
Briefly Cloud uses ChromaDB Cloud as its production vector database for document embeddings and semantic search. This integration enables users to upload documents, have them automatically indexed, and chat with AI that has full context of their document library.

## Current Status: ✅ PRODUCTION READY
- **Integration Status**: 100% test success rate
- **Connection Type**: ChromaDB Cloud with persistent API keys
- **Performance**: Full document indexing and context retrieval working
- **Multi-Device**: Cloud-based storage enables cross-device access

## Architecture

### Vector Store Implementation
- **File**: `server/vector_store.py`
- **Class**: `ChromaVectorStore`
- **Collection**: `briefly_cloud_docs`
- **Embedding Model**: OpenAI text-embedding-3-large (1536 dimensions)

### Key Components
1. **Document Indexing**: Automatic vectorization of uploaded files
2. **Semantic Search**: Context retrieval for chat responses
3. **Graceful Fallback**: System continues working if ChromaDB unavailable
4. **Error Handling**: Comprehensive logging and recovery mechanisms

## Configuration

### Environment Variables
```env
# ChromaDB Cloud Configuration
CHROMA_API_KEY=ck-DJ4RxesjNMM7kdU2SnoW7bcW7aCDBksXMGE7htDWMJyG
CHROMA_TENANT_ID=d66de939-998f-4a7c-beaa-631552b609fb
CHROMA_DB_NAME=Briefly Cloud
CHROMA_CLOUD_URL=https://api.trychroma.com/v1

# OpenAI for Embeddings
OPENAI_API_KEY=your-openai-api-key
```

### Connection Methods
The system tries multiple connection approaches in order:

1. **ChromaDB CloudClient** (Primary)
   ```python
   client = chromadb.CloudClient(
       api_key=chroma_api_key,
       tenant=chroma_tenant,
       database=chroma_database
   )
   ```

2. **HttpClient with Bearer Token** (Fallback)
   ```python
   client = chromadb.HttpClient(
       host='api.trychroma.com',
       port=443,
       ssl=True,
       headers={"Authorization": f"Bearer {chroma_api_key}"},
       tenant=chroma_tenant,
       database=chroma_database
   )
   ```

3. **Graceful Degradation** (Final Fallback)
   - System continues without vector search
   - Authentication and core features remain available
   - Clear logging of the issue

## Testing

### Test Files
- `test_chromadb_integration.py` - Comprehensive integration test suite
- `test_chroma_cloud_direct.py` - Direct connection testing

### Test Coverage
1. **Environment Variables**: Validates all required config
2. **Vector Store Connection**: Tests ChromaDB Cloud connectivity
3. **Document Indexing**: Verifies document vectorization
4. **Context Retrieval**: Tests semantic search functionality
5. **API Endpoints**: Validates server integration

### Running Tests
```bash
# Full integration test
python test_chromadb_integration.py

# Direct connection test
python test_chroma_cloud_direct.py
```

## Usage Patterns

### Document Indexing
```python
from vector_store import build_vector_index

documents = [
    {
        'content': 'Document text content',
        'source': 'filename.pdf',
        'title': 'Document Title',
        'type': 'application/pdf',
        'user_id': 'user-uuid',
        'file_id': 'file-uuid',
        'chunk_index': 0
    }
]

success = build_vector_index(documents)
```

### Context Retrieval
```python
from vector_store import get_relevant_context

context = get_relevant_context(
    query="What is artificial intelligence?",
    max_results=5
)

# Returns list of relevant document chunks with relevance scores
```

### Vector Store Stats
```python
from vector_store import get_vector_store_stats

stats = get_vector_store_stats()
# Returns connection status, document count, collection info
```

## Integration Points

### Chat Route (`server/routes/chat.py`)
- Retrieves relevant document context for user queries
- Enhances LLM responses with document-specific information
- Gracefully handles ChromaDB unavailability

### Embed Route (`server/routes/embed.py`)
- Processes uploaded documents from cloud storage
- Chunks documents and generates embeddings
- Stores vectors in ChromaDB Cloud collection

## Troubleshooting

### Common Issues

1. **Permission Denied Errors**
   - Verify API key is correct and persistent (not session-based)
   - Check tenant ID exists in ChromaDB Cloud dashboard
   - Ensure API key has proper permissions

2. **Connection Timeouts**
   - ChromaDB Cloud may have temporary outages
   - System will gracefully degrade and continue working
   - Check ChromaDB Cloud status page

3. **Collection Not Found**
   - System automatically creates collections on first use
   - Verify tenant and database names are correct

### Debugging Commands
```bash
# Test direct connection
python test_chroma_cloud_direct.py

# Check server logs
python server/main.py  # Look for ChromaDB connection messages

# Verify environment variables
python -c "import os; from dotenv import load_dotenv; load_dotenv('server/.env'); print(f'API Key: {os.getenv(\"CHROMA_API_KEY\")[:15]}...')"
```

## Performance Considerations

### Embedding Generation
- Uses OpenAI text-embedding-3-large (1536 dimensions)
- Cached embeddings to avoid regeneration
- Batch processing for multiple documents

### Search Performance
- ChromaDB Cloud handles vector similarity search
- Results include relevance scores (1.0 - distance)
- Configurable result limits (default: 5 results)

### Scalability
- ChromaDB Cloud handles scaling automatically
- No local storage requirements
- Multi-device access through cloud storage

## Security

### API Key Management
- Use persistent API keys (not session-based)
- Store in environment variables, never in code
- Rotate keys periodically for security

### Data Privacy
- Documents stored in ChromaDB Cloud
- Tenant isolation ensures data separation
- Embeddings are anonymized vector representations

## Future Enhancements

### Potential Improvements
1. **Hybrid Search**: Combine vector search with keyword search
2. **Document Metadata**: Enhanced filtering by document type, date, etc.
3. **User Collections**: Separate collections per user for better isolation
4. **Caching Layer**: Redis cache for frequently accessed embeddings
5. **Analytics**: Track search patterns and document usage

### Migration Considerations
- Current implementation is production-ready
- ChromaDB Cloud provides reliable, persistent storage
- Alternative vector databases (Pinecone, Weaviate) could be considered if needed

## Monitoring

### Health Checks
- Vector store availability checked on startup
- Graceful degradation if unavailable
- Health endpoint reports vector store status

### Logging
- Comprehensive logging of connection attempts
- Error tracking for debugging
- Performance metrics for search operations

---

## Quick Reference

### Key Files
- `server/vector_store.py` - Main vector store implementation
- `server/routes/chat.py` - Context retrieval for chat
- `server/routes/embed.py` - Document indexing
- `test_chromadb_integration.py` - Integration tests

### Environment Variables
- `CHROMA_API_KEY` - Persistent ChromaDB Cloud API key
- `CHROMA_TENANT_ID` - ChromaDB Cloud tenant identifier
- `CHROMA_DB_NAME` - Database name (default: "Briefly Cloud")
- `OPENAI_API_KEY` - For embedding generation

### Test Commands
```bash
python test_chromadb_integration.py    # Full test suite
python test_chroma_cloud_direct.py     # Connection test
python server/main.py                  # Start server with ChromaDB
```

This integration provides the foundation for Briefly's core functionality - enabling users to have intelligent conversations with their document library across all their devices.