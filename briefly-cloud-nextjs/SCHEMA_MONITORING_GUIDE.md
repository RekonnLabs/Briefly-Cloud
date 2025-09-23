# Schema Monitoring System Guide

## Overview

The Schema Monitoring System provides comprehensive real-time monitoring of database schema health, performance metrics, and automated alerting for the post-migration API architecture. This system ensures that the `app`, `private`, and `public` schemas are operating correctly and alerts administrators to any issues.

## Features

### 🔍 Real-Time Health Monitoring
- Continuous monitoring of all three database schemas (app, private, public)
- Response time tracking and performance metrics
- Error rate monitoring and consecutive failure detection
- Automatic status classification (healthy, degraded, unhealthy)

### 📊 Performance Tracking
- Average response times across all schemas
- Request success/failure rates
- Connection pool monitoring
- Historical metrics storage (last 100 measurements per schema)

### 🚨 Intelligent Alerting
- Multi-channel alert delivery (Email, Webhook, Slack)
- Configurable severity levels (low, medium, high, critical)
- Alert deduplication and cooldown periods
- Automatic escalation for unresolved critical issues
- Alert resolution tracking

### 📈 Monitoring Dashboard
- Real-time schema status visualization
- Performance metrics charts
- Active alerts management
- Administrative controls for monitoring system

## Architecture

### Core Components

```
Schema Monitoring System
├── SchemaMonitor (schema-monitor.ts)
│   ├── Health Check Engine
│   ├── Metrics Collection
│   ├── Alert Generation
│   └── Performance Tracking
├── AlertingService (alerting.ts)
│   ├── Multi-Channel Notifications
│   ├── Alert Escalation
│   ├── Cooldown Management
│   └── Configuration Management
├── Monitoring API (/api/monitoring/schema)
│   ├── Metrics Endpoint
│   ├── Alert Management
│   └── Prometheus Export
└── Admin Dashboard (SchemaDashboard.tsx)
    ├── Real-Time Status
    ├── Alert Management
    └── System Controls
```

### Schema Testing Strategy

#### App Schema
- Tests connectivity to `app.users` table
- Validates response times and error rates
- Monitors table accessibility and query performance

#### Private Schema
- Tests RPC function connectivity (`get_oauth_token`)
- Validates secure access patterns
- Monitors private schema isolation

#### Public Schema
- Tests compatibility view access
- Validates view-to-table mapping
- Monitors backward compatibility

## Configuration

### Environment Variables

#### Basic Monitoring
```env
SCHEMA_MONITORING_ENABLED=true
SCHEMA_ALERTING_ENABLED=true
```

#### Email Alerts
```env
EMAIL_ALERTS_ENABLED=true
ALERT_EMAIL_RECIPIENTS=admin@company.com,ops@company.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

#### Webhook Alerts
```env
WEBHOOK_ALERTS_ENABLED=true
ALERT_WEBHOOK_URL=https://your-webhook-endpoint.com/alerts
WEBHOOK_RETRY_ATTEMPTS=3
ALERT_WEBHOOK_HEADERS={"Authorization":"Bearer your-token"}
```

#### Slack Alerts
```env
SLACK_ALERTS_ENABLED=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
SLACK_ALERT_CHANNEL=#alerts
```

#### Alert Thresholds
```env
RESPONSE_TIME_WARNING_MS=1000
RESPONSE_TIME_CRITICAL_MS=3000
ERROR_RATE_WARNING=0.05
ERROR_RATE_CRITICAL=0.15
CONSECUTIVE_FAILURES_WARNING=3
CONSECUTIVE_FAILURES_CRITICAL=5
```

#### Escalation Settings
```env
ALERT_ESCALATION_ENABLED=true
ALERT_ESCALATION_MINUTES=15
ESCALATION_RECIPIENTS=cto@company.com,oncall@company.com
```

## API Endpoints

### Health Check
```http
GET /api/health
```
Enhanced health check with schema-specific status information.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-27T10:00:00Z",
  "schemas": {
    "app": {
      "status": "healthy",
      "responseTime": 45,
      "tables": 8,
      "lastChecked": "2025-01-27T10:00:00Z"
    },
    "private": {
      "status": "healthy",
      "responseTime": 30,
      "tables": 4,
      "lastChecked": "2025-01-27T10:00:00Z"
    },
    "public": {
      "status": "healthy",
      "responseTime": 25,
      "views": 7,
      "lastChecked": "2025-01-27T10:00:00Z"
    }
  }
}
```

### Monitoring Metrics
```http
GET /api/monitoring/schema
```
Detailed monitoring metrics and alerts.

**Response:**
```json
{
  "monitoring": {
    "isMonitoring": true,
    "metricsCount": 150,
    "alertsCount": 2,
    "uptime": 3600000
  },
  "performance": {
    "timestamp": "2025-01-27T10:00:00Z",
    "totalRequests": 1500,
    "averageResponseTime": 85,
    "errorRate": 0.02,
    "schemaMetrics": {
      "app": { /* schema metrics */ },
      "private": { /* schema metrics */ },
      "public": { /* schema metrics */ }
    },
    "alerts": [ /* active alerts */ ]
  }
}
```

### Prometheus Metrics
```http
GET /api/monitoring/schema?format=prometheus
```
Prometheus-compatible metrics for external monitoring systems.

### Alert Management
```http
POST /api/monitoring/schema?action=resolve
Content-Type: application/json

{
  "alertId": "connectivity-app-1706356800000"
}
```

