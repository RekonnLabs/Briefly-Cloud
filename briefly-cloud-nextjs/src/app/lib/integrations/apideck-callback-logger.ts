/**
 * Comprehensive logging utilities for Apideck OAuth callback processing
 * Provides structured logging, performance monitoring, and debugging support
 */

import { getErrorMonitoring, capturePerformanceMetric } from '@/app/lib/error-monitoring';

export interface CallbackLogContext {
  userId?: string;
  correlationId?: string;
  provider?: string;
  connectionId?: string;
  operation?: string;
  timestamp?: string;
}

export interface CallbackPerformanceMetrics {
  startTime: number;
  apiCallDuration?: number;
  dbOperationDuration?: number;
  totalDuration?: number;
  connectionCount?: number;
  retryAttempts?: number;
}

export interface CallbackProcessingStats {
  totalConnections: number;
  successfulConnections: number;
  failedConnections: number;
  retryableFailures: number;
  nonRetryableFailures: number;
  averageProcessingTime: number;
  errors: Array<{
    connection: any;
    error: string;
    category: string;
    retryable: boolean;
  }>;
}

export class ApideckCallbackLogger {
  private metrics: CallbackPerformanceMetrics;
  private context: CallbackLogContext;
  private monitoring = getErrorMonitoring();

  constructor(context: CallbackLogContext) {
    this.context = {
      ...context,
      timestamp: new Date().toISOString()
    };
    this.metrics = {
      startTime: Date.now()
    };

    // Set monitoring context
    this.monitoring.setTag('operation', 'apideck_oauth_callback');
    if (context.userId) {
      this.monitoring.setUser(context.userId);
    }
  }

  // Log callback initiation
  logCallbackStart(additionalContext?: Record<string, any>) {
    const logData = {
      event: 'apideck_callback_start',
      ...this.context,
      ...additionalContext,
      environment: {
        apideckEnabled: process.env.APIDECK_VAULT_BASE_URL ? true : false,
        siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
        nodeEnv: process.env.NODE_ENV
      }
    };

    console.log('[apideck:callback:start]', logData);
    
    this.monitoring.captureMessage(
      'Apideck OAuth callback initiated',
      'info',
      { ...this.context, ...additionalContext }
    );
  }

  // Log authentication validation
  logAuthValidation(isAuthenticated: boolean, authDetails?: Record<string, any>) {
    const logData = {
      event: 'apideck_callback_auth_validation',
      ...this.context,
      authenticated: isAuthenticated,
      ...authDetails
    };

    console.log('[apideck:callback:auth-validation]', logData);

    if (!isAuthenticated) {
      this.monitoring.captureMessage(
        'Apideck callback accessed without authentication',
        'warning',
        this.context
      );
    }
  }

  // Log API call to Apideck
  logApiCallStart(endpoint: string) {
    const logData = {
      event: 'apideck_api_call_start',
      ...this.context,
      endpoint,
      apiCallStartTime: Date.now()
    };

    console.log('[apideck:callback:api-call-start]', logData);
    this.metrics.apiCallDuration = Date.now();
  }

  // Log API call completion
  logApiCallComplete(response: any, error?: Error) {
    const duration = this.metrics.apiCallDuration ? Date.now() - this.metrics.apiCallDuration : 0;
    this.metrics.apiCallDuration = duration;

    const logData = {
      event: 'apideck_api_call_complete',
      ...this.context,
      duration,
      success: !error,
      responseDataLength: response?.data?.length || 0,
      error: error?.message
    };

    console.log('[apideck:callback:api-call-complete]', logData);

    // Capture performance metric
    capturePerformanceMetric(
      'apideck_api_list_connections',
      duration,
      !error,
      this.context.userId
    );

    if (error) {
      this.monitoring.captureError(error, { ...this.context });
    }
  }

  // Log API retry attempt
  logApiRetry(attempt: number, error: Error, nextRetryDelay: number) {
    const logData = {
      event: 'apideck_api_retry',
      ...this.context,
      attempt,
      error: error.message,
      nextRetryIn: nextRetryDelay,
      totalApiDuration: this.metrics.apiCallDuration ? Date.now() - this.metrics.apiCallDuration : 0
    };

    console.log('[apideck:callback:api-retry]', logData);
    
    this.monitoring.captureMessage(
      `Apideck API retry attempt ${attempt}: ${error.message}`,
      'warning',
      { ...this.context }
    );
  }

  // Log connection processing start
  logConnectionProcessingStart(connections: any[]) {
    const logData = {
      event: 'apideck_connections_processing_start',
      ...this.context,
      totalConnections: connections.length,
      connections: connections.map(c => ({
        service_id: c.service_id,
        connection_id: c.connection_id,
        status: c.status,
        hasRequiredFields: !!(c.connection_id && c.service_id)
      }))
    };

    console.log('[apideck:callback:connections-processing-start]', logData);
    this.metrics.connectionCount = connections.length;
  }

  // Log individual connection processing
  logConnectionProcessing(connection: any, provider: string, operation: 'start' | 'success' | 'error', error?: any) {
    const logData = {
      event: `apideck_connection_${operation}`,
      ...this.context,
      provider,
      connectionId: connection.connection_id,
      serviceId: connection.service_id,
      status: connection.status,
      error: error?.message,
      errorCode: error?.code,
      errorCategory: error?.category
    };

    const logLevel = operation === 'error' ? 'error' : 'info';
    console[logLevel === 'error' ? 'error' : 'log'](`[apideck:callback:connection-${operation}]`, logData);

    if (operation === 'error' && error) {
      this.monitoring.captureError(
        error instanceof Error ? error : new Error(error.message || 'Connection processing error'),
        { ...this.context }
      );
    }
  }

