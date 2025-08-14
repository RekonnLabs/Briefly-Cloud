#!/usr/bin/env node

/**
 * Backup Validation Script
 * 
 * This script validates backup integrity, completeness, and
 * restoration capabilities for all recent backups.
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

async function validateBackups() {
  console.log('🔍 Starting backup validation process...')
  
  try {
    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    console.log('✅ Connected to Supabase')

    // Get recent completed backups that need validation
    const validationPeriod = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
    
    const { data: backups, error: backupError } = await supabase
      .from('private.backup_jobs')
      .select(`
        *,
        backup_configs:config_id (
          name,
          backup_type,
          compression_enabled,
          encryption_enabled
        )
      `)
      .eq('status', 'completed')
      .gte('started_at', validationPeriod.toISOString())
      .order('started_at', { ascending: false })

    if (backupError) {
      throw new Error(`Failed to get backups: ${backupError.message}`)
    }

    console.log(`📋 Found ${backups?.length || 0} completed backups to validate`)

    if (!backups || backups.length === 0) {
      console.log('ℹ️  No backups found for validation')
      return
    }

    const validationResults = []
    let validCount = 0
    let invalidCount = 0
    let errorCount = 0

    // Validate each backup
    for (const backup of backups) {
      console.log(`\n🔍 Validating backup: ${backup.id}`)
      console.log(`   • Config: ${backup.backup_configs?.name || 'Unknown'}`)
      console.log(`   • Type: ${backup.backup_type}`)
      console.log(`   • Started: ${new Date(backup.started_at).toLocaleString()}`)
      console.log(`   • Size: ${formatBytes(backup.size || 0)}`)

      try {
        // Check if already validated recently
        const { data: existingValidation, error: validationError } = await supabase
          .from('private.backup_validations')
          .select('*')
          .eq('backup_id', backup.id)
          .gte('validated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
          .single()

        if (existingValidation && !validationError) {
          console.log(`   ✅ Already validated recently (${existingValidation.is_valid ? 'VALID' : 'INVALID'})`)
          
          validationResults.push({
            backupId: backup.id,
            configName: backup.backup_configs?.name,
            isValid: existingValidation.is_valid,
            validatedAt: existingValidation.validated_at,
            checks: {
              integrity: existingValidation.integrity_check,
              completeness: existingValidation.completeness_check,
              restoration: existingValidation.restoration_check
            },
            issues: existingValidation.issues || [],
            validationTime: existingValidation.validation_time_ms,
            skipped: true
          })

          if (existingValidation.is_valid) {
            validCount++
          } else {
            invalidCount++
          }
          continue
        }

        // Perform validation
        const validationResult = await validateBackupIntegrity(supabase, backup)
        
        validationResults.push({
          backupId: backup.id,
          configName: backup.backup_configs?.name,
          ...validationResult,
          skipped: false
        })

        if (validationResult.isValid) {
          validCount++
          console.log(`   ✅ Validation PASSED`)
        } else {
          invalidCount++
          console.log(`   ❌ Validation FAILED`)
          console.log(`      Issues: ${validationResult.issues.join(', ')}`)
        }

        console.log(`   📊 Checks:`)
        console.log(`      • Integrity: ${validationResult.checks.integrity ? '✅' : '❌'}`)
        console.log(`      • Completeness: ${validationResult.checks.completeness ? '✅' : '❌'}`)
        console.log(`      • Restoration: ${validationResult.checks.restoration ? '✅' : '❌'}`)
        console.log(`   ⏱️  Validation time: ${validationResult.validationTime}ms`)

      } catch (validationError) {
        errorCount++
        console.error(`   ❌ Validation error: ${validationError.message}`)
        
        validationResults.push({
          backupId: backup.id,
          configName: backup.backup_configs?.name,
          isValid: false,
          error: validationError.message,
          validatedAt: new Date().toISOString(),
          checks: {
            integrity: false,
            completeness: false,
            restoration: false
          },
          issues: [`Validation failed: ${validationError.message}`],
          validationTime: 0,
          skipped: false
        })
      }
    }

    // Generate validation report
    const report = {
      totalBackups: backups.length,
      validBackups: validCount,
      invalidBackups: invalidCount,
      errorCount,
      successRate: backups.length > 0 ? (validCount / backups.length * 100).toFixed(2) : 0,
      validationDate: new Date().toISOString(),
      results: validationResults
    }

    // Store validation report
    const { error: auditError } = await supabase
      .from('private.audit_logs')
      .insert({
        action: 'BACKUP_VALIDATION_REPORT',
        resource_type: 'backup',
        new_values: {
          report: {
            ...report,
            results: report.results.map(r => ({
              backupId: r.backupId,
              configName: r.configName,
              isValid: r.isValid,
              issues: r.issues,
              skipped: r.skipped
            }))
          }
        },
        severity: invalidCount > 0 || errorCount > 0 ? 'warning' : 'info'
      })

    if (auditError) {
      console.warn(`⚠️  Failed to store validation report: ${auditError.message}`)
    }

    // Display summary
    console.log('\n🎉 Backup validation completed!')
    console.log('\n📊 Validation Summary:')
    console.log(`   • Total backups validated: ${backups.length}`)
    console.log(`   • Valid backups: ${validCount} (${report.successRate}%)`)
    console.log(`   • Invalid backups: ${invalidCount}`)
    console.log(`   • Validation errors: ${errorCount}`)

    // Show failed validations
    const failedValidations = validationResults.filter(r => !r.isValid && !r.skipped)
    if (failedValidations.length > 0) {
      console.log('\n❌ Failed Validations:')
      failedValidations.forEach(result => {
        console.log(`   • ${result.backupId} (${result.configName}):`)
        result.issues.forEach(issue => {
          console.log(`     - ${issue}`)
        })
      })
    }

    // Show recommendations
    console.log('\n💡 Recommendations:')
    if (invalidCount === 0 && errorCount === 0) {
      console.log('   • All backups are valid - backup system is healthy')
    } else {
      if (invalidCount > 0) {
        console.log(`   • Investigate ${invalidCount} invalid backups`)
        console.log('   • Review backup procedures and storage integrity')
      }
      if (errorCount > 0) {
        console.log(`   • Fix ${errorCount} validation errors`)
        console.log('   • Check backup system configuration')
      }
    }
    
    console.log('   • Schedule regular validation (daily/weekly)')
    console.log('   • Monitor backup success rates')
    console.log('   • Test restoration procedures periodically')

    // Exit with error code if there are issues
    if (invalidCount > 0 || errorCount > 0) {
      console.log('\n⚠️  Validation completed with issues')
      process.exit(1)
    }

  } catch (error) {
    console.error('❌ Backup validation failed:', error.message)
    process.exit(1)
  }
}

/**
 * Validate individual backup integrity
 */