## Usage

### Starting Monitoring

#### Automatic (Production)
Monitoring starts automatically in production environments when `SCHEMA_MONITORING_ENABLED=true`.

#### Manual Control
```typescript
import { schemaMonitor } from '@/app/lib/monitoring/schema-monitor'

// Start monitoring with 30-second intervals
schemaMonitor.startMonitoring(30000)

// Stop monitoring
schemaMonitor.stopMonitoring()

// Get current status
const status = schemaMonitor.getMonitoringStatus()
```

### Accessing the Dashboard

Navigate to `/briefly/app/admin/monitoring` to access the administrative dashboard.

**Features:**
- Real-time schema status
- Performance metrics visualization
- Active alerts management
- System control panel

### Testing the System

#### Setup Script
```bash
node scripts/setup-monitoring.js
```

#### Test Script
```bash
node scripts/test-monitoring.js
```

#### Manual Testing
```bash
# Test health endpoint
curl http://localhost:3000/api/health

# Test monitoring endpoint
curl http://localhost:3000/api/monitoring/schema

# Test Prometheus format
curl http://localhost:3000/api/monitoring/schema?format=prometheus
```

## Alert Types

### Schema Unavailable
- **Trigger:** Schema connectivity fails
- **Severity:** Critical
- **Action:** Immediate investigation required

### High Response Time
- **Trigger:** Response time exceeds thresholds
- **Severity:** High (>3s) / Medium (>1s)
- **Action:** Performance investigation

### High Error Rate
- **Trigger:** Error rate exceeds thresholds
- **Severity:** High (>15%) / Medium (>5%)
- **Action:** Error analysis and resolution

### Consecutive Failures
- **Trigger:** Multiple consecutive health check failures
- **Severity:** Critical (>5) / High (>3)
- **Action:** System stability investigation

## Integration with External Systems

### Prometheus/Grafana
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'briefly-cloud-schema'
    static_configs:
      - targets: ['your-app.vercel.app']
    metrics_path: '/api/monitoring/schema'
    params:
      format: ['prometheus']
    scrape_interval: 30s
```

### Uptime Monitoring
Configure external uptime monitors to check:
- `/api/health` - Overall system health
- `/api/monitoring/schema` - Detailed monitoring status

### Log Aggregation
Schema monitoring logs include structured data for log aggregation systems:
```json
{
  "level": "warn",
  "message": "Schema Alert [CRITICAL]: app schema is unhealthy",
  "schema": "app",
  "alertType": "schema_unavailable",
  "severity": "critical",
  "timestamp": "2025-01-27T10:00:00Z"
}
```

## Troubleshooting

### Common Issues

#### Monitoring Not Starting
1. Check `SCHEMA_MONITORING_ENABLED` environment variable
2. Verify database connectivity
3. Check application logs for startup errors

#### Alerts Not Sending
1. Verify alerting configuration (`SCHEMA_ALERTING_ENABLED=true`)
2. Check channel-specific settings (SMTP, webhook URLs, etc.)
3. Review alert cooldown periods
4. Check application logs for alerting errors

#### High False Positive Rate
1. Adjust response time thresholds
2. Increase consecutive failure thresholds
3. Review network connectivity issues
4. Consider database performance optimization

#### Dashboard Not Loading
1. Verify authentication and authorization
2. Check API endpoint accessibility
3. Review browser console for JavaScript errors
4. Verify component dependencies

### Debug Commands

#### Check Monitoring Status
```bash
curl -s http://localhost:3000/api/monitoring/schema | jq '.monitoring'
```

#### View Active Alerts
```bash
curl -s http://localhost:3000/api/monitoring/schema | jq '.alerts'
```

#### Test Alert Channels
```bash
# Send test alert
curl -X POST http://localhost:3000/api/monitoring/schema?action=test-alerts
```

## Performance Considerations

### Monitoring Overhead
- Health checks run every 30 seconds by default
- Each check performs lightweight queries (LIMIT 1)
- Metrics stored in memory (last 100 per schema)
- Minimal impact on application performance

### Scaling Considerations
- Monitoring runs in single instance (no clustering needed)
- Metrics can be exported to external systems
- Alert deduplication prevents notification spam
- Configurable intervals for different environments

## Security

### Access Control
- Admin dashboard requires authentication
- Monitoring API endpoints are protected
- Sensitive configuration in environment variables
- No sensitive data in metrics or logs

### Data Privacy
- Only metadata is collected (no user data)
- Response times and error counts only
- Alert messages contain no sensitive information
- Audit trail for alert resolution

## Maintenance

### Regular Tasks
1. Review alert thresholds quarterly
2. Update notification channels as needed
3. Monitor system performance impact
4. Review and resolve recurring alerts

### Upgrades
1. Test monitoring system after application updates
2. Verify schema changes don't break health checks
3. Update alert thresholds for new performance baselines
4. Review and update documentation

## Support

### Logs Location
- Application logs: Check your deployment platform logs
- Monitoring logs: Prefixed with "Schema Monitor" or "Schema Alert"
- Error logs: Include correlation IDs for tracking

### Metrics Export
- Prometheus format available at `/api/monitoring/schema?format=prometheus`
- JSON format for custom integrations
- Historical data available through API

### Contact
For issues with the monitoring system:
1. Check this documentation
2. Review application logs
3. Test individual components
4. Contact system administrators

---

This monitoring system ensures the reliability and performance of your post-migration API architecture by providing comprehensive visibility into schema health and proactive alerting for issues.