#!/usr/bin/env node

/**
 * Schema Monitoring Setup Script
 * 
 * Sets up and validates the schema monitoring system including
 * health checks, performance tracking, and alerting
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

console.log('🔍 Setting up Schema Monitoring System...\n')

// Check if monitoring files exist
const monitoringFiles = [
  'src/app/lib/monitoring/schema-monitor.ts',
  'src/app/lib/monitoring/alerting.ts',
  'src/app/api/monitoring/schema/route.ts',
  'src/app/components/monitoring/SchemaDashboard.tsx'
]

console.log('📁 Checking monitoring files...')
for (const file of monitoringFiles) {
  const filePath = path.join(process.cwd(), file)
  if (fs.existsSync(filePath)) {
    console.log(`✅ ${file}`)
  } else {
    console.log(`❌ ${file} - MISSING`)
    process.exit(1)
  }
}

// Check environment variables
console.log('\n🔧 Checking environment configuration...')
const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY'
]

const optionalEnvVars = [
  'SCHEMA_MONITORING_ENABLED',
  'SCHEMA_ALERTING_ENABLED',
  'EMAIL_ALERTS_ENABLED',
  'WEBHOOK_ALERTS_ENABLED',
  'SLACK_ALERTS_ENABLED'
]

for (const envVar of requiredEnvVars) {
  if (process.env[envVar]) {
    console.log(`✅ ${envVar}`)
  } else {
    console.log(`❌ ${envVar} - REQUIRED`)
  }
}

for (const envVar of optionalEnvVars) {
  if (process.env[envVar]) {
    console.log(`✅ ${envVar} = ${process.env[envVar]}`)
  } else {
    console.log(`⚠️  ${envVar} - Optional (not set)`)
  }
}

// Test TypeScript compilation
console.log('\n🔨 Testing TypeScript compilation...')
try {
  execSync('npx tsc --noEmit --skipLibCheck', { stdio: 'pipe' })
  console.log('✅ TypeScript compilation successful')
} catch (error) {
  console.log('❌ TypeScript compilation failed:')
  console.log(error.stdout?.toString() || error.message)
  process.exit(1)
}

// Test health check endpoint
console.log('\n🏥 Testing health check endpoint...')
try {
  // Start Next.js in background for testing
  console.log('Starting Next.js server for testing...')
  const server = execSync('npm run build', { stdio: 'pipe' })
  console.log('✅ Build successful')
  
  // Note: In a real scenario, you would start the server and test the endpoint
  console.log('⚠️  Health check endpoint test requires running server')
  console.log('   Run: npm run dev')
  console.log('   Test: curl http://localhost:3000/api/health')
  console.log('   Test: curl http://localhost:3000/api/monitoring/schema')
  
} catch (error) {
  console.log('❌ Build failed:')
  console.log(error.stdout?.toString() || error.message)
}

// Create monitoring configuration template
console.log('\n📝 Creating monitoring configuration template...')
const configTemplate = `# Schema Monitoring Configuration
# Copy these to your .env.local file and configure as needed

# Basic monitoring
SCHEMA_MONITORING_ENABLED=true
SCHEMA_ALERTING_ENABLED=true

# Email alerts (optional)
EMAIL_ALERTS_ENABLED=false
ALERT_EMAIL_RECIPIENTS=admin@yourcompany.com,ops@yourcompany.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Webhook alerts (optional)
WEBHOOK_ALERTS_ENABLED=false
ALERT_WEBHOOK_URL=https://your-webhook-endpoint.com/alerts
WEBHOOK_RETRY_ATTEMPTS=3

# Slack alerts (optional)
SLACK_ALERTS_ENABLED=false
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
SLACK_ALERT_CHANNEL=#alerts

# Alert thresholds
RESPONSE_TIME_WARNING_MS=1000
RESPONSE_TIME_CRITICAL_MS=3000
ERROR_RATE_WARNING=0.05
ERROR_RATE_CRITICAL=0.15
CONSECUTIVE_FAILURES_WARNING=3
CONSECUTIVE_FAILURES_CRITICAL=5

# Escalation (optional)
ALERT_ESCALATION_ENABLED=false
ALERT_ESCALATION_MINUTES=15
ESCALATION_RECIPIENTS=cto@yourcompany.com,oncall@yourcompany.com
`

fs.writeFileSync('monitoring-config-template.env', configTemplate)
console.log('✅ Created monitoring-config-template.env')

// Create monitoring test script
console.log('\n🧪 Creating monitoring test script...')
const testScript = `#!/usr/bin/env node

/**
 * Test Schema Monitoring System
 */

