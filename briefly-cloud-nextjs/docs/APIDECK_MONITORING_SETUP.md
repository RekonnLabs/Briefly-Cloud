# Apideck Integration Monitoring Setup

This guide covers setting up comprehensive monitoring and alerting for the Apideck Vault integration to ensure reliable Google Drive and cloud storage connectivity.

## Overview

Monitoring the Apideck integration involves tracking:
- OAuth flow success rates
- API response times and error rates
- Database connection health
- User connection status
- System performance metrics

## Monitoring Components

### 1. Health Check Endpoints

The system provides several health check endpoints for monitoring:

```bash
# Overall application health
GET /api/health

# Storage integration specific health
GET /api/storage/health

# Connection monitoring dashboard
GET /api/storage/monitoring

# Individual connection status
GET /api/storage/status
```

### 2. Database Monitoring

#### Connection Health Queries

```sql
-- Monitor connection success rate
CREATE OR REPLACE VIEW apideck_connection_health AS
SELECT 
  DATE(created_at) as date,
  provider,
  COUNT(*) as total_connections,
  COUNT(CASE WHEN status = 'connected' THEN 1 END) as successful_connections,
  ROUND(
    COUNT(CASE WHEN status = 'connected' THEN 1 END) * 100.0 / COUNT(*), 
    2
  ) as success_rate_percent
FROM app.apideck_connections 
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at), provider
ORDER BY date DESC, provider;

-- Monitor recent connection attempts
CREATE OR REPLACE VIEW recent_apideck_activity AS
SELECT 
  user_id,
  provider,
  status,
  created_at,
  updated_at,
  EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 as minutes_ago
FROM app.apideck_connections 
WHERE created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Monitor error patterns
CREATE OR REPLACE VIEW apideck_error_summary AS
SELECT 
  DATE(created_at) as date,
  error_type,
  error_message,
  COUNT(*) as error_count,
  COUNT(DISTINCT user_id) as affected_users
FROM app.error_logs 
WHERE component = 'apideck' 
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at), error_type, error_message
ORDER BY date DESC, error_count DESC;
```

#### Performance Monitoring

```sql
-- Monitor API response times
CREATE TABLE IF NOT EXISTS app.apideck_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  response_time_ms INTEGER NOT NULL,
  status_code INTEGER NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for performance queries
CREATE INDEX IF NOT EXISTS idx_apideck_metrics_endpoint_created 
ON app.apideck_metrics(endpoint, created_at);

-- View for response time analysis
CREATE OR REPLACE VIEW apideck_performance_summary AS
SELECT 
  endpoint,
  DATE(created_at) as date,
  COUNT(*) as request_count,
  AVG(response_time_ms) as avg_response_time,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95_response_time,
  COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count,
  ROUND(
    COUNT(CASE WHEN status_code >= 400 THEN 1 END) * 100.0 / COUNT(*), 
    2
  ) as error_rate_percent
FROM app.apideck_metrics 
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY endpoint, DATE(created_at)
ORDER BY date DESC, endpoint;
```

### 3. Application Monitoring

#### Logging Configuration

```javascript
// Enhanced logging for Apideck operations
const logger = {
  info: (message, meta = {}) => {
    console.log(JSON.stringify({
      level: 'info',
      message,
      component: 'apideck',
      timestamp: new Date().toISOString(),
      ...meta
    }));
  },
  
  error: (message, error, meta = {}) => {
    console.error(JSON.stringify({
      level: 'error',
      message,
      component: 'apideck',
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      timestamp: new Date().toISOString(),
      ...meta
    }));
  },
  
  performance: (operation, duration, meta = {}) => {
    console.log(JSON.stringify({
      level: 'performance',
      operation,
      duration_ms: duration,
      component: 'apideck',
      timestamp: new Date().toISOString(),
      ...meta
    }));
  }
};

// Usage in API routes
const startTime = Date.now();
try {
  const result = await apideckOperation();
  logger.performance('apideck_api_call', Date.now() - startTime, {
    endpoint: '/vault/connections',
    success: true
  });
  return result;
} catch (error) {
  logger.error('Apideck API call failed', error, {
    endpoint: '/vault/connections',
    duration_ms: Date.now() - startTime
  });
  throw error;
}
```

