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
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/tests/(.*)$': '<rootDir>/tests/$1'
  },

  // Coverage configuration
  collectCoverage: false, // Disable coverage for now to focus on test execution

  // Coverage thresholds disabled for initial testing

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

  // Transform configuration will be handled by Next.js Jest config

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
    ['jest-junit', {
      outputDirectory: './reports/security',
      outputName: 'jest-results.xml',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}',
      ancestorSeparator: ' › ',
      usePathForSuiteName: true,
      addFileAttribute: true,
      includeConsoleOutput: true,
      suiteName: 'Security Tests'
    }]
  ],

  // Environment variables for security tests
  testEnvironmentOptions: {
    NODE_ENV: 'test',
    SECURITY_TEST_MODE: 'true',
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



  // Security-specific test configuration
  testSequencer: '<rootDir>/tests/security/security-test-sequencer.js'
};

// Create the Jest config with Next.js integration
module.exports = createJestConfig(customJestConfig);