/**
 * Security Test Sequencer
 * 
 * Custom Jest test sequencer that ensures security tests run in the
 * correct order for proper isolation and dependency management.
 */

const Sequencer = require('@jest/test-sequencer').default;
const path = require('path');

class SecurityTestSequencer extends Sequencer {
  /**
   * Sort test files to ensure proper execution order for security tests
   */
  sort(tests) {
    // Define test execution priority (lower number = higher priority)
    const testPriorities = {
      // Setup and utility tests first
      'setup.test.ts': 1,
      'auth-test-utils.test.ts': 2,
      'rls-test-utils.test.ts': 3,
      
      // Core security tests
      'auth-security.test.ts': 10,
      'session-security.test.ts': 11,
      'rls-authorization.test.ts': 20,
      
      // Feature-specific security tests
      'rate-limiting.test.ts': 30,
      'usage-tracking.test.ts': 31,
      'audit-logging.test.ts': 40,
      'security-monitoring.test.ts': 41,
      
      // Integration tests last
      'integration-e2e.test.ts': 90,
      
      // Default priority for unlisted tests
      'default': 50
    };

    const sortedTests = tests
      .map(test => ({
        test,
        priority: this.getTestPriority(test.path, testPriorities),
        category: this.getTestCategory(test.path),
        fileName: path.basename(test.path)
      }))
      .sort((a, b) => {
        // First sort by priority
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        
        // Then sort by category
        if (a.category !== b.category) {
          return a.category.localeCompare(b.category);
        }
        
        // Finally sort alphabetically by filename
        return a.fileName.localeCompare(b.fileName);
      })
      .map(item => item.test);

    // Log test execution order in verbose mode
    if (process.env.JEST_VERBOSE === 'true' || process.env.CI) {
      console.log('\n🔒 Security Test Execution Order:');
      sortedTests.forEach((test, index) => {
        const fileName = path.basename(test.path);
        const category = this.getTestCategory(test.path);
        console.log(`  ${index + 1}. ${fileName} (${category})`);
      });
      console.log('');
    }

    return sortedTests;
  }

  /**
   * Get test priority based on filename
   */
  getTestPriority(testPath, priorities) {
    const fileName = path.basename(testPath);
    return priorities[fileName] || priorities.default;
  }

  /**
   * Categorize tests for better organization
   */
  getTestCategory(testPath) {
    const fileName = path.basename(testPath, '.test.ts');
    
    if (fileName.includes('auth')) return 'authentication';
    if (fileName.includes('rls') || fileName.includes('authorization')) return 'authorization';
    if (fileName.includes('rate-limiting')) return 'rate-limiting';
    if (fileName.includes('usage')) return 'usage-tracking';
    if (fileName.includes('audit')) return 'audit-logging';
    if (fileName.includes('monitoring')) return 'security-monitoring';
    if (fileName.includes('integration') || fileName.includes('e2e')) return 'integration';
    if (fileName.includes('utils') || fileName.includes('setup')) return 'utilities';
    
    return 'other';
  }

  /**
   * Determine if tests can run in parallel
   * Security tests often need isolation, so we're more conservative
   */
  allFailedTests(tests) {
    // For security tests, we want to see all failures, not just the first one
    return super.allFailedTests(tests);
  }
}

module.exports = SecurityTestSequencer;