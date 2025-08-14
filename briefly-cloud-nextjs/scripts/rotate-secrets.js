#!/usr/bin/env node

/**
 * Secrets Rotation Script
 * 
 * This script handles automated secrets rotation based on
 * rotation intervals and expiration dates.
 */

const { getSecretsManager } = require('../src/app/lib/security/secrets-manager')
const { logger } = require('../src/app/lib/logger')

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

class SecretsRotator {
  constructor() {
    this.secretsManager = getSecretsManager()
    this.rotated = []
    this.failed = []
    this.skipped = []
  }

  log(message, color = 'white') {
    console.log(`${colors[color]}${message}${colors.reset}`)
  }

  /**
   * Check which secrets need rotation
   */
  async checkRotationNeeds() {
    this.log('\n🔍 Checking secrets rotation needs...', 'cyan')

    try {
      const secrets = await this.secretsManager.listSecrets()
      const needsRotation = []

      for (const secret of secrets) {
        const health = await this.secretsManager.checkSecretHealth(secret.name)
        
        if (health.rotationDue) {
          needsRotation.push({
            name: secret.name,
            type: secret.type,
            reason: 'rotation_due',
            issues: health.issues
          })
        } else if (health.expiresIn && health.expiresIn <= 7) {
          needsRotation.push({
            name: secret.name,
            type: secret.type,
            reason: 'expiring_soon',
            expiresIn: health.expiresIn,
            issues: health.issues
          })
        } else if (!health.isHealthy) {
          needsRotation.push({
            name: secret.name,
            type: secret.type,
            reason: 'unhealthy',
            issues: health.issues
          })
        }
      }

      return needsRotation

    } catch (error) {
      this.log(`❌ Failed to check rotation needs: ${error.message}`, 'red')
      throw error
    }
  }

  /**
   * Rotate secrets that need rotation
   */
  async rotateSecrets(secretsToRotate, options = {}) {
    const { dryRun = false, force = false } = options

    if (dryRun) {
      this.log('\n🧪 DRY RUN MODE - No actual rotations will be performed', 'yellow')
    }

    this.log(`\n🔄 Rotating ${secretsToRotate.length} secrets...`, 'cyan')

    for (const secretInfo of secretsToRotate) {
      try {
        this.log(`\n  Processing: ${secretInfo.name} (${secretInfo.type})`, 'blue')
        this.log(`    Reason: ${secretInfo.reason}`, 'white')
        
        if (secretInfo.issues && secretInfo.issues.length > 0) {
          this.log(`    Issues: ${secretInfo.issues.join(', ')}`, 'yellow')
        }

        if (dryRun) {
          this.log(`    ✓ Would rotate secret ${secretInfo.name}`, 'green')
          this.skipped.push({
            name: secretInfo.name,
            reason: 'dry_run'
          })
          continue
        }

        // Perform rotation
        const result = await this.secretsManager.rotateSecret(
          secretInfo.name,
          undefined, // Auto-generate new value
          'system' // System user for automated rotation
        )

        if (result.success) {
          this.log(`    ✅ Successfully rotated ${secretInfo.name}`, 'green')
          this.log(`       Old ID: ${result.oldSecretId}`, 'white')
          this.log(`       New ID: ${result.newSecretId}`, 'white')
          
          this.rotated.push({
            name: secretInfo.name,
            type: secretInfo.type,
            reason: secretInfo.reason,
            oldId: result.oldSecretId,
            newId: result.newSecretId,
            rotatedAt: result.rotatedAt
          })
        } else {
          this.log(`    ❌ Failed to rotate ${secretInfo.name}: ${result.error}`, 'red')
          this.failed.push({
            name: secretInfo.name,
            type: secretInfo.type,
            reason: secretInfo.reason,
            error: result.error
          })
        }

        // Add delay between rotations to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 1000))

      } catch (error) {
        this.log(`    ❌ Error rotating ${secretInfo.name}: ${error.message}`, 'red')
        this.failed.push({
          name: secretInfo.name,
          type: secretInfo.type,
          reason: secretInfo.reason,
          error: error.message
        })
      }
    }
  }