#### Metrics Collection

```javascript
// Metrics collection utility
class ApideckMetrics {
  static async recordApiCall(endpoint, method, responseTime, statusCode, userId = null) {
    try {
      await supabase
        .from('apideck_metrics')
        .insert({
          endpoint,
          method,
          response_time_ms: responseTime,
          status_code: statusCode,
          user_id: userId
        });
    } catch (error) {
      console.error('Failed to record metrics:', error);
    }
  }
  
  static async recordConnectionAttempt(userId, provider, success, errorType = null) {
    try {
      await supabase
        .from('connection_attempts')
        .insert({
          user_id: userId,
          provider,
          success,
          error_type: errorType,
          created_at: new Date().toISOString()
        });
    } catch (error) {
      console.error('Failed to record connection attempt:', error);
    }
  }
}

// Usage in API routes
export async function POST(request) {
  const startTime = Date.now();
  const userId = await getUserId(request);
  
  try {
    const result = await processApideckCallback(request);
    
    // Record successful metrics
    await ApideckMetrics.recordApiCall(
      '/api/integrations/apideck/callback',
      'POST',
      Date.now() - startTime,
      200,
      userId
    );
    
    await ApideckMetrics.recordConnectionAttempt(
      userId,
      'google',
      true
    );
    
    return NextResponse.json(result);
  } catch (error) {
    // Record error metrics
    await ApideckMetrics.recordApiCall(
      '/api/integrations/apideck/callback',
      'POST',
      Date.now() - startTime,
      500,
      userId
    );
    
    await ApideckMetrics.recordConnectionAttempt(
      userId,
      'google',
      false,
      error.name
    );
    
    throw error;
  }
}
```

## Alerting Setup

### 1. Database Alerts

#### Health Check Functions

```sql
-- Function to check overall Apideck health
CREATE OR REPLACE FUNCTION check_apideck_system_health()
RETURNS TABLE(
  component TEXT,
  status TEXT,
  message TEXT,
  metric_value NUMERIC,
  threshold NUMERIC
) AS $$
BEGIN
  -- Check connection success rate (last 24 hours)
  RETURN QUERY
  WITH connection_stats AS (
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN status = 'connected' THEN 1 END) as successful
    FROM app.apideck_connections 
    WHERE created_at >= NOW() - INTERVAL '24 hours'
  )
  SELECT 
    'connection_success_rate'::TEXT,
    CASE 
      WHEN total = 0 THEN 'warning'::TEXT
      WHEN (successful * 100.0 / total) < 90 THEN 'critical'::TEXT
      WHEN (successful * 100.0 / total) < 95 THEN 'warning'::TEXT
      ELSE 'healthy'::TEXT
    END,
    CASE 
      WHEN total = 0 THEN 'No connections in last 24 hours'
      ELSE 'Connection success rate: ' || ROUND(successful * 100.0 / total, 1) || '%'
    END,
    CASE WHEN total > 0 THEN ROUND(successful * 100.0 / total, 1) ELSE 0 END,
    90.0
  FROM connection_stats;
  
  -- Check API error rate (last 1 hour)
  RETURN QUERY
  WITH api_stats AS (
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN status_code >= 400 THEN 1 END) as errors
    FROM app.apideck_metrics 
    WHERE created_at >= NOW() - INTERVAL '1 hour'
  )
  SELECT 
    'api_error_rate'::TEXT,
    CASE 
      WHEN total = 0 THEN 'warning'::TEXT
      WHEN (errors * 100.0 / total) > 10 THEN 'critical'::TEXT
      WHEN (errors * 100.0 / total) > 5 THEN 'warning'::TEXT
      ELSE 'healthy'::TEXT
    END,
    CASE 
      WHEN total = 0 THEN 'No API calls in last hour'
      ELSE 'API error rate: ' || ROUND(errors * 100.0 / total, 1) || '%'
    END,
    CASE WHEN total > 0 THEN ROUND(errors * 100.0 / total, 1) ELSE 0 END,
    5.0
  FROM api_stats;
  
  -- Check average response time (last 1 hour)
  RETURN QUERY
  SELECT 
    'api_response_time'::TEXT,
    CASE 
      WHEN AVG(response_time_ms) > 10000 THEN 'critical'::TEXT
      WHEN AVG(response_time_ms) > 5000 THEN 'warning'::TEXT
      ELSE 'healthy'::TEXT
    END,
    'Average response time: ' || ROUND(AVG(response_time_ms)) || 'ms',
    ROUND(AVG(response_time_ms)),
    5000.0
  FROM app.apideck_metrics 
  WHERE created_at >= NOW() - INTERVAL '1 hour'
  HAVING COUNT(*) > 0;
  
END;
$$ LANGUAGE plpgsql;
```

