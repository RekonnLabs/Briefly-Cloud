#!/usr/bin/env node

/**
 * Environment Security Validation
 * 
 * Validates that all required environment variables are present and properly
 * configured for security in production environments.
 */

// Load environment variables
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

class EnvironmentValidator {
  constructor() {
    this.requiredVars = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'NEXTAUTH_SECRET', // Legacy auth secret (now used for general auth)
      'NEXTAUTH_URL',    // Legacy auth URL (now used for app URL)
      'ENCRYPTION_KEY',
      'JWT_SECRET'
    ];
    
    this.productionVars = [
      'ALLOWED_ORIGINS',
      'SESSION_DOMAIN',
      'RATE_LIMIT_MAX',
      'SENTRY_DSN'
    ];
    
    this.optionalVars = [
      'OPENAI_API_KEY',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'MICROSOFT_CLIENT_ID',
      'MICROSOFT_CLIENT_SECRET'
    ];
    
    this.securityPatterns = {
      'SUPABASE_SERVICE_ROLE_KEY': /^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/,
      'OPENAI_API_KEY': /^sk-[a-zA-Z0-9]{20,}$/,
      'STRIPE_SECRET_KEY': /^sk_(test_|live_)[a-zA-Z0-9]{10,}$/,
      'NEXTAUTH_SECRET': /^.{32,}$/, // At least 32 characters
      'ENCRYPTION_KEY': /^.{32,}$/, // At least 32 characters
      'JWT_SECRET': /^.{32,}$/      // At least 32 characters
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
    this.validateProductionToggles();
    this.checkForSecrets();
    
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
    const appUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
    
    // Check NODE_ENV
    if (!nodeEnv) {
      this.warnings.push('NODE_ENV not set, defaulting to development');
    } else if (!['development', 'staging', 'test', 'production'].includes(nodeEnv)) {
      this.warnings.push(`Unexpected NODE_ENV value: ${nodeEnv}`);
    }
    
    // Check app URL for production
    if (nodeEnv === 'production') {
      if (!appUrl) {
        this.errors.push('Application URL (NEXTAUTH_URL or NEXT_PUBLIC_APP_URL) is required in production');
      } else if (!appUrl.startsWith('https://')) {
        this.errors.push('Application URL must use HTTPS in production');
      }
    }
    
    // Check for development-only variables in production
    if (nodeEnv === 'production') {
      const devVars = ['DEBUG', 'VERBOSE_LOGGING', 'DISABLE_AUTH', 'SKIP_VALIDATION'];
      devVars.forEach(varName => {
        if (process.env[varName] && process.env[varName] !== 'false') {
          this.warnings.push(`Development variable ${varName} is set in production`);
        }
      });
    }
  }

  validateURLs() {
    const urlVars = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXTAUTH_URL',
      'NEXT_PUBLIC_APP_URL',
      'SENTRY_DSN'
    ];
    
    urlVars.forEach(varName => {
      const value = process.env[varName];
      
      if (value) {
        try {
          const url = new URL(value);
          
          // Check for HTTPS in production (except for Sentry DSN which can be HTTP)
          if (process.env.NODE_ENV === 'production' && 
              url.protocol !== 'https:' && 
              varName !== 'SENTRY_DSN') {
            this.errors.push(`${varName} must use HTTPS in production: ${value}`);
          }
          
          // Check for localhost in production
          if (process.env.NODE_ENV === 'production' && 
              (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
            this.errors.push(`${varName} cannot use localhost in production: ${value}`);
          }
          
          // Validate Supabase URL format
          if (varName === 'NEXT_PUBLIC_SUPABASE_URL' && !url.hostname.includes('supabase.co')) {
            this.warnings.push(`${varName} does not appear to be a Supabase URL: ${value}`);
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

  validateProductionToggles() {
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (isProduction) {
      // Ensure .env.example is the single source of truth
      const requiredProductionSettings = {
        'NEXT_TELEMETRY_DISABLED': '1',
        'NODE_ENV': 'production'
      };
      
      Object.entries(requiredProductionSettings).forEach(([varName, expectedValue]) => {
        const value = process.env[varName];
        if (value !== expectedValue) {
          this.errors.push(`Production setting ${varName} must be '${expectedValue}', got '${value}'`);
        }
      });
      
      // Check for development-only settings that should be disabled
      const devOnlySettings = [
        'DEBUG',
        'VERBOSE_LOGGING',
        'DISABLE_SECURITY_HEADERS',
        'ALLOW_HTTP',
        'SKIP_AUTH_CHECK'
      ];
      
      devOnlySettings.forEach(varName => {
        const value = process.env[varName];
        if (value && value !== 'false' && value !== '0') {
          this.errors.push(`Development setting ${varName} must be disabled in production`);
        }
      });
      
      // Validate CORS origins are properly set
      const allowedOrigins = process.env.ALLOWED_ORIGINS;
      if (!allowedOrigins) {
        this.warnings.push('ALLOWED_ORIGINS not set - using default production domains');
      } else {
        const origins = allowedOrigins.split(',').map(o => o.trim());
        origins.forEach(origin => {
          try {
            const url = new URL(origin);
            if (url.protocol !== 'https:') {
              this.errors.push(`CORS origin must use HTTPS in production: ${origin}`);
            }
            if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
              this.errors.push(`CORS origin cannot be localhost in production: ${origin}`);
            }
          } catch (error) {
            this.errors.push(`Invalid CORS origin format: ${origin}`);
          }
        });
      }
      
      // Check rate limiting configuration
      const rateLimitMax = process.env.RATE_LIMIT_MAX;
      if (rateLimitMax) {
        const limit = parseInt(rateLimitMax, 10);
        if (isNaN(limit) || limit < 1 || limit > 10000) {
          this.errors.push(`RATE_LIMIT_MAX must be a number between 1 and 10000, got: ${rateLimitMax}`);
        }
      }
    } else {
      // Development environment checks
      const devRecommendations = {
        'DEBUG': 'Consider enabling DEBUG for development',
        'LOG_LEVEL': 'Consider setting LOG_LEVEL to debug for development'
      };
      
      Object.entries(devRecommendations).forEach(([varName, message]) => {
        if (!process.env[varName]) {
          this.warnings.push(message);
        }
      });
    }
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