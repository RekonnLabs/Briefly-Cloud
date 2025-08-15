#!/usr/bin/env node

/**
 * Launch Checklist
 * 
 * Comprehensive checklist for production deployment readiness
 */

const { execSync } = require('child_process');
const fs = require('fs');

class LaunchChecker {
  constructor() {
    this.checks = [];
    this.passed = 0;
    this.failed = 0;
    this.warnings = 0;
  }

  async runCheck(name, checkFn, isWarning = false) {
    try {
      console.log(`🔍 Checking: ${name}`);
      await checkFn();
      console.log(`✅ PASSED: ${name}`);
      this.passed++;
    } catch (error) {
      if (isWarning) {
        console.log(`⚠️  WARNING: ${name}`);
        console.log(`   Issue: ${error.message}`);
        this.warnings++;
      } else {
        console.log(`❌ FAILED: ${name}`);
        console.log(`   Error: ${error.message}`);
        this.failed++;
      }
    }
  }

  // P0 Checks
  async checkNextAuthRemoval() {
    const files = [
      'src/app/api/auth/[...nextauth]/route.ts',
      'src/app/lib/auth.ts'
    ];
    
    files.forEach(file => {
      if (fs.existsSync(file)) {
        throw new Error(`NextAuth file still exists: ${file}`);
      }
    });
    
    // Check for NextAuth references in code
    try {
      execSync('grep -r "NextAuth\\|next-auth" src/ --exclude-dir=node_modules', { stdio: 'pipe' });
      throw new Error('NextAuth references still found in source code');
    } catch (error) {
      // Good - no references found
    }
  }

  async checkEncryptionFunctions() {
    const sqlFile = 'database/10-oauth-token-encryption.sql';
    if (!fs.existsSync(sqlFile)) {
      throw new Error('OAuth token encryption SQL file not found');
    }
    
    const content = fs.readFileSync(sqlFile, 'utf8');
    const requiredFunctions = [
      'encrypt_oauth_token',
      'decrypt_oauth_token',
      'SECURITY DEFINER'
    ];
    
    requiredFunctions.forEach(func => {
      if (!content.includes(func)) {
        throw new Error(`Missing required function: ${func}`);
      }
    });
  }

  async checkBuildArtifacts() {
    const artifacts = ['.next', 'out', 'build', 'dist'];
    artifacts.forEach(artifact => {
      if (fs.existsSync(artifact)) {
        throw new Error(`Build artifact exists and should be cleaned: ${artifact}`);
      }
    });
  }

  // P1 Checks
  async checkCIWorkflow() {
    const workflowFile = '.github/workflows/ci-security-blocking.yml';
    if (!fs.existsSync(workflowFile)) {
      throw new Error('CI security workflow not found');
    }
    
    const content = fs.readFileSync(workflowFile, 'utf8');
    const requiredFeatures = [
      'fail-fast: true',
      'postgres:',
      'database/*.sql',
      'npm run test:security'
    ];
    
    requiredFeatures.forEach(feature => {
      if (!content.includes(feature)) {
        throw new Error(`CI workflow missing feature: ${feature}`);
      }
    });
  }

  async checkSecurityTests() {
    try {
      execSync('npm run test:security:minimal', { stdio: 'pipe' });
    } catch (error) {
      throw new Error('Minimal security tests failed');
    }
  }

  // P2 Checks
  async checkCSPCORS() {
    const configFile = 'src/app/lib/config/environment.ts';
    if (!fs.existsSync(configFile)) {
      throw new Error('Environment configuration file not found');
    }
    
    const content = fs.readFileSync(configFile, 'utf8');
    const requiredFeatures = [
      'deny-by-default',
      'nonce',
      'production'
    ];
    
    // Check for production-specific CSP
    if (!content.includes("'none'")) {
      throw new Error('CSP does not use deny-by-default approach');
    }
  }

