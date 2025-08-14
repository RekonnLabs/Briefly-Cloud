#!/usr/bin/env node

/**
 * Security Report Generator
 * 
 * Aggregates security test results, static analysis findings, and dependency
 * scan results into a comprehensive security report for CI/CD pipeline.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class SecurityReportGenerator {
  constructor(options = {}) {
    this.artifactsPath = options.artifactsPath || './security-artifacts';
    this.outputPath = options.outputPath || './reports/security';
    this.timestamp = new Date().toISOString();
    
    // Ensure output directory exists
    if (!fs.existsSync(this.outputPath)) {
      fs.mkdirSync(this.outputPath, { recursive: true });
    }
  }

  async generateReport() {
    console.log('🔒 Generating comprehensive security report...');
    
    const report = {
      metadata: {
        timestamp: this.timestamp,
        version: this.getVersion(),
        commit: this.getCommitHash(),
        branch: this.getBranch()
      },
      summary: {
        overallStatus: 'unknown',
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        coveragePercentage: 0,
        criticalIssues: 0,
        highIssues: 0,
        mediumIssues: 0,
        lowIssues: 0
      },
      testResults: {
        authentication: await this.parseTestResults('auth'),
        authorization: await this.parseTestResults('rls'),
        rateLimiting: await this.parseTestResults('rate-limiting'),
        auditLogging: await this.parseTestResults('audit'),
        securityMonitoring: await this.parseTestResults('monitoring'),
        integration: await this.parseTestResults('integration')
      },
      staticAnalysis: {
        eslint: await this.parseESLintResults(),
        semgrep: await this.parseSemgrepResults(),
        typescript: await this.parseTypeScriptResults()
      },
      dependencyScans: {
        npmAudit: await this.parseNpmAuditResults(),
        snyk: await this.parseSnykResults(),
        ossar: await this.parseOSSARResults()
      },
      complianceStatus: {
        soc2: false,
        gdpr: false,
        ccpa: false,
        hipaa: false
      },
      recommendations: [],
      actionItems: []
    };

    // Calculate overall status and summary
    this.calculateSummary(report);
    this.assessCompliance(report);
    this.generateRecommendations(report);

    // Write reports
    await this.writeJSONReport(report);
    await this.writeHTMLReport(report);
    await this.writeMarkdownReport(report);
    
    console.log(`✅ Security report generated: ${this.outputPath}`);
    
    // Exit with appropriate code
    process.exit(report.summary.overallStatus === 'passed' ? 0 : 1);
  }

  async parseTestResults(testType) {
    const resultsPath = path.join(this.artifactsPath, `security-test-results-${testType}`);
    
    if (!fs.existsSync(resultsPath)) {
      return { status: 'not_run', tests: [], coverage: 0 };
    }

    try {
      // Look for Jest test results
      const jestResultsPath = path.join(resultsPath, 'jest-results.json');
      if (fs.existsSync(jestResultsPath)) {
        const results = JSON.parse(fs.readFileSync(jestResultsPath, 'utf8'));
        return {
          status: results.success ? 'passed' : 'failed',
          tests: results.testResults || [],
          coverage: results.coverageMap ? this.calculateCoverage(results.coverageMap) : 0,
          duration: results.runTime || 0
        };
      }

      return { status: 'unknown', tests: [], coverage: 0 };
    } catch (error) {
      console.warn(`Warning: Could not parse test results for ${testType}:`, error.message);
      return { status: 'error', tests: [], coverage: 0, error: error.message };
    }
  }

  async parseESLintResults() {
    const eslintPath = path.join(this.artifactsPath, 'static-analysis-results', 'eslint-security-report.json');
    
    if (!fs.existsSync(eslintPath)) {
      return { status: 'not_run', issues: [] };
    }

    try {
      const results = JSON.parse(fs.readFileSync(eslintPath, 'utf8'));
      const issues = results.flatMap(file => 
        file.messages.map(msg => ({
          file: file.filePath,
          line: msg.line,
          column: msg.column,
          rule: msg.ruleId,
          severity: msg.severity === 2 ? 'error' : 'warning',
          message: msg.message
        }))
      );

      return {
        status: issues.some(i => i.severity === 'error') ? 'failed' : 'passed',
        issues,
        errorCount: issues.filter(i => i.severity === 'error').length,
        warningCount: issues.filter(i => i.severity === 'warning').length
      };
    } catch (error) {
      return { status: 'error', issues: [], error: error.message };
    }
  }

  async parseSemgrepResults() {
    const semgrepPath = path.join(this.artifactsPath, 'static-analysis-results', 'semgrep-results.json');
    
    if (!fs.existsSync(semgrepPath)) {
      return { status: 'not_run', findings: [] };
    }

    try {
      const results = JSON.parse(fs.readFileSync(semgrepPath, 'utf8'));
      const findings = (results.results || []).map(finding => ({
        file: finding.path,
        line: finding.start.line,
        rule: finding.check_id,
        severity: finding.extra.severity.toLowerCase(),
        message: finding.extra.message,
        confidence: finding.extra.metadata?.confidence || 'medium'
      }));

      return {
        status: findings.some(f => f.severity === 'error') ? 'failed' : 'passed',
        findings,
        criticalCount: findings.filter(f => f.severity === 'error').length,
        highCount: findings.filter(f => f.severity === 'warning').length,
        mediumCount: findings.filter(f => f.severity === 'info').length
      };
    } catch (error) {
      return { status: 'error', findings: [], error: error.message };
    }
  }

  async parseTypeScriptResults() {
    try {
      // Run TypeScript compiler check
      execSync('npx tsc --noEmit --strict', { stdio: 'pipe' });
      return { status: 'passed', errors: [] };
    } catch (error) {
      const output = error.stdout?.toString() || error.stderr?.toString() || '';
      const errors = this.parseTypeScriptErrors(output);
      return { status: 'failed', errors };
    }
  }

  async parseNpmAuditResults() {
    const auditPath = path.join(this.artifactsPath, 'dependency-scan-results', 'npm-audit-report.json');
    
    if (!fs.existsSync(auditPath)) {
      return { status: 'not_run', vulnerabilities: [] };
    }

    try {
      const results = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
      const vulnerabilities = Object.values(results.vulnerabilities || {}).map(vuln => ({
        name: vuln.name,
        severity: vuln.severity,
        via: vuln.via,
        effects: vuln.effects,
        range: vuln.range,
        nodes: vuln.nodes
      }));

      return {
        status: vulnerabilities.some(v => ['critical', 'high'].includes(v.severity)) ? 'failed' : 'passed',
        vulnerabilities,
        criticalCount: vulnerabilities.filter(v => v.severity === 'critical').length,
        highCount: vulnerabilities.filter(v => v.severity === 'high').length,
        moderateCount: vulnerabilities.filter(v => v.severity === 'moderate').length,
        lowCount: vulnerabilities.filter(v => v.severity === 'low').length
      };
    } catch (error) {
      return { status: 'error', vulnerabilities: [], error: error.message };
    }
  }

  async parseSnykResults() {
    const snykPath = path.join(this.artifactsPath, 'dependency-scan-results', 'snyk-report.json');
    
    if (!fs.existsSync(snykPath)) {
      return { status: 'not_run', issues: [] };
    }

    try {
      const results = JSON.parse(fs.readFileSync(snykPath, 'utf8'));
      const issues = (results.vulnerabilities || []).map(vuln => ({
        id: vuln.id,
        title: vuln.title,
        severity: vuln.severity,
        packageName: vuln.packageName,
        version: vuln.version,
        from: vuln.from,
        upgradePath: vuln.upgradePath,
        isUpgradable: vuln.isUpgradable,
        isPatchable: vuln.isPatchable
      }));

      return {
        status: issues.some(i => ['critical', 'high'].includes(i.severity)) ? 'failed' : 'passed',
        issues,
        criticalCount: issues.filter(i => i.severity === 'critical').length,
        highCount: issues.filter(i => i.severity === 'high').length,
        mediumCount: issues.filter(i => i.severity === 'medium').length,
        lowCount: issues.filter(i => i.severity === 'low').length
      };
    } catch (error) {
      return { status: 'error', issues: [], error: error.message };
    }
  }

  async parseOSSARResults() {
    // OSSAR results are typically uploaded to GitHub Security tab
    // For now, return placeholder
    return { status: 'not_implemented', findings: [] };
  }

  calculateSummary(report) {
    // Aggregate test results
    const testSuites = Object.values(report.testResults);
    report.summary.totalTests = testSuites.reduce((sum, suite) => sum + (suite.tests?.length || 0), 0);
    report.summary.passedTests = testSuites.reduce((sum, suite) => {
      return sum + (suite.tests?.filter(t => t.status === 'passed').length || 0);
    }, 0);
    report.summary.failedTests = report.summary.totalTests - report.summary.passedTests;

    // Calculate coverage
    const coverages = testSuites.map(suite => suite.coverage || 0).filter(c => c > 0);
    report.summary.coveragePercentage = coverages.length > 0 
      ? Math.round(coverages.reduce((sum, c) => sum + c, 0) / coverages.length)
      : 0;

    // Aggregate security issues
    const staticAnalysis = Object.values(report.staticAnalysis);
    const dependencyScans = Object.values(report.dependencyScans);
    
    report.summary.criticalIssues = this.countIssuesBySeverity([...staticAnalysis, ...dependencyScans], 'critical');
    report.summary.highIssues = this.countIssuesBySeverity([...staticAnalysis, ...dependencyScans], 'high');
    report.summary.mediumIssues = this.countIssuesBySeverity([...staticAnalysis, ...dependencyScans], 'medium');
    report.summary.lowIssues = this.countIssuesBySeverity([...staticAnalysis, ...dependencyScans], 'low');

    // Determine overall status
    const hasFailedTests = report.summary.failedTests > 0;
    const hasCriticalIssues = report.summary.criticalIssues > 0;
    const hasHighIssues = report.summary.highIssues > 0;
    const hasFailedScans = [...staticAnalysis, ...dependencyScans].some(scan => scan.status === 'failed');

    if (hasFailedTests || hasCriticalIssues || hasFailedScans) {
      report.summary.overallStatus = 'failed';
    } else if (hasHighIssues) {
      report.summary.overallStatus = 'warning';
    } else {
      report.summary.overallStatus = 'passed';
    }
  }

  assessCompliance(report) {
    // SOC 2 compliance checks
    const hasAuditLogging = report.testResults.auditLogging?.status === 'passed';
    const hasAccessControls = report.testResults.authorization?.status === 'passed';
    const hasSecurityMonitoring = report.testResults.securityMonitoring?.status === 'passed';
    
    report.complianceStatus.soc2 = hasAuditLogging && hasAccessControls && hasSecurityMonitoring;

    // GDPR compliance checks
    const hasDataProtection = report.testResults.authorization?.status === 'passed';
    const hasAuditTrail = report.testResults.auditLogging?.status === 'passed';
    
    report.complianceStatus.gdpr = hasDataProtection && hasAuditTrail;

    // CCPA compliance checks
    report.complianceStatus.ccpa = hasDataProtection && hasAuditTrail;
  }

  generateRecommendations(report) {
    const recommendations = [];
    const actionItems = [];

    // Test-based recommendations
    Object.entries(report.testResults).forEach(([testType, results]) => {
      if (results.status === 'failed') {
        recommendations.push(`Fix failing ${testType} tests to ensure security controls are working properly`);
        actionItems.push({
          type: 'test_failure',
          priority: 'high',
          description: `Address ${testType} test failures`,
          category: 'testing'
        });
      }
    });

    // Static analysis recommendations
    if (report.staticAnalysis.eslint?.errorCount > 0) {
      recommendations.push('Fix ESLint security errors to address code-level vulnerabilities');
      actionItems.push({
        type: 'static_analysis',
        priority: 'high',
        description: 'Resolve ESLint security violations',
        category: 'code_quality'
      });
    }

    if (report.staticAnalysis.semgrep?.criticalCount > 0) {
      recommendations.push('Address critical Semgrep findings to fix security vulnerabilities');
      actionItems.push({
        type: 'security_vulnerability',
        priority: 'critical',
        description: 'Fix critical Semgrep security findings',
        category: 'security'
      });
    }

    // Dependency recommendations
    if (report.dependencyScans.npmAudit?.criticalCount > 0) {
      recommendations.push('Update dependencies with critical vulnerabilities immediately');
      actionItems.push({
        type: 'dependency_vulnerability',
        priority: 'critical',
        description: 'Update dependencies with critical vulnerabilities',
        category: 'dependencies'
      });
    }

    // Coverage recommendations
    if (report.summary.coveragePercentage < 80) {
      recommendations.push('Increase security test coverage to at least 80%');
      actionItems.push({
        type: 'test_coverage',
        priority: 'medium',
        description: 'Improve security test coverage',
        category: 'testing'
      });
    }

    report.recommendations = recommendations;
    report.actionItems = actionItems;
  }

  countIssuesBySeverity(scans, severity) {
    return scans.reduce((count, scan) => {
      if (scan.criticalCount !== undefined && severity === 'critical') return count + scan.criticalCount;
      if (scan.highCount !== undefined && severity === 'high') return count + scan.highCount;
      if (scan.mediumCount !== undefined && severity === 'medium') return count + scan.mediumCount;
      if (scan.lowCount !== undefined && severity === 'low') return count + scan.lowCount;
      return count;
    }, 0);
  }

  calculateCoverage(coverageMap) {
    // Simplified coverage calculation
    const files = Object.values(coverageMap);
    if (files.length === 0) return 0;
    
    const totalStatements = files.reduce((sum, file) => sum + Object.keys(file.s || {}).length, 0);
    const coveredStatements = files.reduce((sum, file) => {
      return sum + Object.values(file.s || {}).filter(count => count > 0).length;
    }, 0);
    
    return totalStatements > 0 ? Math.round((coveredStatements / totalStatements) * 100) : 0;
  }

  parseTypeScriptErrors(output) {
    const lines = output.split('\n');
    const errors = [];
    
    lines.forEach(line => {
      const match = line.match(/^(.+?)\((\d+),(\d+)\): error TS(\d+): (.+)$/);
      if (match) {
        errors.push({
          file: match[1],
          line: parseInt(match[2]),
          column: parseInt(match[3]),
          code: match[4],
          message: match[5]
        });
      }
    });
    
    return errors;
  }

  async writeJSONReport(report) {
    const jsonPath = path.join(this.outputPath, 'latest-security-report.json');
    const timestampedPath = path.join(this.outputPath, `security-report-${this.timestamp.replace(/[:.]/g, '-')}.json`);
    
    const jsonContent = JSON.stringify(report, null, 2);
    
    fs.writeFileSync(jsonPath, jsonContent);
    fs.writeFileSync(timestampedPath, jsonContent);
  }

  async writeHTMLReport(report) {
    const htmlPath = path.join(this.outputPath, 'latest-security-report.html');
    
    const html = this.generateHTMLReport(report);
    fs.writeFileSync(htmlPath, html);
  }

  async writeMarkdownReport(report) {
    const mdPath = path.join(this.outputPath, 'latest-security-report.md');
    
    const markdown = this.generateMarkdownReport(report);
    fs.writeFileSync(mdPath, markdown);
  }

  generateHTMLReport(report) {
    const statusColor = {
      'passed': '#22c55e',
      'failed': '#ef4444',
      'warning': '#f59e0b',
      'unknown': '#6b7280'
    };

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Security Report - ${report.metadata.timestamp}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f8fafc; }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .header { background: #1e293b; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { padding: 20px; }
        .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 20px 0; }
        .card { border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; }
        .metric { text-align: center; }
        .metric-value { font-size: 2em; font-weight: bold; margin-bottom: 4px; }
        .metric-label { color: #64748b; font-size: 0.9em; }
        .section { margin: 30px 0; }
        .section h2 { border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; }
        th { background: #f8fafc; font-weight: 600; }
        .severity-critical { color: #dc2626; }
        .severity-high { color: #ea580c; }
        .severity-medium { color: #d97706; }
        .severity-low { color: #65a30d; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔒 Security Report</h1>
            <p>Generated: ${report.metadata.timestamp}</p>
            <p>Commit: ${report.metadata.commit} | Branch: ${report.metadata.branch}</p>
            <span class="status-badge" style="background-color: ${statusColor[report.summary.overallStatus]}">
                ${report.summary.overallStatus.toUpperCase()}
            </span>
        </div>
        
        <div class="content">
            <div class="grid">
                <div class="card metric">
                    <div class="metric-value">${report.summary.totalTests}</div>
                    <div class="metric-label">Total Tests</div>
                </div>
                <div class="card metric">
                    <div class="metric-value" style="color: #22c55e">${report.summary.passedTests}</div>
                    <div class="metric-label">Passed</div>
                </div>
                <div class="card metric">
                    <div class="metric-value" style="color: #ef4444">${report.summary.failedTests}</div>
                    <div class="metric-label">Failed</div>
                </div>
                <div class="card metric">
                    <div class="metric-value">${report.summary.coveragePercentage}%</div>
                    <div class="metric-label">Coverage</div>
                </div>
            </div>

            <div class="section">
                <h2>Security Issues Summary</h2>
                <div class="grid">
                    <div class="card metric">
                        <div class="metric-value severity-critical">${report.summary.criticalIssues}</div>
                        <div class="metric-label">Critical</div>
                    </div>
                    <div class="card metric">
                        <div class="metric-value severity-high">${report.summary.highIssues}</div>
                        <div class="metric-label">High</div>
                    </div>
                    <div class="card metric">
                        <div class="metric-value severity-medium">${report.summary.mediumIssues}</div>
                        <div class="metric-label">Medium</div>
                    </div>
                    <div class="card metric">
                        <div class="metric-value severity-low">${report.summary.lowIssues}</div>
                        <div class="metric-label">Low</div>
                    </div>
                </div>
            </div>

            <div class="section">
                <h2>Compliance Status</h2>
                <table>
                    <tr><td>SOC 2</td><td>${report.complianceStatus.soc2 ? '✅ Compliant' : '❌ Non-compliant'}</td></tr>
                    <tr><td>GDPR</td><td>${report.complianceStatus.gdpr ? '✅ Compliant' : '❌ Non-compliant'}</td></tr>
                    <tr><td>CCPA</td><td>${report.complianceStatus.ccpa ? '✅ Compliant' : '❌ Non-compliant'}</td></tr>
                </table>
            </div>

            ${report.recommendations.length > 0 ? `
            <div class="section">
                <h2>Recommendations</h2>
                <ul>
                    ${report.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                </ul>
            </div>
            ` : ''}
        </div>
    </div>
</body>
</html>`;
  }

  generateMarkdownReport(report) {
    return `# 🔒 Security Report

**Status:** ${report.summary.overallStatus.toUpperCase()}  
**Generated:** ${report.metadata.timestamp}  
**Commit:** ${report.metadata.commit}  
**Branch:** ${report.metadata.branch}

## Summary

| Metric | Value |
|--------|-------|
| Total Tests | ${report.summary.totalTests} |
| Passed Tests | ${report.summary.passedTests} |
| Failed Tests | ${report.summary.failedTests} |
| Coverage | ${report.summary.coveragePercentage}% |

## Security Issues

| Severity | Count |
|----------|-------|
| Critical | ${report.summary.criticalIssues} |
| High | ${report.summary.highIssues} |
| Medium | ${report.summary.mediumIssues} |
| Low | ${report.summary.lowIssues} |

## Compliance Status

- **SOC 2:** ${report.complianceStatus.soc2 ? '✅ Compliant' : '❌ Non-compliant'}
- **GDPR:** ${report.complianceStatus.gdpr ? '✅ Compliant' : '❌ Non-compliant'}
- **CCPA:** ${report.complianceStatus.ccpa ? '✅ Compliant' : '❌ Non-compliant'}

${report.recommendations.length > 0 ? `
## Recommendations

${report.recommendations.map(rec => `- ${rec}`).join('\n')}
` : ''}

## Test Results

${Object.entries(report.testResults).map(([name, results]) => `
### ${name.charAt(0).toUpperCase() + name.slice(1)}
- **Status:** ${results.status}
- **Tests:** ${results.tests?.length || 0}
- **Coverage:** ${results.coverage || 0}%
`).join('')}

---
*Report generated by Briefly Cloud Security Pipeline*
`;
  }

  getVersion() {
    try {
      const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
      return packageJson.version || '1.0.0';
    } catch {
      return '1.0.0';
    }
  }

  getCommitHash() {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim().substring(0, 8);
    } catch {
      return 'unknown';
    }
  }

  getBranch() {
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};
  
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];
    options[key] = value;
  }

  const generator = new SecurityReportGenerator(options);
  generator.generateReport().catch(error => {
    console.error('❌ Security report generation failed:', error);
    process.exit(1);
  });
}

module.exports = SecurityReportGenerator;