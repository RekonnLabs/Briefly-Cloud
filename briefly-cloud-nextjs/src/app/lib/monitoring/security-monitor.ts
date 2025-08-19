/**
 * Production Security Monitoring System
 * Real-time security event monitoring and alerting
 */

import { supabaseAdmin } from '@/app/lib/supabase-admin';
import { logger } from '@/app/lib/logger';

export interface SecurityEvent {
  id?: string;
  type: SecurityEventType;
  severity: SecuritySeverity;
  source: string;
  user_id?: string;
  ip_address?: string;
  user_agent?: string;
  metadata: Record<string, any>;
  timestamp: Date;
}

export enum SecurityEventType {
  AUTHENTICATION_FAILURE = 'auth_failure',
  AUTHORIZATION_VIOLATION = 'auth_violation',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  DATA_ACCESS_VIOLATION = 'data_access_violation',
  ADMIN_ACTION = 'admin_action',
  SECURITY_CONFIGURATION_CHANGE = 'security_config_change',
  MALICIOUS_REQUEST = 'malicious_request',
  BRUTE_FORCE_ATTEMPT = 'brute_force_attempt',
  PRIVILEGE_ESCALATION = 'privilege_escalation'
}

export enum SecuritySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface SecurityMetrics {
  timestamp: Date;
  authentication_failures: number;
  authorization_violations: number;
  rate_limit_violations: number;
  suspicious_activities: number;
  active_sessions: number;
  failed_login_attempts: number;
  unique_ips: number;
  security_events_per_hour: number;
}

export class SecurityMonitor {
  private alertThresholds: Map<SecurityEventType, number>;
  private eventBuffer: SecurityEvent[];
  private metricsCache: SecurityMetrics | null = null;
  private lastMetricsUpdate: Date | null = null;

  constructor() {
    this.eventBuffer = [];
    this.initializeAlertThresholds();
  }

  private initializeAlertThresholds() {
    this.alertThresholds = new Map([
      [SecurityEventType.AUTHENTICATION_FAILURE, 10], // 10 failures per minute
      [SecurityEventType.AUTHORIZATION_VIOLATION, 5],  // 5 violations per minute
      [SecurityEventType.RATE_LIMIT_EXCEEDED, 20],     // 20 rate limit hits per minute
      [SecurityEventType.BRUTE_FORCE_ATTEMPT, 3],      // 3 brute force attempts per minute
      [SecurityEventType.PRIVILEGE_ESCALATION, 1],     // Any privilege escalation
      [SecurityEventType.MALICIOUS_REQUEST, 5],        // 5 malicious requests per minute
    ]);
  }

