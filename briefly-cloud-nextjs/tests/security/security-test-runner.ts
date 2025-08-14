/**
 * Security Test Suite Runner
 * 
 * Comprehensive test runner for all security tests including:
 * - Test orchestration and execution
 * - Security test reporting
 * - Performance benchmarking
 * - Compliance validation
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

interface SecurityTestResult {
  testSuite: string;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  coverage?: number;
  errors: string[];
}

interface SecurityTestReport {
  timestamp: string;
  overallStatus: 'passed' | 'failed' | 'warning';
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  totalDuration: number;
  coveragePercentage: number;
  testSuites: SecurityTestResult[];
  recommendations: string[];
  complianceStatus: {
    soc2: boolean;
    gdpr: boolean;
    ccpa: boolean;
  };
}

export class SecurityTestRunner {
  private testSuites = [
    'auth-security.test.ts',
    'session-security.test.ts',
    'rls-authorization.test.ts',
    'rate-limiting.test.ts',
    'usage-tracking.test.ts',
    'audit-logging.test.ts',
    'security-monitoring.test.ts',
    'integration-e2e.test.ts'
  ];

  private testDirectory = path.join(__dirname);
  private reportDirectory = path.join(__dirname, '..', '..', 'reports', 'security');

  async runAllSecurityTests(): Promise<SecurityTestReport> {
    console.log('🔒 Starting Comprehensive Security Test Suite');
    console.log(`Running ${this.testSuites.length} test suites...`);

    const startTime = Date.now();
    const testResults: SecurityTestResult[] = [];

    // Ensure report directory exists
    await fs.mkdir(this.reportDirectory, { recursive: true });

    // Run each test suite
    for (const testSuite of this.testSuites) {
      console.log(`\n📋 Running ${testSuite}...`);
      
      try {
        const result = await this.runTestSuite(testSuite);
        testResults.push(result);
        
        if (result.failed > 0) {
          console.log(`❌ ${testSuite}: ${result.failed} tests failed`);
        } else {
          console.log(`✅ ${testSuite}: All ${result.passed} tests passed`);
        }
      } catch (error) {
        console.error(`💥 ${testSuite}: Test suite failed to run`);
        testResults.push({
          testSuite,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 0,
          errors: [error instanceof Error ? error.message : 'Unknown error']
        });
      }
    }

    const endTime = Date.now();
    const totalDuration = endTime - startTime;

    // Generate comprehensive report
    const report = await this.generateSecurityReport(testResults, totalDuration);

    // Save report
    await this.saveReport(report);

    // Print summary
    this.printTestSummary(report);

    return report;
  }

  private async runTestSuite(testSuite: string): Promise<SecurityTestResult> {
    const testPath = path.join(this.testDirectory, testSuite);
    const startTime = Date.now();

    try {
      // Run Jest for the specific test suite
      const jestCommand = `npx jest ${testPath} --json --coverage --coverageReporters=json-summary`;
      const output = execSync(jestCommand, { 
        encoding: 'utf8',
        cwd: path.join(__dirname, '..', '..')
      });

      const result = JSON.parse(output);
      const endTime = Date.now();

      return {
        testSuite,
        passed: result.numPassedTests || 0,
        failed: result.numFailedTests || 0,
        skipped: result.numPendingTests || 0,
        duration: endTime - startTime,
        coverage: result.coverageMap ? this.calculateCoverage(result.coverageMap) : undefined,
        errors: result.testResults?.[0]?.failureMessages || []
      };

    } catch (error) {
      const endTime = Date.now();
      
      return {
        testSuite,
        passed: 0,
        failed: 1,
        skipped: 0,
        duration: endTime - startTime,
        errors: [error instanceof Error ? error.message : 'Test execution failed']
      };
    }
  }

  private calculateCoverage(coverageMap: any): number {
    if (!coverageMap) return 0;

    let totalStatements = 0;
    let coveredStatements = 0;

    Object.values(coverageMap).forEach((fileCoverage: any) => {
      if (fileCoverage.s) {
        Object.values(fileCoverage.s).forEach((count: any) => {
          totalStatements++;
          if (count > 0) coveredStatements++;
        });
      }
    });

    return totalStatements > 0 ? Math.round((coveredStatements / totalStatements) * 100) : 0;
  }

  private async generateSecurityReport(
    testResults: SecurityTestResult[],
    totalDuration: number
  ): Promise<SecurityTestReport> {
    const totalTests = testResults.reduce((sum, result) => 
      sum + result.passed + result.failed + result.skipped, 0);
    
    const passedTests = testResults.reduce((sum, result) => sum + result.passed, 0);
    const failedTests = testResults.reduce((sum, result) => sum + result.failed, 0);
    const skippedTests = testResults.reduce((sum, result) => sum + result.skipped, 0);

    const coverageValues = testResults
      .map(r => r.coverage)
      .filter((c): c is number => c !== undefined);
    
    const averageCoverage = coverageValues.length > 0
      ? Math.round(coverageValues.reduce((sum, c) => sum + c, 0) / coverageValues.length)
      : 0;

    const overallStatus = failedTests === 0 ? 'passed' : 'failed';

    return {
      timestamp: new Date().toISOString(),
      overallStatus,
      totalTests,
      passedTests,
      failedTests,
      skippedTests,
      totalDuration,
      coveragePercentage: averageCoverage,
      testSuites: testResults,
      recommendations: this.generateRecommendations(testResults),
      complianceStatus: this.assessComplianceStatus(testResults)
    };
  }

  private generateRecommendations(testResults: SecurityTestResult[]): string[] {
    const recommendations: string[] = [];

    // Check for failed tests
    const failedSuites = testResults.filter(r => r.failed > 0);
    if (failedSuites.length > 0) {
      recommendations.push(
        `Fix ${failedSuites.length} failing test suite(s): ${failedSuites.map(s => s.testSuite).join(', ')}`
      );
    }

    // Check for low coverage
    const lowCoverageSuites = testResults.filter(r => r.coverage && r.coverage < 80);
    if (lowCoverageSuites.length > 0) {
      recommendations.push(
        `Improve test coverage for ${lowCoverageSuites.length} suite(s) with coverage below 80%`
      );
    }

    // Check for slow tests
    const slowSuites = testResults.filter(r => r.duration > 30000); // > 30 seconds
    if (slowSuites.length > 0) {
      recommendations.push(
        `Optimize performance for ${slowSuites.length} slow test suite(s)`
      );
    }

    // Check for skipped tests
    const skippedSuites = testResults.filter(r => r.skipped > 0);
    if (skippedSuites.length > 0) {
      recommendations.push(
        `Review and enable ${skippedSuites.reduce((sum, s) => sum + s.skipped, 0)} skipped test(s)`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('All security tests are passing with good coverage. Continue regular testing.');
    }

    return recommendations;
  }

  private assessComplianceStatus(testResults: SecurityTestResult[]): {
    soc2: boolean;
    gdpr: boolean;
    ccpa: boolean;
  } {
    // Map test suites to compliance requirements
    const complianceMapping = {
      soc2: ['auth-security.test.ts', 'audit-logging.test.ts', 'rls-authorization.test.ts'],
      gdpr: ['rls-authorization.test.ts', 'usage-tracking.test.ts', 'audit-logging.test.ts'],
      ccpa: ['rls-authorization.test.ts', 'usage-tracking.test.ts', 'auth-security.test.ts']
    };

    const getComplianceStatus = (requiredSuites: string[]) => {
      return requiredSuites.every(suite => {
        const result = testResults.find(r => r.testSuite === suite);
        return result && result.failed === 0;
      });
    };

    return {
      soc2: getComplianceStatus(complianceMapping.soc2),
      gdpr: getComplianceStatus(complianceMapping.gdpr),
      ccpa: getComplianceStatus(complianceMapping.ccpa)
    };
  }

  private async saveReport(report: SecurityTestReport): Promise<void> {
    const reportPath = path.join(
      this.reportDirectory,
      `security-test-report-${Date.now()}.json`
    );

    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    // Also save as latest report
    const latestReportPath = path.join(this.reportDirectory, 'latest-security-report.json');
    await fs.writeFile(latestReportPath, JSON.stringify(report, null, 2));

    console.log(`\n📊 Security test report saved to: ${reportPath}`);
  }

  private printTestSummary(report: SecurityTestReport): void {
    console.log('\n' + '='.repeat(80));
    console.log('🔒 SECURITY TEST SUITE SUMMARY');
    console.log('='.repeat(80));

    console.log(`📅 Test Date: ${report.timestamp.split('T')[0]}`);
    console.log(`⏱️  Total Duration: ${Math.round(report.totalDuration / 1000)}s`);
    console.log(`🎯 Overall Status: ${report.overallStatus.toUpperCase()}`);

    console.log('\n📊 Test Results:');
    console.log(`  Total Tests: ${report.totalTests}`);
    console.log(`  Passed: ${report.passedTests} (${Math.round((report.passedTests / report.totalTests) * 100)}%)`);
    console.log(`  Failed: ${report.failedTests}`);
    console.log(`  Skipped: ${report.skippedTests}`);
    console.log(`  Coverage: ${report.coveragePercentage}%`);

    console.log('\n🏛️ Compliance Status:');
    console.log(`  SOC 2: ${report.complianceStatus.soc2 ? '✅ Compliant' : '❌ Non-Compliant'}`);
    console.log(`  GDPR: ${report.complianceStatus.gdpr ? '✅ Compliant' : '❌ Non-Compliant'}`);
    console.log(`  CCPA: ${report.complianceStatus.ccpa ? '✅ Compliant' : '❌ Non-Compliant'}`);

    console.log('\n📋 Test Suite Results:');
    report.testSuites.forEach(suite => {
      const status = suite.failed === 0 ? '✅' : '❌';
      const duration = Math.round(suite.duration / 1000);
      const coverage = suite.coverage ? ` (${suite.coverage}% coverage)` : '';
      
      console.log(`  ${status} ${suite.testSuite}: ${suite.passed}/${suite.passed + suite.failed} passed in ${duration}s${coverage}`);
      
      if (suite.errors.length > 0) {
        suite.errors.forEach(error => {
          console.log(`      Error: ${error.substring(0, 100)}...`);
        });
      }
    });

    if (report.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      report.recommendations.forEach((rec, index) => {
        console.log(`  ${index + 1}. ${rec}`);
      });
    }

    console.log('\n' + '='.repeat(80));

    if (report.overallStatus === 'failed') {
      console.log('❌ SECURITY TESTS FAILED - Review and fix failing tests before deployment');
      process.exit(1);
    } else {
      console.log('✅ ALL SECURITY TESTS PASSED - System is ready for deployment');
    }
  }

  async runContinuousSecurityTesting(): Promise<void> {
    console.log('🔄 Starting Continuous Security Testing...');

    const runTests = async () => {
      try {
        await this.runAllSecurityTests();
      } catch (error) {
        console.error('Security test run failed:', error);
      }
    };

    // Run tests immediately
    await runTests();

    // Schedule periodic runs (every 6 hours)
    setInterval(runTests, 6 * 60 * 60 * 1000);

    console.log('🔄 Continuous security testing scheduled (every 6 hours)');
  }

  async generateSecurityMetrics(): Promise<{
    testTrends: any[];
    coverageTrends: any[];
    performanceTrends: any[];
  }> {
    const reportFiles = await fs.readdir(this.reportDirectory);
    const securityReports = reportFiles
      .filter(file => file.startsWith('security-test-report-'))
      .sort()
      .slice(-30); // Last 30 reports

    const reports = await Promise.all(
      securityReports.map(async file => {
        const content = await fs.readFile(path.join(this.reportDirectory, file), 'utf8');
        return JSON.parse(content) as SecurityTestReport;
      })
    );

    return {
      testTrends: reports.map(r => ({
        date: r.timestamp.split('T')[0],
        passed: r.passedTests,
        failed: r.failedTests,
        total: r.totalTests
      })),
      coverageTrends: reports.map(r => ({
        date: r.timestamp.split('T')[0],
        coverage: r.coveragePercentage
      })),
      performanceTrends: reports.map(r => ({
        date: r.timestamp.split('T')[0],
        duration: r.totalDuration
      }))
    };
  }
}

// CLI execution
if (require.main === module) {
  const runner = new SecurityTestRunner();
  
  const command = process.argv[2];
  
  switch (command) {
    case 'run':
      runner.runAllSecurityTests().catch(console.error);
      break;
    case 'continuous':
      runner.runContinuousSecurityTesting().catch(console.error);
      break;
    case 'metrics':
      runner.generateSecurityMetrics().then(metrics => {
        console.log('Security Metrics:', JSON.stringify(metrics, null, 2));
      }).catch(console.error);
      break;
    default:
      console.log('Usage: npm run security:test [run|continuous|metrics]');
      break;
  }
}

export default SecurityTestRunner;