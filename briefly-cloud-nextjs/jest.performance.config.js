/**
 * Jest configuration for performance tests
 * Optimized for running performance-focused test suites
 */

const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: './',
})

// Performance test specific configuration
const performanceJestConfig = {
  // Performance test specific settings
  testMatch: [
    '<rootDir>/tests/performance/**/*.test.ts',
    '<rootDir>/tests/performance/**/*.test.js'
  ],
  
  // Longer timeout for performance tests
  testTimeout: 30000,
  
  // Run tests serially to avoid resource contention
  maxWorkers: 1,
  
  // Disable coverage for performance tests (adds overhead)
  collectCoverage: false,
  
  // Performance test specific setup
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.js',
    '<rootDir>/tests/performance/setup.ts'
  ],
  
  // More verbose output for performance analysis
  verbose: true,
  
  // Custom reporter for performance metrics
  reporters: [
    'default',
    ['<rootDir>/tests/performance/performance-reporter.js', {}]
  ],
  
  // Environment for performance tests
  testEnvironment: 'node',
  
  // Global setup and teardown for performance tests
  globalSetup: '<rootDir>/tests/performance/global-setup.ts',
  globalTeardown: '<rootDir>/tests/performance/global-teardown.ts',
  
  // Module name mapping for performance tests
  moduleNameMapper: {
    '^server-only$': '<rootDir>/src/app/lib/__mocks__/server-only.js',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/app/(.*)$': '<rootDir>/src/app/$1',
    '^@/components/(.*)$': '<rootDir>/src/app/components/$1',
    '^@/lib/(.*)$': '<rootDir>/src/app/lib/$1',
    '^@/types/(.*)$': '<rootDir>/src/app/types/$1',
    '^@/api/(.*)$': '<rootDir>/src/app/api/$1',
  },
  
  // Transform configuration for TypeScript and ES modules
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { presets: ['next/babel'] }],
  },
  
  transformIgnorePatterns: [
    '/node_modules/(?!(.*\\.mjs$|@supabase|@upstash))',
  ],
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks after each test
  restoreMocks: true,
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(performanceJestConfig)