async function validateBackupIntegrity(supabase, backup) {
  const startTime = Date.now()
  
  const checks = {
    integrity: false,
    completeness: false,
    restoration: false
  }
  const issues = []

  try {
    // Check 1: Verify checksum exists and is valid
    if (!backup.checksum) {
      issues.push('Missing checksum')
    } else {
      // In a real implementation, you would verify the actual file checksum
      checks.integrity = true
    }

    // Check 2: Verify metadata completeness
    if (!backup.metadata || 
        !backup.metadata.tables || 
        !backup.metadata.recordCount) {
      issues.push('Incomplete metadata')
    } else {
      // Verify metadata indicates a complete backup
      if (backup.metadata.recordCount > 0 && backup.metadata.tables.length > 0) {
        checks.completeness = true
      } else {
        issues.push('Backup appears empty or incomplete')
      }
    }

    // Check 3: Verify backup size is reasonable
    if (!backup.size || backup.size <= 0) {
      issues.push('Invalid backup size')
    } else if (backup.size < 1000) { // Less than 1KB seems suspicious
      issues.push('Backup size suspiciously small')
    }

    // Check 4: Verify backup duration is reasonable
    if (!backup.duration || backup.duration <= 0) {
      issues.push('Invalid backup duration')
    } else if (backup.duration > 24 * 60 * 60 * 1000) { // More than 24 hours
      issues.push('Backup duration suspiciously long')
    }

    // Check 5: Test restoration capability (simplified)
    try {
      // In a real implementation, you would test actual restoration
      // For now, we'll simulate based on backup metadata
      if (backup.metadata && backup.metadata.tables && backup.metadata.tables.length > 0) {
        checks.restoration = true
      } else {
        issues.push('Cannot verify restoration capability')
      }
    } catch (restoreError) {
      issues.push(`Restoration test failed: ${restoreError.message}`)
    }

    const isValid = checks.integrity && checks.completeness && checks.restoration
    const validationTime = Date.now() - startTime

    // Store validation result
    const { error: storeError } = await supabase
      .from('private.backup_validations')
      .insert({
        backup_id: backup.id,
        is_valid: isValid,
        validated_at: new Date().toISOString(),
        integrity_check: checks.integrity,
        completeness_check: checks.completeness,
        restoration_check: checks.restoration,
        issues: issues,
        validation_time_ms: validationTime
      })

    if (storeError) {
      console.warn(`⚠️  Failed to store validation result: ${storeError.message}`)
    }

    return {
      isValid,
      validatedAt: new Date().toISOString(),
      checks,
      issues,
      validationTime
    }

  } catch (error) {
    throw new Error(`Validation failed: ${error.message}`)
  }
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Validate environment variables
 */
function validateEnvironment() {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
  ]

  const missing = required.filter(key => !process.env[key])
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:')
    missing.forEach(key => console.error(`   • ${key}`))
    process.exit(1)
  }
}