#### Alert Triggers

```sql
-- Create alert log table
CREATE TABLE IF NOT EXISTS app.system_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  message TEXT NOT NULL,
  metric_value NUMERIC,
  threshold NUMERIC,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Function to generate alerts
CREATE OR REPLACE FUNCTION generate_apideck_alerts()
RETURNS INTEGER AS $$
DECLARE
  alert_count INTEGER := 0;
  health_record RECORD;
BEGIN
  -- Check system health and generate alerts
  FOR health_record IN 
    SELECT * FROM check_apideck_system_health() 
    WHERE status IN ('warning', 'critical')
  LOOP
    -- Check if similar alert already exists and is unresolved
    IF NOT EXISTS (
      SELECT 1 FROM app.system_alerts 
      WHERE component = health_record.component 
        AND alert_type = health_record.status
        AND resolved = FALSE
        AND created_at >= NOW() - INTERVAL '1 hour'
    ) THEN
      -- Insert new alert
      INSERT INTO app.system_alerts (
        component, alert_type, severity, message, metric_value, threshold
      ) VALUES (
        health_record.component,
        'health_check',
        health_record.status,
        health_record.message,
        health_record.metric_value,
        health_record.threshold
      );
      
      alert_count := alert_count + 1;
    END IF;
  END LOOP;
  
  RETURN alert_count;
END;
$$ LANGUAGE plpgsql;
```

### 2. Application-Level Alerts

#### Real-time Monitoring Script

