#!/usr/bin/env node

/**
 * Backup Cleanup Script
 * 
 * This script enforces backup retention policies by cleaning up
 * old backups that exceed the configured retention period.
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

async function cleanupOldBackups() {
  console.log('🧹 Starting backup cleanup process...')
  
  try {
    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    console.log('✅ Connected to Supabase')

    // Get all active backup configurations
    const { data: configs, error: configError } = await supabase
      .from('private.backup_configs')
      .select('*')
      .eq('is_active', true)

    if (configError) {
      throw new Error(`Failed to get backup configs: ${configError.message}`)
    }

    console.log(`📋 Found ${configs?.length || 0} active backup configurations`)

    let totalDeleted = 0
    const cleanupResults = []

    // Process each configuration
    for (const config of configs || []) {
      console.log(`\n🔍 Processing config: ${config.name}`)
      
      try {
        // Calculate cutoff dates
        const retentionCutoff = new Date(Date.now() - config.retention_days * 24 * 60 * 60 * 1000)
        
        console.log(`   • Retention period: ${config.retention_days} days`)
        console.log(`   • Cutoff date: ${retentionCutoff.toISOString()}`)
        console.log(`   • Max count: ${config.retention_max_count}`)

        // Get backups for this configuration
        const { data: allBackups, error: backupError } = await supabase
          .from('private.backup_jobs')
          .select('id, started_at, status, size')
          .eq('config_id', config.id)
          .eq('status', 'completed')
          .order('started_at', { ascending: false })

        if (backupError) {
          throw new Error(`Failed to get backups for ${config.name}: ${backupError.message}`)
        }

        console.log(`   • Total completed backups: ${allBackups?.length || 0}`)

        let deletedCount = 0
        let deletedSize = 0
        const deletedBackups = []

        // Delete backups older than retention period
        const oldBackups = (allBackups || []).filter(backup => 
          new Date(backup.started_at) < retentionCutoff
        )

        if (oldBackups.length > 0) {
          console.log(`   • Found ${oldBackups.length} backups exceeding retention period`)
          
          for (const backup of oldBackups) {
            const { error: deleteError } = await supabase
              .from('private.backup_jobs')
              .delete()
              .eq('id', backup.id)

            if (deleteError) {
              console.warn(`   ⚠️  Failed to delete backup ${backup.id}: ${deleteError.message}`)
            } else {
              deletedCount++
              deletedSize += backup.size || 0
              deletedBackups.push({
                id: backup.id,
                startedAt: backup.started_at,
                size: backup.size
              })
              console.log(`   ✅ Deleted backup ${backup.id} (${formatBytes(backup.size || 0)})`)
            }
          }
        }

        // Delete excess backups beyond max count
        const excessBackups = (allBackups || []).slice(config.retention_max_count)
        
        if (excessBackups.length > 0) {
          console.log(`   • Found ${excessBackups.length} backups exceeding max count`)
          
          for (const backup of excessBackups) {
            // Skip if already deleted by retention period
            if (deletedBackups.some(d => d.id === backup.id)) {
              continue
            }

            const { error: deleteError } = await supabase
              .from('private.backup_jobs')
              .delete()
              .eq('id', backup.id)

            if (deleteError) {
              console.warn(`   ⚠️  Failed to delete excess backup ${backup.id}: ${deleteError.message}`)
            } else {
              deletedCount++
              deletedSize += backup.size || 0
              deletedBackups.push({
                id: backup.id,
                startedAt: backup.started_at,
                size: backup.size
              })
              console.log(`   ✅ Deleted excess backup ${backup.id} (${formatBytes(backup.size || 0)})`)
            }
          }
        }

        totalDeleted += deletedCount

        cleanupResults.push({
          configId: config.id,
          configName: config.name,
          deletedCount,
          deletedSize,
          deletedBackups,
          retentionDays: config.retention_days,
          maxCount: config.retention_max_count
        })

        console.log(`   📊 Cleanup summary for ${config.name}:`)
        console.log(`      • Deleted backups: ${deletedCount}`)
        console.log(`      • Space freed: ${formatBytes(deletedSize)}`)

      } catch (configError) {
        console.error(`❌ Failed to process config ${config.name}:`, configError.message)
        cleanupResults.push({
          configId: config.id,
          configName: config.name,
          error: configError.message,
          deletedCount: 0,
          deletedSize: 0
        })
      }
    }

    // Log cleanup activity
    const { error: auditError } = await supabase
      .from('private.audit_logs')
      .insert({
        action: 'BACKUP_CLEANUP',
        resource_type: 'backup',
        new_values: {
          total_deleted: totalDeleted,
          cleanup_date: new Date().toISOString(),
          configs_processed: configs?.length || 0,
          results: cleanupResults.map(r => ({
            configName: r.configName,
            deletedCount: r.deletedCount,
            deletedSize: r.deletedSize,
            error: r.error
          }))
        },
        severity: 'info'
      })

    if (auditError) {
      console.warn(`⚠️  Failed to log cleanup activity: ${auditError.message}`)
    }

    // Summary
    console.log('\n🎉 Backup cleanup completed!')
    console.log('\n📊 Overall Summary:')
    console.log(`   • Configurations processed: ${configs?.length || 0}`)
    console.log(`   • Total backups deleted: ${totalDeleted}`)
    
    const totalSpaceFreed = cleanupResults.reduce((sum, r) => sum + (r.deletedSize || 0), 0)
    console.log(`   • Total space freed: ${formatBytes(totalSpaceFreed)}`)

    // Detailed results
    if (cleanupResults.length > 0) {
      console.log('\n📋 Detailed Results:')
      cleanupResults.forEach(result => {
        if (result.error) {
          console.log(`   ❌ ${result.configName}: Error - ${result.error}`)
        } else {
          console.log(`   ✅ ${result.configName}: ${result.deletedCount} backups, ${formatBytes(result.deletedSize || 0)} freed`)
        }
      })
    }

    // Recommendations
    console.log('\n💡 Recommendations:')
    const failedConfigs = cleanupResults.filter(r => r.error)
    if (failedConfigs.length > 0) {
      console.log(`   • Review ${failedConfigs.length} failed configurations`)
    }
    
    if (totalDeleted === 0) {
      console.log('   • No cleanup needed - all backups within retention policy')
    } else {
      console.log('   • Consider adjusting retention policies if cleanup frequency is too high')
      console.log('   • Monitor storage usage trends')
    }

    console.log('   • Schedule this script to run daily via cron job')

  } catch (error) {
    console.error('❌ Backup cleanup failed:', error.message)
    process.exit(1)
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
 * Dry run mode - show what would be deleted without actually deleting
 */
