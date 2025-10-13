/**
 * Apideck Connection Monitoring and Alerting
 * 
 * Provides monitoring capabilities for connection health and automated alerting
 * for connection issues that require attention.
 */

import { 
  performConnectionHealthCheck, 
  refreshExpiredConnections,
  type ConnectionHealthSummary,
  type ConnectionHealthStatus 
} from '@/app/lib/integrations/apideck-health-check';
import { captureApiError } from '@/app/lib/error-monitoring';
import { supabaseAdmin } from '@/app/lib/supabase-admin';

export interface MonitoringAlert {
  type: 'connection_expired' | 'connection_invalid' | 'connection_error' | 'health_check_failed';
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId: string;
  provider?: string;
  connectionId?: string;
  message: string;
  details?: any;
  timestamp: string;
  resolved: boolean;
}

export interface MonitoringReport {
  userId: string;
  reportTime: string;
  healthSummary: ConnectionHealthSummary;
  alerts: MonitoringAlert[];
  recommendations: string[];
  autoActionsPerformed: string[];
}

/**
 * Generate alerts based on connection health status
 */
function generateAlertsFromHealthCheck(
  userId: string, 
  healthSummary: ConnectionHealthSummary
): MonitoringAlert[] {
  const alerts: MonitoringAlert[] = [];
  const timestamp = new Date().toISOString();

  // Check for expired connections
  const expiredConnections = healthSummary.connections.filter(c => c.status === 'expired');
  if (expiredConnections.length > 0) {
    for (const connection of expiredConnections) {
      alerts.push({
        type: 'connection_expired',
        severity: connection.canRefresh ? 'medium' : 'high',
        userId,
        provider: connection.provider,
        connectionId: connection.connectionId,
        message: `${connection.provider} connection has expired and ${connection.canRefresh ? 'can be refreshed' : 'requires manual reconnection'}`,
        details: {
          lastSync: connection.lastSync,
          error: connection.error,
          canRefresh: connection.canRefresh
        },
        timestamp,
        resolved: false
      });
    }
  }

  // Check for invalid connections
  const invalidConnections = healthSummary.connections.filter(c => c.status === 'invalid');
  if (invalidConnections.length > 0) {
    for (const connection of invalidConnections) {
      alerts.push({
        type: 'connection_invalid',
        severity: 'high',
        userId,
        provider: connection.provider,
        connectionId: connection.connectionId,
        message: `${connection.provider} connection is invalid - permissions may have been revoked`,
        details: {
          lastSync: connection.lastSync,
          error: connection.error
        },
        timestamp,
        resolved: false
      });
    }
  }

  // Check for error connections
  const errorConnections = healthSummary.connections.filter(c => c.status === 'error');
  if (errorConnections.length > 0) {
    for (const connection of errorConnections) {
      alerts.push({
        type: 'connection_error',
        severity: 'medium',
        userId,
        provider: connection.provider,
        connectionId: connection.connectionId,
        message: `${connection.provider} connection has errors: ${connection.error}`,
        details: {
          lastSync: connection.lastSync,
          error: connection.error
        },
        timestamp,
        resolved: false
      });
    }
  }

  return alerts;
}

/**
 * Generate recommendations based on health status
 */
function generateRecommendations(healthSummary: ConnectionHealthSummary): string[] {
  const recommendations: string[] = [];

  const expiredCount = healthSummary.expiredConnections;
  const invalidCount = healthSummary.invalidConnections;
  const errorCount = healthSummary.errorConnections;

  if (expiredCount > 0) {
    const refreshableCount = healthSummary.connections.filter(
      c => c.status === 'expired' && c.canRefresh
    ).length;
    
    if (refreshableCount > 0) {
      recommendations.push(`${refreshableCount} expired connection(s) can be automatically refreshed`);
    }
    
    const manualCount = expiredCount - refreshableCount;
    if (manualCount > 0) {
      recommendations.push(`${manualCount} expired connection(s) require manual reconnection`);
    }
  }

  if (invalidCount > 0) {
    recommendations.push(`${invalidCount} invalid connection(s) need to be reconnected - permissions may have been revoked`);
  }

  if (errorCount > 0) {
    recommendations.push(`${errorCount} connection(s) have errors and should be investigated`);
  }

  if (healthSummary.healthyConnections === healthSummary.totalConnections && healthSummary.totalConnections > 0) {
    recommendations.push('All connections are healthy - no action required');
  }

  if (healthSummary.totalConnections === 0) {
    recommendations.push('No connections found - user may need to connect storage providers');
  }

  return recommendations;
}

/**
 * Perform automatic actions based on health status
 */