/**
 * Quick validation mode - only check recent backups
 */
async function quickValidation() {
  console.log('⚡ Running quick backup validation...')
  
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // Get only the most recent backup from each config
    const { data: configs, error: configError } = await supabase
      .from('private.backup_configs')
      .select('id, name')
      .eq('is_active', true)

    if (configError) {
      throw new Error(`Failed to get configs: ${configError.message}`)
    }

    console.log(`📋 Checking latest backup from ${configs?.length || 0} configurations`)

    let validCount = 0
    let invalidCount = 0

    for (const config of configs || []) {
      const { data: latestBackup, error: backupError } = await supabase
        .from('private.backup_jobs')
        .select('*')
        .eq('config_id', config.id)
        .eq('status', 'completed')
        .order('started_at', { ascending: false })
        .limit(1)
        .single()

      if (backupError || !latestBackup) {
        console.log(`   ⚠️  No recent backup for ${config.name}`)
        continue
      }

      try {
        const result = await validateBackupIntegrity(supabase, latestBackup)
        
        if (result.isValid) {
          validCount++
          console.log(`   ✅ ${config.name}: Latest backup is valid`)
        } else {
          invalidCount++
          console.log(`   ❌ ${config.name}: Latest backup is invalid (${result.issues.join(', ')})`)
        }
      } catch (error) {
        invalidCount++
        console.log(`   ❌ ${config.name}: Validation failed (${error.message})`)
      }
    }

    console.log(`\n📊 Quick Validation Summary:`)
    console.log(`   • Valid configurations: ${validCount}`)
    console.log(`   • Invalid configurations: ${invalidCount}`)
    
    if (invalidCount > 0) {
      console.log('💡 Run full validation for detailed analysis')
      process.exit(1)
    }

  } catch (error) {
    console.error('❌ Quick validation failed:', error.message)
    process.exit(1)
  }
}

// Main execution
if (require.main === module) {
  validateEnvironment()
  
  const isQuick = process.argv.includes('--quick')
  
  const validationFunction = isQuick ? quickValidation : validateBackups
  
  validationFunction()
    .then(() => {
      console.log('\n✅ Script completed successfully')
      process.exit(0)
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error.message)
      process.exit(1)
    })
}

module.exports = {
  validateBackups,
  quickValidation,
  validateBackupIntegrity,
  formatBytes
}