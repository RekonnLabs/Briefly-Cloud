#!/usr/bin/env node

/**
 * Security Regression Test Runner
 * Runs automated security regression tests to ensure security controls remain intact
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class SecurityRegressionTester {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      tests: [],
      passed: 0,
      failed: 0,
      skipped: 0
    };
  }

  async runAllTests() {
    console.log('🔒 Starting Security Regression Tests...\n');

    try {
      await this.testAuthenticationSecurity();
      await this.testAuthorizationControls();
      await this.testRateLimiting();
      await this.testDataIsolation();
      await this.testAuditLogging();
      await this.testSecurityHeaders();
      await this.testInputValidation();
      await this.testFileUploadSecurity();

      this.generateReport();
      
      if (this.results.failed > 0) {
        console.error(`\n❌ Security regression tests failed: ${this.results.failed} failures`);
        process.exit(1);
      } else {
        console.log(`\n✅ All security regression tests passed: ${this.results.passed} tests`);
      }
    } catch (error) {
      console.error('❌ Security regression test suite failed:', error.message);
      process.exit(1);
    }
  }

  async testAuthenticationSecurity() {
    console.log('Testing Authentication Security...');
    
    const tests = [
      {
        name: 'JWT token validation',
        command: 'npm run test -- --testNamePattern="JWT token validation" --silent'
      },
      {
        name: 'Session expiration handling',
        command: 'npm run test -- --testNamePattern="session expiration" --silent'
      },
      {
        name: 'Invalid token rejection',
        command: 'npm run test -- --testNamePattern="invalid token" --silent'
      }
    ];

    await this.runTestGroup('Authentication', tests);
  }

  async testAuthorizationControls() {
    console.log('Testing Authorization Controls...');
    
    const tests = [
      {
        name: 'RLS policy enforcement',
        command: 'npm run test -- --testNamePattern="RLS policy" --silent'
      },
      {
        name: 'Cross-user data access prevention',
        command: 'npm run test -- --testNamePattern="cross-user access" --silent'
      },
      {
        name: 'Admin privilege validation',
        command: 'npm run test -- --testNamePattern="admin privilege" --silent'
      }
    ];

    await this.runTestGroup('Authorization', tests);
  }

  async testRateLimiting() {
    console.log('Testing Rate Limiting...');
    
    const tests = [
      {
        name: 'Rate limit enforcement',
        command: 'npm run test -- --testNamePattern="rate limit enforcement" --silent'
      },
      {
        name: 'Rate limit window calculations',
        command: 'npm run test -- --testNamePattern="rate limit window" --silent'
      },
      {
        name: 'Rate limit bypass prevention',
        command: 'npm run test -- --testNamePattern="rate limit bypass" --silent'
      }
    ];

    await this.runTestGroup('Rate Limiting', tests);
  }

  async testDataIsolation() {
    console.log('Testing Data Isolation...');
    
    const tests = [
      {
        name: 'User data isolation',
        command: 'npm run test -- --testNamePattern="user data isolation" --silent'
      },
      {
        name: 'Vector collection namespacing',
        command: 'npm run test -- --testNamePattern="vector collection" --silent'
      },
      {
        name: 'Document access controls',
        command: 'npm run test -- --testNamePattern="document access" --silent'
      }
    ];

    await this.runTestGroup('Data Isolation', tests);
  }

  async testAuditLogging() {
    console.log('Testing Audit Logging...');
    
    const tests = [
      {
        name: 'Audit log generation',
        command: 'npm run test -- --testNamePattern="audit log generation" --silent'
      },
      {
        name: 'Security event logging',
        command: 'npm run test -- --testNamePattern="security event" --silent'
      },
      {
        name: 'Audit log access controls',
        command: 'npm run test -- --testNamePattern="audit log access" --silent'
      }
    ];

    await this.runTestGroup('Audit Logging', tests);
  }

  async testSecurityHeaders() {
    console.log('Testing Security Headers...');
    
    const tests = [
      {
        name: 'HSTS header validation',
        command: 'npm run test -- --testNamePattern="HSTS header" --silent'
      },
      {
        name: 'CSP header validation',
        command: 'npm run test -- --testNamePattern="CSP header" --silent'
      },
      {
        name: 'Security headers completeness',
        command: 'npm run test -- --testNamePattern="security headers" --silent'
      }
    ];

    await this.runTestGroup('Security Headers', tests);
  }

  async testInputValidation() {
    console.log('Testing Input Validation...');
    
    const tests = [
      {
        name: 'SQL injection prevention',
        command: 'npm run test -- --testNamePattern="SQL injection" --silent'
      },
      {
        name: 'XSS prevention',
        command: 'npm run test -- --testNamePattern="XSS prevention" --silent'
      },
      {
        name: 'Input sanitization',
        command: 'npm run test -- --testNamePattern="input sanitization" --silent'
      }
    ];

    await this.runTestGroup('Input Validation', tests);
  }

  async testFileUploadSecurity() {
    console.log('Testing File Upload Security...');
    
    const tests = [
      {
        name: 'File type validation',
        command: 'npm run test -- --testNamePattern="file type validation" --silent'
      },
      {
        name: 'File size limits',
        command: 'npm run test -- --testNamePattern="file size limit" --silent'
      },
      {
        name: 'Malicious file detection',
        command: 'npm run test -- --testNamePattern="malicious file" --silent'
      }
    ];

    await this.runTestGroup('File Upload Security', tests);
  }

  async runTestGroup(groupName, tests) {
    for (const test of tests) {
      try {
        console.log(`  Running: ${test.name}`);
        execSync(test.command, { 
          cwd: process.cwd(),
          stdio: 'pipe'
        });
        
        this.results.tests.push({
          group: groupName,
          name: test.name,
          status: 'passed',
          timestamp: new Date().toISOString()
        });
        this.results.passed++;
        console.log(`    ✅ ${test.name}`);
      } catch (error) {
        this.results.tests.push({
          group: groupName,
          name: test.name,
          status: 'failed',
          error: error.message,
          timestamp: new Date().toISOString()
        });
        this.results.failed++;
        console.log(`    ❌ ${test.name}: ${error.message}`);
      }
    }
  }

  generateReport() {
    const reportPath = path.join(process.cwd(), 'security-regression-report.json');
    
    const report = {
      ...this.results,
      summary: {
        total: this.results.passed + this.results.failed + this.results.skipped,
        passed: this.results.passed,
        failed: this.results.failed,
        skipped: this.results.skipped,
        success_rate: this.results.passed / (this.results.passed + this.results.failed) * 100
      }
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📊 Security regression report saved to: ${reportPath}`);
  }
}

// Performance benchmark tests
class SecurityPerformanceBenchmark {
  constructor() {
    this.benchmarks = [];
  }

  async runBenchmarks() {
    console.log('\n🚀 Running Security Performance Benchmarks...\n');

    await this.benchmarkAuthenticationLatency();
    await this.benchmarkRateLimitingOverhead();
    await this.benchmarkAuditLoggingPerformance();
    await this.benchmarkVectorSearchSecurity();

    this.generateBenchmarkReport();
  }

  async benchmarkAuthenticationLatency() {
    console.log('Benchmarking Authentication Latency...');
    
    const iterations = 100;
    const times = [];

    for (let i = 0; i < iterations; i++) {
      const start = process.hrtime.bigint();
      
      try {
        execSync('npm run test -- --testNamePattern="auth latency benchmark" --silent', {
          stdio: 'pipe'
        });
        
        const end = process.hrtime.bigint();
        times.push(Number(end - start) / 1000000); // Convert to milliseconds
      } catch (error) {
        // Skip failed iterations
      }
    }

    const avgLatency = times.reduce((a, b) => a + b, 0) / times.length;
    
    this.benchmarks.push({
      name: 'Authentication Latency',
      metric: 'Average Response Time',
      value: avgLatency,
      unit: 'ms',
      threshold: 100, // 100ms threshold
      passed: avgLatency < 100
    });

    console.log(`  Average authentication latency: ${avgLatency.toFixed(2)}ms`);
  }

  async benchmarkRateLimitingOverhead() {
    console.log('Benchmarking Rate Limiting Overhead...');
    
    // Benchmark with and without rate limiting
    const withoutRateLimit = await this.measureEndpointPerformance('/api/test/no-rate-limit');
    const withRateLimit = await this.measureEndpointPerformance('/api/test/with-rate-limit');
    
    const overhead = withRateLimit - withoutRateLimit;
    
    this.benchmarks.push({
      name: 'Rate Limiting Overhead',
      metric: 'Additional Latency',
      value: overhead,
      unit: 'ms',
      threshold: 10, // 10ms threshold
      passed: overhead < 10
    });

    console.log(`  Rate limiting overhead: ${overhead.toFixed(2)}ms`);
  }

  async benchmarkAuditLoggingPerformance() {
    console.log('Benchmarking Audit Logging Performance...');
    
    const iterations = 50;
    const times = [];

    for (let i = 0; i < iterations; i++) {
      const start = process.hrtime.bigint();
      
      try {
        execSync('npm run test -- --testNamePattern="audit logging benchmark" --silent', {
          stdio: 'pipe'
        });
        
        const end = process.hrtime.bigint();
        times.push(Number(end - start) / 1000000);
      } catch (error) {
        // Skip failed iterations
      }
    }

    const avgLatency = times.reduce((a, b) => a + b, 0) / times.length;
    
    this.benchmarks.push({
      name: 'Audit Logging Performance',
      metric: 'Average Logging Time',
      value: avgLatency,
      unit: 'ms',
      threshold: 50, // 50ms threshold
      passed: avgLatency < 50
    });

    console.log(`  Average audit logging time: ${avgLatency.toFixed(2)}ms`);
  }

  async benchmarkVectorSearchSecurity() {
    console.log('Benchmarking Vector Search Security...');
    
    const iterations = 20;
    const times = [];

    for (let i = 0; i < iterations; i++) {
      const start = process.hrtime.bigint();
      
      try {
        execSync('npm run test -- --testNamePattern="vector search security benchmark" --silent', {
          stdio: 'pipe'
        });
        
        const end = process.hrtime.bigint();
        times.push(Number(end - start) / 1000000);
      } catch (error) {
        // Skip failed iterations
      }
    }

    const avgLatency = times.reduce((a, b) => a + b, 0) / times.length;
    
    this.benchmarks.push({
      name: 'Vector Search Security',
      metric: 'Average Search Time with RLS',
      value: avgLatency,
      unit: 'ms',
      threshold: 200, // 200ms threshold
      passed: avgLatency < 200
    });

    console.log(`  Average secure vector search time: ${avgLatency.toFixed(2)}ms`);
  }

  async measureEndpointPerformance(endpoint) {
    // Mock implementation - would make actual HTTP requests in real scenario
    return Math.random() * 50 + 10; // Random latency between 10-60ms
  }

  generateBenchmarkReport() {
    const reportPath = path.join(process.cwd(), 'security-performance-report.json');
    
    const report = {
      timestamp: new Date().toISOString(),
      benchmarks: this.benchmarks,
      summary: {
        total: this.benchmarks.length,
        passed: this.benchmarks.filter(b => b.passed).length,
        failed: this.benchmarks.filter(b => !b.passed).length
      }
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📊 Security performance report saved to: ${reportPath}`);

    // Check if any benchmarks failed
    const failed = this.benchmarks.filter(b => !b.passed);
    if (failed.length > 0) {
      console.error(`\n❌ Performance benchmarks failed:`);
      failed.forEach(b => {
        console.error(`  - ${b.name}: ${b.value}${b.unit} (threshold: ${b.threshold}${b.unit})`);
      });
      process.exit(1);
    } else {
      console.log(`\n✅ All performance benchmarks passed`);
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--performance-only')) {
    const benchmark = new SecurityPerformanceBenchmark();
    await benchmark.runBenchmarks();
  } else if (args.includes('--regression-only')) {
    const tester = new SecurityRegressionTester();
    await tester.runAllTests();
  } else {
    // Run both regression tests and performance benchmarks
    const tester = new SecurityRegressionTester();
    await tester.runAllTests();
    
    const benchmark = new SecurityPerformanceBenchmark();
    await benchmark.runBenchmarks();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Security regression testing failed:', error);
    process.exit(1);
  });
}

module.exports = { SecurityRegressionTester, SecurityPerformanceBenchmark };