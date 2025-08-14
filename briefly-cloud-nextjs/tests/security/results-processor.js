/**
 * Security Test Results Processor
 * 
 * Processes Jest test results for security tests and generates
 * security-specific reports and metrics.
 */

const fs = require('fs');
const path = require('path');

class SecurityTestResultsProcessor {
  constructor(results) {
    this.results = results;
    this.timestamp = new Date().toISOString();
  }

  process() {
    console.log('📊 Processing security test results...');
    
    const processedResults = {
      metadata: {
        timestamp: this.timestamp,
        testRun: this.results.testResults.length,
        totalTests: this.results.numTotalTests,
        passedTests: this.results.numPassedTests,
        failedTests: this.results.numFailedTests,
        pendingTests: this.results.numPendingTests,
        runtime: this.results.testResults.reduce((sum, result) => sum + (result.perfStats?.runtime || 0), 0)
      },
      summary: {
        success: this.results.success,
        coverageThreshold: this.results.coverageMap ? this.calculateCoverageMetrics() : null,
        securityTestCategories: this.categorizeSecurityTests(),
        criticalFailures: this.identifyCriticalFailures(),
        performanceMetrics: this.calculatePerformanceMetrics()
      },
      testResults: this.results.testResults.map(result => ({
        testFilePath: result.testFilePath,
        numPassingTests: result.numPassingTests,
        numFailingTests: result.numFailingTests,
        numPendingTests: result.numPendingTests,
        runtime: result.perfStats?.runtime || 0,
        securityCategory: this.getSecurityCategory(result.testFilePath),
        failureMessages: result.testResults
          .filter(test => test.status === 'failed')
          .map(test => ({
            title: test.title,
            fullName: test.fullName,
            failureMessages: test.failureMessages,
            location: test.location
          }))
      })),
      recommendations: this.generateSecurityRecommendations()
    };

    // Write processed results
    this.writeResults(processedResults);
    
    return this.results;
  }

  categorizeSecurityTests() {
    const categories = {
      authentication: 0,
      authorization: 0,
      rateLimiting: 0,
      auditLogging: 0,
      securityMonitoring: 0,
      integration: 0,
      other: 0
    };

    this.results.testResults.forEach(result => {
      const category = this.getSecurityCategory(result.testFilePath);
      if (categories.hasOwnProperty(category)) {
        categories[category] += result.numPassingTests + result.numFailingTests;
      } else {
        categories.other += result.numPassingTests + result.numFailingTests;
      }
    });

    return categories;
  }

  getSecurityCategory(testFilePath) {
    const fileName = path.basename(testFilePath, '.test.ts');
    
    if (fileName.includes('auth')) return 'authentication';
    if (fileName.includes('rls') || fileName.includes('authorization')) return 'authorization';
    if (fileName.includes('rate-limiting')) return 'rateLimiting';
    if (fileName.includes('audit')) return 'auditLogging';
    if (fileName.includes('monitoring')) return 'securityMonitoring';
    if (fileName.includes('integration') || fileName.includes('e2e')) return 'integration';
    
    return 'other';
  }

  identifyCriticalFailures() {
    const criticalFailures = [];
    
    this.results.testResults.forEach(result => {
      result.testResults
        .filter(test => test.status === 'failed')
        .forEach(test => {
          const isCritical = this.isCriticalSecurityTest(test.fullName, result.testFilePath);
          if (isCritical) {
            criticalFailures.push({
              testName: test.fullName,
              testFile: result.testFilePath,
              category: this.getSecurityCategory(result.testFilePath),
              failureMessage: test.failureMessages[0] || 'Unknown failure'
            });
          }
        });
    });
    
    return criticalFailures;
  }