async function performAutoActions(
  userId: string, 
  healthSummary: ConnectionHealthSummary
): Promise<string[]> {
  const actions: string[] = [];

  try {
    // Auto-refresh expired connections that can be refreshed
    const refreshableConnections = healthSummary.connections.filter(
      c => c.status === 'expired' && c.canRefresh
    );

    if (refreshableConnections.length > 0) {
      console.log('[monitoring:auto-refresh:start]', {
        userId,
        refreshableCount: refreshableConnections.length
      });

      const refreshResults = await refreshExpiredConnections(userId);
      const successfulRefreshes = refreshResults.filter(r => r.success);
      const failedRefreshes = refreshResults.filter(r => !r.success);

      if (successfulRefreshes.length > 0) {
        actions.push(`Auto-refreshed ${successfulRefreshes.length} expired connection(s)`);
      }

      if (failedRefreshes.length > 0) {
        actions.push(`Failed to refresh ${failedRefreshes.length} connection(s) - manual intervention required`);
      }

      console.log('[monitoring:auto-refresh:complete]', {
        userId,
        successful: successfulRefreshes.length,
        failed: failedRefreshes.length
      });
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    actions.push(`Auto-refresh failed: ${errorMessage}`);
    
    console.error('[monitoring:auto-actions:error]', {
      userId,
      error: errorMessage
    });

    // Capture error for monitoring
    captureApiError(
      error instanceof Error ? error : new Error(errorMessage),
      'monitoring-auto-actions-failed',
      userId
    );
  }

  return actions;
}

/**
 * Store monitoring alert in database for tracking
 */
async function storeMonitoringAlert(alert: MonitoringAlert): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('monitoring_alerts')
      .insert({
        user_id: alert.userId,
        alert_type: alert.type,
        severity: alert.severity,
        provider: alert.provider,
        connection_id: alert.connectionId,
        message: alert.message,
        details: alert.details,
        resolved: alert.resolved,
        created_at: alert.timestamp
      });

    if (error) {
      console.error('[monitoring:store-alert:error]', {
        userId: alert.userId,
        alertType: alert.type,
        error: error.message
      });
      // Don't throw - monitoring alerts shouldn't break the main flow
    }
  } catch (error) {
    console.error('[monitoring:store-alert:exception]', {
      userId: alert.userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Perform comprehensive monitoring check for a user
 */
export async function performMonitoringCheck(userId: string): Promise<MonitoringReport> {
  const startTime = Date.now();
  console.log('[monitoring:check:start]', { userId });

  try {
    // Perform health check
    const healthSummary = await performConnectionHealthCheck(userId);

    // Generate alerts
    const alerts = generateAlertsFromHealthCheck(userId, healthSummary);

    // Store alerts in database for tracking
    for (const alert of alerts) {
      await storeMonitoringAlert(alert);
    }

    // Generate recommendations
    const recommendations = generateRecommendations(healthSummary);

    // Perform automatic actions
    const autoActions = await performAutoActions(userId, healthSummary);

    const report: MonitoringReport = {
      userId,
      reportTime: new Date().toISOString(),
      healthSummary,
      alerts,
      recommendations,
      autoActionsPerformed: autoActions
    };

    console.log('[monitoring:check:complete]', {
      userId,
      duration: Date.now() - startTime,
      summary: {
        totalConnections: healthSummary.totalConnections,
        healthyConnections: healthSummary.healthyConnections,
        alertsGenerated: alerts.length,
        autoActionsPerformed: autoActions.length
      }
    });

    return report;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[monitoring:check:error]', {
      userId,
      error: errorMessage,
      duration: Date.now() - startTime
    });

    // Generate error alert
    const errorAlert: MonitoringAlert = {
      type: 'health_check_failed',
      severity: 'critical',
      userId,
      message: `Health check failed: ${errorMessage}`,
      details: { error: errorMessage },
      timestamp: new Date().toISOString(),
      resolved: false
    };

    await storeMonitoringAlert(errorAlert);

    // Capture error for monitoring
    captureApiError(
      error instanceof Error ? error : new Error(errorMessage),
      'monitoring-check-failed',
      userId
    );

    // Return minimal report with error information
    return {
      userId,
      reportTime: new Date().toISOString(),
      healthSummary: {
        userId,
        totalConnections: 0,
        healthyConnections: 0,
        expiredConnections: 0,
        invalidConnections: 0,
        errorConnections: 0,
        lastHealthCheck: new Date().toISOString(),
        connections: []
      },
      alerts: [errorAlert],
      recommendations: ['Health check failed - manual investigation required'],
      autoActionsPerformed: []
    };
  }
}

/**
 * Get recent monitoring alerts for a user
 */
export async function getRecentAlerts(
  userId: string, 
  limit: number = 10
): Promise<MonitoringAlert[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('monitoring_alerts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[monitoring:get-alerts:error]', {
        userId,
        error: error.message
      });
      return [];
    }

    return (data || []).map(row => ({
      type: row.alert_type,
      severity: row.severity,
      userId: row.user_id,
      provider: row.provider,
      connectionId: row.connection_id,
      message: row.message,
      details: row.details,
      timestamp: row.created_at,
      resolved: row.resolved
    }));

  } catch (error) {
    console.error('[monitoring:get-alerts:exception]', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return [];
  }
}