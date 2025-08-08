# Test Suite Documentation

This directory contains the comprehensive test suite for the Briefly Cloud Next.js application.

## Test Structure

### Unit Tests (`src/app/lib/__tests__/`)
- **auth.test.ts**: Authentication system tests (NextAuth, OAuth providers, session handling)
- **openai.test.ts**: OpenAI integration tests (model selection, embeddings, chat completions)
- **vector-storage.test.ts**: Vector storage tests (ChromaDB, pgvector fallback)
- **document-extractor.test.ts**: Document text extraction tests (PDF, DOCX, XLSX, etc.)
- **document-chunker.test.ts**: Text chunking tests (sentence boundaries, metadata preservation)

### Integration Tests (`tests/integration/`)
- **api-upload.test.ts**: File upload API integration tests
- **api-chat.test.ts**: Chat API integration tests

### End-to-End Tests (`tests/e2e/`)
- **auth-flow.spec.ts**: Authentication flow E2E tests
- **file-upload.spec.ts**: File upload E2E tests

## Running Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run E2E tests only
npm run test:e2e

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## Test Coverage

The test suite covers:

1. **Authentication System**
   - OAuth provider configuration
   - Session management
   - Token refresh
   - Error handling

2. **Document Processing**
   - File upload validation
   - Text extraction from various formats
   - Document chunking
   - Embedding generation

3. **Vector Storage**
   - ChromaDB operations
   - pgvector fallback
   - Search functionality
   - Error handling

4. **API Endpoints**
   - Upload API
   - Chat API
   - Search API
   - Error responses

5. **User Interface**
   - Authentication flows
   - File upload interface
   - Error handling
   - Responsive design

## Test Fixtures

Test files are located in `tests/fixtures/`:
- `test-document.pdf`: Sample PDF for testing
- `test-document.txt`: Sample text file
- Additional files for various formats

## Mocking Strategy

The test suite uses comprehensive mocking to:
- Isolate unit tests from external dependencies
- Mock external APIs (OpenAI, ChromaDB, Supabase)
- Simulate various error conditions
- Test edge cases and error handling

## Continuous Integration

Tests are configured to run in CI/CD pipelines with:
- Jest for unit and integration tests
- Playwright for E2E tests
- Coverage reporting
- Parallel test execution
