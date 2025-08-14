#!/usr/bin/env node

/**
 * Security Validation Script
 * 
 * This script validates the security configuration and environment
 * setup for production deployment.
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

// ANSI color codes for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  reset: '\x1b[0m',
  bright: '\x1b[1m'
}

class SecurityValidator {
  constructor() {
    this.errors = []
    this.warnings = []
    this.passed = []
    this.environment = process.env.NODE_ENV || 'development'
  }

  log(message, color = 'white') {
    console.log(`${colors[color]}${message}${colors.reset}`)
  }

  error(message) {
    this.errors.push(message)
    this.log(`❌ ${message}`, 'red')
  }

  warning(message) {
    this.warnings.push(message)
    this.log(`⚠️  ${message}`, 'yellow')
  }

  pass(message) {
    this.passed.push(message)
    this.log(`✅ ${message}`, 'green')
  }

  info(message) {
    this.log(`ℹ️  ${message}`, 'blue')
  }

  /**
   * Validate environment variables
   */
  validateEnvironmentVariables() {
    this.log('\n🔍 Validating Environment Variables...', 'cyan')

    const requiredVars = {
      'NODE_ENV': { required: true, values: ['development', 'staging', 'production'] },
      'NEXT_PUBLIC_APP_URL': { required: true, type: 'url' },
      'SUPABASE_URL': { required: true, type: 'url' },
      'SUPABASE_ANON_KEY': { required: true, minLength: 100 },
      'SUPABASE_SERVICE_ROLE_KEY': { required: true, minLength: 100 },
      'NEXTAUTH_SECRET': { required: true, minLength: 32 },
      'NEXTAUTH_URL': { required: true, type: 'url' },
      'ENCRYPTION_KEY': { required: true, minLength: 32 },
      'JWT_SECRET': { required: true, minLength: 32 }
    }

    const productionVars = {
      'ALLOWED_ORIGINS': { required: false, type: 'string' },
      'SESSION_DOMAIN': { required: false, type: 'string' },
      'SENTRY_DSN': { required: false, type: 'url' }
    }

    // Check required variables
    Object.entries(requiredVars).forEach(([key, config]) => {
      const value = process.env[key]

      if (!value) {
        this.error(`Missing required environment variable: ${key}`)
        return
      }

      // Type validation
      if (config.type === 'url') {
        try {
          new URL(value)
          this.pass(`${key} is a valid URL`)
        } catch {
          this.error(`${key} is not a valid URL: ${value}`)
        }
      }

      // Length validation
      if (config.minLength && value.length < config.minLength) {
        this.error(`${key} must be at least ${config.minLength} characters (current: ${value.length})`)
      } else if (config.minLength) {
        this.pass(`${key} meets minimum length requirement`)
      }

      // Value validation
      if (config.values && !config.values.includes(value)) {
        this.error(`${key} must be one of: ${config.values.join(', ')} (current: ${value})`)
      } else if (config.values) {
        this.pass(`${key} has valid value: ${value}`)
      }
    })

    // Production-specific checks
    if (this.environment === 'production') {
      this.log('\n🏭 Production Environment Checks...', 'magenta')

      if (!process.env.ALLOWED_ORIGINS) {
        this.warning('ALLOWED_ORIGINS not set - using default CORS policy')
      } else {
        this.pass('ALLOWED_ORIGINS configured for production')
      }

      if (process.env.NEXT_PUBLIC_APP_URL?.includes('localhost')) {
        this.error('Using localhost URL in production environment')
      }

      if (!process.env.SENTRY_DSN) {
        this.warning('SENTRY_DSN not configured - error tracking disabled')
      }
    }
  }

  /**
   * Validate secret strength
   */
  validateSecretStrength() {
    this.log('\n🔐 Validating Secret Strength...', 'cyan')

    const secrets = [
      'NEXTAUTH_SECRET',
      'ENCRYPTION_KEY',
      'JWT_SECRET'
    ]

    secrets.forEach(secretName => {
      const secret = process.env[secretName]
      if (!secret) return

      // Check entropy
      const entropy = this.calculateEntropy(secret)
      if (entropy < 4.0) {
        this.warning(`${secretName} has low entropy (${entropy.toFixed(2)}). Consider using a more random value.`)
      } else {
        this.pass(`${secretName} has good entropy (${entropy.toFixed(2)})`)
      }

      // Check for common patterns
      if (this.hasCommonPatterns(secret)) {
        this.warning(`${secretName} contains common patterns. Consider using a cryptographically secure random value.`)
      } else {
        this.pass(`${secretName} does not contain obvious patterns`)
      }

      // Check if it's a default/example value
      if (this.isDefaultValue(secret)) {
        this.error(`${secretName} appears to be a default/example value. Use a unique secret!`)
      }
    })
  }

  /**
   * Calculate Shannon entropy of a string
   */
  calculateEntropy(str) {
    const freq = {}
    for (let char of str) {
      freq[char] = (freq[char] || 0) + 1
    }

    let entropy = 0
    const len = str.length
    for (let char in freq) {
      const p = freq[char] / len
      entropy -= p * Math.log2(p)
    }

    return entropy
  }

  /**
   * Check for common patterns in secrets
   */
  hasCommonPatterns(secret) {
    const patterns = [
      /123456/,
      /password/i,
      /secret/i,
      /admin/i,
      /test/i,
      /demo/i,
      /(.)\1{3,}/, // Repeated characters
      /^[a-zA-Z]+$/, // Only letters
      /^[0-9]+$/ // Only numbers
    ]

    return patterns.some(pattern => pattern.test(secret))
  }

  /**
   * Check if secret is a default/example value
   */
  isDefaultValue(secret) {
    const defaultValues = [
      'your-secret-here',
      'change-me',
      'example',
      'test',
      'demo',
      'default',
      'placeholder'
    ]

    return defaultValues.some(defaultVal => 
      secret.toLowerCase().includes(defaultVal)
    )
  }

  /**
   * Validate file permissions and security
   */
  validateFilePermissions() {
    this.log('\n📁 Validating File Permissions...', 'cyan')

    const sensitiveFiles = [
      '.env.local',
      '.env.production',
      '.env'
    ]

    sensitiveFiles.forEach(file => {
      const filePath = path.join(process.cwd(), file)
      
      if (fs.existsSync(filePath)) {
        try {
          const stats = fs.statSync(filePath)
          const mode = stats.mode & parseInt('777', 8)
          
          // Check if file is readable by others
          if (mode & parseInt('044', 8)) {
            this.warning(`${file} is readable by others (permissions: ${mode.toString(8)})`)
          } else {
            this.pass(`${file} has secure permissions`)
          }
        } catch (error) {
          this.warning(`Could not check permissions for ${file}: ${error.message}`)
        }
      }
    })

    // Check for accidentally committed secrets
    const gitignorePath = path.join(process.cwd(), '.gitignore')
    if (fs.existsSync(gitignorePath)) {
      const gitignore = fs.readFileSync(gitignorePath, 'utf8')
      const requiredIgnores = ['.env.local', '.env.production', '.env']
      
      requiredIgnores.forEach(pattern => {
        if (gitignore.includes(pattern)) {
          this.pass(`${pattern} is in .gitignore`)
        } else {
          this.error(`${pattern} is NOT in .gitignore - risk of committing secrets!`)
        }
      })
    } else {
      this.warning('.gitignore file not found')
    }
  }

  /**
   * Validate Next.js configuration
   */
  validateNextConfig() {
    this.log('\n⚙️  Validating Next.js Configuration...', 'cyan')

    const configPath = path.join(process.cwd(), 'next.config.js')
    
    if (!fs.existsSync(configPath)) {
      this.warning('next.config.js not found')
      return
    }

    try {
      const configContent = fs.readFileSync(configPath, 'utf8')
      
      // Check for security configurations
      const securityChecks = [
        { pattern: /poweredByHeader:\s*false/, message: 'X-Powered-By header disabled' },
        { pattern: /reactStrictMode:\s*true/, message: 'React Strict Mode enabled' },
        { pattern: /swcMinify:\s*true/, message: 'SWC minification enabled' },
        { pattern: /headers\(\)/, message: 'Security headers configured' },
        { pattern: /Strict-Transport-Security/, message: 'HSTS header configured' }
      ]

      securityChecks.forEach(check => {
        if (check.pattern.test(configContent)) {
          this.pass(check.message)
        } else {
          this.warning(`Missing: ${check.message}`)
        }
      })

      // Production-specific checks
      if (this.environment === 'production') {
        if (configContent.includes('productionBrowserSourceMaps: false')) {
          this.pass('Source maps disabled in production')
        } else {
          this.warning('Source maps may be enabled in production')
        }
      }

    } catch (error) {
      this.error(`Could not read next.config.js: ${error.message}`)
    }
  }

  /**
   * Validate package.json security
   */
  validatePackageSecurity() {
    this.log('\n📦 Validating Package Security...', 'cyan')

    const packagePath = path.join(process.cwd(), 'package.json')
    
    if (!fs.existsSync(packagePath)) {
      this.error('package.json not found')
      return
    }

    try {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
      
      // Check for security-related scripts
      const scripts = packageJson.scripts || {}
      
      if (scripts['security:check'] || scripts['audit']) {
        this.pass('Security check scripts configured')
      } else {
        this.warning('No security check scripts found')
      }

      // Check for known vulnerable packages (basic check)
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies }
      
      // This is a basic example - in practice, use npm audit or similar tools
      const knownVulnerable = ['lodash@4.17.20', 'axios@0.21.0']
      
      let foundVulnerable = false
      Object.entries(dependencies).forEach(([name, version]) => {
        const packageVersion = `${name}@${version}`
        if (knownVulnerable.includes(packageVersion)) {
          this.error(`Known vulnerable package: ${packageVersion}`)
          foundVulnerable = true
        }
      })

      if (!foundVulnerable) {
        this.pass('No known vulnerable packages found (basic check)')
      }

    } catch (error) {
      this.error(`Could not read package.json: ${error.message}`)
    }
  }

  /**
   * Generate security report
   */
  generateReport() {
    this.log('\n📊 Security Validation Report', 'bright')
    this.log('='.repeat(50), 'white')

    this.log(`\n✅ Passed: ${this.passed.length}`, 'green')
    this.log(`⚠️  Warnings: ${this.warnings.length}`, 'yellow')
    this.log(`❌ Errors: ${this.errors.length}`, 'red')

    if (this.warnings.length > 0) {
      this.log('\n⚠️  Warnings:', 'yellow')
      this.warnings.forEach(warning => this.log(`  • ${warning}`, 'yellow'))
    }

    if (this.errors.length > 0) {
      this.log('\n❌ Errors:', 'red')
      this.errors.forEach(error => this.log(`  • ${error}`, 'red'))
    }

    // Overall security score
    const total = this.passed.length + this.warnings.length + this.errors.length
    const score = total > 0 ? Math.round((this.passed.length / total) * 100) : 0

    this.log(`\n🛡️  Security Score: ${score}%`, score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red')

    if (this.errors.length === 0) {
      this.log('\n🎉 Security validation passed!', 'green')
      return true
    } else {
      this.log('\n🚨 Security validation failed! Please fix the errors above.', 'red')
      return false
    }
  }

  /**
   * Run all validations
   */
  async run() {
    this.log('🛡️  Briefly Cloud Security Validator', 'bright')
    this.log(`Environment: ${this.environment}`, 'blue')
    this.log('='.repeat(50), 'white')

    this.validateEnvironmentVariables()
    this.validateSecretStrength()
    this.validateFilePermissions()
    this.validateNextConfig()
    this.validatePackageSecurity()

    const passed = this.generateReport()
    
    // Exit with appropriate code
    process.exit(passed ? 0 : 1)
  }
}

// Run the validator
if (require.main === module) {
  const validator = new SecurityValidator()
  validator.run().catch(error => {
    console.error('Validation failed:', error)
    process.exit(1)
  })
}

module.exports = SecurityValidator