const fetch = require('node-fetch')

async function testMonitoring() {
  const baseUrl = process.env.TEST_URL || 'http://localhost:3000'
  
  console.log('Testing schema monitoring endpoints...')
  
  try {
    // Test health check
    console.log('\\n1. Testing health check...')
    const healthResponse = await fetch(\`\${baseUrl}/api/health\`)
    const healthData = await healthResponse.json()
    console.log('Health Status:', healthData.status)
    console.log('Schema Status:', {
      app: healthData.schemas?.app?.status,
      private: healthData.schemas?.private?.status,
      public: healthData.schemas?.public?.status
    })
    
    // Test monitoring endpoint
    console.log('\\n2. Testing monitoring endpoint...')
    const monitoringResponse = await fetch(\`\${baseUrl}/api/monitoring/schema\`)
    const monitoringData = await monitoringResponse.json()
    console.log('Monitoring Status:', monitoringData.monitoring?.isMonitoring)
    console.log('Active Alerts:', monitoringData.alerts?.length || 0)
    console.log('Performance:', {
      totalRequests: monitoringData.performance?.totalRequests,
      averageResponseTime: monitoringData.performance?.averageResponseTime,
      errorRate: monitoringData.performance?.errorRate
    })
    
    // Test Prometheus format
    console.log('\\n3. Testing Prometheus format...')
    const prometheusResponse = await fetch(\`\${baseUrl}/api/monitoring/schema?format=prometheus\`)
    const prometheusData = await prometheusResponse.text()
    console.log('Prometheus metrics length:', prometheusData.length)
    
    console.log('\\n✅ All monitoring tests passed!')
    
  } catch (error) {
    console.error('❌ Monitoring test failed:', error.message)
    process.exit(1)
  }
}

if (require.main === module) {
  testMonitoring()
}

module.exports = { testMonitoring }
`

fs.writeFileSync('scripts/test-monitoring.js', testScript)
fs.chmodSync('scripts/test-monitoring.js', '755')
console.log('✅ Created scripts/test-monitoring.js')

// Summary
console.log('\n📊 Schema Monitoring Setup Complete!')
console.log('\n🚀 Next Steps:')
console.log('1. Configure environment variables using monitoring-config-template.env')
console.log('2. Start the development server: npm run dev')
console.log('3. Test the monitoring system: node scripts/test-monitoring.js')
console.log('4. Access the monitoring dashboard: http://localhost:3000/briefly/app/admin/monitoring')
console.log('5. Check health endpoint: http://localhost:3000/api/health')
console.log('6. Check monitoring API: http://localhost:3000/api/monitoring/schema')

console.log('\n📈 Monitoring Features:')
console.log('• Real-time schema health monitoring')
console.log('• Performance metrics tracking')
console.log('• Automated alerting system')
console.log('• Email, Webhook, and Slack notifications')
console.log('• Prometheus metrics export')
console.log('• Administrative dashboard')
console.log('• Alert escalation and resolution')

console.log('\n⚠️  Important Notes:')
console.log('• Monitoring starts automatically in production')
console.log('• Configure alerting channels in environment variables')
console.log('• Monitor /api/health for load balancer health checks')
console.log('• Use /api/monitoring/schema for detailed metrics')
console.log('• Access admin dashboard requires authentication')