/**
 * Security Test Setup
 * 
 * Sets up the test environment for security tests with proper mocks and configurations.
 */

// Set test environment
process.env.NODE_ENV = 'test'
process.env.SECURITY_TEST_MODE = 'true'

// Mock environment variables
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters'
process.env.JWT_SECRET = 'test-jwt-secret-key'

// Setup security test environment
export function setupSecurityMocks() {
  // Mock console methods to reduce noise in tests
  global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  }
}

// Global setup
beforeAll(() => {
  setupSecurityMocks()
})

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks()
})

// Global cleanup
afterAll(() => {
  console.log('Cleaning up security test resources...')
})