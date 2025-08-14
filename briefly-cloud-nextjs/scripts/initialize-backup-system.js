#!/usr/bin/env node

/**
 * Initialize Backup System Script
 * 
 * This script initializes the automated backup system with PITR,
 * daily backups, monitoring, and alerting.
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

// Configuration
const BACKUP_CONFIG = {
  pitr: {
    enabled: true,
    retentionDays: 30,
    backupWindow: '02:00', // 2 AM UTC
    alertingEnabled: true,
    alertContacts: ['admin@rekonnlabs.com'],
    monitoringInterval: 60 // minutes
  },
  dailyBackup: {
    retentionDays: 30,
    backupWindow: '02:00'
  },
  monitoring: {
    enabled: true,
    checkInterval: 60, // minutes
    alertThresholds: {
      failureRate: 10, // percentage
      backupDelay: 25, // hours
      storageUsage: 85 // percentage
    },
    notifications: {
      email: true,
      slack: false
    },
    contacts: ['admin@rekonnlabs.com']
  }
}

async function initializeBackupSystem() {
  console.log('🔧 Initializing Backup System...')
  
  try {
    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    console.log('✅ Connected to Supabase')

    // Step 1: Create default PITR configuration
    console.log('📋 Creating PITR configuration...')
    
    const { data: pitrConfig, error: pitrError } = await supabase
      .from('private.backup_configs')
      .upsert({
        name: 'pitr_config',
        description: 'Point-in-Time Recovery Configuration',
        backup_type: 'full',
        schedule_cron: convertBackupWindowToCron(BACKUP_CONFIG.pitr.backupWindow),
        retention_days: BACKUP_CONFIG.pitr.retentionDays,
        retention_max_count: 50,
        compression_enabled: true,
        encryption_enabled: true,
        include_storage: false,
        is_active: BACKUP_CONFIG.pitr.enabled,
        metadata: {
          pitr_enabled: BACKUP_CONFIG.pitr.enabled,
          backup_window: BACKUP_CONFIG.pitr.backupWindow,
          alerting_enabled: BACKUP_CONFIG.pitr.alertingEnabled,
          alert_contacts: BACKUP_CONFIG.pitr.alertContacts,
          monitoring_interval: BACKUP_CONFIG.pitr.monitoringInterval
        }
      })
      .select()

    if (pitrError) {
      throw new Error(`PITR config error: ${pitrError.message}`)
    }

    console.log('✅ PITR configuration created')

    // Step 2: Create daily backup configuration
    console.log('📋 Creating daily backup configuration...')
    
    const { data: dailyConfig, error: dailyError } = await supabase
      .from('private.backup_configs')
      .upsert({
        name: 'daily_automated_backup',
        description: 'Automated daily backup for disaster recovery',
        backup_type: 'full',
        schedule_cron: convertBackupWindowToCron(BACKUP_CONFIG.dailyBackup.backupWindow),
        retention_days: BACKUP_CONFIG.dailyBackup.retentionDays,
        retention_max_count: Math.max(BACKUP_CONFIG.dailyBackup.retentionDays, 30),
        compression_enabled: true,
        encryption_enabled: true,
        include_storage: true,
        is_active: true
      })
      .select()

    if (dailyError) {
      throw new Error(`Daily backup config error: ${dailyError.message}`)
    }

    console.log('✅ Daily backup configuration created')

    // Step 3: Create monitoring configuration
    console.log('📋 Creating monitoring configuration...')
    
    const { data: monitorConfig, error: monitorError } = await supabase
      .from('private.backup_configs')
      .upsert({
        name: 'monitoring_config',
        description: 'Backup monitoring configuration',
        backup_type: 'full',
        is_active: BACKUP_CONFIG.monitoring.enabled,
        metadata: {
          monitoring_config: BACKUP_CONFIG.monitoring,
          initialized_at: new Date().toISOString()
        }
      })
      .select()

    if (monitorError) {
      throw new Error(`Monitoring config error: ${monitorError.message}`)
    }

    console.log('✅ Monitoring configuration created')

    // Step 4: Create initial disaster recovery plans
    console.log('📋 Creating disaster recovery plans...')
    
    const drPlans = [
      {
        name: 'Data Corruption Recovery',
        description: 'Recovery procedures for data corruption incidents',
        plan_type: 'data_corruption',
        priority: 1,
        rto_minutes: 60,
        rpo_minutes: 15,
        procedures: {
          steps: [
            'Identify scope of corruption',
            'Stop all write operations',
            'Restore from latest valid backup',
            'Verify data integrity',
            'Resume operations'
          ]
        },
        contacts: {
          primary: 'admin@rekonnlabs.com',
          escalation: 'cto@rekonnlabs.com'
        },
        dependencies: ['backup_system', 'monitoring_system']
      },
      {
        name: 'Hardware Failure Recovery',
        description: 'Recovery procedures for hardware failures',
        plan_type: 'hardware_failure',
        priority: 2,
        rto_minutes: 120,
        rpo_minutes: 60,
        procedures: {
          steps: [
            'Assess hardware failure scope',
            'Activate backup infrastructure',
            'Restore from PITR backup',
            'Update DNS/routing',
            'Verify system functionality'
          ]
        },
        contacts: {
          primary: 'admin@rekonnlabs.com',
          escalation: 'cto@rekonnlabs.com'
        },
        dependencies: ['backup_system', 'infrastructure']
      },
      {
        name: 'Security Breach Recovery',
        description: 'Recovery procedures for security incidents',
        plan_type: 'security_breach',
        priority: 1,
        rto_minutes: 30,
        rpo_minutes: 5,
        procedures: {
          steps: [
            'Isolate affected systems',
            'Assess breach scope',
            'Rotate all credentials',
            'Restore from clean backup',
            'Implement additional security measures'
          ]
        },
        contacts: {
          primary: 'security@rekonnlabs.com',
          escalation: 'cto@rekonnlabs.com'
        },
        dependencies: ['backup_system', 'security_system', 'audit_system']
      }
    ]

    for (const plan of drPlans) {
      const { error: planError } = await supabase
        .rpc('create_disaster_recovery_plan', {
          p_name: plan.name,
          p_description: plan.description,
          p_plan_type: plan.plan_type,
          p_priority: plan.priority,
          p_rto_minutes: plan.rto_minutes,
          p_rpo_minutes: plan.rpo_minutes,
          p_procedures: plan.procedures,
          p_contacts: plan.contacts,
          p_dependencies: plan.dependencies
        })

      if (planError) {
        console.warn(`⚠️  Failed to create DR plan ${plan.name}: ${planError.message}`)
      } else {
        console.log(`✅ Created DR plan: ${plan.name}`)
      }
    }

    // Step 5: Log initialization completion
    const { error: auditError } = await supabase
      .from('private.audit_logs')
      .insert({
        action: 'BACKUP_SYSTEM_INITIALIZED',
        resource_type: 'system',
        new_values: {
          pitr_config: BACKUP_CONFIG.pitr,
          daily_backup_config: BACKUP_CONFIG.dailyBackup,
          monitoring_config: BACKUP_CONFIG.monitoring,
          dr_plans_created: drPlans.length,
          initialized_at: new Date().toISOString()
        },
        severity: 'info'
      })

    if (auditError) {
      console.warn(`⚠️  Failed to log initialization: ${auditError.message}`)
    }

    console.log('\n🎉 Backup System Initialization Complete!')
    console.log('\n📊 Summary:')
    console.log(`   • PITR Configuration: ${BACKUP_CONFIG.pitr.enabled ? 'Enabled' : 'Disabled'}`)
    console.log(`   • Daily Backups: Enabled (${BACKUP_CONFIG.dailyBackup.retentionDays} day retention)`)
    console.log(`   • Monitoring: ${BACKUP_CONFIG.monitoring.enabled ? 'Enabled' : 'Disabled'}`)
    console.log(`   • Disaster Recovery Plans: ${drPlans.length} created`)
    console.log(`   • Backup Window: ${BACKUP_CONFIG.pitr.backupWindow} UTC`)
    console.log(`   • Alert Contacts: ${BACKUP_CONFIG.pitr.alertContacts.join(', ')}`)
    
    console.log('\n📋 Next Steps:')
    console.log('   1. Verify backup configurations in admin dashboard')
    console.log('   2. Test backup and restore procedures')
    console.log('   3. Configure external notification channels (email/Slack)')
    console.log('   4. Schedule regular DR plan testing')
    console.log('   5. Monitor backup system health daily')

  } catch (error) {
    console.error('❌ Backup system initialization failed:', error.message)
    process.exit(1)
  }
}

/**
 * Convert backup window to cron expression
 */
function convertBackupWindowToCron(backupWindow) {
  const [hours, minutes] = backupWindow.split(':').map(Number)
  
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error('Invalid backup window format. Use HH:MM format.')
  }

  return `${minutes} ${hours} * * *`
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

// Main execution
if (require.main === module) {
  validateEnvironment()
  initializeBackupSystem()
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
  initializeBackupSystem,
  convertBackupWindowToCron,
  BACKUP_CONFIG
}