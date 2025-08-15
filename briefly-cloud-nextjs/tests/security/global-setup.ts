/**
 * Global Setup for Security Tests
 * 
 * Sets up the test environment before running security tests.
 * This includes database connections, test data, and security configurations.
 */

export default async function globalSetup() {
  console.log('🔧 Setting up security test environment...')
  
  // Set test environment variables
  process.env.NODE_ENV = 'test'
  process.env.SECURITY_TEST_MODE = 'true'
  
  // Mock external services for security tests
  process.env.SUPABASE_URL = 'https://test.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'test-anon-key'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
  
  // Mock encryption keys for testing
  process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters'
  process.env.JWT_SECRET = 'test-jwt-secret-key'
  
  console.log('✅ Security test environment ready')
}