  /**
   * Log a security event and trigger real-time monitoring
   */
  async logSecurityEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): Promise<void> {
    const securityEvent: SecurityEvent = {
      ...event,
      timestamp: new Date()
    };

    // Add to buffer for real-time analysis
    this.eventBuffer.push(securityEvent);

    // Store in database
    await this.storeSecurityEvent(securityEvent);

    // Log to audit system
    logger.warn('Security event logged', {
      type: event.type,
      severity: event.severity,
      source: event.source,
      user_id: event.user_id,
      ip_address: event.ip_address,
      user_agent: event.user_agent,
      ...event.metadata
    });

    // Check for immediate alerts
    await this.checkAlertThresholds(event.type);

    // Analyze for suspicious patterns
    await this.analyzeSuspiciousPatterns(securityEvent);

    // Clean old events from buffer
    this.cleanEventBuffer();
  }

  /**
   * Store security event in database
   */
  private async storeSecurityEvent(event: SecurityEvent): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('private.security_events')
        .insert({
          type: event.type,
          severity: event.severity,
          source: event.source,
          user_id: event.user_id,
          ip_address: event.ip_address,
          user_agent: event.user_agent,
          metadata: event.metadata,
          created_at: event.timestamp.toISOString()
        });

      if (error) {
        console.error('Failed to store security event:', error);
      }
    } catch (error) {
      console.error('Error storing security event:', error);
    }
  }

  /**
   * Check if alert thresholds are exceeded
   */
  private async checkAlertThresholds(eventType: SecurityEventType): Promise<void> {
    const threshold = this.alertThresholds.get(eventType);
    if (!threshold) return;

    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recentEvents = this.eventBuffer.filter(
      event => event.type === eventType && event.timestamp > oneMinuteAgo
    );

    if (recentEvents.length >= threshold) {
      await this.triggerSecurityAlert({
        type: 'THRESHOLD_EXCEEDED',
        severity: SecuritySeverity.HIGH,
        message: `${eventType} threshold exceeded: ${recentEvents.length}/${threshold} events in 1 minute`,
        events: recentEvents,
        threshold,
        actual_count: recentEvents.length
      });
    }
  }

  /**
   * Analyze patterns for suspicious activity
   */
  private async analyzeSuspiciousPatterns(event: SecurityEvent): Promise<void> {
    // Check for brute force patterns
    if (event.type === SecurityEventType.AUTHENTICATION_FAILURE) {
      await this.detectBruteForceAttempts(event);
    }

    // Check for privilege escalation patterns
    if (event.type === SecurityEventType.ADMIN_ACTION) {
      await this.detectPrivilegeEscalation(event);
    }

    // Check for data access patterns
    if (event.type === SecurityEventType.DATA_ACCESS_VIOLATION) {
      await this.detectDataAccessAnomalies(event);
    }

    // Check for geographic anomalies
    await this.detectGeographicAnomalies(event);
  }

  /**
   * Detect brute force attack patterns
   */
  private async detectBruteForceAttempts(event: SecurityEvent): Promise<void> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    // Check for multiple failures from same IP
    const ipFailures = this.eventBuffer.filter(
      e => e.type === SecurityEventType.AUTHENTICATION_FAILURE &&
           e.ip_address === event.ip_address &&
           e.timestamp > fiveMinutesAgo
    );

    if (ipFailures.length >= 5) {
      await this.logSecurityEvent({
        type: SecurityEventType.BRUTE_FORCE_ATTEMPT,
        severity: SecuritySeverity.CRITICAL,
        source: 'security_monitor',
        ip_address: event.ip_address,
        metadata: {
          failure_count: ipFailures.length,
          time_window: '5_minutes',
          original_event: event
        }
      });
    }

    // Check for multiple failures for same user
    if (event.user_id) {
      const userFailures = this.eventBuffer.filter(
        e => e.type === SecurityEventType.AUTHENTICATION_FAILURE &&
             e.user_id === event.user_id &&
             e.timestamp > fiveMinutesAgo
      );

      if (userFailures.length >= 3) {
        await this.triggerSecurityAlert({
          type: 'USER_BRUTE_FORCE',
          severity: SecuritySeverity.HIGH,
          message: `Multiple authentication failures for user ${event.user_id}`,
          user_id: event.user_id,
          failure_count: userFailures.length,
          events: userFailures
        });
      }
    }
  }

  /**
   * Detect privilege escalation attempts
   */
  private async detectPrivilegeEscalation(event: SecurityEvent): Promise<void> {
    if (!event.user_id) return;

    // Check if user recently had authentication issues
    const recentAuthFailures = this.eventBuffer.filter(
      e => e.type === SecurityEventType.AUTHENTICATION_FAILURE &&
           e.user_id === event.user_id &&
           e.timestamp > new Date(Date.now() - 10 * 60 * 1000) // 10 minutes
    );

    if (recentAuthFailures.length > 0) {
      await this.logSecurityEvent({
        type: SecurityEventType.PRIVILEGE_ESCALATION,
        severity: SecuritySeverity.CRITICAL,
        source: 'security_monitor',
        user_id: event.user_id,
        metadata: {
          admin_action: event.metadata,
          recent_auth_failures: recentAuthFailures.length,
          suspicious_pattern: 'admin_action_after_auth_failure'
        }
      });
    }
  }

  /**
   * Detect data access anomalies
   */
  private async detectDataAccessAnomalies(event: SecurityEvent): Promise<void> {
    if (!event.user_id) return;

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    // Check for excessive data access attempts
    const dataAccessEvents = this.eventBuffer.filter(
      e => e.type === SecurityEventType.DATA_ACCESS_VIOLATION &&
           e.user_id === event.user_id &&
           e.timestamp > oneHourAgo
    );

    if (dataAccessEvents.length >= 10) {
      await this.triggerSecurityAlert({
        type: 'EXCESSIVE_DATA_ACCESS',
        severity: SecuritySeverity.HIGH,
        message: `Excessive data access violations for user ${event.user_id}`,
        user_id: event.user_id,
        violation_count: dataAccessEvents.length,
        events: dataAccessEvents
      });
    }
  }

  /**
   * Detect geographic anomalies
   */
  private async detectGeographicAnomalies(event: SecurityEvent): Promise<void> {
    if (!event.user_id || !event.ip_address) return;

    // This would integrate with IP geolocation service
    // For now, we'll implement basic IP change detection
    const recentEvents = this.eventBuffer.filter(
      e => e.user_id === event.user_id &&
           e.ip_address &&
           e.ip_address !== event.ip_address &&
           e.timestamp > new Date(Date.now() - 30 * 60 * 1000) // 30 minutes
    );

    if (recentEvents.length > 0) {
      await this.triggerSecurityAlert({
        type: 'GEOGRAPHIC_ANOMALY',
        severity: SecuritySeverity.MEDIUM,
        message: `User ${event.user_id} accessing from multiple IP addresses`,
        user_id: event.user_id,
        current_ip: event.ip_address,
        previous_ips: recentEvents.map(e => e.ip_address),
        time_window: '30_minutes'
      });
    }
  }

  /**
   * Trigger security alert
   */
  private async triggerSecurityAlert(alert: any): Promise<void> {
    console.error('🚨 SECURITY ALERT:', alert);

    // Store alert in database
    try {
      await supabaseAdmin
        .from('private.security_alerts')
        .insert({
          type: alert.type,
          severity: alert.severity,
          message: alert.message,
          metadata: alert,
          created_at: new Date().toISOString()
        });
    } catch (error) {
      console.error('Failed to store security alert:', error);
    }

    // Send notifications based on severity
    await this.sendAlertNotifications(alert);
  }

  /**
   * Send alert notifications
   */
  private async sendAlertNotifications(alert: any): Promise<void> {
    // In production, this would integrate with:
    // - Slack/Teams webhooks
    // - Email notifications
    // - PagerDuty/OpsGenie
    // - SMS alerts for critical issues

    if (alert.severity === SecuritySeverity.CRITICAL) {
      // Send immediate notifications
      console.error('🚨 CRITICAL SECURITY ALERT - IMMEDIATE ATTENTION REQUIRED');
      console.error(JSON.stringify(alert, null, 2));
    }
  }

  /**
   * Get real-time security metrics
   */
  async getSecurityMetrics(): Promise<SecurityMetrics> {
    // Return cached metrics if recent
    if (this.metricsCache && this.lastMetricsUpdate) {
      const cacheAge = Date.now() - this.lastMetricsUpdate.getTime();
      if (cacheAge < 60000) { // 1 minute cache
        return this.metricsCache;
      }
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    // Calculate metrics from recent events
    const recentEvents = this.eventBuffer.filter(e => e.timestamp > oneHourAgo);
    
    const metrics: SecurityMetrics = {
      timestamp: new Date(),
      authentication_failures: recentEvents.filter(e => e.type === SecurityEventType.AUTHENTICATION_FAILURE).length,
      authorization_violations: recentEvents.filter(e => e.type === SecurityEventType.AUTHORIZATION_VIOLATION).length,
      rate_limit_violations: recentEvents.filter(e => e.type === SecurityEventType.RATE_LIMIT_EXCEEDED).length,
      suspicious_activities: recentEvents.filter(e => e.type === SecurityEventType.SUSPICIOUS_ACTIVITY).length,
      active_sessions: await this.getActiveSessionCount(),
      failed_login_attempts: recentEvents.filter(e => e.type === SecurityEventType.AUTHENTICATION_FAILURE).length,
      unique_ips: new Set(recentEvents.map(e => e.ip_address).filter(Boolean)).size,
      security_events_per_hour: recentEvents.length
    };

    // Cache metrics
    this.metricsCache = metrics;
    this.lastMetricsUpdate = new Date();

    return metrics;
  }

  /**
   * Get active session count
   */
  private async getActiveSessionCount(): Promise<number> {
    try {
      const { count } = await supabaseAdmin
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('last_login', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      return count || 0;
    } catch (error) {
      console.error('Failed to get active session count:', error);
      return 0;
    }
  }

  /**
   * Get security dashboard data
   */
  async getSecurityDashboard(): Promise<any> {
    const metrics = await this.getSecurityMetrics();
    const recentAlerts = await this.getRecentAlerts();
    const topThreats = await this.getTopThreats();

    return {
      metrics,
      alerts: recentAlerts,
      threats: topThreats,
      status: this.getOverallSecurityStatus(metrics, recentAlerts)
    };
  }

  /**
   * Get recent security alerts
   */
  private async getRecentAlerts(limit = 10): Promise<any[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('private.security_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Failed to get recent alerts:', error);
      return [];
    }
  }

  /**
   * Get top security threats
   */
  private async getTopThreats(): Promise<any[]> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentEvents = this.eventBuffer.filter(e => e.timestamp > oneHourAgo);

    // Group by IP address
    const ipCounts = new Map<string, number>();
    recentEvents.forEach(event => {
      if (event.ip_address) {
        ipCounts.set(event.ip_address, (ipCounts.get(event.ip_address) || 0) + 1);
      }
    });

    // Sort by count and return top threats
    return Array.from(ipCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([ip, count]) => ({
        ip_address: ip,
        event_count: count,
        threat_level: count > 10 ? 'high' : count > 5 ? 'medium' : 'low'
      }));
  }

  /**
   * Get overall security status
   */
  private getOverallSecurityStatus(metrics: SecurityMetrics, alerts: any[]): string {
    const criticalAlerts = alerts.filter(a => a.severity === SecuritySeverity.CRITICAL);
    const highAlerts = alerts.filter(a => a.severity === SecuritySeverity.HIGH);

    if (criticalAlerts.length > 0) return 'critical';
    if (highAlerts.length > 0 || metrics.authentication_failures > 50) return 'warning';
    if (metrics.security_events_per_hour > 100) return 'elevated';
    return 'normal';
  }

  /**
   * Clean old events from buffer to prevent memory issues
   */
  private cleanEventBuffer(): void {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    this.eventBuffer = this.eventBuffer.filter(event => event.timestamp > oneHourAgo);
  }

  /**
   * Start real-time monitoring
   */
  startMonitoring(): void {
    console.log('🔒 Security monitoring started');
    
    // Clean buffer every 5 minutes
    setInterval(() => {
      this.cleanEventBuffer();
    }, 5 * 60 * 1000);

    // Generate metrics every minute
    setInterval(async () => {
      await this.getSecurityMetrics();
    }, 60 * 1000);
  }
}

// Singleton instance
export const securityMonitor = new SecurityMonitor();