```javascript
// monitoring/apideck-monitor.js
const { createClient } = require('@supabase/supabase-js');

class ApideckMonitor {
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    this.alertThresholds = {
      connectionSuccessRate: 90, // %
      apiErrorRate: 5, // %
      avgResponseTime: 5000, // ms
      maxConsecutiveFailures: 3
    };
    this.consecutiveFailures = 0;
  }
  
  async checkHealth() {
    try {
      const health = await this.getSystemHealth();
      await this.evaluateAlerts(health);
      return health;
    } catch (error) {
      console.error('Health check failed:', error);
      await this.sendAlert('critical', 'Health check system failure', error);
      throw error;
    }
  }
  
  async getSystemHealth() {
    const { data: healthData, error } = await this.supabase
      .rpc('check_apideck_system_health');
    
    if (error) throw error;
    
    return healthData.reduce((acc, item) => {
      acc[item.component] = {
        status: item.status,
        message: item.message,
        value: item.metric_value,
        threshold: item.threshold
      };
      return acc;
    }, {});
  }
  
  async evaluateAlerts(health) {
    const criticalIssues = Object.entries(health)
      .filter(([_, data]) => data.status === 'critical');
    
    const warningIssues = Object.entries(health)
      .filter(([_, data]) => data.status === 'warning');
    
    if (criticalIssues.length > 0) {
      this.consecutiveFailures++;
      await this.sendAlert('critical', 'Critical Apideck issues detected', {
        issues: criticalIssues,
        consecutiveFailures: this.consecutiveFailures
      });
    } else if (warningIssues.length > 0) {
      await this.sendAlert('warning', 'Apideck performance warnings', {
        issues: warningIssues
      });
      this.consecutiveFailures = 0;
    } else {
      this.consecutiveFailures = 0;
    }
    
    // Escalate if too many consecutive failures
    if (this.consecutiveFailures >= this.alertThresholds.maxConsecutiveFailures) {
      await this.sendAlert('critical', 'Apideck system degradation - escalation required', {
        consecutiveFailures: this.consecutiveFailures,
        duration: `${this.consecutiveFailures * 5} minutes`
      });
    }
  }
  
  async sendAlert(severity, message, details = {}) {
    const alert = {
      timestamp: new Date().toISOString(),
      severity,
      component: 'apideck',
      message,
      details,
      environment: process.env.NODE_ENV
    };
    
    console.log(`[ALERT:${severity.toUpperCase()}] ${message}`, details);
    
    // Send to external alerting systems
    await Promise.allSettled([
      this.sendSlackAlert(alert),
      this.sendEmailAlert(alert),
      this.logAlert(alert)
    ]);
  }
  
  async sendSlackAlert(alert) {
    if (!process.env.SLACK_WEBHOOK_URL) return;
    
    const color = {
      critical: 'danger',
      warning: 'warning',
      info: 'good'
    }[alert.severity] || 'warning';
    
    const payload = {
      text: `Apideck Alert: ${alert.message}`,
      attachments: [{
        color,
        fields: [
          {
            title: 'Severity',
            value: alert.severity.toUpperCase(),
            short: true
          },
          {
            title: 'Environment',
            value: alert.environment,
            short: true
          },
          {
            title: 'Timestamp',
            value: alert.timestamp,
            short: false
          },
          {
            title: 'Details',
            value: JSON.stringify(alert.details, null, 2),
            short: false
          }
        ]
      }]
    };
    
    try {
      const response = await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`Slack API error: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to send Slack alert:', error);
    }
  }
  
  async sendEmailAlert(alert) {
    // Implement email alerting based on your email service
    // Example with SendGrid, SES, or similar
    console.log('Email alert would be sent:', alert);
  }
  
  async logAlert(alert) {
    try {
      await this.supabase
        .from('system_alerts')
        .insert({
          component: 'apideck',
          alert_type: 'monitoring',
          severity: alert.severity,
          message: alert.message,
          metric_value: alert.details.value,
          threshold: alert.details.threshold
        });
    } catch (error) {
      console.error('Failed to log alert to database:', error);
    }
  }
  
  async startMonitoring(intervalMinutes = 5) {
    console.log(`Starting Apideck monitoring (${intervalMinutes}min intervals)`);
    
    const monitor = async () => {
      try {
        await this.checkHealth();
      } catch (error) {
        console.error('Monitoring cycle failed:', error);
      }
    };
    
    // Initial check
    await monitor();
    
    // Schedule recurring checks
    setInterval(monitor, intervalMinutes * 60 * 1000);
  }
}

// CLI usage
if (require.main === module) {
  const monitor = new ApideckMonitor();
  
  if (process.argv[2] === 'start') {
    const interval = parseInt(process.argv[3]) || 5;
    monitor.startMonitoring(interval);
  } else {
    monitor.checkHealth()
      .then(health => {
        console.log('Health check results:', JSON.stringify(health, null, 2));
        process.exit(0);
      })
      .catch(error => {
        console.error('Health check failed:', error);
        process.exit(1);
      });
  }
}

module.exports = ApideckMonitor;
```

### 3. External Monitoring

#### Uptime Monitoring

```bash
#!/bin/bash
# scripts/monitor-apideck-uptime.sh

# Configuration
DOMAIN="your-domain.com"
SLACK_WEBHOOK_URL="your-slack-webhook-url"
CHECK_INTERVAL=300 # 5 minutes

# Health check endpoints
ENDPOINTS=(
  "https://$DOMAIN/api/health"
  "https://$DOMAIN/api/storage/health"
  "https://$DOMAIN/api/storage/monitoring"
)

send_alert() {
  local message="$1"
  local severity="$2"
  
  if [ -n "$SLACK_WEBHOOK_URL" ]; then
    curl -X POST -H 'Content-type: application/json' \
      --data "{\"text\":\"🚨 Apideck Monitor: $message\", \"color\":\"$severity\"}" \
      "$SLACK_WEBHOOK_URL"
  fi
  
  echo "[$(date)] ALERT: $message"
}

check_endpoint() {
  local url="$1"
  local response_code
  local response_time
  
  response_time=$(curl -o /dev/null -s -w "%{time_total}" -m 30 "$url")
  response_code=$(curl -o /dev/null -s -w "%{http_code}" -m 30 "$url")
  
  if [ "$response_code" -eq 200 ]; then
    echo "[$(date)] ✅ $url - OK (${response_time}s)"
    return 0
  else
    echo "[$(date)] ❌ $url - FAILED (HTTP $response_code)"
    send_alert "$url returned HTTP $response_code" "danger"
    return 1
  fi
}