  // Log database operation
  logDatabaseOperation(operation: 'start' | 'success' | 'error' | 'retry', details: Record<string, any>) {
    const dbStartTime = details.startTime || Date.now();
    const duration = operation !== 'start' ? Date.now() - dbStartTime : 0;

    const logData = {
      event: `apideck_db_operation_${operation}`,
      ...this.context,
      operation: 'connection_upsert',
      duration,
      ...details
    };

    const logLevel = operation === 'error' ? 'error' : 'log';
    console[logLevel](`[apideck:callback:db-${operation}]`, logData);

    if (operation === 'success' || operation === 'error') {
      capturePerformanceMetric(
        'apideck_db_connection_upsert',
        duration,
        operation === 'success',
        this.context.userId
      );
    }

    if (operation === 'retry') {
      this.monitoring.captureMessage(
        `Database operation retry: ${details.error}`,
        'warning',
        { ...this.context, ...details }
      );
    }
  }

  // Log processing completion with comprehensive stats
  logProcessingComplete(stats: CallbackProcessingStats) {
    const totalDuration = Date.now() - this.metrics.startTime;
    this.metrics.totalDuration = totalDuration;

    const logData = {
      event: 'apideck_callback_processing_complete',
      ...this.context,
      duration: totalDuration,
      apiCallDuration: this.metrics.apiCallDuration,
      stats: {
        ...stats,
        successRate: stats.totalConnections > 0 ? 
          (stats.successfulConnections / stats.totalConnections * 100).toFixed(2) + '%' : '0%',
        retryableFailureRate: stats.totalConnections > 0 ? 
          (stats.retryableFailures / stats.totalConnections * 100).toFixed(2) + '%' : '0%'
      },
      performance: {
        totalDuration,
        apiCallDuration: this.metrics.apiCallDuration,
        averageConnectionProcessingTime: stats.averageProcessingTime,
        connectionsPerSecond: stats.totalConnections > 0 ? 
          (stats.totalConnections / (totalDuration / 1000)).toFixed(2) : '0'
      }
    };

    console.log('[apideck:callback:processing-complete]', logData);

    // Capture overall performance metric
    capturePerformanceMetric(
      'apideck_oauth_callback_complete',
      totalDuration,
      stats.failedConnections === 0,
      this.context.userId
    );

    // Log summary message based on results
    let summaryMessage: string;
    let logLevel: 'info' | 'warning' | 'error';

    if (stats.failedConnections === 0) {
      summaryMessage = `Apideck callback completed successfully: ${stats.successfulConnections} connections processed`;
      logLevel = 'info';
    } else if (stats.successfulConnections > 0) {
      summaryMessage = `Apideck callback completed with partial success: ${stats.successfulConnections}/${stats.totalConnections} connections processed`;
      logLevel = 'warning';
    } else {
      summaryMessage = `Apideck callback failed: 0/${stats.totalConnections} connections processed successfully`;
      logLevel = 'error';
    }

    this.monitoring.captureMessage(summaryMessage, logLevel, { ...this.context });
  }

  // Log unexpected errors
  logUnexpectedError(error: Error, operation: string) {
    const duration = Date.now() - this.metrics.startTime;

    const logData = {
      event: 'apideck_callback_unexpected_error',
      ...this.context,
      operation,
      error: error.message,
      stack: error.stack,
      duration
    };

    console.error('[apideck:callback:unexpected-error]', logData);

    this.monitoring.captureError(error, { ...this.context });

    // Capture failed performance metric
    capturePerformanceMetric(
      `apideck_callback_${operation}`,
      duration,
      false,
      this.context.userId
    );
  }

  // Log redirect decision
  logRedirectDecision(redirectType: 'success' | 'partial_success' | 'failure', reason: string, url: string) {
    const logData = {
      event: 'apideck_callback_redirect',
      ...this.context,
      redirectType,
      reason,
      url,
      totalDuration: this.metrics.totalDuration || Date.now() - this.metrics.startTime
    };

    console.log('[apideck:callback:redirect]', logData);

    this.monitoring.captureMessage(
      `Apideck callback redirect: ${redirectType} - ${reason}`,
      redirectType === 'failure' ? 'error' : 'info',
      { ...this.context }
    );
  }

  // Get current metrics for external use
  getMetrics(): CallbackPerformanceMetrics & { currentDuration: number } {
    return {
      ...this.metrics,
      currentDuration: Date.now() - this.metrics.startTime
    };
  }

  // Create child logger for specific operations
  createChildLogger(additionalContext: Partial<CallbackLogContext>): ApideckCallbackLogger {
    return new ApideckCallbackLogger({
      ...this.context,
      ...additionalContext
    });
  }
}

// Utility function to create logger with correlation ID
export function createCallbackLogger(context: CallbackLogContext): ApideckCallbackLogger {
  return new ApideckCallbackLogger({
    ...context,
    correlationId: context.correlationId || crypto.randomUUID()
  });
}

// Helper function to extract connection summary for logging
export function summarizeConnections(connections: any[]): Record<string, any> {
  const summary = {
    total: connections.length,
    byProvider: {} as Record<string, number>,
    byStatus: {} as Record<string, number>,
    validConnections: 0,
    invalidConnections: 0
  };

  connections.forEach(conn => {
    // Count by provider (service_id)
    if (conn.service_id) {
      summary.byProvider[conn.service_id] = (summary.byProvider[conn.service_id] || 0) + 1;
    }

    // Count by status
    const status = conn.status || 'unknown';
    summary.byStatus[status] = (summary.byStatus[status] || 0) + 1;

    // Count valid vs invalid
    if (conn.connection_id && conn.service_id) {
      summary.validConnections++;
    } else {
      summary.invalidConnections++;
    }
  });

  return summary;
}