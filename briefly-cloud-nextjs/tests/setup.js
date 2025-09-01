// Global test setup that runs before all tests

// Mock server-only module
jest.mock('server-only', () => ({}))

// Mock Next.js headers and cookies
jest.mock('next/headers', () => ({
  headers: jest.fn(() => ({
    get: jest.fn(),
    has: jest.fn(),
    entries: jest.fn(() => []),
  })),
  cookies: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    has: jest.fn(),
    getAll: jest.fn(() => []),
  })),
}))

// Mock crypto for Node.js environment
const crypto = require('crypto')
Object.defineProperty(globalThis, 'crypto', {
  value: {
    randomUUID: () => crypto.randomUUID(),
    getRandomValues: (arr) => crypto.getRandomValues(arr),
  },
})

// Mock fetch if not available
if (!global.fetch) {
  global.fetch = jest.fn()
}

// Mock console methods to reduce noise in tests
const originalConsole = { ...console }
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

// Restore console for specific tests if needed
global.restoreConsole = () => {
  global.console = originalConsole
}

// Mock performance API
global.performance = {
  now: jest.fn(() => Date.now()),
  mark: jest.fn(),
  measure: jest.fn(),
}

// Mock TextEncoder/TextDecoder for Node.js environment
const { TextEncoder, TextDecoder } = require('util')
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// Mock URL and URLSearchParams
global.URL = URL
global.URLSearchParams = URLSearchParams