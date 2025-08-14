/**
 * Audit Logging and Security Monitoring Tests
 * 
 * Comprehensive test suite for audit logging and security monitoring including:
 * - Audit log generation for all sensitive operations
 * - Audit log access controls and admin restrictions
 * - Security event detection and alerting
 * - Audit log integrity validation
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AuditLogger } from '../../src/app/lib/audit/audit-logger';
import { SecurityMonitor } from '../../src/app/lib/security/security-monitor';

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(),
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
      })),
      neq: jest.fn(() => ({
        order: jest.fn(() => ({
          limit: jest.fn()
        }))
      }))
    })),
    insert: jest.fn(),
    update: jest.fn(() => ({
      eq: jest.fn()
    })),
    delete: jest.fn(() => ({
      eq: jest.fn()
    }))
  })),
  rpc: jest.fn()
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase)
}));

describe('Audit Logging Security Tests', () => {
  let auditLogger: AuditLogger;
  let securityMonitor: SecurityMonitor;

  beforeEach(() => {
    jest.clearAllMocks();
    auditLogger = new AuditLogger();
    securityMonitor = new SecurityMonitor();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Audit Log Generation for Sensitive Operations', () => {
    it('should log user authentication events', async () => {
      const authEvent = {
        user_id: 'user-123',
        action: 'login_success',
        ip_address: '192.168.1.100',
        user_agent: 'Mozilla/5.0 (Test Browser)',
        timestamp: new Date().toISOString()
      };

      mockSupabase.from().insert.mockResolvedValue({
        data: [{ id: 'audit-log-1' }],
        error: null
      });

      await auditLogger.logAction({
        user_id: authEvent.user_id,
        action: authEvent.action,
        resource_type: 'authentication',
        details: {
          ip_address: authEvent.ip_address,
          user_agent: authEvent.user_agent,
          success: true
        }
      });

      expect(mockSupabase.from).toHaveBeenCalledWith('private.audit_logs');
      expect(mockSupabase.from().insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: authEvent.user_id,
          action: authEvent.action,
          resource_type: 'authentication',
          details: expect.objectContaining({
            ip_address: authEvent.ip_address,
            user_agent: authEvent.user_agent
          })
        })
      );
    });

    it('should log file operations with complete metadata', async () => {
      const fileOperation = {
        user_id: 'user-123',
        action: 'file_upload',
        resource_type: 'file',
        resource_id: 'file-456',
        before_state: null,
        after_state: {
          id: 'file-456',
          name: 'document.pdf',
          size: 1024 * 1024,
          mime_type: 'application/pdf'
        }
      };

      mockSupabase.from().insert.mockResolvedValue({
        data: [{ id: 'audit-log-2' }],
        error: null
      });

      await auditLogger.logAction(fileOperation);

      expect(mockSupabase.from().insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: fileOperation.user_id,
          action: fileOperation.action,
          resource_type: fileOperation.resource_type,
          resource_id: fileOperation.resource_id,
          before_state: fileOperation.before_state,
          after_state: fileOperation.after_state
        })
      );
    });

    it('should log data access operations', async () => {
      const dataAccess = {
        user_id: 'user-123',
        action: 'data_access',
        resource_type: 'conversation',
        resource_id: 'conv-789',
        details: {
          access_type: 'read',
          query_parameters: { limit: 10, offset: 0 },
          records_accessed: 5
        }
      };

      mockSupabase.from().insert.mockResolvedValue({
        data: [{ id: 'audit-log-3' }],
        error: null
      });

      await auditLogger.logAction(dataAccess);

      expect(mockSupabase.from().insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: dataAccess.user_id,
          action: dataAccess.action,
          resource_type: dataAccess.resource_type,
          resource_id: dataAccess.resource_id,
          details: dataAccess.details
        })
      );
    });

    it('should log administrative operations', async () => {
      const adminOperation = {
        user_id: 'admin-123',
        action: 'user_data_access',
        resource_type: 'user',
        resource_id: 'target-user-456',
        details: {
          admin_reason: 'Support ticket investigation',
          ticket_id: 'TICKET-789',
          data_accessed: ['profile', 'files', 'usage_logs']
        }
      };

      mockSupabase.from().insert.mockResolvedValue({
        data: [{ id: 'audit-log-4' }],
        error: null
      });

      await auditLogger.logAction(adminOperation);

      expect(mockSupabase.from().insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: adminOperation.user_id,
          action: adminOperation.action,
          resource_type: adminOperation.resource_type,
          resource_id: adminOperation.resource_id,
          details: expect.objectContaining({
            admin_reason: 'Support ticket investigation',
            ticket_id: 'TICKET-789'
          })
        })
      );
    });

    it('should log security events with appropriate severity', async () => {
      const securityEvents = [
        {
          event_type: 'failed_login_attempt',
          severity: 'medium',
          user_id: 'user-123',
          details: {
            ip_address: '192.168.1.100',
            failure_reason: 'invalid_password',
            attempt_count: 3
          }
        },
        {
          event_type: 'privilege_escalation_attempt',
          severity: 'critical',
          user_id: 'user-456',
          details: {
            attempted_action: 'admin_access',
            current_role: 'user',
            requested_role: 'admin'
          }
        },
        {
          event_type: 'suspicious_data_access',
          severity: 'high',
          user_id: 'user-789',
          details: {
            access_pattern: 'bulk_download',
            files_accessed: 50,
            time_window: '5 minutes'
          }
        }
      ];

      mockSupabase.from().insert.mockResolvedValue({
        data: [{ id: 'security-event-1' }],
        error: null
      });

      for (const event of securityEvents) {
        await auditLogger.logSecurityEvent(event);

        expect(mockSupabase.from().insert).toHaveBeenCalledWith(
          expect.objectContaining({
            event_type: event.event_type,
            severity: event.severity,
            user_id: event.user_id,
            details: event.details
          })
        );
      }
    });

    it('should log configuration changes', async () => {
      const configChange = {
        user_id: 'admin-123',
        action: 'security_config_update',
        resource_type: 'configuration',
        resource_id: 'security_headers',
        before_state: {
          'Content-Security-Policy': "default-src 'self'",
          'X-Frame-Options': 'DENY'
        },
        after_state: {
          'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'",
          'X-Frame-Options': 'DENY'
        }
      };

      mockSupabase.from().insert.mockResolvedValue({
        data: [{ id: 'audit-log-5' }],
        error: null
      });

      await auditLogger.logAction(configChange);

      expect(mockSupabase.from().insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'security_config_update',
          before_state: configChange.before_state,
          after_state: configChange.after_state
        })
      );
    });
  });

  describe('Audit Log Access Controls and Admin Restrictions', () => {
    it('should restrict audit log access to authorized admins only', async () => {
      const regularUserId = 'user-123';
      const adminUserId = 'admin-456';

      // Regular user tries to access audit logs
      mockSupabase.from().select().eq().order().limit.mockResolvedValue({
        data: [],
        error: { message: 'Insufficient privileges' }
      });

      const regularUserResult = await auditLogger.getAuditLogs(regularUserId, {
        limit: 10
      });

      expect(regularUserResult.success).toBe(false);
      expect(regularUserResult.error).toContain('Insufficient privileges');

      // Admin user can access audit logs
      mockSupabase.from().select().eq().order().limit.mockResolvedValue({
        data: [
          {
            id: 'audit-1',
            user_id: 'user-789',
            action: 'file_upload',
            created_at: new Date().toISOString()
          }
        ],
        error: null
      });

      const adminResult = await auditLogger.getAuditLogs(adminUserId, {
        limit: 10
      });

      expect(adminResult.success).toBe(true);
      expect(adminResult.data).toBeDefined();
    });

    it('should validate admin permissions before audit log access', async () => {
      const userId = 'potential-admin-123';

      // Mock admin permission check
      mockSupabase.rpc.mockResolvedValue({
        data: { is_admin: false },
        error: null
      });

      const permissionCheck = await auditLogger.checkAdminPermissions(userId);

      expect(permissionCheck.is_admin).toBe(false);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('check_admin_permissions', {
        user_id: userId
      });

      // Should deny access based on permission check
      const accessResult = await auditLogger.getAuditLogs(userId, { limit: 10 });
      expect(accessResult.success).toBe(false);
    });

    it('should log audit log access attempts', async () => {
      const adminUserId = 'admin-123';
      const accessRequest = {
        user_id: adminUserId,
        filters: {
          start_date: '2024-01-01',
          end_date: '2024-01-31',
          action: 'file_upload'
        }
      };

      mockSupabase.from().insert.mockResolvedValue({
        data: [{ id: 'audit-access-log-1' }],
        error: null
      });

      await auditLogger.logAuditAccess(accessRequest);

      expect(mockSupabase.from().insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: adminUserId,
          action: 'audit_log_access',
          resource_type: 'audit_logs',
          details: expect.objectContaining({
            filters: accessRequest.filters,
            access_time: expect.any(String)
          })
        })
      );
    });

    it('should implement audit log data masking for sensitive information', async () => {
      const adminUserId = 'admin-123';

      // Mock audit logs with sensitive data
      const rawAuditLogs = [
        {
          id: 'audit-1',
          user_id: 'user-123',
          action: 'login_success',
          details: {
            ip_address: '192.168.1.100',
            password_hash: '$2b$10$...',
            session_token: 'eyJhbGciOiJIUzI1NiIs...'
          }
        }
      ];

      mockSupabase.from().select().eq().order().limit.mockResolvedValue({
        data: rawAuditLogs,
        error: null
      });

      const result = await auditLogger.getAuditLogs(adminUserId, { limit: 10 });

      // Sensitive data should be masked
      expect(result.data[0].details.password_hash).toBeUndefined();
      expect(result.data[0].details.session_token).toBeUndefined();
      expect(result.data[0].details.ip_address).toBeDefined(); // Non-sensitive data preserved
    });

    it('should enforce audit log retention policies', async () => {
      const retentionPeriod = 7 * 365 * 24 * 60 * 60 * 1000; // 7 years in milliseconds
      const cutoffDate = new Date(Date.now() - retentionPeriod);

      mockSupabase.from().delete().eq.mockResolvedValue({
        data: [],
        error: null
      });

      await auditLogger.enforceRetentionPolicy(cutoffDate);

      expect(mockSupabase.from().delete().eq).toHaveBeenCalledWith(
        'created_at',
        expect.any(String)
      );
    });
  });

  describe('Security Event Detection and Alerting', () => {
    it('should detect failed authentication patterns', async () => {
      const failedAttempts = [
        {
          user_id: 'user-123',
          ip_address: '192.168.1.100',
          timestamp: Date.now(),
          failure_reason: 'invalid_password'
        },
        {
          user_id: 'user-123',
          ip_address: '192.168.1.100',
          timestamp: Date.now() + 1000,
          failure_reason: 'invalid_password'
        },
        {
          user_id: 'user-123',
          ip_address: '192.168.1.100',
          timestamp: Date.now() + 2000,
          failure_reason: 'invalid_password'
        }
      ];

      mockSupabase.from().select().eq().gte().lte().mockResolvedValue({
        data: failedAttempts,
        error: null
      });

      const suspiciousPattern = await securityMonitor.detectFailedAuthPattern(
        'user-123',
        '192.168.1.100'
      );

      expect(suspiciousPattern.detected).toBe(true);
      expect(suspiciousPattern.pattern_type).toBe('repeated_failed_auth');
      expect(suspiciousPattern.severity).toBe('high');
      expect(suspiciousPattern.failure_count).toBe(3);
    });

    it('should detect unusual data access patterns', async () => {
      const dataAccessEvents = [
        {
          user_id: 'user-123',
          action: 'file_download',
          timestamp: Date.now(),
          resource_id: 'file-1'
        },
        {
          user_id: 'user-123',
          action: 'file_download',
          timestamp: Date.now() + 1000,
          resource_id: 'file-2'
        },
        // ... 48 more rapid downloads
      ];

      // Generate 50 rapid downloads
      for (let i = 3; i <= 50; i++) {
        dataAccessEvents.push({
          user_id: 'user-123',
          action: 'file_download',
          timestamp: Date.now() + (i * 1000),
          resource_id: `file-${i}`
        });
      }

      mockSupabase.from().select().eq().gte().mockResolvedValue({
        data: dataAccessEvents,
        error: null
      });

      const bulkAccessPattern = await securityMonitor.detectBulkDataAccess(
        'user-123',
        10 * 60 * 1000 // 10 minute window
      );

      expect(bulkAccessPattern.detected).toBe(true);
      expect(bulkAccessPattern.pattern_type).toBe('bulk_data_access');
      expect(bulkAccessPattern.severity).toBe('high');
      expect(bulkAccessPattern.access_count).toBe(50);
    });

    it('should detect privilege escalation attempts', async () => {
      const escalationAttempt = {
        user_id: 'user-123',
        action: 'admin_function_access',
        resource_type: 'admin_panel',
        details: {
          attempted_function: 'view_all_users',
          current_role: 'user',
          required_role: 'admin'
        }
      };

      mockSupabase.from().select().eq().mockResolvedValue({
        data: [escalationAttempt],
        error: null
      });

      const escalationDetection = await securityMonitor.detectPrivilegeEscalation(
        'user-123'
      );

      expect(escalationDetection.detected).toBe(true);
      expect(escalationDetection.pattern_type).toBe('privilege_escalation');
      expect(escalationDetection.severity).toBe('critical');
    });

    it('should detect cross-user data access attempts', async () => {
      const crossUserAccess = {
        user_id: 'user-123',
        action: 'data_access_violation',
        resource_type: 'file',
        resource_id: 'file-belonging-to-user-456',
        details: {
          owner_user_id: 'user-456',
          violation_type: 'unauthorized_access'
        }
      };

      mockSupabase.from().select().eq().mockResolvedValue({
        data: [crossUserAccess],
        error: null
      });

      const crossUserDetection = await securityMonitor.detectCrossUserAccess(
        'user-123'
      );

      expect(crossUserDetection.detected).toBe(true);
      expect(crossUserDetection.pattern_type).toBe('cross_user_access');
      expect(crossUserDetection.severity).toBe('critical');
    });

    it('should generate security alerts for detected patterns', async () => {
      const securityEvent = {
        event_type: 'repeated_failed_auth',
        severity: 'high',
        user_id: 'user-123',
        details: {
          ip_address: '192.168.1.100',
          failure_count: 5,
          time_window: '5 minutes'
        }
      };

      mockSupabase.from().insert.mockResolvedValue({
        data: [{ id: 'security-alert-1' }],
        error: null
      });

      await securityMonitor.generateSecurityAlert(securityEvent);

      expect(mockSupabase.from().insert).toHaveBeenCalledWith(
        expect.objectContaining({
          alert_type: securityEvent.event_type,
          severity: securityEvent.severity,
          user_id: securityEvent.user_id,
          details: securityEvent.details,
          status: 'active'
        })
      );
    });

    it('should implement real-time security monitoring', async () => {
      const monitoringConfig = {
        check_interval: 60000, // 1 minute
        patterns: [
          'failed_auth_attempts',
          'bulk_data_access',
          'privilege_escalation',
          'cross_user_access'
        ]
      };

      const mockPatternResults = [
        { pattern: 'failed_auth_attempts', detected: true, count: 2 },
        { pattern: 'bulk_data_access', detected: false, count: 0 },
        { pattern: 'privilege_escalation', detected: false, count: 0 },
        { pattern: 'cross_user_access', detected: true, count: 1 }
      ];

      mockSupabase.rpc.mockResolvedValue({
        data: mockPatternResults,
        error: null
      });

      const monitoringResults = await securityMonitor.runSecurityMonitoring(
        monitoringConfig
      );

      expect(monitoringResults.patterns_checked).toBe(4);
      expect(monitoringResults.threats_detected).toBe(2);
      expect(monitoringResults.alerts_generated).toBeGreaterThan(0);
    });
  });

  describe('Audit Log Integrity Validation', () => {
    it('should validate audit log integrity with checksums', async () => {
      const auditLogEntry = {
        id: 'audit-1',
        user_id: 'user-123',
        action: 'file_upload',
        resource_type: 'file',
        resource_id: 'file-456',
        created_at: '2024-01-15T10:30:00Z',
        details: { file_size: 1024 }
      };

      // Calculate expected checksum
      const expectedChecksum = await auditLogger.calculateChecksum(auditLogEntry);

      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: {
          ...auditLogEntry,
          checksum: expectedChecksum
        },
        error: null
      });

      const integrityCheck = await auditLogger.validateLogIntegrity('audit-1');

      expect(integrityCheck.valid).toBe(true);
      expect(integrityCheck.checksum_match).toBe(true);
    });

    it('should detect audit log tampering', async () => {
      const originalEntry = {
        id: 'audit-1',
        user_id: 'user-123',
        action: 'file_upload',
        created_at: '2024-01-15T10:30:00Z'
      };

      const tamperedEntry = {
        id: 'audit-1',
        user_id: 'user-123',
        action: 'file_delete', // Changed action
        created_at: '2024-01-15T10:30:00Z'
      };

      const originalChecksum = await auditLogger.calculateChecksum(originalEntry);

      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: {
          ...tamperedEntry,
          checksum: originalChecksum // Checksum doesn't match tampered data
        },
        error: null
      });

      const integrityCheck = await auditLogger.validateLogIntegrity('audit-1');

      expect(integrityCheck.valid).toBe(false);
      expect(integrityCheck.checksum_match).toBe(false);
      expect(integrityCheck.tampering_detected).toBe(true);
    });

    it('should implement audit log immutability', async () => {
      const auditLogId = 'audit-1';

      // Attempt to update audit log (should fail)
      mockSupabase.from().update().eq.mockResolvedValue({
        data: [],
        error: { message: 'Audit logs are immutable' }
      });

      const updateAttempt = await auditLogger.updateAuditLog(auditLogId, {
        action: 'modified_action'
      });

      expect(updateAttempt.success).toBe(false);
      expect(updateAttempt.error).toContain('immutable');

      // Attempt to delete audit log (should fail)
      mockSupabase.from().delete().eq.mockResolvedValue({
        data: [],
        error: { message: 'Audit logs cannot be deleted' }
      });

      const deleteAttempt = await auditLogger.deleteAuditLog(auditLogId);

      expect(deleteAttempt.success).toBe(false);
      expect(deleteAttempt.error).toContain('cannot be deleted');
    });

    it('should validate audit log sequence integrity', async () => {
      const auditLogSequence = [
        { id: 'audit-1', sequence_number: 1, previous_hash: null },
        { id: 'audit-2', sequence_number: 2, previous_hash: 'hash-of-audit-1' },
        { id: 'audit-3', sequence_number: 3, previous_hash: 'hash-of-audit-2' },
        { id: 'audit-4', sequence_number: 4, previous_hash: 'hash-of-audit-3' }
      ];

      mockSupabase.from().select().order().mockResolvedValue({
        data: auditLogSequence,
        error: null
      });

      const sequenceValidation = await auditLogger.validateLogSequence();

      expect(sequenceValidation.valid).toBe(true);
      expect(sequenceValidation.sequence_intact).toBe(true);
      expect(sequenceValidation.missing_entries).toHaveLength(0);
    });

    it('should detect missing audit log entries', async () => {
      const incompleteSequence = [
        { id: 'audit-1', sequence_number: 1 },
        { id: 'audit-2', sequence_number: 2 },
        // audit-3 is missing
        { id: 'audit-4', sequence_number: 4 },
        { id: 'audit-5', sequence_number: 5 }
      ];

      mockSupabase.from().select().order().mockResolvedValue({
        data: incompleteSequence,
        error: null
      });

      const sequenceValidation = await auditLogger.validateLogSequence();

      expect(sequenceValidation.valid).toBe(false);
      expect(sequenceValidation.missing_entries).toContain(3);
      expect(sequenceValidation.sequence_intact).toBe(false);
    });

    it('should implement audit log backup and archival', async () => {
      const archivalDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // 1 year ago

      mockSupabase.from().select().gte().lte().mockResolvedValue({
        data: [
          { id: 'audit-old-1', created_at: archivalDate.toISOString() },
          { id: 'audit-old-2', created_at: archivalDate.toISOString() }
        ],
        error: null
      });

      const archivalResult = await auditLogger.archiveOldLogs(archivalDate);

      expect(archivalResult.success).toBe(true);
      expect(archivalResult.archived_count).toBe(2);
      expect(archivalResult.backup_location).toBeDefined();
    });

    it('should validate audit log export integrity', async () => {
      const exportRequest = {
        user_id: 'admin-123',
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        format: 'json'
      };

      mockSupabase.from().select().gte().lte().order().mockResolvedValue({
        data: [
          { id: 'audit-1', action: 'file_upload' },
          { id: 'audit-2', action: 'file_delete' }
        ],
        error: null
      });

      const exportResult = await auditLogger.exportAuditLogs(exportRequest);

      expect(exportResult.success).toBe(true);
      expect(exportResult.export_checksum).toBeDefined();
      expect(exportResult.record_count).toBe(2);
      expect(exportResult.export_integrity).toBe('verified');
    });
  });

  describe('Audit Log Performance and Scalability', () => {
    it('should handle high-volume audit log generation', async () => {
      const batchSize = 1000;
      const auditEntries = Array.from({ length: batchSize }, (_, i) => ({
        user_id: `user-${i % 100}`,
        action: 'api_call',
        resource_type: 'endpoint',
        resource_id: `/api/test-${i}`,
        created_at: new Date().toISOString()
      }));

      mockSupabase.from().insert.mockResolvedValue({
        data: auditEntries.map((_, i) => ({ id: `audit-${i}` })),
        error: null
      });

      const batchResult = await auditLogger.logBatch(auditEntries);

      expect(batchResult.success).toBe(true);
      expect(batchResult.processed_count).toBe(batchSize);
      expect(mockSupabase.from().insert).toHaveBeenCalledWith(auditEntries);
    });

    it('should implement audit log partitioning for performance', async () => {
      const partitionDate = new Date('2024-01-01');
      
      mockSupabase.rpc.mockResolvedValue({
        data: { partition_created: true, partition_name: 'audit_logs_2024_01' },
        error: null
      });

      const partitionResult = await auditLogger.createPartition(partitionDate);

      expect(partitionResult.success).toBe(true);
      expect(partitionResult.partition_name).toBe('audit_logs_2024_01');
      expect(mockSupabase.rpc).toHaveBeenCalledWith('create_audit_log_partition', {
        partition_date: partitionDate.toISOString()
      });
    });

    it('should optimize audit log queries with proper indexing', async () => {
      const queryParams = {
        user_id: 'user-123',
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        action: 'file_upload'
      };

      mockSupabase.from().select().eq().gte().lte().eq().order().limit.mockResolvedValue({
        data: [
          { id: 'audit-1', action: 'file_upload', created_at: '2024-01-15T10:00:00Z' }
        ],
        error: null
      });

      const queryStart = performance.now();
      const queryResult = await auditLogger.queryAuditLogs(queryParams);
      const queryDuration = performance.now() - queryStart;

      expect(queryResult.success).toBe(true);
      expect(queryDuration).toBeLessThan(1000); // Should complete within 1 second
      expect(queryResult.data).toBeDefined();
    });
  });
});