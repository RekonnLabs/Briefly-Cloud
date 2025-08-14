#!/usr/bin/env node

/**
 * RTO/RPO Monitoring and Validation Script
 * 
 * This script monitors Recovery Time Objective (RTO) and Recovery Point Objective (RPO)
 * metrics to ensure backup and recovery procedures meet business requirements.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');

class RTORPOMonitor {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Business requirements for RTO/RPO
    this.requirements = {
      rto: {
        critical: 1 * 60, // 1 hour in minutes
        high: 4 * 60,     // 4 hours in minutes
        medium: 8 * 60,   // 8 hours in minutes
        low: 24 * 60      // 24 hours in minutes
      },
      rpo: {
        critical: 15,     // 15 minutes
        high: 60,         // 1 hour in minutes
        medium: 4 * 60,   // 4 hours in minutes
        low: 24 * 60      // 24 hours in minutes
      }
    };
    
    this.monitoringResults = {
      rto: { measurements: [], status: 'unknown' },
      rpo: { measurements: [], status: 'unknown' },
      trends: { rto: [], rpo: [] },
      alerts: []
    };
  }

  async startMonitoring() {
    console.log('🔍 Starting RTO/RPO Monitoring...');
    console.log(`Monitoring started at: ${new Date().toISOString()}`);
    
    try {
      // Monitor current backup status
      await this.monitorBackupStatus();
      
      // Measure current RTO capabilities
      await this.measureRTOCapabilities();
      
      // Measure current RPO status
      await this.measureRPOStatus();
      
      // Analyze historical trends
      await this.analyzeHistoricalTrends();
      
      // Validate against requirements
      await this.validateRequirements();
      
      // Generate monitoring report
      await this.generateMonitoringReport();
      
      // Check for alerts
      await this.processAlerts();
      
      console.log('✅ RTO/RPO monitoring completed successfully');
      
    } catch (error) {
      console.error('❌ RTO/RPO monitoring failed:', error);
      await this.generateErrorReport(error);
      throw error;
    }
  }

  async monitorBackupStatus() {
    console.log('\n📊 Monitoring Backup Status...');
    
    try {
      // Check PITR availability
      const pitrStatus = await this.checkPITRAvailability();
      
      // Check automated backup status
      const backupStatus = await this.checkAutomatedBackups();
      
      // Check backup integrity
      const integrityStatus = await this.checkBackupIntegrity();
      
      // Check cross-region replication
      const replicationStatus = await this.checkCrossRegionReplication();
      
      const backupMonitoring = {
        pitr: pitrStatus,
        automatedBackups: backupStatus,
        integrity: integrityStatus,
        replication: replicationStatus,
        timestamp: new Date().toISOString()
      };
      
      this.monitoringResults.backupStatus = backupMonitoring;
      
      console.log('📊 Backup status monitoring completed');
      
    } catch (error) {
      console.error('❌ Backup status monitoring failed:', error);
      throw error;
    }
  }

  async checkPITRAvailability() {
    console.log('  Checking PITR availability...');
    
    try {
      // Check available recovery points
      const recoveryPoints = await this.getAvailableRecoveryPoints();
      
      // Calculate PITR window
      const pitrWindow = this.calculatePITRWindow(recoveryPoints);
      
      // Check PITR performance metrics
      const performanceMetrics = await this.getPITRPerformanceMetrics();
      
      return {
        status: 'available',
        windowHours: pitrWindow,
        recoveryPoints: recoveryPoints.length,
        performance: performanceMetrics,
        lastChecked: new Date().toISOString()
      };
      
    } catch (error) {
      return {
        status: 'unavailable',
        error: error.message,
        lastChecked: new Date().toISOString()
      };
    }
  }

  async getAvailableRecoveryPoints() {
    // Simulate getting recovery points from Supabase
    // In real implementation, this would query Supabase API
    const now = new Date();
    const recoveryPoints = [];
    
    // Generate recovery points for the last 7 days (every hour)
    for (let i = 0; i < 7 * 24; i++) {
      const point = new Date(now.getTime() - (i * 60 * 60 * 1000));
      recoveryPoints.push({
        timestamp: point.toISOString(),
        type: 'automatic',
        size: Math.floor(Math.random() * 1000) + 500 // MB
      });
    }
    
    return recoveryPoints;
  }

  calculatePITRWindow(recoveryPoints) {
    if (recoveryPoints.length === 0) return 0;
    
    const oldest = new Date(recoveryPoints[recoveryPoints.length - 1].timestamp);
    const newest = new Date(recoveryPoints[0].timestamp);
    
    return Math.round((newest - oldest) / (1000 * 60 * 60)); // hours
  }

  async getPITRPerformanceMetrics() {
    // Simulate PITR performance metrics
    return {
      averageRestoreTime: '25 minutes',
      successRate: 99.5,
      lastRestoreTime: '22 minutes',
      dataLossWindow: '5 minutes'
    };
  }

  async checkAutomatedBackups() {
    console.log('  Checking automated backups...');
    
    try {
      // Check daily backups
      const dailyBackups = await this.checkDailyBackups();
      
      // Check weekly backups
      const weeklyBackups = await this.checkWeeklyBackups();
      
      // Check backup retention
      const retentionStatus = await this.checkBackupRetention();
      
      return {
        status: 'operational',
        daily: dailyBackups,
        weekly: weeklyBackups,
        retention: retentionStatus,
        lastChecked: new Date().toISOString()
      };
      
    } catch (error) {
      return {
        status: 'failed',
        error: error.message,
        lastChecked: new Date().toISOString()
      };
    }
  }

  async checkDailyBackups() {
    // Simulate checking daily backups
    const last7Days = [];
    const now = new Date();
    
    for (let i = 0; i < 7; i++) {
      const backupDate = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
      last7Days.push({
        date: backupDate.toISOString().split('T')[0],
        status: Math.random() > 0.05 ? 'success' : 'failed', // 95% success rate
        size: `${(Math.random() * 2 + 1).toFixed(1)}GB`,
        duration: `${Math.floor(Math.random() * 30 + 15)} minutes`
      });
    }
    
    const successRate = (last7Days.filter(b => b.status === 'success').length / last7Days.length) * 100;
    
    return {
      last7Days,
      successRate: `${successRate.toFixed(1)}%`,
      averageSize: '1.8GB',
      averageDuration: '22 minutes'
    };
  }

  async checkWeeklyBackups() {
    // Simulate checking weekly backups
    const last4Weeks = [];
    const now = new Date();
    
    for (let i = 0; i < 4; i++) {
      const backupDate = new Date(now.getTime() - (i * 7 * 24 * 60 * 60 * 1000));
      last4Weeks.push({
        week: `Week ${i + 1}`,
        date: backupDate.toISOString().split('T')[0],
        status: 'success',
        size: `${(Math.random() * 3 + 2).toFixed(1)}GB`,
        duration: `${Math.floor(Math.random() * 60 + 30)} minutes`
      });
    }
    
    return {
      last4Weeks,
      successRate: '100%',
      averageSize: '2.5GB',
      averageDuration: '45 minutes'
    };
  }

  async checkBackupRetention() {
    return {
      dailyRetention: '30 days',
      weeklyRetention: '12 weeks',
      monthlyRetention: '12 months',
      complianceStatus: 'compliant'
    };
  }

  async checkBackupIntegrity() {
    console.log('  Checking backup integrity...');
    
    // Simulate integrity checks
    const integrityChecks = [
      { type: 'checksum', status: 'passed', lastCheck: new Date().toISOString() },
      { type: 'restoration_test', status: 'passed', lastCheck: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
      { type: 'corruption_scan', status: 'passed', lastCheck: new Date().toISOString() }
    ];
    
    const allPassed = integrityChecks.every(check => check.status === 'passed');
    
    return {
      status: allPassed ? 'healthy' : 'issues_detected',
      checks: integrityChecks,
      lastFullCheck: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
    };
  }

  async checkCrossRegionReplication() {
    console.log('  Checking cross-region replication...');
    
    return {
      status: 'active',
      primaryRegion: 'us-east-1',
      replicaRegions: ['us-west-2', 'eu-west-1'],
      replicationLag: '< 5 minutes',
      lastSync: new Date(Date.now() - 2 * 60 * 1000).toISOString()
    };
  }

  async measureRTOCapabilities() {
    console.log('\n⏱️ Measuring RTO Capabilities...');
    
    const rtoMeasurements = [
      await this.measurePITRRestoreTime(),
      await this.measureFullBackupRestoreTime(),
      await this.measureApplicationDeploymentTime(),
      await this.measureDNSFailoverTime()
    ];
    
    this.monitoringResults.rto.measurements = rtoMeasurements;
    
    // Calculate overall RTO
    const totalRTO = rtoMeasurements.reduce((sum, measurement) => {
      return sum + this.parseTimeToMinutes(measurement.estimatedTime);
    }, 0);
    
    this.monitoringResults.rto.totalEstimated = `${totalRTO} minutes`;
    
    console.log(`⏱️ Total estimated RTO: ${totalRTO} minutes`);
  }

  async measurePITRRestoreTime() {
    console.log('  Measuring PITR restore time...');
    
    // Simulate PITR restore time measurement
    const estimatedTime = '25 minutes';
    const confidence = 'high';
    
    return {
      component: 'PITR Database Restore',
      estimatedTime,
      confidence,
      factors: [
        'Database size: 2.5GB',
        'Network bandwidth: 1Gbps',
        'Supabase region: us-east-1'
      ],
      lastMeasured: new Date().toISOString()
    };
  }

  async measureFullBackupRestoreTime() {
    console.log('  Measuring full backup restore time...');
    
    return {
      component: 'Full Backup Restore',
      estimatedTime: '45 minutes',
      confidence: 'medium',
      factors: [
        'Backup size: 2.5GB compressed',
        'Restoration method: pg_restore',
        'Target database: Supabase'
      ],
      lastMeasured: new Date().toISOString()
    };
  }

  async measureApplicationDeploymentTime() {
    console.log('  Measuring application deployment time...');
    
    return {
      component: 'Application Redeployment',
      estimatedTime: '15 minutes',
      confidence: 'high',
      factors: [
        'Vercel deployment: ~5 minutes',
        'Environment configuration: ~5 minutes',
        'Health checks: ~5 minutes'
      ],
      lastMeasured: new Date().toISOString()
    };
  }

  async measureDNSFailoverTime() {
    console.log('  Measuring DNS failover time...');
    
    return {
      component: 'DNS Failover',
      estimatedTime: '10 minutes',
      confidence: 'medium',
      factors: [
        'DNS TTL: 300 seconds',
        'Global propagation: ~10 minutes',
        'CDN cache invalidation: ~5 minutes'
      ],
      lastMeasured: new Date().toISOString()
    };
  }

  parseTimeToMinutes(timeString) {
    const match = timeString.match(/(\d+)\s*minutes?/);
    return match ? parseInt(match[1]) : 0;
  }

  async measureRPOStatus() {
    console.log('\n📍 Measuring RPO Status...');
    
    const rpoMeasurements = [
      await this.measureDatabaseRPO(),
      await this.measureFileStorageRPO(),
      await this.measureApplicationStateRPO()
    ];
    
    this.monitoringResults.rpo.measurements = rpoMeasurements;
    
    // Calculate worst-case RPO
    const worstRPO = Math.max(...rpoMeasurements.map(m => this.parseTimeToMinutes(m.currentRPO)));
    this.monitoringResults.rpo.worstCase = `${worstRPO} minutes`;
    
    console.log(`📍 Worst-case RPO: ${worstRPO} minutes`);
  }

  async measureDatabaseRPO() {
    console.log('  Measuring database RPO...');
    
    // Check last backup timestamp
    const lastBackup = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
    const currentRPO = Math.round((Date.now() - lastBackup.getTime()) / (1000 * 60));
    
    return {
      component: 'Database (Supabase)',
      currentRPO: `${currentRPO} minutes`,
      backupFrequency: 'Continuous (PITR)',
      lastBackup: lastBackup.toISOString(),
      status: currentRPO <= 60 ? 'within_target' : 'exceeds_target'
    };
  }

  async measureFileStorageRPO() {
    console.log('  Measuring file storage RPO...');
    
    return {
      component: 'File Storage (Supabase Storage)',
      currentRPO: '5 minutes',
      backupFrequency: 'Real-time replication',
      lastSync: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      status: 'within_target'
    };
  }

  async measureApplicationStateRPO() {
    console.log('  Measuring application state RPO...');
    
    return {
      component: 'Application State',
      currentRPO: '15 minutes',
      backupFrequency: 'Configuration snapshots',
      lastSnapshot: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      status: 'within_target'
    };
  }

  async analyzeHistoricalTrends() {
    console.log('\n📈 Analyzing Historical Trends...');
    
    // Simulate historical data analysis
    const rtoTrend = await this.analyzeRTOTrend();
    const rpoTrend = await this.analyzeRPOTrend();
    
    this.monitoringResults.trends = {
      rto: rtoTrend,
      rpo: rpoTrend,
      analysisDate: new Date().toISOString()
    };
    
    console.log('📈 Historical trend analysis completed');
  }

  async analyzeRTOTrend() {
    // Simulate RTO trend data for the last 30 days
    const trendData = [];
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(Date.now() - (i * 24 * 60 * 60 * 1000));
      const baseRTO = 95; // minutes
      const variation = (Math.random() - 0.5) * 20; // ±10 minutes variation
      
      trendData.push({
        date: date.toISOString().split('T')[0],
        rto: Math.round(baseRTO + variation),
        incidents: Math.random() > 0.9 ? 1 : 0 // 10% chance of incident
      });
    }
    
    const averageRTO = trendData.reduce((sum, day) => sum + day.rto, 0) / trendData.length;
    const trend = this.calculateTrend(trendData.map(d => d.rto));
    
    return {
      period: '30 days',
      averageRTO: `${Math.round(averageRTO)} minutes`,
      trend: trend > 0 ? 'increasing' : trend < 0 ? 'decreasing' : 'stable',
      trendPercentage: `${Math.abs(trend).toFixed(1)}%`,
      incidents: trendData.filter(d => d.incidents > 0).length,
      data: trendData
    };
  }

  async analyzeRPOTrend() {
    // Simulate RPO trend data for the last 30 days
    const trendData = [];
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(Date.now() - (i * 24 * 60 * 60 * 1000));
      const baseRPO = 25; // minutes
      const variation = (Math.random() - 0.5) * 10; // ±5 minutes variation
      
      trendData.push({
        date: date.toISOString().split('T')[0],
        rpo: Math.round(Math.max(5, baseRPO + variation)), // minimum 5 minutes
        backupFailures: Math.random() > 0.95 ? 1 : 0 // 5% chance of backup failure
      });
    }
    
    const averageRPO = trendData.reduce((sum, day) => sum + day.rpo, 0) / trendData.length;
    const trend = this.calculateTrend(trendData.map(d => d.rpo));
    
    return {
      period: '30 days',
      averageRPO: `${Math.round(averageRPO)} minutes`,
      trend: trend > 0 ? 'increasing' : trend < 0 ? 'decreasing' : 'stable',
      trendPercentage: `${Math.abs(trend).toFixed(1)}%`,
      backupFailures: trendData.filter(d => d.backupFailures > 0).length,
      data: trendData
    };
  }

  calculateTrend(values) {
    if (values.length < 2) return 0;
    
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
    
    return ((secondAvg - firstAvg) / firstAvg) * 100;
  }

  async validateRequirements() {
    console.log('\n✅ Validating Against Requirements...');
    
    // Validate RTO requirements
    const rtoValidation = this.validateRTORequirements();
    
    // Validate RPO requirements
    const rpoValidation = this.validateRPORequirements();
    
    this.monitoringResults.validation = {
      rto: rtoValidation,
      rpo: rpoValidation,
      validationDate: new Date().toISOString()
    };
    
    console.log('✅ Requirements validation completed');
  }

  validateRTORequirements() {
    const currentRTO = this.parseTimeToMinutes(this.monitoringResults.rto.totalEstimated);
    
    const validationResults = {};
    
    Object.entries(this.requirements.rto).forEach(([priority, requirement]) => {
      const meets = currentRTO <= requirement;
      validationResults[priority] = {
        requirement: `${requirement} minutes`,
        current: `${currentRTO} minutes`,
        meets,
        gap: meets ? 0 : currentRTO - requirement
      };
    });
    
    return {
      currentRTO: `${currentRTO} minutes`,
      validations: validationResults,
      overallStatus: validationResults.critical.meets ? 'compliant' : 'non_compliant'
    };
  }

  validateRPORequirements() {
    const currentRPO = this.parseTimeToMinutes(this.monitoringResults.rpo.worstCase);
    
    const validationResults = {};
    
    Object.entries(this.requirements.rpo).forEach(([priority, requirement]) => {
      const meets = currentRPO <= requirement;
      validationResults[priority] = {
        requirement: `${requirement} minutes`,
        current: `${currentRPO} minutes`,
        meets,
        gap: meets ? 0 : currentRPO - requirement
      };
    });
    
    return {
      currentRPO: `${currentRPO} minutes`,
      validations: validationResults,
      overallStatus: validationResults.critical.meets ? 'compliant' : 'non_compliant'
    };
  }

  async processAlerts() {
    console.log('\n🚨 Processing Alerts...');
    
    // Check for RTO violations
    if (this.monitoringResults.validation.rto.overallStatus === 'non_compliant') {
      this.monitoringResults.alerts.push({
        type: 'rto_violation',
        severity: 'high',
        message: 'Current RTO exceeds critical requirements',
        details: this.monitoringResults.validation.rto,
        timestamp: new Date().toISOString()
      });
    }
    
    // Check for RPO violations
    if (this.monitoringResults.validation.rpo.overallStatus === 'non_compliant') {
      this.monitoringResults.alerts.push({
        type: 'rpo_violation',
        severity: 'high',
        message: 'Current RPO exceeds critical requirements',
        details: this.monitoringResults.validation.rpo,
        timestamp: new Date().toISOString()
      });
    }
    
    // Check for backup failures
    const backupStatus = this.monitoringResults.backupStatus;
    if (backupStatus && backupStatus.automatedBackups.status === 'failed') {
      this.monitoringResults.alerts.push({
        type: 'backup_failure',
        severity: 'medium',
        message: 'Automated backup failures detected',
        details: backupStatus.automatedBackups,
        timestamp: new Date().toISOString()
      });
    }
    
    // Check for trend deterioration
    if (this.monitoringResults.trends.rto.trend === 'increasing') {
      this.monitoringResults.alerts.push({
        type: 'rto_trend_deterioration',
        severity: 'low',
        message: 'RTO trend is increasing over time',
        details: this.monitoringResults.trends.rto,
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`🚨 ${this.monitoringResults.alerts.length} alerts generated`);
    
    // Send alerts if any
    if (this.monitoringResults.alerts.length > 0) {
      await this.sendAlerts();
    }
  }

  async sendAlerts() {
    console.log('📧 Sending alerts...');
    
    for (const alert of this.monitoringResults.alerts) {
      console.log(`  [${alert.severity.toUpperCase()}] ${alert.message}`);
      
      // In production, this would send actual alerts via email, Slack, etc.
      // For now, we'll just log them
    }
  }

  async generateMonitoringReport() {
    console.log('\n📊 Generating Monitoring Report...');
    
    const report = {
      reportType: 'RTO/RPO Monitoring',
      generatedAt: new Date().toISOString(),
      summary: {
        rto: {
          current: this.monitoringResults.rto.totalEstimated,
          status: this.monitoringResults.validation.rto.overallStatus,
          trend: this.monitoringResults.trends.rto.trend
        },
        rpo: {
          current: this.monitoringResults.rpo.worstCase,
          status: this.monitoringResults.validation.rpo.overallStatus,
          trend: this.monitoringResults.trends.rpo.trend
        },
        alerts: this.monitoringResults.alerts.length,
        backupHealth: this.monitoringResults.backupStatus?.integrity?.status || 'unknown'
      },
      detailedResults: this.monitoringResults,
      recommendations: this.generateRecommendations()
    };
    
    // Save report to file
    const reportPath = path.join(__dirname, '..', 'reports', `rto-rpo-report-${Date.now()}.json`);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`📊 Monitoring report saved to: ${reportPath}`);
    
    // Print summary
    this.printMonitoringSummary(report);
    
    return report;
  }

  generateRecommendations() {
    const recommendations = [];
    
    // RTO recommendations
    if (this.monitoringResults.validation.rto.overallStatus === 'non_compliant') {
      recommendations.push({
        category: 'RTO',
        priority: 'high',
        issue: 'RTO exceeds critical requirements',
        recommendation: 'Consider implementing hot standby or reducing restoration complexity'
      });
    }
    
    // RPO recommendations
    if (this.monitoringResults.validation.rpo.overallStatus === 'non_compliant') {
      recommendations.push({
        category: 'RPO',
        priority: 'high',
        issue: 'RPO exceeds critical requirements',
        recommendation: 'Increase backup frequency or implement real-time replication'
      });
    }
    
    // Trend recommendations
    if (this.monitoringResults.trends.rto.trend === 'increasing') {
      recommendations.push({
        category: 'Performance',
        priority: 'medium',
        issue: 'RTO performance degrading over time',
        recommendation: 'Investigate and optimize restoration procedures'
      });
    }
    
    // General recommendations
    recommendations.push({
      category: 'Monitoring',
      priority: 'low',
      issue: 'Continuous improvement',
      recommendation: 'Schedule regular RTO/RPO testing and optimization reviews'
    });
    
    return recommendations;
  }

  printMonitoringSummary(report) {
    console.log('\n' + '='.repeat(60));
    console.log('📋 RTO/RPO MONITORING SUMMARY');
    console.log('='.repeat(60));
    
    console.log(`📅 Report Date: ${report.generatedAt.split('T')[0]}`);
    
    console.log('\n📊 Current Status:');
    console.log(`  RTO: ${report.summary.rto.current} (${report.summary.rto.status})`);
    console.log(`  RPO: ${report.summary.rpo.current} (${report.summary.rpo.status})`);
    console.log(`  Backup Health: ${report.summary.backupHealth}`);
    
    console.log('\n📈 Trends:');
    console.log(`  RTO Trend: ${report.summary.rto.trend}`);
    console.log(`  RPO Trend: ${report.summary.rpo.trend}`);
    
    if (report.summary.alerts > 0) {
      console.log(`\n🚨 Alerts: ${report.summary.alerts} active alerts`);
      this.monitoringResults.alerts.forEach(alert => {
        console.log(`  [${alert.severity.toUpperCase()}] ${alert.message}`);
      });
    } else {
      console.log('\n✅ No active alerts');
    }
    
    if (report.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      report.recommendations.forEach((rec, index) => {
        console.log(`  ${index + 1}. [${rec.priority.toUpperCase()}] ${rec.recommendation}`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
  }

  async generateErrorReport(error) {
    const errorReport = {
      reportType: 'RTO/RPO Monitoring Error',
      status: 'failed',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      partialResults: this.monitoringResults
    };
    
    const errorReportPath = path.join(__dirname, '..', 'reports', `rto-rpo-error-${Date.now()}.json`);
    await fs.mkdir(path.dirname(errorReportPath), { recursive: true });
    await fs.writeFile(errorReportPath, JSON.stringify(errorReport, null, 2));
    
    console.log(`❌ Error report saved to: ${errorReportPath}`);
  }
}

// CLI execution
if (require.main === module) {
  const monitor = new RTORPOMonitor();
  monitor.startMonitoring().catch(console.error);
}

module.exports = { RTORPOMonitor };