async function dryRunCleanup() {
  console.log('🔍 Running backup cleanup in DRY RUN mode...')
  
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { data: configs, error: configError } = await supabase
      .from('private.backup_configs')
      .select('*')
      .eq('is_active', true)

    if (configError) {
      throw new Error(`Failed to get backup configs: ${configError.message}`)
    }

    console.log(`📋 Found ${configs?.length || 0} active backup configurations`)

    let totalWouldDelete = 0

    for (const config of configs || []) {
      console.log(`\n🔍 Analyzing config: ${config.name}`)
      
      const retentionCutoff = new Date(Date.now() - config.retention_days * 24 * 60 * 60 * 1000)
      
      const { data: allBackups, error: backupError } = await supabase
        .from('private.backup_jobs')
        .select('id, started_at, status, size')
        .eq('config_id', config.id)
        .eq('status', 'completed')
        .order('started_at', { ascending: false })

      if (backupError) {
        console.warn(`   ⚠️  Failed to get backups: ${backupError.message}`)
        continue
      }

      const oldBackups = (allBackups || []).filter(backup => 
        new Date(backup.started_at) < retentionCutoff
      )
      
      const excessBackups = (allBackups || []).slice(config.retention_max_count)
      const wouldDelete = oldBackups.length + excessBackups.filter(b => 
        !oldBackups.some(o => o.id === b.id)
      ).length

      totalWouldDelete += wouldDelete

      console.log(`   • Total backups: ${allBackups?.length || 0}`)
      console.log(`   • Old backups (>${config.retention_days} days): ${oldBackups.length}`)
      console.log(`   • Excess backups (>${config.retention_max_count} count): ${excessBackups.length}`)
      console.log(`   • Would delete: ${wouldDelete}`)
    }

    console.log(`\n📊 DRY RUN Summary: Would delete ${totalWouldDelete} backups`)
    console.log('💡 Run without --dry-run flag to perform actual cleanup')

  } catch (error) {
    console.error('❌ Dry run failed:', error.message)
    process.exit(1)
  }
}

// Main execution
if (require.main === module) {
  validateEnvironment()
  
  const isDryRun = process.argv.includes('--dry-run')
  
  const cleanupFunction = isDryRun ? dryRunCleanup : cleanupOldBackups
  
  cleanupFunction()
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
  cleanupOldBackups,
  dryRunCleanup,
  formatBytes
}