/**
 * Security Test Sequencer
 * 
 * Custom test sequencer to run security tests in a specific order
 * to ensure proper isolation and dependency management.
 */

const Sequencer = require('@jest/test-sequencer').default;

class SecurityTestSequencer extends Sequencer {
  sort(tests) {
    // Define the order of security test execution
    const testOrder = [
      'auth-security.test.ts',
      'session-security.test.ts', 
      'rls-authorization.test.ts',
      'rate-limiting.test.ts',
      'usage-tracking.test.ts',
      'audit-logging.test.ts',
      'security-monitoring.test.ts',
      'integration-e2e.test.ts'
    ];

    // Sort tests based on the defined order
    return tests.sort((testA, testB) => {
      const orderA = testOrder.findIndex(name => testA.path.includes(name));
      const orderB = testOrder.findIndex(name => testB.path.includes(name));
      
      // If test is not in the order list, put it at the end
      const indexA = orderA === -1 ? testOrder.length : orderA;
      const indexB = orderB === -1 ? testOrder.length : orderB;
      
      return indexA - indexB;
    });
  }
}

module.exports = SecurityTestSequencer;