#!/usr/bin/env node

/**
 * Environment Security Validation
 * 
 * Validates that all required environment variables are present and properly
 * configured for security in production environments.
 */

const fs = require('fs');
const path = require('path');

class EnvironmentValidator {
  constructor() {
    this.requiredVars = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'OPENAI_API_KEY',
      'NEXTAUTH_SECRET',
      'NEXTAUTH_URL'
    ];
    
    this.productionVars = [
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'MICROSOFT_CLIENT_ID',
      'MICROSOFT_CLIENT_SECRET'
    ];
    
    this.securityPatterns = {
      'SUPABASE_SERVICE_ROLE_KEY': /^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/,
      'OPENAI_API_KEY': /^sk-[a-zA-Z0-9]{48}$/,
      'STRIPE_SECRET_KEY': /^sk_(test_|live_)[a-zA-Z0-9]{24,}$/,
      'NEXTAUTH_SECRET': /^[a-zA-Z0-9_-]{32,}$/
    };
    
    this.errors = [];
    this.warnings = [];
  }

  validate() {
    console.log('🔍 Validating environment configuration...');
    
    this.checkRequiredVariables();
    this.checkProductionVariables();
    this.validateSecurityPatterns();
    this.checkEnvironmentSpecific();
    this.validateURLs();
    this.checkSecurityHeaders();
    
    this.printResults();
    
    if (this.errors.length > 0) {
      process.exit(1);
    }
  }

  checkRequiredVariables() {
    this.requiredVars.forEach(varName => {
      const value = process.env[varName];
      
      if (!value) {
        this.errors.push(`Missing required environment variable: ${varName}`);
      } else if (value.trim() === '') {
        this.errors.push(`Empty environment variable: ${varName}`);
      } else if (value === 'your_value_here' || value === 'placeholder') {
        this.errors.push(`Placeholder value detected for: ${varName}`);
      }
    });
  }

  checkProductionVariables() {
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (isProduction) {
      this.productionVars.forEach(varName => {
        const value = process.env[varName];
        
        if (!value) {
          this.errors.push(`Missing production environment variable: ${varName}`);
        }
      });
    }
  }

  validateSecurityPatterns() {
    Object.entries(this.securityPatterns).forEach(([varName, pattern]) => {
      const value = process.env[varName];
      
      if (value && !pattern.test(value)) {
        this.errors.push(`Invalid format for ${varName}: does not match expected pattern`);
      }
    });
  }

  checkEnvironmentSpecific() {
    const nodeEnv = process.env.NODE_ENV;
    const nextAuthUrl = process.env.NEXTAUTH_URL;
    
    // Check NODE_ENV
    if (!nodeEnv) {
      this.warnings.push('NODE_ENV not set, defaulting to development');
    } else if (!['development', 'test', 'production'].includes(nodeEnv)) {
      this.warnings.push(`Unexpected NODE_ENV value: ${nodeEnv}`);
    }
    
    // Check NEXTAUTH_URL for production
    if (nodeEnv === 'production') {
      if (!nextAuthUrl) {
        this.errors.push('NEXTAUTH_URL is required in production');
      } else if (!nextAuthUrl.startsWith('https://')) {
        this.errors.push('NEXTAUTH_URL must use HTTPS in production');
      }
    }
    
    // Check for development-only variables in production
    if (nodeEnv === 'production') {
      const devVars = ['DEBUG', 'VERBOSE_LOGGING'];
      devVars.forEach(varName => {
        if (process.env[varName]) {
          this.warnings.push(`Development variable ${varName} is set in production`);
        }
      });
    }
  }

  validateURLs() {
    const urlVars = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXTAUTH_URL'
    ];
    
    urlVars.forEach(varName => {
      const value = process.env[varName];
      
      if (value) {
        try {
          const url = new URL(value);
          
          // Check for HTTPS in production
          if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
            this.errors.push(`${varName} must use HTTPS in production: ${value}`);
          }
          
          // Check for localhost in production
          if (process.env.NODE_ENV === 'production' && 
              (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
            this.errors.push(`${varName} cannot use localhost in production: ${value}`);
          }
          
        } catch (error) {
          this.errors.push(`Invalid URL format for ${varName}: ${value}`);
        }
      }
    });
  }

  checkSecurityHeaders() {
    // Check if security-related environment variables are properly set
    const securityVars = {
      'SECURITY_HEADERS_ENABLED': 'true',
      'CORS_ENABLED': 'true',
      'RATE_LIMITING_ENABLED': 'true'
    };
    
    Object.entries(securityVars).forEach(([varName, expectedValue]) => {
      const value = process.env[varName];
      
      if (process.env.NODE_ENV === 'production') {
        if (!value || value !== expectedValue) {
          this.warnings.push(`Security setting ${varName} should be set to '${expectedValue}' in production`);
        }
      }
    });
  }

  checkForSecrets() {
    // Check for accidentally exposed secrets in environment
    const secretPatterns = [
      { name: 'Private Key', pattern: /-----BEGIN (RSA )?PRIVATE KEY-----/ },
      { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/ },
      { name: 'Generic Secret', pattern: /secret[_-]?key/i }
    ];
    
    Object.entries(process.env).forEach(([key, value]) => {
      secretPatterns.forEach(({ name, pattern }) => {
        if (pattern.test(value)) {
          this.errors.push(`Potential ${name} detected in environment variable ${key}`);
        }
      });
    });
  }

  printResults() {
    console.log('\n📊 Environment Validation Results:');
    
    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('✅ All environment variables are properly configured');
      return;
    }
    
    if (this.errors.length > 0) {
      console.log('\n❌ Errors:');
      this.errors.forEach(error => console.log(`  - ${error}`));
    }
    
    if (this.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      this.warnings.forEach(warning => console.log(`  - ${warning}`));
    }
    
    console.log(`\nSummary: ${this.errors.length} errors, ${this.warnings.length} warnings`);
  }
}

// CLI execution
if (require.main === module) {
  const validator = new EnvironmentValidator();
  validator.validate();
}

module.exports = EnvironmentValidator;