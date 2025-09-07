// Optional: configure or set up a testing framework before each test.
// If you delete this file, remove `setupFilesAfterEnv` from `jest.config.js`

// Used for __tests__/testing-library.js
// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Mock Next.js router
jest.mock('next/router', () => ({
  useRouter() {
    return {
      route: '/',
      pathname: '/',
      query: {},
      asPath: '/',
      push: jest.fn(),
      pop: jest.fn(),
      reload: jest.fn(),
      back: jest.fn(),
      prefetch: jest.fn().mockResolvedValue(undefined),
      beforePopState: jest.fn(),
      events: {
        on: jest.fn(),
        off: jest.fn(),
        emit: jest.fn(),
      },
      isFallback: false,
    }
  },
}))

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
    }
  },
  useSearchParams() {
    return new URLSearchParams()
  },
  usePathname() {
    return '/'
  },
}))

// Mock environment variables
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000'
process.env.OPENAI_API_KEY = 'test-openai-key'
process.env.GOOGLE_DRIVE_CLIENT_ID = 'test-google-client-id'
process.env.GOOGLE_DRIVE_CLIENT_SECRET = 'test-google-client-secret'
process.env.MS_DRIVE_CLIENT_ID = 'test-ms-client-id'
process.env.MS_DRIVE_CLIENT_SECRET = 'test-ms-client-secret'
process.env.MS_DRIVE_TENANT_ID = 'test-tenant-id'

// Global test utilities
global.testUtils = {
  createMockUser: (overrides = {}) => ({
    id: 'test-user-id',
    email: 'test@example.com',
    full_name: 'Test User',
    subscription_tier: 'free',
    subscription_status: 'active',
    usage_count: 0,
    usage_limit: 100,
    features_enabled: { ai_chat: true },
    permissions: { can_upload: true },
    last_login_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides
  }),
  
  createMockToken: (overrides = {}) => ({
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    ...overrides
  }),
  
  createMockRequest: (url = 'http://localhost:3000/api/test', options = {}) => {
    return new Request(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'test-agent',
        ...options.headers
      },
      ...options
    })
  }
}

// Increase timeout for integration tests
jest.setTimeout(30000)