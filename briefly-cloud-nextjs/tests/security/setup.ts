/**
 * Security Test Setup
 * 
 * Global setup configuration for security tests including:
 * - Test environment initialization
 * - Mock configurations
 * - Security test utilities
 * - Database and Redis setup for testing
 */

import { jest } from '@jest/globals';

// Extend Jest matchers for security testing
expect.extend({
  toBeSecurelyHashed(received: string) {
    const pass = received && received.length >= 60 && received.startsWith('$2b$');
    return {
      message: () => `expected ${received} to be a securely hashed password`,
      pass
    };
  },

  toBeValidJWT(received: string) {
    const jwtPattern = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;
    const pass = jwtPattern.test(received);
    return {
      message: () => `expected ${received} to be a valid JWT token`,
      pass
    };
  },

  toBeSecureUrl(received: string) {
    const pass = received && received.startsWith('https://');
    return {
      message: () => `expected ${received} to be a secure HTTPS URL`,
      pass
    };
  },

  toHaveSecurityHeaders(received: Headers) {
    const requiredHeaders = [
      'strict-transport-security',
      'content-security-policy',
      'x-frame-options',
      'x-content-type-options'
    ];
    
    const missingHeaders = requiredHeaders.filter(header => 
      !received.has(header)
    );
    
    const pass = missingHeaders.length === 0;
    return {
      message: () => `expected headers to include security headers: ${missingHeaders.join(', ')}`,
      pass
    };
  },

  toBeWithinRateLimit(received: number, limit: number) {
    const pass = received <= limit;
    return {
      message: () => `expected ${received} to be within rate limit of ${limit}`,
      pass
    };
  }
});

// Global test configuration
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.SECURITY_TEST_MODE = 'true';
  
  // Mock external services for security testing
  setupSecurityMocks();
  
  // Initialize test database if needed
  await initializeTestDatabase();
  
  // Setup Redis mock for rate limiting tests
  setupRedisMocks();
});

afterAll(async () => {
  // Cleanup test resources
  await cleanupTestResources();
});

beforeEach(() => {
  // Reset all mocks before each test
  jest.clearAllMocks();
  
  // Reset security test state
  resetSecurityTestState();
});

afterEach(() => {
  // Cleanup after each test
  cleanupTestState();
});

function setupSecurityMocks() {
  // Mock Supabase client
  jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(() => ({
      auth: {
        getUser: jest.fn(),
        signInWithPassword: jest.fn(),
        signOut: jest.fn(),
        refreshSession: jest.fn(),
        getSession: jest.fn()
      },
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(),
            limit: jest.fn()
          })),
          gte: jest.fn(() => ({
            lte: jest.fn(() => ({
              order: jest.fn()
            }))
          }))
        })),
        insert: jest.fn(),
        update: jest.fn(() => ({
          eq: jest.fn()
        })),
        delete: jest.fn(() => ({
          eq: jest.fn()
        }))
      })),
      rpc: jest.fn(),
      channel: jest.fn(() => ({
        on: jest.fn().mockReturnThis(),
        subscribe: jest.fn()
      }))
    }))
  }));

  // Mock Redis client for rate limiting
  jest.mock('redis', () => ({
    createClient: jest.fn(() => ({
      get: jest.fn(),
      set: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      ttl: jest.fn(),
      multi: jest.fn(() => ({
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn()
      }))
    }))
  }));

  // Mock OpenAI for security testing
  jest.mock('openai', () => ({
    OpenAI: jest.fn(() => ({
      chat: {
        completions: {
          create: jest.fn()
        }
      },
      embeddings: {
        create: jest.fn()
      }
    }))
  }));

  // Mock Next.js API utilities
  jest.mock('next/server', () => ({
    NextRequest: jest.fn(),
    NextResponse: {
      json: jest.fn((data, init) => ({
        json: () => Promise.resolve(data),
        status: init?.status || 200,
        headers: new Headers(init?.headers)
      })),
      redirect: jest.fn()
    }
  }));
}