  isCriticalSecurityTest(testName, testFilePath) {
    const criticalPatterns = [
      /authentication.*bypass/i,
      /authorization.*fail/i,
      /sql.*injection/i,
      /xss.*vulnerability/i,
      /csrf.*protection/i,
      /rate.*limit.*bypass/i,
      /audit.*log.*missing/i,
      /security.*header.*missing/i
    ];
    
    const criticalFiles = [
      'auth-security.test.ts',
      'rls-authorization.test.ts',
      'session-security.test.ts'
    ];
    
    const fileName = path.basename(testFilePath);
    const isCriticalFile = criticalFiles.includes(fileName);
    const hasCriticalPattern = criticalPatterns.some(pattern => pattern.test(testName));
    
    return isCriticalFile || hasCriticalPattern;
  }

  calculatePerformanceMetrics() {
    const runtimes = this.results.testResults.map(result => result.perfStats?.runtime || 0);
    
    return {
      totalRuntime: runtimes.reduce((sum, runtime) => sum + runtime, 0),
      averageRuntime: runtimes.length > 0 ? runtimes.reduce((sum, runtime) => sum + runtime, 0) / runtimes.length : 0,
      slowestTest: Math.max(...runtimes),
      fastestTest: Math.min(...runtimes.filter(r => r > 0)),
      testsOverThreshold: runtimes.filter(runtime => runtime > 5000).length // Tests taking over 5 seconds
    };
  }

  calculateCoverageMetrics() {
    // Simplified coverage calculation
    // In a real implementation, you would parse the coverage map
    return {
      statements: { covered: 0, total: 0, percentage: 0 },
      branches: { covered: 0, total: 0, percentage: 0 },
      functions: { covered: 0, total: 0, percentage: 0 },
      lines: { covered: 0, total: 0, percentage: 0 }
    };
  }

  generateSecurityRecommendations() {
    const recommendations = [];
    
    // Check for failed tests
    if (this.results.numFailedTests > 0) {
      recommendations.push({
        type: 'critical',
        message: `${this.results.numFailedTests} security tests failed. Review and fix immediately.`,
        action: 'Fix failing security tests before deployment'
      });
    }
    
    // Check for critical failures
    const criticalFailures = this.identifyCriticalFailures();
    if (criticalFailures.length > 0) {
      recommendations.push({
        type: 'critical',
        message: `${criticalFailures.length} critical security tests failed.`,
        action: 'Address critical security vulnerabilities immediately'
      });
    }
    
    // Check performance
    const performanceMetrics = this.calculatePerformanceMetrics();
    if (performanceMetrics.testsOverThreshold > 0) {
      recommendations.push({
        type: 'warning',
        message: `${performanceMetrics.testsOverThreshold} security tests are running slowly.`,
        action: 'Optimize slow security tests to improve CI/CD pipeline performance'
      });
    }
    
    // Check test coverage
    const categories = this.categorizeSecurityTests();
    const missingCategories = Object.entries(categories)
      .filter(([category, count]) => count === 0 && category !== 'other')
      .map(([category]) => category);
    
    if (missingCategories.length > 0) {
      recommendations.push({
        type: 'info',
        message: `Missing security tests for: ${missingCategories.join(', ')}`,
        action: 'Add comprehensive security tests for all security categories'
      });
    }
    
    return recommendations;
  }

  writeResults(processedResults) {
    const outputDir = path.join(process.cwd(), 'reports/security');
    
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Write JSON report
    const jsonPath = path.join(outputDir, 'security-test-results.json');
    fs.writeFileSync(jsonPath, JSON.stringify(processedResults, null, 2));
    
    // Write summary report
    const summaryPath = path.join(outputDir, 'security-test-summary.json');
    const summary = {
      timestamp: processedResults.metadata.timestamp,
      success: processedResults.summary.success,
      totalTests: processedResults.metadata.totalTests,
      passedTests: processedResults.metadata.passedTests,
      failedTests: processedResults.metadata.failedTests,
      criticalFailures: processedResults.summary.criticalFailures.length,
      recommendations: processedResults.recommendations.length
    };
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    
    console.log(`📄 Security test results written to ${outputDir}`);
  }
}

// Jest results processor function
module.exports = function(results) {
  const processor = new SecurityTestResultsProcessor(results);
  return processor.process();
};