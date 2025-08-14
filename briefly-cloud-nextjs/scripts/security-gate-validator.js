#!/usr/bin/env node

/**
 * Security Gate Validator
 * Validates that all security gates are properly configured and functioning
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class SecurityGateValidator {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      gates: [],
      passed: 0,
      failed: 0,
      warnings: 0
    };
  }

  async validateAllGates() {
    console.log('🔒 Validating Security Gates Configuration...\n');

    try {
      await this.validateWorkflowConfiguration();
      await this.validateBranchProtection();
      await this.validateSecurityTests();
      await this.validateStaticAnalysis();
      await this.validateDependencyScanning();
      await this.validateCodeOwners();
      await this.validateSecurityLabels();

      this.generateValidationReport();
      
      if (this.results.failed > 0) {
        console.error(`\n❌ Security gate validation failed: ${this.results.failed} failures, ${this.results.warnings} warnings`);
        process.exit(1);
      } else {
        console.log(`\n✅ All security gates validated successfully: ${this.results.passed} checks passed`);
        if (this.results.warnings > 0) {
          console.log(`⚠️  ${this.results.warnings} warnings found - review recommended`);
        }
      }
    } catch (error) {
      console.error('❌ Security gate validation failed:', error.message);
      process.exit(1);
    }
  }

  async validateWorkflowConfiguration() {
    console.log('Validating GitHub Actions workflow configuration...');
    
    const workflowPath = path.join(process.cwd(), '.github', 'workflows', 'security-gates.yml');
    
    if (!fs.existsSync(workflowPath)) {
      this.addResult('Workflow Configuration', 'Security gates workflow file missing', 'failed');
      return;
    }

    const workflowContent = fs.readFileSync(workflowPath, 'utf8');
    
    // Check for required jobs
    const requiredJobs = [
      'security-gate-check',
      'security-regression-test',
      'block-merge-on-failure',
      'require-security-review'
    ];

    let allJobsPresent = true;
    for (const job of requiredJobs) {
      if (!workflowContent.includes(job)) {
        this.addResult('Workflow Configuration', `Missing required job: ${job}`, 'failed');
        allJobsPresent = false;
      }
    }

    if (allJobsPresent) {
      this.addResult('Workflow Configuration', 'All required jobs present', 'passed');
    }

    // Check for required triggers
    if (workflowContent.includes('pull_request:') && workflowContent.includes('push:')) {
      this.addResult('Workflow Triggers', 'Proper triggers configured', 'passed');
    } else {
      this.addResult('Workflow Triggers', 'Missing required triggers', 'failed');
    }
  }

  async validateBranchProtection() {
    console.log('Validating branch protection configuration...');
    
    const configPath = path.join(process.cwd(), '.github', 'branch-protection-config.json');
    
    if (!fs.existsSync(configPath)) {
      this.addResult('Branch Protection Config', 'Configuration file missing', 'failed');
      return;
    }

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      // Check main branch protection
      if (config.branch_protection_rules?.main) {
        const mainRules = config.branch_protection_rules.main;
        
        if (mainRules.required_status_checks?.contexts?.length > 0) {
          this.addResult('Main Branch Status Checks', 'Required status checks configured', 'passed');
        } else {
          this.addResult('Main Branch Status Checks', 'No required status checks', 'failed');
        }

        if (mainRules.required_pull_request_reviews?.required_approving_review_count >= 2) {
          this.addResult('Main Branch Reviews', 'Sufficient review requirements', 'passed');
        } else {
          this.addResult('Main Branch Reviews', 'Insufficient review requirements', 'failed');
        }

        if (mainRules.enforce_admins) {
          this.addResult('Main Branch Admin Enforcement', 'Admin enforcement enabled', 'passed');
        } else {
          this.addResult('Main Branch Admin Enforcement', 'Admin enforcement disabled', 'warning');
        }
      } else {
        this.addResult('Main Branch Protection', 'Main branch protection not configured', 'failed');
      }
    } catch (error) {
      this.addResult('Branch Protection Config', `Invalid configuration: ${error.message}`, 'failed');
    }
  }

  async validateSecurityTests() {
    console.log('Validating security test configuration...');
    
    const testConfigPath = path.join(process.cwd(), 'jest.security.config.js');
    
    if (!fs.existsSync(testConfigPath)) {
      this.addResult('Security Test Config', 'Jest security config missing', 'failed');
      return;
    }

    // Check if security test files exist
    const securityTestDir = path.join(process.cwd(), 'tests', 'security');
    
    if (!fs.existsSync(securityTestDir)) {
      this.addResult('Security Test Directory', 'Security test directory missing', 'failed');
      return;
    }

    const testFiles = fs.readdirSync(securityTestDir).filter(file => file.endsWith('.test.ts'));
    
    const requiredTests = [
      'auth-security.test.ts',
      'rls-authorization.test.ts',
      'rate-limiting.test.ts',
      'audit-logging.test.ts',
      'security-monitoring.test.ts'
    ];

    let allTestsPresent = true;
    for (const testFile of requiredTests) {
      if (!testFiles.includes(testFile)) {
        this.addResult('Security Tests', `Missing test file: ${testFile}`, 'failed');
        allTestsPresent = false;
      }
    }

    if (allTestsPresent) {
      this.addResult('Security Tests', 'All required test files present', 'passed');
    }

    // Try to run security tests
    try {
      execSync('npm run test:security -- --passWithNoTests', { 
        stdio: 'pipe',
        timeout: 30000
      });
      this.addResult('Security Test Execution', 'Security tests can be executed', 'passed');
    } catch (error) {
      this.addResult('Security Test Execution', 'Security tests fail to execute', 'failed');
    }
  }

  async validateStaticAnalysis() {
    console.log('Validating static analysis configuration...');
    
    // Check ESLint security config
    const eslintSecurityPath = path.join(process.cwd(), '.eslintrc.security.js');
    
    if (!fs.existsSync(eslintSecurityPath)) {
      this.addResult('ESLint Security Config', 'Security ESLint config missing', 'failed');
    } else {
      this.addResult('ESLint Security Config', 'Security ESLint config present', 'passed');
    }

    // Check Semgrep config
    const semgrepPath = path.join(process.cwd(), '.semgrep.yml');
    
    if (!fs.existsSync(semgrepPath)) {
      this.addResult('Semgrep Config', 'Semgrep config missing', 'failed');
    } else {
      this.addResult('Semgrep Config', 'Semgrep config present', 'passed');
    }

    // Try to run static analysis
    try {
      execSync('npm run lint:security', { 
        stdio: 'pipe',
        timeout: 30000
      });
      this.addResult('ESLint Security Execution', 'Security linting passes', 'passed');
    } catch (error) {
      this.addResult('ESLint Security Execution', 'Security linting has issues', 'warning');
    }
  }

  async validateDependencyScanning() {
    console.log('Validating dependency scanning...');
    
    // Check if npm audit works
    try {
      execSync('npm audit --audit-level=moderate', { 
        stdio: 'pipe',
        timeout: 30000
      });
      this.addResult('NPM Audit', 'No moderate+ vulnerabilities found', 'passed');
    } catch (error) {
      this.addResult('NPM Audit', 'Vulnerabilities found or audit failed', 'warning');
    }

    // Check package.json for security scripts
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      const requiredScripts = [
        'security:audit',
        'security:scan',
        'test:security'
      ];

      let allScriptsPresent = true;
      for (const script of requiredScripts) {
        if (!packageJson.scripts?.[script]) {
          this.addResult('Security Scripts', `Missing script: ${script}`, 'failed');
          allScriptsPresent = false;
        }
      }

      if (allScriptsPresent) {
        this.addResult('Security Scripts', 'All required security scripts present', 'passed');
      }
    }
  }

  async validateCodeOwners() {
    console.log('Validating CODEOWNERS configuration...');
    
    const codeOwnersPath = path.join(process.cwd(), '.github', 'CODEOWNERS');
    
    if (!fs.existsSync(codeOwnersPath)) {
      this.addResult('CODEOWNERS File', 'CODEOWNERS file missing', 'failed');
      return;
    }

    const codeOwnersContent = fs.readFileSync(codeOwnersPath, 'utf8');
    
    // Check for security-sensitive path coverage
    const requiredPaths = [
      '/database/',
      '/src/app/lib/auth/',
      '/src/app/lib/security/',
      '/middleware.ts',
      '/.github/workflows/'
    ];

    let allPathsCovered = true;
    for (const path of requiredPaths) {
      if (!codeOwnersContent.includes(path)) {
        this.addResult('CODEOWNERS Coverage', `Missing path: ${path}`, 'failed');
        allPathsCovered = false;
      }
    }

    if (allPathsCovered) {
      this.addResult('CODEOWNERS Coverage', 'All security-sensitive paths covered', 'passed');
    }

    // Check for security team assignment
    if (codeOwnersContent.includes('@security-team')) {
      this.addResult('CODEOWNERS Security Team', 'Security team assigned to sensitive files', 'passed');
    } else {
      this.addResult('CODEOWNERS Security Team', 'Security team not assigned', 'warning');
    }
  }

  async validateSecurityLabels() {
    console.log('Validating security label configuration...');
    
    const configPath = path.join(process.cwd(), '.github', 'branch-protection-config.json');
    
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      if (config.security_review_requirements?.security_labels?.length > 0) {
        this.addResult('Security Labels Config', 'Security labels configured', 'passed');
      } else {
        this.addResult('Security Labels Config', 'Security labels not configured', 'warning');
      }

      if (config.security_review_requirements?.sensitive_file_patterns?.length > 0) {
        this.addResult('Sensitive File Patterns', 'Sensitive file patterns configured', 'passed');
      } else {
        this.addResult('Sensitive File Patterns', 'Sensitive file patterns not configured', 'failed');
      }
    }
  }

  addResult(category, message, status) {
    this.results.gates.push({
      category,
      message,
      status,
      timestamp: new Date().toISOString()
    });

    switch (status) {
      case 'passed':
        this.results.passed++;
        console.log(`  ✅ ${category}: ${message}`);
        break;
      case 'failed':
        this.results.failed++;
        console.log(`  ❌ ${category}: ${message}`);
        break;
      case 'warning':
        this.results.warnings++;
        console.log(`  ⚠️  ${category}: ${message}`);
        break;
    }
  }

  generateValidationReport() {
    const reportPath = path.join(process.cwd(), 'security-gate-validation-report.json');
    
    const report = {
      ...this.results,
      summary: {
        total: this.results.passed + this.results.failed + this.results.warnings,
        passed: this.results.passed,
        failed: this.results.failed,
        warnings: this.results.warnings,
        success_rate: this.results.passed / (this.results.passed + this.results.failed) * 100
      }
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📊 Security gate validation report saved to: ${reportPath}`);
  }
}

// Main execution
async function main() {
  const validator = new SecurityGateValidator();
  await validator.validateAllGates();
}

if (require.main === module) {
  main().catch(error => {
    console.error('Security gate validation failed:', error);
    process.exit(1);
  });
}

module.exports = SecurityGateValidator;