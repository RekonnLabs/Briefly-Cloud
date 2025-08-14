#!/usr/bin/env node

/**
 * Security Configuration Drift Detection
 * Monitors security configuration changes and detects drift
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

class SecurityConfigMonitor {
  constructor() {
    this.configPaths = [
      'middleware.ts',
      'next.config.js',
      '.github/workflows/security-gates.yml',
      '.github/workflows/security-testing.yml',
      '.github/branch-protection-config.json',
      '.github/CODEOWNERS',
      '.eslintrc.security.js',
      '.semgrep.yml',
      'jest.security.config.js',
      'database/',
      'src/app/lib/auth/',
      'src/app/lib/security/',
      'src/app/api/admin/'
    ];
    
    this.snapshotPath = path.join(process.cwd(), 'security-config-snapshots.json');
    this.alertThreshold = 5; // Alert if more than 5 files changed
  }

  /**
   * Generate hash for file or directory
   */
  generateHash(filePath) {
    const fullPath = path.join(process.cwd(), filePath);
    
    if (!fs.existsSync(fullPath)) {
      return null;
    }

    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      return this.generateDirectoryHash(fullPath);
    } else {
      const content = fs.readFileSync(fullPath, 'utf8');
      return crypto.createHash('sha256').update(content).digest('hex');
    }
  }

  /**
   * Generate hash for directory contents
   */
  generateDirectoryHash(dirPath) {
    const files = this.getAllFiles(dirPath);
    const hashes = files.map(file => {
      const content = fs.readFileSync(file, 'utf8');
      const relativePath = path.relative(process.cwd(), file);
      return `${relativePath}:${crypto.createHash('sha256').update(content).digest('hex')}`;
    });
    
    return crypto.createHash('sha256').update(hashes.sort().join('\n')).digest('hex');
  }

  /**
   * Get all files in directory recursively
   */
  getAllFiles(dirPath) {
    const files = [];
    
    const items = fs.readdirSync(dirPath);
    
    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        // Skip node_modules and .git directories
        if (!['node_modules', '.git', '.next'].includes(item)) {
          files.push(...this.getAllFiles(fullPath));
        }
      } else {
        // Only include relevant file types
        if (this.isRelevantFile(fullPath)) {
          files.push(fullPath);
        }
      }
    }
    
    return files;
  }

  /**
   * Check if file is relevant for security monitoring
   */
  isRelevantFile(filePath) {
    const ext = path.extname(filePath);
    const relevantExtensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.yml', '.yaml', '.sql', '.md'];
    
    return relevantExtensions.includes(ext);
  }

  /**
   * Create security configuration snapshot
   */
  createSnapshot() {
    console.log('📸 Creating security configuration snapshot...');
    
    const snapshot = {
      timestamp: new Date().toISOString(),
      git_commit: this.getCurrentGitCommit(),
      configurations: {}
    };

    for (const configPath of this.configPaths) {
      const hash = this.generateHash(configPath);
      if (hash) {
        snapshot.configurations[configPath] = {
          hash,
          last_modified: this.getLastModified(configPath)
        };
      }
    }

    // Save snapshot
    let snapshots = [];
    if (fs.existsSync(this.snapshotPath)) {
      snapshots = JSON.parse(fs.readFileSync(this.snapshotPath, 'utf8'));
    }
    
    snapshots.push(snapshot);
    
    // Keep only last 50 snapshots
    if (snapshots.length > 50) {
      snapshots = snapshots.slice(-50);
    }
    
    fs.writeFileSync(this.snapshotPath, JSON.stringify(snapshots, null, 2));
    
    console.log(`✅ Snapshot created with ${Object.keys(snapshot.configurations).length} configurations`);
    return snapshot;
  }

  /**
   * Detect configuration drift
   */
  detectDrift() {
    console.log('🔍 Detecting security configuration drift...');
    
    if (!fs.existsSync(this.snapshotPath)) {
      console.log('⚠️  No previous snapshots found. Creating initial snapshot...');
      return this.createSnapshot();
    }

    const snapshots = JSON.parse(fs.readFileSync(this.snapshotPath, 'utf8'));
    const lastSnapshot = snapshots[snapshots.length - 1];
    
    if (!lastSnapshot) {
      console.log('⚠️  No valid snapshots found. Creating initial snapshot...');
      return this.createSnapshot();
    }

    const currentSnapshot = this.createSnapshot();
    const driftReport = this.comparSnapshots(lastSnapshot, currentSnapshot);
    
    if (driftReport.changes.length > 0) {
      console.log(`🚨 Configuration drift detected: ${driftReport.changes.length} changes`);
      this.handleDrift(driftReport);
    } else {
      console.log('✅ No configuration drift detected');
    }

    return driftReport;
  }

  /**
   * Compare two snapshots
   */
  comparSnapshots(oldSnapshot, newSnapshot) {
    const changes = [];
    const allPaths = new Set([
      ...Object.keys(oldSnapshot.configurations),
      ...Object.keys(newSnapshot.configurations)
    ]);

    for (const configPath of allPaths) {
      const oldConfig = oldSnapshot.configurations[configPath];
      const newConfig = newSnapshot.configurations[configPath];

      if (!oldConfig && newConfig) {
        changes.push({
          type: 'added',
          path: configPath,
          hash: newConfig.hash
        });
      } else if (oldConfig && !newConfig) {
        changes.push({
          type: 'deleted',
          path: configPath,
          hash: oldConfig.hash
        });
      } else if (oldConfig && newConfig && oldConfig.hash !== newConfig.hash) {
        changes.push({
          type: 'modified',
          path: configPath,
          old_hash: oldConfig.hash,
          new_hash: newConfig.hash,
          old_modified: oldConfig.last_modified,
          new_modified: newConfig.last_modified
        });
      }
    }

    return {
      timestamp: new Date().toISOString(),
      old_snapshot: oldSnapshot.timestamp,
      new_snapshot: newSnapshot.timestamp,
      changes,
      severity: this.calculateSeverity(changes)
    };
  }

  /**
   * Calculate drift severity
   */
  calculateSeverity(changes) {
    if (changes.length === 0) return 'none';
    
    const criticalPaths = [
      'middleware.ts',
      'next.config.js',
      '.github/workflows/',
      'src/app/lib/auth/',
      'src/app/lib/security/',
      'database/'
    ];

    const criticalChanges = changes.filter(change => 
      criticalPaths.some(path => change.path.includes(path))
    );

    if (criticalChanges.length > 0) return 'critical';
    if (changes.length > this.alertThreshold) return 'high';
    if (changes.length > 2) return 'medium';
    return 'low';
  }

  /**
   * Handle detected drift
   */
  handleDrift(driftReport) {
    console.log('\n📋 Drift Report:');
    console.log(`Severity: ${driftReport.severity.toUpperCase()}`);
    console.log(`Changes: ${driftReport.changes.length}`);
    
    for (const change of driftReport.changes) {
      console.log(`  ${change.type.toUpperCase()}: ${change.path}`);
    }

    // Save drift report
    const reportPath = path.join(process.cwd(), `security-drift-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(driftReport, null, 2));
    console.log(`\n📊 Drift report saved to: ${reportPath}`);

    // Send alerts based on severity
    if (driftReport.severity === 'critical') {
      this.sendCriticalAlert(driftReport);
    } else if (driftReport.severity === 'high') {
      this.sendHighAlert(driftReport);
    }

    // Log to security monitoring system
    this.logSecurityEvent(driftReport);
  }

  /**
   * Send critical security alert
   */
  sendCriticalAlert(driftReport) {
    console.log('\n🚨 CRITICAL SECURITY CONFIGURATION DRIFT DETECTED');
    console.log('Immediate attention required!');
    
    // In production, this would:
    // - Send PagerDuty/OpsGenie alert
    // - Send Slack/Teams notification
    // - Email security team
    // - Create incident ticket
  }

  /**
   * Send high priority alert
   */
  sendHighAlert(driftReport) {
    console.log('\n⚠️  HIGH PRIORITY SECURITY CONFIGURATION DRIFT');
    console.log('Review required within 24 hours');
    
    // In production, this would:
    // - Send Slack/Teams notification
    // - Email security team
    // - Create review ticket
  }

  /**
   * Log security event
   */
  async logSecurityEvent(driftReport) {
    try {
      // This would integrate with the security monitoring system
      const event = {
        type: 'security_config_change',
        severity: driftReport.severity,
        source: 'config_monitor',
        metadata: {
          changes_count: driftReport.changes.length,
          changes: driftReport.changes,
          git_commit: this.getCurrentGitCommit()
        }
      };

      console.log('📝 Security event logged:', event.type);
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  /**
   * Get current git commit
   */
  getCurrentGitCommit() {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Get last modified time
   */
  getLastModified(filePath) {
    try {
      const fullPath = path.join(process.cwd(), filePath);
      const stat = fs.statSync(fullPath);
      return stat.mtime.toISOString();
    } catch (error) {
      return null;
    }
  }

  /**
   * Validate current security configuration
   */
  validateConfiguration() {
    console.log('🔍 Validating security configuration...');
    
    const issues = [];
    
    // Check critical files exist
    const criticalFiles = [
      'middleware.ts',
      'next.config.js',
      '.github/workflows/security-gates.yml',
      '.eslintrc.security.js'
    ];

    for (const file of criticalFiles) {
      if (!fs.existsSync(path.join(process.cwd(), file))) {
        issues.push({
          type: 'missing_file',
          severity: 'critical',
          message: `Critical security file missing: ${file}`
        });
      }
    }

    // Check security middleware configuration
    const middlewarePath = path.join(process.cwd(), 'middleware.ts');
    if (fs.existsSync(middlewarePath)) {
      const content = fs.readFileSync(middlewarePath, 'utf8');
      if (!content.includes('securityHeaders')) {
        issues.push({
          type: 'missing_security_headers',
          severity: 'high',
          message: 'Security headers not found in middleware'
        });
      }
    }

    // Check Next.js security configuration
    const nextConfigPath = path.join(process.cwd(), 'next.config.js');
    if (fs.existsSync(nextConfigPath)) {
      const content = fs.readFileSync(nextConfigPath, 'utf8');
      if (!content.includes('headers') && !content.includes('security')) {
        issues.push({
          type: 'missing_security_config',
          severity: 'medium',
          message: 'Security configuration not found in next.config.js'
        });
      }
    }

    if (issues.length > 0) {
      console.log(`❌ Configuration validation failed: ${issues.length} issues found`);
      issues.forEach(issue => {
        console.log(`  ${issue.severity.toUpperCase()}: ${issue.message}`);
      });
      return false;
    } else {
      console.log('✅ Security configuration validation passed');
      return true;
    }
  }

  /**
   * Generate configuration report
   */
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      git_commit: this.getCurrentGitCommit(),
      validation: this.validateConfiguration(),
      configurations: {}
    };

    for (const configPath of this.configPaths) {
      const hash = this.generateHash(configPath);
      if (hash) {
        report.configurations[configPath] = {
          hash,
          last_modified: this.getLastModified(configPath),
          exists: true
        };
      } else {
        report.configurations[configPath] = {
          exists: false
        };
      }
    }

    const reportPath = path.join(process.cwd(), `security-config-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`📊 Configuration report saved to: ${reportPath}`);
    return report;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const monitor = new SecurityConfigMonitor();

  try {
    if (args.includes('--snapshot')) {
      monitor.createSnapshot();
    } else if (args.includes('--detect-drift')) {
      monitor.detectDrift();
    } else if (args.includes('--validate')) {
      monitor.validateConfiguration();
    } else if (args.includes('--report')) {
      monitor.generateReport();
    } else {
      // Default: detect drift
      monitor.detectDrift();
    }
  } catch (error) {
    console.error('Security configuration monitoring failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = SecurityConfigMonitor;