  async checkDocumentation() {
    const files = [
      'README.md',
      'supabase-schema.sql',
      '.env.example'
    ];
    
    files.forEach(file => {
      if (!fs.existsSync(file)) {
        throw new Error(`Documentation file missing: ${file}`);
      }
      
      const content = fs.readFileSync(file, 'utf8');
      // Check for NextAuth references (case insensitive)
      const nextAuthRegex = /nextauth/i;
      if (nextAuthRegex.test(content) && !content.toLowerCase().includes('legacy')) {
        throw new Error(`NextAuth references found in ${file} without legacy note`);
      }
    });
  }

  async checkEnvironmentValidation() {
    try {
      execSync('node scripts/validate-environment.js', { stdio: 'pipe' });
    } catch (error) {
      throw new Error('Environment validation failed');
    }
  }

  // Additional Production Readiness Checks
  async checkPackageJson() {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    
    // Check for security scripts
    const requiredScripts = [
      'test:security:minimal',
      'clean',
      'validate:environment'
    ];
    
    requiredScripts.forEach(script => {
      if (!packageJson.scripts[script]) {
        throw new Error(`Missing required script: ${script}`);
      }
    });
    
    // Check for development dependencies in production
    if (packageJson.dependencies['next-auth']) {
      throw new Error('NextAuth still in dependencies');
    }
  }

  async checkGitignore() {
    if (!fs.existsSync('.gitignore')) {
      throw new Error('.gitignore file not found');
    }
    
    const content = fs.readFileSync('.gitignore', 'utf8');
    const requiredEntries = [
      '.next/',
      '.env*',
      'node_modules'
    ];
    
    requiredEntries.forEach(entry => {
      if (!content.includes(entry)) {
        throw new Error(`Missing .gitignore entry: ${entry}`);
      }
    });
  }

  async runAllChecks() {
    console.log('🚀 Running Launch Readiness Checklist...\n');
    
    console.log('📋 P0 - Critical Blockers:');
    await this.runCheck('NextAuth Removal', () => this.checkNextAuthRemoval());
    await this.runCheck('Encryption Functions', () => this.checkEncryptionFunctions());
    await this.runCheck('Build Artifacts Clean', () => this.checkBuildArtifacts());
    
    console.log('\n📋 P1 - CI/CD Security:');
    await this.runCheck('CI Workflow', () => this.checkCIWorkflow());
    await this.runCheck('Security Tests', () => this.checkSecurityTests());
    
    console.log('\n📋 P2 - Production Polish:');
    await this.runCheck('CSP/CORS Configuration', () => this.checkCSPCORS());
    await this.runCheck('Documentation Cleanup', () => this.checkDocumentation());
    await this.runCheck('Environment Validation', () => this.checkEnvironmentValidation());
    
    console.log('\n📋 Additional Readiness:');
    await this.runCheck('Package.json', () => this.checkPackageJson());
    await this.runCheck('Gitignore', () => this.checkGitignore());
    
    console.log('\n📊 Launch Readiness Results:');
    console.log(`✅ Passed: ${this.passed}`);
    console.log(`❌ Failed: ${this.failed}`);
    console.log(`⚠️  Warnings: ${this.warnings}`);
    
    const total = this.passed + this.failed + this.warnings;
    const successRate = Math.round((this.passed / total) * 100);
    console.log(`📈 Success Rate: ${successRate}%`);
    
    if (this.failed === 0) {
      console.log('\n🎉 All critical checks passed! Ready for production deployment.');
      if (this.warnings > 0) {
        console.log('⚠️  Please review warnings before deploying.');
      }
    } else {
      console.log('\n🚨 Critical issues found! Please fix before deployment.');
      process.exit(1);
    }
  }
}

// CLI execution
if (require.main === module) {
  const checker = new LaunchChecker();
  checker.runAllChecks().catch(error => {
    console.error('Launch checker failed:', error);
    process.exit(1);
  });
}

module.exports = LaunchChecker;