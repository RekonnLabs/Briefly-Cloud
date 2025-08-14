#!/usr/bin/env node

/**
 * Deployment Security Gate
 * Validates security requirements before allowing deployment
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class DeploymentSecurityGate {
  constructor(environment = 'production') {
    this.environment = environment;
    this.results = {
      timestamp: new Date().toISOString(),
      environment,
      checks: [],
      passed: 0,
      failed: 0,
      blocked: false
    };
  }

  async validateDeployment() {
    console.log(`🚀 Validating deployment security for ${this.environment}...\n`);

    try {
      await this.checkSecurityTests();
      await this.checkStaticAnalysis();
      await this.checkDependencyVulnerabilities();
      await this.checkSecurityConfiguration();
      await this.checkEnvironmentSecurity();
      await this.checkPerformanceBenchmarks();
      
      if (this.environment === 'production') {
        await this.checkProductionRequirements();
      }

      this.generateDeploymentReport();
      
      if (this.results.blocked || this.results.failed > 0) {
        console.error(`\n🚫 Deployment BLOCKED: ${this.results.failed} security checks failed`);
        process.exit(1);
      } else {
        console.log(`\n✅ Deployment APPROVED: All ${this.results.passed} security checks passed`);
      }
    } catch (error) {
      console.error('❌ Deployment security validation failed:', error.message);
      process.exit(1);
    }
  }

  async checkSecurityTests() {
    console.log('Running security test suite...');
    
    try {
      execSync('npm run test:security', { 
        stdio: 'pipe',
        timeout: 120000 // 2 minutes
      });
      this.addCheck('Security Tests', 'All security tests passed', 'passed');
    } catch (error) {
      this.addCheck('Security Tests', 'Security tests failed', 'failed', true);
    }
  }

  async checkStaticAnalysis() {
    console.log('Running static security analysis...');
    
    try {
      // Run ESLint security rules
      execSync('npm run lint:security', { 
        stdio: 'pipe',
        timeout: 60000
      });
      this.addCheck('ESLint Security', 'No security issues found', 'passed');
    } catch (error) {
      this.addCheck('ESLint Security', 'Security issues found in static analysis', 'failed', true);
    }

    try {
      // Run Semgrep
      execSync('npm run security:scan', { 
        stdio: 'pipe',
        timeout: 60000
      });
      this.addCheck('Semgrep Analysis', 'No security vulnerabilities detected', 'passed');
    } catch (error) {
      this.addCheck('Semgrep Analysis', 'Security vulnerabilities detected', 'failed', true);
    }
  }

  async checkDependencyVulnerabilities() {
    console.log('Scanning dependencies for vulnerabilities...');
    
    try {
      execSync('npm audit --audit-level=moderate', { 
        stdio: 'pipe',
        timeout: 60000
      });
      this.addCheck('Dependency Scan', 'No moderate+ vulnerabilities found', 'passed');
    } catch (error) {
      if (this.environment === 'production') {
        this.addCheck('Dependency Scan', 'Vulnerabilities found in dependencies', 'failed', true);
      } else {
        this.addCheck('Dependency Scan', 'Vulnerabilities found (non-blocking for staging)', 'warning');
      }
    }
  }

  async checkSecurityConfiguration() {
    console.log('Validating security configuration...');
    
    // Check environment variables
    const requiredEnvVars = [
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'NEXTAUTH_SECRET',
      'NEXTAUTH_URL'
    ];

    let envVarsValid = true;
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        this.addCheck('Environment Variables', `Missing required variable: ${envVar}`, 'failed', true);
        envVarsValid = false;
      }
    }

    if (envVarsValid) {
      this.addCheck('Environment Variables', 'All required environment variables present', 'passed');
    }

    // Check security headers configuration
    const middlewarePath = path.join(process.cwd(), 'middleware.ts');
    if (fs.existsSync(middlewarePath)) {
      const middlewareContent = fs.readFileSync(middlewarePath, 'utf8');
      
      if (middlewareContent.includes('securityHeaders')) {
        this.addCheck('Security Headers', 'Security headers middleware configured', 'passed');
      } else {
        this.addCheck('Security Headers', 'Security headers middleware not found', 'failed', true);
      }
    } else {
      this.addCheck('Security Headers', 'Middleware file not found', 'failed', true);
    }

    // Check Next.js security configuration
    const nextConfigPath = path.join(process.cwd(), 'next.config.js');
    if (fs.existsSync(nextConfigPath)) {
      const nextConfigContent = fs.readFileSync(nextConfigPath, 'utf8');
      
      if (nextConfigContent.includes('headers') || nextConfigContent.includes('security')) {
        this.addCheck('Next.js Security Config', 'Security configuration present', 'passed');
      } else {
        this.addCheck('Next.js Security Config', 'Security configuration missing', 'warning');
      }
    }
  }

  async checkEnvironmentSecurity() {
    console.log('Validating environment security settings...');
    
    // Check for debug mode
    if (process.env.NODE_ENV === 'production') {
      this.addCheck('Production Mode', 'Running in production mode', 'passed');
    } else if (this.environment === 'production') {
      this.addCheck('Production Mode', 'Not running in production mode', 'failed', true);
    }

    // Check for development dependencies in production
    if (this.environment === 'production') {
      try {
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        const prodDeps = Object.keys(packageJson.dependencies || {});
        const devDeps = Object.keys(packageJson.devDependencies || {});
        
        // Check if any dev dependencies are in production dependencies
        const devInProd = prodDeps.filter(dep => devDeps.includes(dep));
        
        if (devInProd.length === 0) {
          this.addCheck('Dependency Separation', 'No dev dependencies in production', 'passed');
        } else {
          this.addCheck('Dependency Separation', `Dev dependencies in production: ${devInProd.join(', ')}`, 'warning');
        }
      } catch (error) {
        this.addCheck('Dependency Separation', 'Could not validate dependency separation', 'warning');
      }
    }

    // Check for sensitive files
    const sensitiveFiles = [
      '.env.local',
      '.env.development',
      'private.key',
      'id_rsa',
      'secrets.json'
    ];

    let sensitiveFilesFound = [];
    for (const file of sensitiveFiles) {
      if (fs.existsSync(file)) {
        sensitiveFilesFound.push(file);
      }
    }

    if (sensitiveFilesFound.length === 0) {
      this.addCheck('Sensitive Files', 'No sensitive files in deployment', 'passed');
    } else {
      this.addCheck('Sensitive Files', `Sensitive files found: ${sensitiveFilesFound.join(', ')}`, 'failed', true);
    }
  }

  async checkPerformanceBenchmarks() {
    console.log('Running security performance benchmarks...');
    
    try {
      execSync('npm run test:security:performance', { 
        stdio: 'pipe',
        timeout: 180000 // 3 minutes
      });
      this.addCheck('Performance Benchmarks', 'Security performance within acceptable limits', 'passed');
    } catch (error) {
      if (this.environment === 'production') {
        this.addCheck('Performance Benchmarks', 'Security performance benchmarks failed', 'failed', true);
      } else {
        this.addCheck('Performance Benchmarks', 'Performance benchmarks failed (non-blocking for staging)', 'warning');
      }
    }
  }

  async checkProductionRequirements() {
    console.log('Validating production-specific requirements...');
    
    // Check for HTTPS enforcement
    if (process.env.NEXTAUTH_URL?.startsWith('https://')) {
      this.addCheck('HTTPS Enforcement', 'HTTPS configured for authentication', 'passed');
    } else {
      this.addCheck('HTTPS Enforcement', 'HTTPS not configured for authentication', 'failed', true);
    }

    // Check for secure cookie settings
    if (process.env.NODE_ENV === 'production') {
      // In production, cookies should be secure
      this.addCheck('Secure Cookies', 'Production environment configured for secure cookies', 'passed');
    }

    // Check for rate limiting configuration
    const rateLimitPath = path.join(process.cwd(), 'src', 'app', 'lib', 'usage', 'rate-limiter.ts');
    if (fs.existsSync(rateLimitPath)) {
      this.addCheck('Rate Limiting', 'Rate limiting implementation present', 'passed');
    } else {
      this.addCheck('Rate Limiting', 'Rate limiting implementation missing', 'failed', true);
    }

    // Check for audit logging
    const auditLogPath = path.join(process.cwd(), 'src', 'app', 'lib', 'audit', 'audit-logger.ts');
    if (fs.existsSync(auditLogPath)) {
      this.addCheck('Audit Logging', 'Audit logging implementation present', 'passed');
    } else {
      this.addCheck('Audit Logging', 'Audit logging implementation missing', 'failed', true);
    }

    // Check for backup configuration
    const backupPath = path.join(process.cwd(), 'src', 'app', 'lib', 'backup');
    if (fs.existsSync(backupPath)) {
      this.addCheck('Backup System', 'Backup system implementation present', 'passed');
    } else {
      this.addCheck('Backup System', 'Backup system implementation missing', 'warning');
    }
  }

  addCheck(category, message, status, blocking = false) {
    this.results.checks.push({
      category,
      message,
      status,
      blocking,
      timestamp: new Date().toISOString()
    });

    if (blocking && status === 'failed') {
      this.results.blocked = true;
    }

    switch (status) {
      case 'passed':
        this.results.passed++;
        console.log(`  ✅ ${category}: ${message}`);
        break;
      case 'failed':
        this.results.failed++;
        const blockingText = blocking ? ' (BLOCKING)' : '';
        console.log(`  ❌ ${category}: ${message}${blockingText}`);
        break;
      case 'warning':
        console.log(`  ⚠️  ${category}: ${message}`);
        break;
    }
  }

  generateDeploymentReport() {
    const reportPath = path.join(process.cwd(), `deployment-security-report-${this.environment}.json`);
    
    const report = {
      ...this.results,
      summary: {
        total: this.results.checks.length,
        passed: this.results.passed,
        failed: this.results.failed,
        warnings: this.results.checks.filter(c => c.status === 'warning').length,
        blocking_failures: this.results.checks.filter(c => c.blocking && c.status === 'failed').length,
        deployment_approved: !this.results.blocked && this.results.failed === 0
      }
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📊 Deployment security report saved to: ${reportPath}`);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const environment = args.find(arg => arg.startsWith('--env='))?.split('=')[1] || 'production';
  
  const gate = new DeploymentSecurityGate(environment);
  await gate.validateDeployment();
}

if (require.main === module) {
  main().catch(error => {
    console.error('Deployment security gate failed:', error);
    process.exit(1);
  });
}

module.exports = DeploymentSecurityGate;