# Main monitoring loop
echo "Starting Apideck uptime monitoring..."
while true; do
  for endpoint in "${ENDPOINTS[@]}"; do
    check_endpoint "$endpoint"
  done
  
  sleep $CHECK_INTERVAL
done
```

#### Synthetic Transaction Monitoring

```javascript
// scripts/synthetic-oauth-test.js
const puppeteer = require('puppeteer');

class SyntheticOAuthTest {
  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    this.testUser = {
      email: process.env.TEST_USER_EMAIL,
      password: process.env.TEST_USER_PASSWORD
    };
  }
  
  async runOAuthFlowTest() {
    const browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
      const page = await browser.newPage();
      
      // Set up monitoring
      const metrics = {
        startTime: Date.now(),
        steps: [],
        errors: []
      };
      
      // Step 1: Login
      await this.recordStep(metrics, 'login', async () => {
        await page.goto(`${this.baseUrl}/login`);
        await page.type('[name="email"]', this.testUser.email);
        await page.type('[name="password"]', this.testUser.password);
        await page.click('[type="submit"]');
        await page.waitForNavigation();
      });
      
      // Step 2: Navigate to integrations
      await this.recordStep(metrics, 'navigate_integrations', async () => {
        await page.goto(`${this.baseUrl}/dashboard/integrations`);
        await page.waitForSelector('[data-testid="connect-google-drive"]');
      });
      
      // Step 3: Start OAuth flow
      await this.recordStep(metrics, 'start_oauth', async () => {
        await page.click('[data-testid="connect-google-drive"]');
        await page.waitForNavigation();
        
        // Should redirect to Apideck/Google OAuth
        const url = page.url();
        if (!url.includes('accounts.google.com') && !url.includes('apideck.com')) {
          throw new Error(`Unexpected OAuth redirect: ${url}`);
        }
      });
      
      // Note: We don't complete the actual OAuth to avoid affecting real accounts
      // Instead, we verify the flow starts correctly
      
      metrics.totalTime = Date.now() - metrics.startTime;
      metrics.success = metrics.errors.length === 0;
      
      return metrics;
      
    } finally {
      await browser.close();
    }
  }
  
  async recordStep(metrics, stepName, stepFunction) {
    const stepStart = Date.now();
    
    try {
      await stepFunction();
      metrics.steps.push({
        name: stepName,
        duration: Date.now() - stepStart,
        success: true
      });
    } catch (error) {
      metrics.steps.push({
        name: stepName,
        duration: Date.now() - stepStart,
        success: false,
        error: error.message
      });
      metrics.errors.push({
        step: stepName,
        error: error.message
      });
    }
  }
  
  async runAndReport() {
    try {
      const results = await this.runOAuthFlowTest();
      
      if (results.success) {
        console.log('✅ Synthetic OAuth test passed');
        console.log(`Total time: ${results.totalTime}ms`);
      } else {
        console.log('❌ Synthetic OAuth test failed');
        console.log('Errors:', results.errors);
        
        // Send alert for failures
        if (process.env.SLACK_WEBHOOK_URL) {
          await this.sendAlert(results);
        }
      }
      
      return results;
    } catch (error) {
      console.error('Synthetic test execution failed:', error);
      throw error;
    }
  }
  
  async sendAlert(results) {
    const payload = {
      text: '🚨 Synthetic OAuth Test Failed',
      attachments: [{
        color: 'danger',
        fields: [
          {
            title: 'Total Duration',
            value: `${results.totalTime}ms`,
            short: true
          },
          {
            title: 'Failed Steps',
            value: results.errors.length.toString(),
            short: true
          },
          {
            title: 'Errors',
            value: results.errors.map(e => `${e.step}: ${e.error}`).join('\n'),
            short: false
          }
        ]
      }]
    };
    
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }
}

