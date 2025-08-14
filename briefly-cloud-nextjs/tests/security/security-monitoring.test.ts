/**
 * Security Monitoring Tests
 * 
 * Tests for security monitoring and alerting including:
 * - Real-time threat detection
 * - Security event correlation
 * - Automated incident response
 * - Security metrics and dashboards
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { SecurityMonitor } from '../../src/app/lib/security/security-monitor';

// Mock dependencies
const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        gte: jest.fn(() => ({
          lte: jest.fn(() => ({
            order: jest.fn(() => ({
              limit: jest.fn()
            }))
          }))
        })),
        order: jest.fn(() => ({
          limit: jest.fn()
        })),
        limit: jest.fn()
      })),
      gte: jest.fn(() => ({
        lte: jest.fn(() => ({
          order: jest.fn(() => ({
            limit: jest.fn()
          }))
        }))
      }))
    })),
    insert: jest.fn(),
    update: jest.fn(() => ({
      eq: jest.fn()
    }))
  })),
  rpc: jest.fn(),
  channel: jest.fn(() => ({
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn()
  }))
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
  hget: jest.fn(),
  hset: jest.fn(),
  zadd: jest.fn(),
  zrange: jest.fn(),
  zremrangebyscore: jest.fn()
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase)
}));

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedis)
}));

describe('Security Monitoring Tests', () => {
  let securityMonitor: SecurityMonitor;

  beforeEach(() => {
    jest.clearAllMocks();
    securityMonitor = new SecurityMonitor();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Real-Time Threat Detection', () => {
    it('should detect brute force attacks in real-time', async () => {
      const attackPattern = {
        ip_address: '192.168.1.100',
        user_id: 'user-123',
        failed_attempts: 10,
        time_window: 5 * 60 * 1000 // 5 minutes
      };

      // Mock failed login attempts
      mockRedis.incr.mockResolvedValue(attackPattern.failed_attempts);
      mockRedis.expire.mockResolvedValue(1);

      const threatDetection = await securityMonitor.detectBruteForceAttack(
        attackPattern.ip_address,
        attackPattern.user_id
      );

      expect(threatDetection.detected).toBe(true);
      expect(threatDetection.threat_type).toBe('brute_force_attack');
      expect(threatDetection.severity).toBe('high');
      expect(threatDetection.attack_count).toBe(attackPattern.failed_attempts);
      expect(threatDetection.source_ip).toBe(attackPattern.ip_address);
    });

    it('should detect distributed denial of service (DDoS) patterns', async () => {
      const ddosPattern = {
        request_count: 1000,
        unique_ips: 50,
        time_window: 60 * 1000, // 1 minute
        request_rate: 16.67 // requests per second
      };

      // Mock high request volume from multiple IPs
      mockRedis.keys.mockResolvedValue(
        Array.from({ length: ddosPattern.unique_ips }, (_, i) => `rate_limit:192.168.1.${i}`)
      );

      mockRedis.get.mockImplementation((key) => {
        return Promise.resolve(Math.floor(ddosPattern.request_count / ddosPattern.unique_ips));
      });

      const ddosDetection = await securityMonitor.detectDDoSPattern();

      expect(ddosDetection.detected).toBe(true);
      expect(ddosDetection.threat_type).toBe('ddos_attack');
      expect(ddosDetection.severity).toBe('critical');
      expect(ddosDetection.request_rate).toBeGreaterThan(10); // requests per second
      expect(ddosDetection.source_count).toBe(ddosPattern.unique_ips);
    });

    it('should detect SQL injection attempts', async () => {
      const sqlInjectionPatterns = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "' UNION SELECT * FROM passwords --",
        "'; SELECT pg_sleep(10); --"
      ];

      for (const payload of sqlInjectionPatterns) {
        const injectionDetection = await securityMonitor.detectSQLInjection({
          user_id: 'user-123',
          endpoint: '/api/search',
          payload: payload,
          ip_address: '192.168.1.100'
        });

        expect(injectionDetection.detected).toBe(true);
        expect(injectionDetection.threat_type).toBe('sql_injection');
        expect(injectionDetection.severity).toBe('critical');
        expect(injectionDetection.malicious_payload).toBe(payload);
      }
    });

    it('should detect cross-site scripting (XSS) attempts', async () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        '<img src="x" onerror="alert(1)">',
        '<svg onload="alert(1)">'
      ];

      for (const payload of xssPayloads) {
        const xssDetection = await securityMonitor.detectXSSAttempt({
          user_id: 'user-123',
          endpoint: '/api/chat',
          payload: payload,
          ip_address: '192.168.1.100'
        });

        expect(xssDetection.detected).toBe(true);
        expect(xssDetection.threat_type).toBe('xss_attempt');
        expect(xssDetection.severity).toBe('high');
        expect(xssDetection.malicious_payload).toBe(payload);
      }
    });

    it('should detect file upload attacks', async () => {
      const maliciousFiles = [
        {
          filename: 'malware.exe',
          mime_type: 'application/x-executable',
          size: 1024 * 1024,
          content_signature: 'MZ' // PE executable signature
        },
        {
          filename: 'script.php',
          mime_type: 'application/x-php',
          size: 2048,
          content_signature: '<?php'
        },
        {
          filename: 'document.pdf.exe',
          mime_type: 'application/pdf',
          size: 512 * 1024,
          content_signature: 'MZ' // Disguised executable
        }
      ];

      for (const file of maliciousFiles) {
        const uploadThreatDetection = await securityMonitor.detectMaliciousUpload({
          user_id: 'user-123',
          filename: file.filename,
          mime_type: file.mime_type,
          size: file.size,
          content_signature: file.content_signature
        });

        expect(uploadThreatDetection.detected).toBe(true);
        expect(uploadThreatDetection.threat_type).toBe('malicious_upload');
        expect(uploadThreatDetection.severity).toBeOneOf(['high', 'critical']);
      }
    });

    it('should detect anomalous user behavior', async () => {
      const userBehavior = {
        user_id: 'user-123',
        normal_login_times: [9, 10, 11, 14, 15, 16], // Normal business hours
        current_login_time: 3, // 3 AM - anomalous
        normal_locations: ['US', 'CA'],
        current_location: 'RU', // Different country
        normal_devices: ['Chrome/Windows', 'Safari/macOS'],
        current_device: 'curl/7.68.0' // Suspicious user agent
      };

      const behaviorAnalysis = await securityMonitor.analyzeUserBehavior(userBehavior);

      expect(behaviorAnalysis.anomalous).toBe(true);
      expect(behaviorAnalysis.anomaly_score).toBeGreaterThan(0.7);
      expect(behaviorAnalysis.anomalies).toContain('unusual_login_time');
      expect(behaviorAnalysis.anomalies).toContain('unusual_location');
      expect(behaviorAnalysis.anomalies).toContain('suspicious_user_agent');
    });
  });

  describe('Security Event Correlation', () => {
    it('should correlate related security events', async () => {
      const relatedEvents = [
        {
          id: 'event-1',
          type: 'failed_login',
          user_id: 'user-123',
          ip_address: '192.168.1.100',
          timestamp: Date.now()
        },
        {
          id: 'event-2',
          type: 'password_reset_request',
          user_id: 'user-123',
          ip_address: '192.168.1.100',
          timestamp: Date.now() + 60000 // 1 minute later
        },
        {
          id: 'event-3',
          type: 'account_lockout',
          user_id: 'user-123',
          ip_address: '192.168.1.100',
          timestamp: Date.now() + 120000 // 2 minutes later
        }
      ];

      mockSupabase.from().select().eq().gte().lte().order().limit.mockResolvedValue({
        data: relatedEvents,
        error: null
      });

      const correlation = await securityMonitor.correlateSecurityEvents(
        'user-123',
        30 * 60 * 1000 // 30 minute window
      );

      expect(correlation.correlated_events).toHaveLength(3);
      expect(correlation.attack_pattern).toBe('account_takeover_attempt');
      expect(correlation.confidence_score).toBeGreaterThan(0.8);
      expect(correlation.recommended_action).toBe('immediate_account_protection');
    });

    it('should detect coordinated attacks across multiple users', async () => {
      const coordinatedAttack = [
        {
          type: 'failed_login',
          user_id: 'user-1',
          ip_address: '192.168.1.100',
          timestamp: Date.now()
        },
        {
          type: 'failed_login',
          user_id: 'user-2',
          ip_address: '192.168.1.100',
          timestamp: Date.now() + 1000
        },
        {
          type: 'failed_login',
          user_id: 'user-3',
          ip_address: '192.168.1.100',
          timestamp: Date.now() + 2000
        }
      ];

      mockSupabase.from().select().eq().gte().mockResolvedValue({
        data: coordinatedAttack,
        error: null
      });

      const attackDetection = await securityMonitor.detectCoordinatedAttack(
        '192.168.1.100',
        10 * 60 * 1000 // 10 minute window
      );

      expect(attackDetection.detected).toBe(true);
      expect(attackDetection.attack_type).toBe('coordinated_brute_force');
      expect(attackDetection.affected_users).toHaveLength(3);
      expect(attackDetection.source_ip).toBe('192.168.1.100');
    });

    it('should identify attack progression patterns', async () => {
      const attackProgression = [
        { stage: 'reconnaissance', events: ['port_scan', 'directory_enumeration'] },
        { stage: 'initial_access', events: ['brute_force_login', 'credential_stuffing'] },
        { stage: 'privilege_escalation', events: ['admin_function_access', 'role_manipulation'] },
        { stage: 'data_exfiltration', events: ['bulk_download', 'api_abuse'] }
      ];

      mockSupabase.rpc.mockResolvedValue({
        data: {
          attack_stages: attackProgression,
          progression_score: 0.85,
          current_stage: 'privilege_escalation'
        },
        error: null
      });

      const progressionAnalysis = await securityMonitor.analyzeAttackProgression(
        '192.168.1.100'
      );

      expect(progressionAnalysis.attack_in_progress).toBe(true);
      expect(progressionAnalysis.current_stage).toBe('privilege_escalation');
      expect(progressionAnalysis.progression_score).toBe(0.85);
      expect(progressionAnalysis.threat_level).toBe('critical');
    });

    it('should correlate events across different time windows', async () => {
      const timeWindows = [
        { window: '5m', events: 15 },
        { window: '1h', events: 45 },
        { window: '24h', events: 120 }
      ];

      mockSupabase.rpc.mockResolvedValue({
        data: timeWindows,
        error: null
      });

      const temporalCorrelation = await securityMonitor.analyzeTemporalPatterns(
        'user-123'
      );

      expect(temporalCorrelation.pattern_detected).toBe(true);
      expect(temporalCorrelation.escalation_trend).toBe('increasing');
      expect(temporalCorrelation.time_windows).toEqual(timeWindows);
    });
  });

  describe('Automated Incident Response', () => {
    it('should automatically block malicious IP addresses', async () => {
      const maliciousIP = '192.168.1.100';
      const threatLevel = 'critical';

      mockSupabase.from().insert.mockResolvedValue({
        data: [{ id: 'block-rule-1' }],
        error: null
      });

      const blockResult = await securityMonitor.autoBlockIP(maliciousIP, threatLevel);

      expect(blockResult.blocked).toBe(true);
      expect(blockResult.block_duration).toBe('24h'); // Critical threats blocked for 24 hours
      expect(blockResult.rule_id).toBe('block-rule-1');

      expect(mockSupabase.from().insert).toHaveBeenCalledWith(
        expect.objectContaining({
          ip_address: maliciousIP,
          block_type: 'automatic',
          threat_level: threatLevel,
          expires_at: expect.any(String)
        })
      );
    });

    it('should automatically lock compromised user accounts', async () => {
      const compromisedUser = 'user-123';
      const lockReason = 'multiple_failed_logins';

      mockSupabase.from().update().eq.mockResolvedValue({
        data: [{ id: compromisedUser, account_locked: true }],
        error: null
      });

      const lockResult = await securityMonitor.autoLockAccount(
        compromisedUser,
        lockReason
      );

      expect(lockResult.locked).toBe(true);
      expect(lockResult.lock_reason).toBe(lockReason);
      expect(lockResult.unlock_method).toBe('admin_review');

      expect(mockSupabase.from().update().eq).toHaveBeenCalledWith(
        'id',
        compromisedUser
      );
    });

    it('should automatically revoke suspicious sessions', async () => {
      const suspiciousSessions = [
        {
          session_id: 'session-1',
          user_id: 'user-123',
          ip_address: '192.168.1.100',
          suspicious_activity: 'unusual_location'
        },
        {
          session_id: 'session-2',
          user_id: 'user-123',
          ip_address: '203.0.113.1',
          suspicious_activity: 'concurrent_sessions'
        }
      ];

      mockSupabase.from().update().eq.mockResolvedValue({
        data: suspiciousSessions.map(s => ({ ...s, revoked: true })),
        error: null
      });

      const revocationResult = await securityMonitor.autoRevokeSessions(
        suspiciousSessions.map(s => s.session_id)
      );

      expect(revocationResult.revoked_count).toBe(2);
      expect(revocationResult.success).toBe(true);
    });

    it('should automatically quarantine malicious files', async () => {
      const maliciousFile = {
        file_id: 'file-123',
        user_id: 'user-456',
        filename: 'malware.exe',
        threat_type: 'executable_upload'
      };

      mockSupabase.from().update().eq.mockResolvedValue({
        data: [{ ...maliciousFile, quarantined: true }],
        error: null
      });

      const quarantineResult = await securityMonitor.autoQuarantineFile(
        maliciousFile.file_id,
        maliciousFile.threat_type
      );

      expect(quarantineResult.quarantined).toBe(true);
      expect(quarantineResult.file_id).toBe(maliciousFile.file_id);
      expect(quarantineResult.quarantine_reason).toBe(maliciousFile.threat_type);
    });

    it('should trigger emergency lockdown for critical threats', async () => {
      const criticalThreat = {
        threat_type: 'active_data_breach',
        severity: 'critical',
        affected_systems: ['database', 'file_storage', 'api'],
        confidence: 0.95
      };

      mockSupabase.from().insert.mockResolvedValue({
        data: [{ id: 'lockdown-1' }],
        error: null
      });

      const lockdownResult = await securityMonitor.triggerEmergencyLockdown(
        criticalThreat
      );

      expect(lockdownResult.lockdown_activated).toBe(true);
      expect(lockdownResult.lockdown_level).toBe('full');
      expect(lockdownResult.affected_systems).toEqual(criticalThreat.affected_systems);
      expect(lockdownResult.estimated_duration).toBe('2h');
    });

    it('should send automated security alerts', async () => {
      const securityAlert = {
        alert_type: 'brute_force_attack',
        severity: 'high',
        source_ip: '192.168.1.100',
        affected_user: 'user-123',
        details: {
          attack_count: 15,
          time_window: '5 minutes',
          blocked: true
        }
      };

      mockSupabase.from().insert.mockResolvedValue({
        data: [{ id: 'alert-1' }],
        error: null
      });

      const alertResult = await securityMonitor.sendSecurityAlert(securityAlert);

      expect(alertResult.sent).toBe(true);
      expect(alertResult.alert_id).toBe('alert-1');
      expect(alertResult.notification_channels).toContain('email');
      expect(alertResult.notification_channels).toContain('slack');
    });
  });

  describe('Security Metrics and Dashboards', () => {
    it('should calculate security metrics', async () => {
      const timeRange = {
        start: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
        end: new Date()
      };

      mockSupabase.rpc.mockResolvedValue({
        data: {
          total_security_events: 150,
          critical_events: 5,
          high_events: 15,
          medium_events: 45,
          low_events: 85,
          blocked_attacks: 12,
          false_positives: 3,
          mean_detection_time: 45, // seconds
          mean_response_time: 180 // seconds
        },
        error: null
      });

      const metrics = await securityMonitor.calculateSecurityMetrics(timeRange);

      expect(metrics.total_events).toBe(150);
      expect(metrics.threat_distribution.critical).toBe(5);
      expect(metrics.threat_distribution.high).toBe(15);
      expect(metrics.blocked_attacks).toBe(12);
      expect(metrics.detection_accuracy).toBeGreaterThan(0.9); // > 90%
      expect(metrics.mean_detection_time).toBe(45);
      expect(metrics.mean_response_time).toBe(180);
    });

    it('should generate security dashboard data', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: {
          active_threats: 3,
          blocked_ips: 25,
          quarantined_files: 2,
          locked_accounts: 1,
          recent_alerts: [
            {
              id: 'alert-1',
              type: 'brute_force_attack',
              severity: 'high',
              timestamp: new Date().toISOString()
            }
          ],
          threat_trends: {
            last_24h: 45,
            last_7d: 280,
            last_30d: 1200
          }
        },
        error: null
      });

      const dashboardData = await securityMonitor.generateDashboardData();

      expect(dashboardData.active_threats).toBe(3);
      expect(dashboardData.blocked_ips).toBe(25);
      expect(dashboardData.quarantined_files).toBe(2);
      expect(dashboardData.locked_accounts).toBe(1);
      expect(dashboardData.recent_alerts).toHaveLength(1);
      expect(dashboardData.threat_trends.last_24h).toBe(45);
    });

    it('should track security KPIs', async () => {
      const kpiData = {
        detection_rate: 0.95, // 95% of threats detected
        false_positive_rate: 0.05, // 5% false positives
        mean_time_to_detection: 30, // 30 seconds
        mean_time_to_response: 120, // 2 minutes
        mean_time_to_resolution: 1800, // 30 minutes
        security_coverage: 0.98, // 98% of systems monitored
        compliance_score: 0.92 // 92% compliant
      };

      mockSupabase.rpc.mockResolvedValue({
        data: kpiData,
        error: null
      });

      const kpis = await securityMonitor.calculateSecurityKPIs();

      expect(kpis.detection_rate).toBe(0.95);
      expect(kpis.false_positive_rate).toBe(0.05);
      expect(kpis.mean_time_to_detection).toBe(30);
      expect(kpis.mean_time_to_response).toBe(120);
      expect(kpis.security_coverage).toBe(0.98);
      expect(kpis.compliance_score).toBe(0.92);
    });

    it('should generate security reports', async () => {
      const reportPeriod = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31')
      };

      mockSupabase.rpc.mockResolvedValue({
        data: {
          executive_summary: {
            total_incidents: 25,
            critical_incidents: 2,
            incidents_resolved: 23,
            average_resolution_time: '4.2 hours'
          },
          threat_landscape: {
            top_threats: ['brute_force', 'sql_injection', 'xss'],
            attack_sources: ['192.168.1.0/24', '203.0.113.0/24'],
            targeted_assets: ['login_endpoint', 'file_upload', 'api_search']
          },
          security_posture: {
            vulnerabilities_fixed: 15,
            security_controls_added: 8,
            compliance_improvements: 5
          }
        },
        error: null
      });

      const securityReport = await securityMonitor.generateSecurityReport(
        reportPeriod
      );

      expect(securityReport.executive_summary.total_incidents).toBe(25);
      expect(securityReport.threat_landscape.top_threats).toContain('brute_force');
      expect(securityReport.security_posture.vulnerabilities_fixed).toBe(15);
    });
  });

  describe('Security Monitoring Performance', () => {
    it('should handle high-volume security event processing', async () => {
      const eventVolume = 10000;
      const events = Array.from({ length: eventVolume }, (_, i) => ({
        id: `event-${i}`,
        type: 'api_request',
        timestamp: Date.now() + i,
        user_id: `user-${i % 100}`,
        ip_address: `192.168.1.${i % 255}`
      }));

      const processingStart = performance.now();
      
      mockSupabase.from().insert.mockResolvedValue({
        data: events.map(e => ({ id: e.id })),
        error: null
      });

      const batchResult = await securityMonitor.processBatchEvents(events);
      
      const processingTime = performance.now() - processingStart;

      expect(batchResult.processed_count).toBe(eventVolume);
      expect(batchResult.success).toBe(true);
      expect(processingTime).toBeLessThan(5000); // Should process within 5 seconds
    });

    it('should optimize security monitoring queries', async () => {
      const queryStart = performance.now();

      mockSupabase.from().select().eq().gte().order().limit.mockResolvedValue({
        data: Array.from({ length: 100 }, (_, i) => ({
          id: `event-${i}`,
          type: 'security_event',
          timestamp: new Date().toISOString()
        })),
        error: null
      });

      const queryResult = await securityMonitor.getRecentSecurityEvents({
        limit: 100,
        severity: 'high'
      });

      const queryTime = performance.now() - queryStart;

      expect(queryResult.success).toBe(true);
      expect(queryResult.data).toHaveLength(100);
      expect(queryTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should implement efficient threat detection algorithms', async () => {
      const detectionStart = performance.now();

      // Simulate complex threat detection algorithm
      const threatPatterns = Array.from({ length: 1000 }, (_, i) => ({
        pattern_id: `pattern-${i}`,
        complexity: Math.random(),
        match_probability: Math.random()
      }));

      const detectionResult = await securityMonitor.runThreatDetection(
        threatPatterns
      );

      const detectionTime = performance.now() - detectionStart;

      expect(detectionResult.patterns_analyzed).toBe(1000);
      expect(detectionResult.threats_detected).toBeGreaterThanOrEqual(0);
      expect(detectionTime).toBeLessThan(2000); // Should complete within 2 seconds
    });
  });
});