function setupRedisMocks() {
  // Setup Redis mock responses for rate limiting tests
  const redisMock = {
    rateLimitData: new Map<string, { count: number; expiry: number }>(),
    
    get: jest.fn((key: string) => {
      const data = redisMock.rateLimitData.get(key);
      if (!data || Date.now() > data.expiry) {
        return Promise.resolve(null);
      }
      return Promise.resolve(data.count.toString());
    }),
    
    incr: jest.fn((key: string) => {
      const data = redisMock.rateLimitData.get(key) || { count: 0, expiry: Date.now() + 60000 };
      data.count++;
      redisMock.rateLimitData.set(key, data);
      return Promise.resolve(data.count);
    }),
    
    expire: jest.fn((key: string, seconds: number) => {
      const data = redisMock.rateLimitData.get(key);
      if (data) {
        data.expiry = Date.now() + (seconds * 1000);
        redisMock.rateLimitData.set(key, data);
      }
      return Promise.resolve(1);
    }),
    
    del: jest.fn((key: string) => {
      const deleted = redisMock.rateLimitData.delete(key);
      return Promise.resolve(deleted ? 1 : 0);
    })
  };

  // Make mock available globally for tests
  (global as any).redisMock = redisMock;
}

async function initializeTestDatabase() {
  // Initialize test database if needed
  // This would typically set up a test-specific database instance
  console.log('Initializing test database for security tests...');
  
  // Mock database initialization
  (global as any).testDatabase = {
    users: new Map(),
    files: new Map(),
    conversations: new Map(),
    auditLogs: new Map(),
    usageLogs: new Map()
  };
}

function resetSecurityTestState() {
  // Reset any global security test state
  if ((global as any).testDatabase) {
    (global as any).testDatabase.users.clear();
    (global as any).testDatabase.files.clear();
    (global as any).testDatabase.conversations.clear();
    (global as any).testDatabase.auditLogs.clear();
    (global as any).testDatabase.usageLogs.clear();
  }
  
  if ((global as any).redisMock) {
    (global as any).redisMock.rateLimitData.clear();
  }
}

function cleanupTestState() {
  // Cleanup any test-specific state
  // Reset timers, clear intervals, etc.
  jest.clearAllTimers();
}

async function cleanupTestResources() {
  // Cleanup test resources
  console.log('Cleaning up security test resources...');
  
  // Clear global test objects
  delete (global as any).testDatabase;
  delete (global as any).redisMock;
}

// Security test utilities
export const SecurityTestUtils = {
  // Generate test data
  generateTestUser: (overrides = {}) => ({
    id: `test-user-${Date.now()}`,
    email: `test-${Date.now()}@example.com`,
    subscription_tier: 'free',
    created_at: new Date().toISOString(),
    ...overrides
  }),

  // Generate test tokens
  generateTestToken: (payload = {}) => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const testPayload = Buffer.from(JSON.stringify({
      sub: 'test-user',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...payload
    })).toString('base64url');
    const signature = 'test-signature';
    
    return `${header}.${testPayload}.${signature}`;
  },

  // Security assertion helpers
  assertSecureResponse: (response: any) => {
    expect(response.headers).toHaveSecurityHeaders();
    if (response.headers.get('set-cookie')) {
      expect(response.headers.get('set-cookie')).toContain('HttpOnly');
      expect(response.headers.get('set-cookie')).toContain('Secure');
    }
  },

  // Rate limiting test helpers
  simulateRateLimitExceeded: (key: string, limit: number) => {
    const redisMock = (global as any).redisMock;
    if (redisMock) {
      redisMock.rateLimitData.set(key, { 
        count: limit + 1, 
        expiry: Date.now() + 60000 
      });
    }
  },

  // Authentication test helpers
  mockAuthenticatedUser: (user: any) => {
    const mockSupabase = require('@supabase/supabase-js').createClient();
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user },
      error: null
    });
    return mockSupabase;
  },

  // Audit logging test helpers
  expectAuditLog: (action: string, userId: string) => {
    const testDatabase = (global as any).testDatabase;
    if (testDatabase) {
      const auditLogs = Array.from(testDatabase.auditLogs.values());
      const matchingLog = auditLogs.find(log => 
        log.action === action && log.user_id === userId
      );
      expect(matchingLog).toBeDefined();
    }
  }
};

// Make utilities available globally
(global as any).SecurityTestUtils = SecurityTestUtils;

// Console override for cleaner test output
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  // Suppress expected error messages in tests
  const message = args[0];
  if (typeof message === 'string') {
    const suppressedMessages = [
      'Warning: ReactDOM.render is deprecated',
      'Warning: componentWillReceiveProps has been renamed'
    ];
    
    if (suppressedMessages.some(suppressed => message.includes(suppressed))) {
      return;
    }
  }
  
  originalConsoleError.apply(console, args);
};