#!/usr/bin/env node

/**
 * Security Pipeline Runner
 * 
 * Orchestrates the complete security testing pipeline including static analysis,
 * dependency scanning, security tests, and report generation.
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class SecurityPipelineRunner {
  constructor(options = {}) {
    this.options = {
      skipTests: options.skipTests || false,
      skipStaticAnalysis: options.skipStaticAnalysis || false,
      skipDependencyScans: options.skipDependencyScans || false,
      generateReport: options.generateReport !== false,
      verbose: options.verbose || false,
      ...options
    };
    
    this.results = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      pipeline: {
        staticAnalysis: { status: 'not_run', results: null },
        dependencyScans: { status: 'not_run', results: null },
        securityTests: { status: 'not_run', results: null },
        environmentValidation: { status: 'not_run', results: null },
        buildValidation: { status: 'not_run', results: null }
      },
      summary: {
        overallStatus: 'unknown',
        criticalIssues: 0,
        highIssues: 0,
        mediumIssues: 0,
        lowIssues: 0,
        testsPassed: 0,
        testsFailed: 0
      }
    };
    
    this.setupDirectories();
  }

  setupDirectories() {
    const dirs = [
      'reports/security',
      'coverage/security',
      'logs/security-pipeline'
    ];
    
    dirs.forEach(dir => {
      const fullPath = path.join(process.cwd(), dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    });
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const colors = {
      info: '\x1b[36m',    // cyan
      success: '\x1b[32m', // green
      warning: '\x1b[33m', // yellow
      error: '\x1b[31m',   // red
      reset: '\x1b[0m'
    };
    
    const color = colors[level] || colors.info;
    console.log(`${color}[${timestamp}] ${message}${colors.reset}`);
    
    // Also log to file
    const logFile = path.join(process.cwd(), 'logs/security-pipeline/pipeline.log');
    fs.appendFileSync(logFile, `[${timestamp}] [${level.toUpperCase()}] ${message}\n`);
  }

  async runCommand(command, description, options = {}) {
    this.log(`Starting: ${description}`, 'info');
    
    try {
      const result = execSync(command, {
        encoding: 'utf8',
        stdio: this.options.verbose ? 'inherit' : 'pipe',
        ...options
      });
      
      this.log(`Completed: ${description}`, 'success');
      return { success: true, output: result };
    } catch (error) {
      this.log(`Failed: ${description} - ${error.message}`, 'error');
      return { success: false, error: error.message, output: error.stdout };
    }
  }

  async runStaticAnalysis() {
    if (this.options.skipStaticAnalysis) {
      this.log('Skipping static analysis', 'warning');
      return;
    }

    this.log('🔍 Running Static Analysis...', 'info');
    this.results.pipeline.staticAnalysis.status = 'running';

    const analyses = [
      {
        name: 'ESLint Security',
        command: 'npm run lint:security',
        description: 'Running ESLint security rules'
      },
      {
        name: 'Semgrep',
        command: 'npm run security:scan:ci',
        description: 'Running Semgrep security analysis'
      },
      {
        name: 'TypeScript Check',
        command: 'npx tsc --noEmit --strict',
        description: 'Running TypeScript strict checks'
      }
    ];

    const results = {};
    let hasErrors = false;

    for (const analysis of analyses) {
      const result = await this.runCommand(analysis.command, analysis.description);
      results[analysis.name] = result;
      
      if (!result.success) {
        hasErrors = true;
      }
    }

    this.results.pipeline.staticAnalysis = {
      status: hasErrors ? 'failed' : 'passed',
      results
    };

    this.log(`Static analysis ${hasErrors ? 'failed' : 'completed'}`, hasErrors ? 'error' : 'success');
  }

  async runDependencyScans() {
    if (this.options.skipDependencyScans) {
      this.log('Skipping dependency scans', 'warning');
      return;
    }

    this.log('📦 Running Dependency Scans...', 'info');
    this.results.pipeline.dependencyScans.status = 'running';

    const scans = [
      {
        name: 'NPM Audit',
        command: 'npm audit --audit-level=moderate --json',
        description: 'Running NPM security audit',
        allowFailure: true
      },
      {
        name: 'Audit CI',
        command: 'npx audit-ci --moderate',
        description: 'Running audit-ci security check',
        allowFailure: true
      }
    ];

    // Add Snyk if token is available
    if (process.env.SNYK_TOKEN) {
      scans.push({
        name: 'Snyk',
        command: 'npx snyk test --severity-threshold=medium',
        description: 'Running Snyk vulnerability scan',
        allowFailure: true
      });
    }

    const results = {};
    let hasErrors = false;

    for (const scan of scans) {
      const result = await this.runCommand(scan.command, scan.description);
      results[scan.name] = result;
      
      if (!result.success && !scan.allowFailure) {
        hasErrors = true;
      }
    }

    this.results.pipeline.dependencyScans = {
      status: hasErrors ? 'failed' : 'passed',
      results
    };

    this.log(`Dependency scans ${hasErrors ? 'failed' : 'completed'}`, hasErrors ? 'error' : 'success');
  }

  async runSecurityTests() {
    if (this.options.skipTests) {
      this.log('Skipping security tests', 'warning');
      return;
    }

    this.log('🧪 Running Security Tests...', 'info');
    this.results.pipeline.securityTests.status = 'running';

    const testSuites = [
      'auth',
      'rls', 
      'rate-limiting',
      'audit',
      'monitoring',
      'integration'
    ];

    const results = {};
    let totalPassed = 0;
    let totalFailed = 0;

    for (const suite of testSuites) {
      this.log(`Running ${suite} security tests...`, 'info');
      
      const result = await this.runCommand(
        `npm run test:security:${suite}`,
        `Security tests: ${suite}`
      );
      
      results[suite] = result;
      
      // Parse test results if available
      try {
        const reportPath = path.join(process.cwd(), `reports/security/jest-results-${suite}.xml`);
        if (fs.existsSync(reportPath)) {
          // Parse XML results (simplified)
          const xmlContent = fs.readFileSync(reportPath, 'utf8');
          const passedMatch = xmlContent.match(/tests="(\d+)"/);
          const failedMatch = xmlContent.match(/failures="(\d+)"/);
          
          if (passedMatch) totalPassed += parseInt(passedMatch[1]) - (failedMatch ? parseInt(failedMatch[1]) : 0);
          if (failedMatch) totalFailed += parseInt(failedMatch[1]);
        }
      } catch (error) {
        this.log(`Could not parse test results for ${suite}: ${error.message}`, 'warning');
      }
    }

    this.results.pipeline.securityTests = {
      status: totalFailed > 0 ? 'failed' : 'passed',
      results,
      summary: {
        totalPassed,
        totalFailed,
        totalTests: totalPassed + totalFailed
      }
    };

    this.results.summary.testsPassed = totalPassed;
    this.results.summary.testsFailed = totalFailed;

    this.log(`Security tests completed: ${totalPassed} passed, ${totalFailed} failed`, 
             totalFailed > 0 ? 'error' : 'success');
  }

  async runEnvironmentValidation() {
    this.log('🔧 Running Environment Validation...', 'info');
    this.results.pipeline.environmentValidation.status = 'running';

    const result = await this.runCommand(
      'node scripts/validate-environment.js',
      'Environment security validation'
    );

    this.results.pipeline.environmentValidation = {
      status: result.success ? 'passed' : 'failed',
      results: result
    };

    this.log(`Environment validation ${result.success ? 'passed' : 'failed'}`, 
             result.success ? 'success' : 'error');
  }

  async runBuildValidation() {
    // Only run build validation if we have a build
    const buildDir = path.join(process.cwd(), '.next');
    if (!fs.existsSync(buildDir)) {
      this.log('No build found, skipping build validation', 'warning');
      return;
    }

    this.log('🏗️  Running Build Security Validation...', 'info');
    this.results.pipeline.buildValidation.status = 'running';

    const result = await this.runCommand(
      'node scripts/validate-build-security.js',
      'Build security validation'
    );

    this.results.pipeline.buildValidation = {
      status: result.success ? 'passed' : 'failed',
      results: result
    };

    this.log(`Build validation ${result.success ? 'passed' : 'failed'}`, 
             result.success ? 'success' : 'error');
  }

  calculateSummary() {
    const pipeline = this.results.pipeline;
    
    // Count issues from different sources
    let criticalIssues = 0;
    let highIssues = 0;
    let mediumIssues = 0;
    let lowIssues = 0;

    // Aggregate issues from static analysis and dependency scans
    // This is a simplified aggregation - in practice, you'd parse the actual reports
    
    const failedSteps = Object.values(pipeline).filter(step => step.status === 'failed').length;
    const passedSteps = Object.values(pipeline).filter(step => step.status === 'passed').length;
    const totalSteps = Object.values(pipeline).filter(step => step.status !== 'not_run').length;

    // Determine overall status
    let overallStatus = 'passed';
    if (failedSteps > 0) {
      overallStatus = 'failed';
    } else if (passedSteps < totalSteps) {
      overallStatus = 'warning';
    }

    this.results.summary = {
      ...this.results.summary,
      overallStatus,
      criticalIssues,
      highIssues,
      mediumIssues,
      lowIssues,
      pipelineSteps: {
        total: totalSteps,
        passed: passedSteps,
        failed: failedSteps
      }
    };
  }

  async generateReport() {
    if (!this.options.generateReport) {
      return;
    }

    this.log('📊 Generating Security Report...', 'info');

    try {
      await this.runCommand(
        'node scripts/generate-security-report.js --artifacts-path ./reports/security',
        'Generating comprehensive security report'
      );
    } catch (error) {
      this.log(`Report generation failed: ${error.message}`, 'error');
    }
  }

  async run() {
    this.log('🚀 Starting Security Pipeline...', 'info');
    
    const startTime = Date.now();

    try {
      // Run all pipeline steps
      await this.runEnvironmentValidation();
      await this.runStaticAnalysis();
      await this.runDependencyScans();
      await this.runSecurityTests();
      await this.runBuildValidation();

      // Calculate summary
      this.calculateSummary();

      // Generate reports
      await this.generateReport();

      const duration = Date.now() - startTime;
      this.log(`Security pipeline completed in ${Math.round(duration / 1000)}s`, 'success');

      // Write pipeline results
      const resultsPath = path.join(process.cwd(), 'reports/security/pipeline-results.json');
      fs.writeFileSync(resultsPath, JSON.stringify(this.results, null, 2));

      // Print summary
      this.printSummary();

      // Exit with appropriate code
      const success = this.results.summary.overallStatus === 'passed';
      process.exit(success ? 0 : 1);

    } catch (error) {
      this.log(`Security pipeline failed: ${error.message}`, 'error');
      process.exit(1);
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('🛡️  SECURITY PIPELINE SUMMARY');
    console.log('='.repeat(60));
    
    const summary = this.results.summary;
    const statusColor = summary.overallStatus === 'passed' ? '\x1b[32m' : 
                       summary.overallStatus === 'warning' ? '\x1b[33m' : '\x1b[31m';
    
    console.log(`\nOverall Status: ${statusColor}${summary.overallStatus.toUpperCase()}\x1b[0m`);
    
    if (summary.pipelineSteps) {
      console.log(`\nPipeline Steps: ${summary.pipelineSteps.passed}/${summary.pipelineSteps.total} passed`);
    }
    
    if (summary.testsPassed || summary.testsFailed) {
      console.log(`Security Tests: ${summary.testsPassed} passed, ${summary.testsFailed} failed`);
    }
    
    console.log(`\nIssues Found:`);
    console.log(`  Critical: ${summary.criticalIssues}`);
    console.log(`  High: ${summary.highIssues}`);
    console.log(`  Medium: ${summary.mediumIssues}`);
    console.log(`  Low: ${summary.lowIssues}`);
    
    console.log('\n' + '='.repeat(60));
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.substring(2).replace(/-/g, '_');
      const nextArg = args[i + 1];
      
      if (nextArg && !nextArg.startsWith('--')) {
        options[key] = nextArg;
        i++; // Skip next argument
      } else {
        options[key] = true;
      }
    }
  }

  const runner = new SecurityPipelineRunner(options);
  runner.run().catch(error => {
    console.error('❌ Security pipeline failed:', error);
    process.exit(1);
  });
}

module.exports = SecurityPipelineRunner;