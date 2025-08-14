/**
 * Global Teardown for Security Tests
 * 
 * Cleans up the test environment after security tests complete,
 * including database cleanup and log finalization.
 */

import fs from 'fs';
import path from 'path';

export default async function globalTeardown() {
  console.log('🧹 Cleaning up security test environment...');
  
  // Finalize security test logs
  const logFile = path.join(process.cwd(), 'logs/security-tests/setup.log');
  if (fs.existsSync(logFile)) {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFile, `Security test teardown completed at ${timestamp}\n`);
  }
  
  // Clean up test data if needed
  try {
    if (process.env.TEST_DATABASE_CLEANUP === 'true') {
      console.log('🗑️  Cleaning up test database...');
      // Add database cleanup logic here if needed
    }
  } catch (error) {
    console.warn('⚠️  Could not clean up test database:', error.message);
  }
  
  // Generate security test summary
  const summaryFile = path.join(process.cwd(), 'reports/security/test-summary.json');
  const summary = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    securityTestMode: process.env.SECURITY_TEST_MODE,
    testIsolation: process.env.TEST_ISOLATION
  };
  
  try {
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
  } catch (error) {
    console.warn('⚠️  Could not write test summary:', error.message);
  }
  
  console.log('✅ Security test environment cleanup complete');
}