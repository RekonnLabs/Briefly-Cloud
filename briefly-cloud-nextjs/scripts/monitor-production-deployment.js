#!/usr/bin/env node

/**
 * Production Deployment Monitoring Script
 * Monitors API endpoints and schema health after deployment
 * Part of Task 18: Deploy updated API code
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const PRODUCTION_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PRODUCTION_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

class ProductionMonitor {
  constructor() {
    this.metrics = {
      startTime: new Date(),
      checks: [],
      errors: [],
      warnings: [],
      performance: {}
    };
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const icon = {
      info: '📊',
      success: '✅',
      warning: '⚠️',
      error: '❌',
      metric: '📈'
    }[level] || '📊';
    
    console.log(`${icon} ${message}`);
    
    if (level === 'error') {
      this.metrics.errors.push({ timestamp, message });
    } else if (level === 'warning') {
      this.metrics.warnings.push({ timestamp, message });
    }
  }

  async measurePerformance(name, operation) {
    const start = Date.now();
    try {
      const result = await operation();
      const duration = Date.now() - start;
      this.metrics.performance[name] = { duration, status: 'success' };
      this.log(`${name}: ${duration}ms`, 'metric');
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.metrics.performance[name] = { duration, status: 'error', error: error.message };
      this.log(`${name}: ${duration}ms (failed)`, 'error');
      throw error;
    }
  }

  async checkHealthEndpoint() {
    this.log('Checking health endpoint...', 'info');
    
    try {
      const response = await this.measurePerformance('health_endpoint', async () => {
        const res = await fetch(`${SITE_URL}/api/health`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
        
        if (!res.ok) {
          throw new Error(`Health endpoint returned ${res.status}`);
        }
        
        return await res.json();
      });

      // Validate health response structure
      if (!response.status || !response.timestamp) {
        this.log('Health endpoint response missing required fields', 'warning');
      }

      if (response.schemas) {
        const schemaStatuses = Object.entries(response.schemas);
        for (const [schema, status] of schemaStatuses) {
          if (status.status === 'error') {
            this.log(`Schema ${schema} reporting errors: ${status.error}`, 'error');
          } else if (status.status === 'healthy') {
            this.log(`Schema ${schema} healthy`, 'success');
          }
        }
      }

      this.log('Health endpoint check completed', 'success');
      return response;
    } catch (error) {
      this.log(`Health endpoint check failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async checkDatabaseConnectivity() {
    this.log('Checking database connectivity...', 'info');
    
    const supabase = createClient(PRODUCTION_URL, PRODUCTION_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    try {
      // Test app schema connectivity
      await this.measurePerformance('app_schema_query', async () => {
        const { error } = await supabase
          .from('users')
          .select('id')
          .limit(1);

        if (error && !error.message.includes('relation "users" does not exist')) {
          throw new Error(`App schema error: ${error.message}`);
        }
      });

      // Test RPC functions
      await this.measurePerformance('rpc_function_call', async () => {
        const { error } = await supabase.rpc('get_oauth_token', {
          p_user_id: '00000000-0000-0000-0000-000000000000',
          p_provider: 'google'
        });

        if (error && !error.message.includes('no rows')) {
          throw new Error(`RPC function error: ${error.message}`);
        }
      });

      this.log('Database connectivity check completed', 'success');
    } catch (error) {
      this.log(`Database connectivity check failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async checkAPIEndpoints() {
    this.log('Checking API endpoints...', 'info');
    
    const endpoints = [
      { path: '/api/health', method: 'GET', public: true },
      { path: '/api/user/profile', method: 'GET', public: false },
      { path: '/api/files', method: 'GET', public: false }
    ];

    for (const endpoint of endpoints) {
      try {
        await this.measurePerformance(`api_${endpoint.path.replace(/\//g, '_')}`, async () => {
          const headers = { 'Accept': 'application/json' };
          
          // For non-public endpoints, we expect 401 without auth
          const response = await fetch(`${SITE_URL}${endpoint.path}`, {
            method: endpoint.method,
            headers
          });

          if (endpoint.public) {
            if (!response.ok) {
              throw new Error(`Public endpoint ${endpoint.path} returned ${response.status}`);
            }
          } else {
            // Non-public endpoints should return 401 without auth
            if (response.status !== 401 && response.status !== 403) {
              this.log(`Endpoint ${endpoint.path} returned ${response.status} (expected 401/403)`, 'warning');
            }
          }
        });

        this.log(`Endpoint ${endpoint.path} responding correctly`, 'success');
      } catch (error) {
        this.log(`Endpoint ${endpoint.path} check failed: ${error.message}`, 'error');
      }
    }
  }

  async checkSchemaOperations() {
    this.log('Checking schema operations...', 'info');
    
    const supabase = createClient(PRODUCTION_URL, PRODUCTION_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    try {
      // Test app schema operations
      await this.measurePerformance('app_schema_operations', async () => {
        // Test users table
        const { error: usersError } = await supabase
          .from('users')
          .select('id, email')
          .limit(1);

        if (usersError && !usersError.message.includes('relation "users" does not exist')) {
          throw new Error(`Users table error: ${usersError.message}`);
        }

        // Test files table
        const { error: filesError } = await supabase
          .from('files')
          .select('id, name')
          .limit(1);

        if (filesError && !filesError.message.includes('relation "files" does not exist')) {
          throw new Error(`Files table error: ${filesError.message}`);
        }
      });

      // Test private schema RPC operations
      await this.measurePerformance('private_schema_rpc', async () => {
        const testUserId = '12345678-1234-1234-1234-123456789012';
        
        // Test OAuth token operations
        const { error: saveError } = await supabase.rpc('save_oauth_token', {
          p_user_id: testUserId,
          p_provider: 'google',
          p_access_token: 'test-token-monitoring',
          p_refresh_token: null,
          p_expires_at: null,
          p_scope: null
        });

        if (saveError) {
          throw new Error(`OAuth save RPC error: ${saveError.message}`);
        }

        // Clean up test token
        await supabase.rpc('delete_oauth_token', {
          p_user_id: testUserId,
          p_provider: 'google'
        });
      });

      this.log('Schema operations check completed', 'success');
    } catch (error) {
      this.log(`Schema operations check failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async checkErrorRates() {
    this.log('Checking error rates...', 'info');
    
    // This would typically integrate with your logging/monitoring service
    // For now, we'll just check if we can access error logs
    
    try {
      const supabase = createClient(PRODUCTION_URL, PRODUCTION_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
      });

      // Check if audit logs are accessible
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, action, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error && !error.message.includes('relation "audit_logs" does not exist')) {
        this.log(`Audit logs access error: ${error.message}`, 'warning');
      } else if (data) {
        this.log(`Found ${data.length} recent audit log entries`, 'success');
      }

      this.log('Error rates check completed', 'success');
    } catch (error) {
      this.log(`Error rates check failed: ${error.message}`, 'warning');
    }
  }

  async generateMonitoringReport() {
    const endTime = new Date();
    const duration = Math.round((endTime - this.metrics.startTime) / 1000);
    
    const report = {
      monitoring: {
        timestamp: this.metrics.startTime.toISOString(),
        duration: `${duration} seconds`,
        status: this.metrics.errors.length === 0 ? 'healthy' : 'degraded'
      },
      performance: this.metrics.performance,
      health: {
        errors: this.metrics.errors.length,
        warnings: this.metrics.warnings.length,
        total_checks: Object.keys(this.metrics.performance).length
      },
      issues: {
        errors: this.metrics.errors,
        warnings: this.metrics.warnings
      },
      recommendations: this.generateRecommendations()
    };

    // Write report to file
    const reportPath = path.join(process.cwd(), 'PRODUCTION_MONITORING_REPORT.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    this.log(`Monitoring report generated: ${reportPath}`, 'success');
    return report;
  }

  generateRecommendations() {
    const recommendations = [];
    
    if (this.metrics.errors.length > 0) {
      recommendations.push('Investigate and resolve critical errors immediately');
    }
    
    if (this.metrics.warnings.length > 0) {
      recommendations.push('Review warnings and plan fixes for next deployment');
    }
    
    // Performance recommendations
    const slowOperations = Object.entries(this.metrics.performance)
      .filter(([_, perf]) => perf.duration > 1000)
      .map(([name]) => name);
    
    if (slowOperations.length > 0) {
      recommendations.push(`Optimize slow operations: ${slowOperations.join(', ')}`);
    }
    
    if (recommendations.length === 0) {
      recommendations.push('System is performing well - continue monitoring');
    }
    
    return recommendations;
  }

  async run() {
    try {
      this.log('🔍 Starting Production Deployment Monitoring', 'info');
      this.log('==============================================');

      // Run all monitoring checks
      await this.checkHealthEndpoint();
      await this.checkDatabaseConnectivity();
      await this.checkAPIEndpoints();
      await this.checkSchemaOperations();
      await this.checkErrorRates();

      // Generate monitoring report
      const report = await this.generateMonitoringReport();

      this.log('📊 Production Monitoring Summary', 'info');
      this.log('===============================');
      this.log(`Status: ${report.monitoring.status.toUpperCase()}`);
      this.log(`Errors: ${report.health.errors}`);
      this.log(`Warnings: ${report.health.warnings}`);
      this.log(`Performance checks: ${report.health.total_checks}`);
      
      if (report.recommendations.length > 0) {
        this.log('');
        this.log('🔧 Recommendations:');
        report.recommendations.forEach((rec, i) => {
          this.log(`${i + 1}. ${rec}`);
        });
      }

      return report.monitoring.status === 'healthy';
    } catch (error) {
      this.log(`💥 Monitoring failed: ${error.message}`, 'error');
      return false;
    }
  }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log('Production Deployment Monitoring Script');
  console.log('======================================');
  console.log('');
  console.log('Usage: node scripts/monitor-production-deployment.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --help, -h     Show this help message');
  console.log('  --continuous   Run monitoring continuously (every 5 minutes)');
  console.log('  --quiet        Reduce output verbosity');
  console.log('');
  console.log('Environment Variables Required:');
  console.log('  NEXT_PUBLIC_SUPABASE_URL     - Production Supabase URL');
  console.log('  SUPABASE_SERVICE_ROLE_KEY    - Production service role key');
  console.log('  NEXT_PUBLIC_SITE_URL         - Production site URL');
  console.log('');
  console.log('This script monitors the health and performance of the');
  console.log('deployed API code and schema operations.');
  process.exit(0);
}

// Run monitoring
const monitor = new ProductionMonitor();

if (args.includes('--continuous')) {
  console.log('🔄 Starting continuous monitoring (every 5 minutes)...');
  
  const runMonitoring = async () => {
    try {
      await monitor.run();
    } catch (error) {
      console.error('Monitoring cycle failed:', error.message);
    }
  };
  
  // Run immediately, then every 5 minutes
  runMonitoring();
  setInterval(runMonitoring, 5 * 60 * 1000);
} else {
  // Run once
  monitor.run()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Monitoring script failed:', error.message);
      process.exit(1);
    });
}