// CLI usage
if (require.main === module) {
  const test = new SyntheticOAuthTest();
  test.runAndReport()
    .then(results => {
      process.exit(results.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}

module.exports = SyntheticOAuthTest;
```

## Dashboard and Visualization

### Monitoring Dashboard Component

```javascript
// components/monitoring/ApideckDashboard.tsx
import { useEffect, useState } from 'react';

interface HealthMetric {
  component: string;
  status: 'healthy' | 'warning' | 'critical';
  message: string;
  value?: number;
  threshold?: number;
}

export function ApideckMonitoringDashboard() {
  const [health, setHealth] = useState<HealthMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>();
  
  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await fetch('/api/storage/monitoring');
        const data = await response.json();
        setHealth(data.metrics || []);
        setLastUpdate(new Date());
      } catch (error) {
        console.error('Failed to fetch health data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000); // Update every 30s
    
    return () => clearInterval(interval);
  }, []);
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-100';
      case 'warning': return 'text-yellow-600 bg-yellow-100';
      case 'critical': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };
  
  if (loading) {
    return <div className="p-4">Loading monitoring data...</div>;
  }
  
  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Apideck Integration Monitoring</h2>
        <div className="text-sm text-gray-500">
          Last updated: {lastUpdate?.toLocaleTimeString()}
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {health.map((metric) => (
          <div key={metric.component} className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold capitalize">
                {metric.component.replace(/_/g, ' ')}
              </h3>
              <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(metric.status)}`}>
                {metric.status}
              </span>
            </div>
            
            <p className="text-sm text-gray-600 mb-2">{metric.message}</p>
            
            {metric.value !== undefined && metric.threshold !== undefined && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>Current: {metric.value}</span>
                  <span>Threshold: {metric.threshold}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${
                      metric.value > metric.threshold ? 'bg-red-500' : 'bg-green-500'
                    }`}
                    style={{ 
                      width: `${Math.min((metric.value / metric.threshold) * 100, 100)}%` 
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      
      {health.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No monitoring data available
        </div>
      )}
    </div>
  );
}
```

## Deployment and Configuration

### Environment Variables for Monitoring

```bash
# Monitoring configuration
MONITORING_ENABLED=true
HEALTH_CHECK_INTERVAL=300000  # 5 minutes in ms
ALERT_THRESHOLD_CONNECTION_SUCCESS_RATE=90
ALERT_THRESHOLD_API_ERROR_RATE=5
ALERT_THRESHOLD_RESPONSE_TIME=5000

# Alerting configuration
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/your/webhook/url
ALERT_EMAIL_RECIPIENTS=admin@your-domain.com,ops@your-domain.com
PAGERDUTY_INTEGRATION_KEY=your-pagerduty-key

# Synthetic testing
SYNTHETIC_TESTING_ENABLED=true
TEST_USER_EMAIL=test@your-domain.com
TEST_USER_PASSWORD=secure-test-password
```

### Deployment Script

```bash
#!/bin/bash
# scripts/deploy-monitoring.sh

echo "Deploying Apideck monitoring setup..."

# 1. Deploy database monitoring views and functions
echo "Setting up database monitoring..."
psql $DATABASE_URL -f database/monitoring-setup.sql

# 2. Install monitoring dependencies
echo "Installing monitoring dependencies..."
npm install puppeteer @supabase/supabase-js

# 3. Set up monitoring cron jobs
echo "Setting up monitoring cron jobs..."
(crontab -l 2>/dev/null; echo "*/5 * * * * /usr/bin/node $(pwd)/monitoring/apideck-monitor.js") | crontab -
(crontab -l 2>/dev/null; echo "*/15 * * * * /bin/bash $(pwd)/scripts/monitor-apideck-uptime.sh") | crontab -
(crontab -l 2>/dev/null; echo "0 */6 * * * /usr/bin/node $(pwd)/scripts/synthetic-oauth-test.js") | crontab -

# 4. Validate monitoring setup
echo "Validating monitoring setup..."
node monitoring/apideck-monitor.js
node scripts/synthetic-oauth-test.js

echo "Monitoring deployment complete!"
```

This comprehensive monitoring setup provides:
- Real-time health checks and alerting
- Performance metrics collection
- Synthetic transaction testing
- Dashboard visualization
- Automated deployment and configuration

The system will proactively identify issues with the Apideck integration and alert the appropriate teams for quick resolution.