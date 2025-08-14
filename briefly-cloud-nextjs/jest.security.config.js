/**
 * Jest Configuration for Security Tests
 * 
 * Specialized Jest configuration for running security-focused tests
 * with appropriate timeouts, coverage, and reporting settings.
 */

const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: './',
});

// Add any custom config to be passed to Jest
const customJestConfig = {
  // Test environment
  testEnvironment: 'node',

  // Test file patterns for security tests
  testMatch: [
    '<rootDir>/tests/security/**/*.test.ts',
    '<rootDir>/tests/security/**/*.test.js'
  ],

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/security/setup.ts'],

  // Module name mapping
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/tests/(.*)$': '<rootDir>/tests/$1'
  },

  // Coverage configuration
  collectCoverage: true,
  collectCoverageFrom: [
    'src/app/lib/auth/**/*.{ts,tsx}',
    'src/app/lib/security/**/*.{ts,tsx}',
    'src/app/lib/audit/**/*.{ts,tsx}',
    'src/app/lib/usage/**/*.{ts,tsx}',
    'src/app/api/**/*.{ts,tsx}',
    'src/app/middleware.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/__tests__/**',
    '!src/**/node_modules/**'
  ],

  // Coverage thresholds for security-critical code
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    // Higher thresholds for security-critical modules
    'src/app/lib/auth/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    'src/app/lib/security/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    'src/app/lib/audit/': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },

  // Coverage reporters
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json-summary',
    'cobertura'
  ],

  // Coverage directory
  coverageDirectory: '<rootDir>/coverage/security',

  // Test timeout (security tests may take longer)
  testTimeout: 30000,

  // Verbose output for security tests
  verbose: true,

  // Detect open handles (important for security tests with async operations)
  detectOpenHandles: true,

  // Force exit after tests complete
  forceExit: true,

  // Maximum number of concurrent workers
  maxWorkers: '50%',

  // Transform configuration
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        jsx: 'react-jsx'
      }
    }]
  },

  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  // Global setup and teardown
  globalSetup: '<rootDir>/tests/security/global-setup.ts',
  globalTeardown: '<rootDir>/tests/security/global-teardown.ts',

  // Test results processor for security-specific reporting
  testResultsProcessor: '<rootDir>/tests/security/results-processor.js',

  // Reporter configuration
  reporters: [
    'default',
    ['jest-html-reporters', {
      publicPath: './coverage/security/html-report',
      filename: 'security-test-report.html',
      expand: true,
      hideIcon: false,
      pageTitle: 'Security Test Report'
    }],
    ['jest-junit', {
      outputDirectory: './coverage/security',
      outputName: 'security-test-results.xml',
      suiteName: 'Security Tests'
    }]
  ],

  // Globals for security tests
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json'
    },
    // Security test environment variables
    SECURITY_TEST_MODE: true,
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
    TEST_REDIS_URL: process.env.TEST_REDIS_URL
  },

  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,

  // Error handling
  errorOnDeprecated: true,

  // Notify mode for CI/CD
  notify: false,
  notifyMode: 'failure-change',

  // Cache configuration
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache/security',

  // Watch mode configuration (for development)
  watchPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/coverage/',
    '<rootDir>/.next/',
    '<rootDir>/dist/'
  ],

  // Snapshot configuration
  updateSnapshot: false,

  // Test environment options
  testEnvironmentOptions: {
    // Node.js environment options for security tests
    NODE_ENV: 'test',
    SECURITY_TEST_ISOLATION: 'true'
  }
};

// Create the Jest config with Next.js integration
module.exports = createJestConfig(customJestConfig);