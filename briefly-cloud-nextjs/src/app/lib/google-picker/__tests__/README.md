# Google Picker Integration Test Suite

This directory contains comprehensive tests for the Google Picker integration feature, covering all aspects from token management to end-to-end workflows.

## Test Structure

### 1. Token Management Tests (`token-management.test.ts`)
- **Coverage**: Token generation, refresh logic, validation, and security measures
- **Requirements**: 2.1, 2.2, 4.1, 4.2, 4.3
- **Key Areas**:
  - Fresh token generation with valid stored tokens
  - Token refresh for expired tokens
  - Token scope and permission validation
  - Error handling for various failure scenarios
  - Token cleanup and security measures

### 2. Picker Component Tests (`../../../components/__tests__/GooglePicker.test.tsx`)
- **Coverage**: Component rendering, interactions, API loading, and file selection
- **Requirements**: 1.1, 1.2, 1.3, 1.4, 2.3, 2.4
- **Key Areas**:
  - Component rendering and state management
  - Google Picker API loading and initialization
  - Picker configuration and callback handling
  - Error states and recovery mechanisms
  - User interaction flows

### 3. File Registration Integration Tests (`../../../api/storage/google/__tests__/register-files.integration.test.ts`)
- **Coverage**: File registration API, processing queue integration, error handling
- **Requirements**: 3.1, 3.2, 3.3, 3.4, 3.5
- **Key Areas**:
  - API route handler validation and processing
  - File registration service functionality
  - MIME type support and validation
  - Processing queue integration
  - Error handling and recovery

### 4. End-to-End Workflow Tests (`end-to-end-workflow.test.ts`)
- **Coverage**: Complete picker workflow, error scenarios, security compliance
- **Requirements**: 6.1, 6.2, 7.1, 7.2, 8.1
- **Key Areas**:
  - Complete successful workflow from button to processing
  - Error scenarios and recovery mechanisms
  - Security and privacy compliance
  - User experience and error guidance
  - Audit logging and monitoring

## Running Tests

### Individual Test Suites

```bash
# Token management tests
npm test -- src/app/lib/google-picker/__tests__/token-management.test.ts

# Picker component tests
npm test -- src/app/components/__tests__/GooglePicker.test.tsx

# File registration integration tests
npm test -- src/app/api/storage/google/__tests__/register-files.integration.test.ts

# End-to-end workflow tests
npm test -- src/app/lib/google-picker/__tests__/end-to-end-workflow.test.ts
```

### All Google Picker Tests

```bash
# Run all picker-related tests
npm test -- --testPathPattern="google-picker|GooglePicker|register-files"

# Run with coverage
npm test -- --testPathPattern="google-picker|GooglePicker|register-files" --coverage
```

### Specific Test Categories

```bash
# Security and privacy tests
npm test -- --testNamePattern="security|privacy|permission|audit"

# Error handling tests
npm test -- --testNamePattern="error|failure|retry|recovery"

# Integration tests
npm test -- --testNamePattern="integration|end-to-end|workflow"
```

## Test Configuration

### Environment Setup
Tests use Jest with the following configuration:
- **Environment**: `jest-environment-jsdom` for component tests
- **Setup**: `jest.setup.js` for global test configuration
- **Mocks**: Comprehensive mocking of external dependencies
- **Timeout**: 30 seconds for integration tests

### Required Mocks
The tests mock the following external dependencies:
- Google APIs (`window.google`, `window.gapi`)
- Supabase client and database operations
- Next.js API middleware and utilities
- External services (audit, security, retry)
- Browser APIs (fetch, localStorage, etc.)

### Test Data
Tests use consistent test data:
- **User ID**: `test-user-123`
- **Token ID**: `token-456` / `test-token-id`
- **Session ID**: `session-456` / auto-generated
- **File IDs**: `file-1`, `file-2`, etc.

## Coverage Requirements

### Minimum Coverage Targets
- **Statements**: 90%
- **Branches**: 85%
- **Functions**: 90%
- **Lines**: 90%

### Critical Paths (100% Coverage Required)
- Token generation and validation
- Security permission checks
- Error handling and recovery
- Audit logging
- File registration workflow

## Test Scenarios

### Happy Path Scenarios
1. **Complete Workflow**: Button click → Token generation → Picker initialization → File selection → Registration → Processing
2. **Mixed File Types**: Supported and unsupported files handled correctly
3. **Permission Validation**: Valid tokens with proper scopes
4. **Audit Logging**: Complete audit trail for all operations

### Error Scenarios
1. **Token Failures**: Expired tokens, refresh failures, invalid credentials
2. **API Failures**: Google API loading failures, network errors
3. **Permission Violations**: Invalid scopes, security violations
4. **Registration Failures**: Database errors, validation failures
5. **Recovery Flows**: Retry mechanisms, re-authentication flows

### Security Scenarios
1. **Token Security**: Short-lived tokens, proper cleanup
2. **Permission Validation**: Minimal scope usage, violation detection
3. **Audit Compliance**: Comprehensive logging, privacy protection
4. **Error Handling**: Secure error messages, no information leakage

## Debugging Tests

### Common Issues
1. **Mock Setup**: Ensure all external dependencies are properly mocked
2. **Async Operations**: Use `waitFor` for async state changes
3. **Component State**: Use `act` for state updates in tests
4. **API Calls**: Mock fetch responses for different scenarios

### Debug Commands
```bash
# Run tests in debug mode
npm test -- --testPathPattern="google-picker" --verbose --no-cache

# Run single test with full output
npm test -- --testNamePattern="specific test name" --verbose

# Run tests in watch mode for development
npm test -- --testPathPattern="google-picker" --watch
```

### Logging
Tests include comprehensive logging for debugging:
- Mock function calls and arguments
- Component state changes
- API request/response cycles
- Error scenarios and recovery attempts

## Maintenance

### Adding New Tests
1. Follow the existing test structure and naming conventions
2. Include comprehensive mocking for external dependencies
3. Test both happy path and error scenarios
4. Ensure proper cleanup in `beforeEach`/`afterEach`
5. Add appropriate JSDoc comments for test purposes

### Updating Tests
1. Update tests when requirements change
2. Maintain backward compatibility where possible
3. Update mock data to reflect real-world scenarios
4. Keep test documentation current

### Performance Considerations
- Tests run in parallel where possible
- Mocks are optimized for speed
- Large test data is generated programmatically
- Cleanup is performed efficiently between tests

## Integration with CI/CD

### Pre-commit Hooks
Tests should be run before commits:
```bash
# In package.json scripts
"pre-commit": "npm test -- --testPathPattern='google-picker' --passWithNoTests"
```

### CI Pipeline
Tests are included in the CI pipeline:
```bash
# CI test command
npm run test:google-picker
```

### Coverage Reporting
Coverage reports are generated and uploaded to coverage services:
```bash
npm test -- --coverage --testPathPattern="google-picker"
```

This comprehensive test suite ensures the Google Picker integration is robust, secure, and maintainable while providing excellent developer experience and debugging capabilities.
