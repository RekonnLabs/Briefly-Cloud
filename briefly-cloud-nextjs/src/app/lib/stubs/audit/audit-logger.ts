/**
 * Minimal audit logging for MVP
 * Provides basic audit trail without complex infrastructure
 */

export type AuditAction = 
  | 'user.login'
  | 'user.logout'
  | 'user.register'
  | 'file.upload'
  | 'file.download'
  | 'file.delete'
  | 'file.share'
  | 'chat.message'
  | 'api.access'
  | 'security.threat'
  | 'system.error';

export type AuditSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: AuditAction;
  severity: AuditSeverity;
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  resource?: string;
  details?: Record<string, any>;
  success: boolean;
}

export interface AuditLogFilter {
  userId?: string;
  action?: AuditAction;
  severity?: AuditSeverity;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

// Simple in-memory audit logger for MVP
class SimpleAuditLogger {
  private logs: AuditLogEntry[] = [];
  private maxLogs = 1000; // Keep only last 1000 logs

  async log(
    action: AuditAction,
    severity: AuditSeverity,
    success: boolean,
    context?: {
      userId?: string;
      sessionId?: string;
      ipAddress?: string;
      userAgent?: string;
      resource?: string;
      details?: Record<string, any>;
    }
  ): Promise<void> {
    const entry: AuditLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action,
      severity,
      success,
      ...context
    };

    this.logs.push(entry);

    // Keep only recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Audit] ${action} (${severity}): ${success ? '✓' : '✗'}`, context);
    }

    // In production, you might want to send to external service
    if (process.env.NODE_ENV === 'production') {
      // TODO: Send to external audit service
    }
  }

  async query(filter: AuditLogFilter = {}): Promise<AuditLogEntry[]> {
    let filtered = [...this.logs];

    if (filter.userId) {
      filtered = filtered.filter(log => log.userId === filter.userId);
    }

    if (filter.action) {
      filtered = filtered.filter(log => log.action === filter.action);
    }

    if (filter.severity) {
      filtered = filtered.filter(log => log.severity === filter.severity);
    }

    if (filter.startDate) {
      filtered = filtered.filter(log => log.timestamp >= filter.startDate!);
    }

    if (filter.endDate) {
      filtered = filtered.filter(log => log.timestamp <= filter.endDate!);
    }

    // Sort by timestamp (newest first)
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply pagination
    const offset = filter.offset || 0;
    const limit = filter.limit || 100;
    
    return filtered.slice(offset, offset + limit);
  }

  async getStats(): Promise<{
    totalLogs: number;
    logsByAction: Record<AuditAction, number>;
    logsBySeverity: Record<AuditSeverity, number>;
    recentErrors: number;
  }> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const logsByAction = {} as Record<AuditAction, number>;
    const logsBySeverity = {} as Record<AuditSeverity, number>;
    let recentErrors = 0;

    for (const log of this.logs) {
      // Count by action
      logsByAction[log.action] = (logsByAction[log.action] || 0) + 1;
      
      // Count by severity
      logsBySeverity[log.severity] = (logsBySeverity[log.severity] || 0) + 1;
      
      // Count recent errors
      if (!log.success && new Date(log.timestamp) > oneHourAgo) {
        recentErrors++;
      }
    }

    return {
      totalLogs: this.logs.length,
      logsByAction,
      logsBySeverity,
      recentErrors
    };
  }

  clear(): void {
    this.logs = [];
  }
}

// Global audit logger instance
let auditLogger: SimpleAuditLogger;

export function getAuditLogger(): SimpleAuditLogger {
  if (!auditLogger) {
    auditLogger = new SimpleAuditLogger();
  }
  return auditLogger;
}

// Utility functions for common audit scenarios
export async function auditUserAction(
  action: AuditAction,
  userId: string,
  success: boolean,
  details?: Record<string, any>,
  severity: AuditSeverity = 'low'
): Promise<void> {
  const logger = getAuditLogger();
  await logger.log(action, severity, success, {
    userId,
    details
  });
}

export async function auditApiAccess(
  endpoint: string,
  userId: string | undefined,
  success: boolean,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  const logger = getAuditLogger();
  await logger.log('api.access', 'low', success, {
    userId,
    resource: endpoint,
    ipAddress,
    userAgent
  });
}

export async function auditSecurityEvent(
  action: AuditAction,
  severity: AuditSeverity,
  details: Record<string, any>,
  userId?: string,
  ipAddress?: string
): Promise<void> {
  const logger = getAuditLogger();
  await logger.log(action, severity, false, {
    userId,
    ipAddress,
    details
  });
}

export async function auditFileOperation(
  operation: 'upload' | 'download' | 'delete' | 'share',
  fileId: string,
  userId: string,
  success: boolean,
  details?: Record<string, any>
): Promise<void> {
  const logger = getAuditLogger();
  const actionMap = {
    upload: 'file.upload' as const,
    download: 'file.download' as const,
    delete: 'file.delete' as const,
    share: 'file.share' as const
  };

  await logger.log(actionMap[operation], 'medium', success, {
    userId,
    resource: fileId,
    details
  });
}