  /**
   * Generate rotation report
   */
  generateReport() {
    this.log('\n📊 Secrets Rotation Report', 'bright')
    this.log('='.repeat(50), 'white')

    this.log(`\n✅ Successfully rotated: ${this.rotated.length}`, 'green')
    this.log(`❌ Failed rotations: ${this.failed.length}`, 'red')
    this.log(`⏭️  Skipped: ${this.skipped.length}`, 'yellow')

    if (this.rotated.length > 0) {
      this.log('\n✅ Successfully Rotated:', 'green')
      this.rotated.forEach(secret => {
        this.log(`  • ${secret.name} (${secret.type}) - ${secret.reason}`, 'green')
      })
    }

    if (this.failed.length > 0) {
      this.log('\n❌ Failed Rotations:', 'red')
      this.failed.forEach(secret => {
        this.log(`  • ${secret.name} (${secret.type}) - ${secret.error}`, 'red')
      })
    }

    if (this.skipped.length > 0) {
      this.log('\n⏭️  Skipped:', 'yellow')
      this.skipped.forEach(secret => {
        this.log(`  • ${secret.name} - ${secret.reason}`, 'yellow')
      })
    }

    // Overall status
    const total = this.rotated.length + this.failed.length + this.skipped.length
    const successRate = total > 0 ? Math.round((this.rotated.length / total) * 100) : 0

    this.log(`\n🎯 Success Rate: ${successRate}%`, successRate >= 80 ? 'green' : successRate >= 60 ? 'yellow' : 'red')

    return {
      rotated: this.rotated.length,
      failed: this.failed.length,
      skipped: this.skipped.length,
      successRate,
      details: {
        rotated: this.rotated,
        failed: this.failed,
        skipped: this.skipped
      }
    }
  }

  /**
   * Run the rotation process
   */
  async run(options = {}) {
    const { 
      dryRun = false, 
      force = false, 
      secretType = null,
      secretName = null 
    } = options

    try {
      this.log('🔐 Briefly Cloud Secrets Rotator', 'bright')
      this.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`, dryRun ? 'yellow' : 'green')
      this.log('='.repeat(50), 'white')

      let secretsToRotate = []

      if (secretName) {
        // Rotate specific secret
        this.log(`\n🎯 Targeting specific secret: ${secretName}`, 'blue')
        
        const health = await this.secretsManager.checkSecretHealth(secretName)
        if (!health.isHealthy || force) {
          secretsToRotate.push({
            name: secretName,
            type: 'unknown', // Will be determined during rotation
            reason: force ? 'forced' : 'unhealthy',
            issues: health.issues
          })
        } else {
          this.log(`✅ Secret ${secretName} is healthy and doesn't need rotation`, 'green')
        }
      } else {
        // Check all secrets or by type
        secretsToRotate = await this.checkRotationNeeds()
        
        if (secretType) {
          secretsToRotate = secretsToRotate.filter(s => s.type === secretType)
          this.log(`\n🎯 Filtering by type: ${secretType}`, 'blue')
        }
      }

      if (secretsToRotate.length === 0) {
        this.log('\n🎉 No secrets need rotation at this time!', 'green')
        return this.generateReport()
      }

      this.log(`\n📋 Found ${secretsToRotate.length} secrets that need rotation:`, 'yellow')
      secretsToRotate.forEach(secret => {
        this.log(`  • ${secret.name} (${secret.type}) - ${secret.reason}`, 'white')
      })

      // Confirm rotation in interactive mode
      if (!dryRun && !force && process.stdin.isTTY) {
        const readline = require('readline')
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        })

        const answer = await new Promise(resolve => {
          rl.question('\n❓ Proceed with rotation? (y/N): ', resolve)
        })
        rl.close()

        if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
          this.log('\n⏹️  Rotation cancelled by user', 'yellow')
          return this.generateReport()
        }
      }

      // Perform rotations
      await this.rotateSecrets(secretsToRotate, { dryRun, force })

      // Generate and return report
      return this.generateReport()

    } catch (error) {
      this.log(`\n💥 Rotation process failed: ${error.message}`, 'red')
      logger.error('Secrets rotation failed', error)
      throw error
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2)
  const options = {}

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        options.dryRun = true
        break
      case '--force':
        options.force = true
        break
      case '--type':
        options.secretType = args[++i]
        break
      case '--secret':
        options.secretName = args[++i]
        break
      case '--help':
        console.log(`
🔐 Briefly Cloud Secrets Rotator

Usage: node scripts/rotate-secrets.js [options]

Options:
  --dry-run          Show what would be rotated without making changes
  --force            Force rotation even for healthy secrets
  --type <type>      Only rotate secrets of specific type
  --secret <name>    Rotate specific secret by name
  --help             Show this help message

Examples:
  node scripts/rotate-secrets.js --dry-run
  node scripts/rotate-secrets.js --type api_key
  node scripts/rotate-secrets.js --secret my-secret --force
        `)
        process.exit(0)
      default:
        console.error(`Unknown option: ${args[i]}`)
        process.exit(1)
    }
  }

  try {
    const rotator = new SecretsRotator()
    const report = await rotator.run(options)
    
    // Exit with appropriate code
    process.exit(report.failed > 0 ? 1 : 0)
    
  } catch (error) {
    console.error('Rotation failed:', error.message)
    process.exit(1)
  }
}

// Run if called directly
if (require.main === module) {
  main()
}

module.exports = SecretsRotator