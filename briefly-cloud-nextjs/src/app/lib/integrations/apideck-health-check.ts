/**
 * Apideck Connection Health Check Utilities
 * 
 * Provides functionality to validate connection status, refresh expired connections,
 * and monitor connection health for Apideck integrations.
 */

import { supabaseAdmin } from '@/app/lib/supabase-admin';
import { Apideck, apideckHeaders, isApideckEnabled } from '@/app/lib/integrations/apideck';
import { retryApiCall, RetryError } from '@/app/lib/retry';
import { captureApiError } from '@/app/lib/error-monitoring';

export interface ConnectionHealthStatus {
  provider: string;
  connectionId: string;
  status: 'healthy' | 'expired' | 'invalid' | 'error';
  lastChecked: string;
  lastSync?: string;
  error?: string;
  needsRefresh: boolean;
  canRefresh: boolean;
}

export interface ConnectionHealthSummary {
  userId: string;
  totalConnections: number;
  healthyConnections: number;
  expiredConnections: number;
  invalidConnections: number;
  errorConnections: number;
  lastHealthCheck: string;
  connections: ConnectionHealthStatus[];
}

export interface RefreshResult {
  success: boolean;
  connectionId: string;
  provider: string;
  error?: string;
  newStatus?: string;
}

/**
 * Check if a connection is still active by making a test API call
 */
async function validateConnectionHealth(
  userId: string, 
  connectionId: string, 
  provider: string
): Promise<{ isHealthy: boolean; error?: string }> {
  try {
    // Make a lightweight test call to validate the connection
    // Use file listing with minimal parameters to test connectivity
    const response = await retryApiCall(async () => {
      const res = await fetch(`${process.env.APIDECK_API_BASE_URL}/file-storage/files?limit=1`, {
        headers: { 
          ...apideckHeaders(userId), 
          'x-apideck-connection-id': connectionId 
        }
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`API call failed: ${res.status} ${errorText}`);
      }

      return res.json();
    }, {
      maxAttempts: 2,
      baseDelay: 1000
    });

    return { isHealthy: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Categorize the error to determine if connection needs refresh
    if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
      return { isHealthy: false, error: 'Connection expired - needs refresh' };
    } else if (errorMessage.includes('403') || errorMessage.includes('forbidden')) {
      return { isHealthy: false, error: 'Connection invalid - permissions revoked' };
    } else if (errorMessage.includes('404') || errorMessage.includes('not found')) {
      return { isHealthy: false, error: 'Connection not found - may have been deleted' };
    } else {
      return { isHealthy: false, error: `Connection error: ${errorMessage}` };
    }
  }
}

/**
 * Get stored connection data from database
 */
async function getStoredConnections(userId: string): Promise<Array<{
  provider: string;
  connection_id: string;
  status: string;
  updated_at: string;
}>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('app.apideck_connections')
      .select('provider, connection_id, status, updated_at')
      .eq('user_id', userId);

    if (error) {
      console.error('[health-check:db-error]', {
        userId,
        error: error.message,
        code: error.code
      });
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('[health-check:get-connections-error]', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Update connection status in database
 */
async function updateConnectionStatus(
  userId: string,
  connectionId: string,
  status: string,
  provider: string
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('app.apideck_connections')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('connection_id', connectionId)
      .eq('provider', provider);

    if (error) {
      console.error('[health-check:update-status-error]', {
        userId,
        connectionId,
        provider,
        status,
        error: error.message
      });
      throw error;
    }

    console.log('[health-check:status-updated]', {
      userId,
      connectionId,
      provider,
      newStatus: status
    });
  } catch (error) {
    console.error('[health-check:update-error]', {
      userId,
      connectionId,
      provider,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Perform comprehensive health check on all user connections
 */
export async function performConnectionHealthCheck(userId: string): Promise<ConnectionHealthSummary> {
  if (!isApideckEnabled()) {
    throw new Error('Apideck integration is not enabled');
  }

  const startTime = Date.now();
  console.log('[health-check:start]', { userId, startTime });

  try {
    // Get all stored connections for the user
    const storedConnections = await getStoredConnections(userId);
    
    const healthStatuses: ConnectionHealthStatus[] = [];
    let healthyCount = 0;
    let expiredCount = 0;
    let invalidCount = 0;
    let errorCount = 0;

    // Check health of each connection
    for (const connection of storedConnections) {
      const checkStartTime = Date.now();
      
      try {
        const healthCheck = await validateConnectionHealth(
          userId,
          connection.connection_id,
          connection.provider
        );

        let status: ConnectionHealthStatus['status'];
        let needsRefresh = false;
        let canRefresh = true;

        if (healthCheck.isHealthy) {
          status = 'healthy';
          healthyCount++;
        } else if (healthCheck.error?.includes('expired')) {
          status = 'expired';
          needsRefresh = true;
          expiredCount++;
        } else if (healthCheck.error?.includes('invalid') || healthCheck.error?.includes('revoked')) {
          status = 'invalid';
          needsRefresh = true;
          canRefresh = false; // User needs to manually reconnect
          invalidCount++;
        } else {
          status = 'error';
          errorCount++;
        }

        const healthStatus: ConnectionHealthStatus = {
          provider: connection.provider,
          connectionId: connection.connection_id,
          status,
          lastChecked: new Date().toISOString(),
          lastSync: connection.updated_at,
          error: healthCheck.error,
          needsRefresh,
          canRefresh
        };

        healthStatuses.push(healthStatus);

        // Update database status if it has changed
        if (status !== connection.status) {
          await updateConnectionStatus(
            userId,
            connection.connection_id,
            status,
            connection.provider
          );
        }

        console.log('[health-check:connection-checked]', {
          userId,
          provider: connection.provider,
          connectionId: connection.connection_id,
          status,
          duration: Date.now() - checkStartTime,
          needsRefresh,
          canRefresh
        });

      } catch (error) {
        errorCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        healthStatuses.push({
          provider: connection.provider,
          connectionId: connection.connection_id,
          status: 'error',
          lastChecked: new Date().toISOString(),
          lastSync: connection.updated_at,
          error: errorMessage,
          needsRefresh: false,
          canRefresh: false
        });

        console.error('[health-check:connection-error]', {
          userId,
          provider: connection.provider,
          connectionId: connection.connection_id,
          error: errorMessage,
          duration: Date.now() - checkStartTime
        });

        // Capture error for monitoring
        captureApiError(
          error instanceof Error ? error : new Error(errorMessage),
          'connection-health-check',
          userId,
          `provider:${connection.provider},connectionId:${connection.connection_id}`
        );
      }
    }

    const summary: ConnectionHealthSummary = {
      userId,
      totalConnections: storedConnections.length,
      healthyConnections: healthyCount,
      expiredConnections: expiredCount,
      invalidConnections: invalidCount,
      errorConnections: errorCount,
      lastHealthCheck: new Date().toISOString(),
      connections: healthStatuses
    };

    console.log('[health-check:complete]', {
      userId,
      summary: {
        total: summary.totalConnections,
        healthy: summary.healthyConnections,
        expired: summary.expiredConnections,
        invalid: summary.invalidConnections,
        errors: summary.errorConnections
      },
      duration: Date.now() - startTime
    });

    return summary;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[health-check:failed]', {
      userId,
      error: errorMessage,
      duration: Date.now() - startTime
    });

    // Capture error for monitoring
    captureApiError(
      error instanceof Error ? error : new Error(errorMessage),
      'connection-health-check-failed',
      userId
    );

    throw error;
  }
}
/**

 * Attempt to refresh an expired connection by fetching latest status from Apideck
 */
export async function refreshConnection(
  userId: string,
  connectionId: string,
  provider: string
): Promise<RefreshResult> {
  if (!isApideckEnabled()) {
    return {
      success: false,
      connectionId,
      provider,
      error: 'Apideck integration is not enabled'
    };
  }

  console.log('[connection-refresh:start]', {
    userId,
    connectionId,
    provider
  });

  try {
    // Fetch latest connection data from Apideck
    const connectionsResponse = await retryApiCall(async () => {
      return await Apideck.listConnections(userId);
    }, {
      maxAttempts: 3,
      baseDelay: 1000
    }) as any;

    const connections = connectionsResponse?.data || [];
    const targetConnection = connections.find((conn: any) => 
      conn.connection_id === connectionId
    );

    if (!targetConnection) {
      // Connection no longer exists in Apideck
      await updateConnectionStatus(userId, connectionId, 'invalid', provider);
      
      return {
        success: false,
        connectionId,
        provider,
        error: 'Connection no longer exists in Apideck'
      };
    }

    // Update local database with latest status
    const newStatus = targetConnection.status || 'connected';
    await updateConnectionStatus(userId, connectionId, newStatus, provider);

    // Validate the refreshed connection
    const healthCheck = await validateConnectionHealth(userId, connectionId, provider);

    if (healthCheck.isHealthy) {
      console.log('[connection-refresh:success]', {
        userId,
        connectionId,
        provider,
        newStatus
      });

      return {
        success: true,
        connectionId,
        provider,
        newStatus
      };
    } else {
      console.log('[connection-refresh:still-unhealthy]', {
        userId,
        connectionId,
        provider,
        newStatus,
        error: healthCheck.error
      });

      return {
        success: false,
        connectionId,
        provider,
        error: healthCheck.error || 'Connection still unhealthy after refresh'
      };
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[connection-refresh:error]', {
      userId,
      connectionId,
      provider,
      error: errorMessage
    });

    // Capture error for monitoring
    captureApiError(
      error instanceof Error ? error : new Error(errorMessage),
      'connection-refresh-failed',
      userId,
      `provider:${provider},connectionId:${connectionId}`
    );

    return {
      success: false,
      connectionId,
      provider,
      error: errorMessage
    };
  }
}

/**
 * Refresh all expired connections for a user
 */
export async function refreshExpiredConnections(userId: string): Promise<RefreshResult[]> {
  console.log('[refresh-expired:start]', { userId });

  try {
    // First perform health check to identify expired connections
    const healthSummary = await performConnectionHealthCheck(userId);
    
    const expiredConnections = healthSummary.connections.filter(
      conn => conn.status === 'expired' && conn.canRefresh
    );

    if (expiredConnections.length === 0) {
      console.log('[refresh-expired:none-found]', { userId });
      return [];
    }

    console.log('[refresh-expired:found]', {
      userId,
      expiredCount: expiredConnections.length,
      connections: expiredConnections.map(c => ({
        provider: c.provider,
        connectionId: c.connectionId
      }))
    });

    // Refresh each expired connection
    const refreshResults: RefreshResult[] = [];
    
    for (const connection of expiredConnections) {
      const result = await refreshConnection(
        userId,
        connection.connectionId,
        connection.provider
      );
      refreshResults.push(result);
    }

    const successCount = refreshResults.filter(r => r.success).length;
    const failureCount = refreshResults.filter(r => !r.success).length;

    console.log('[refresh-expired:complete]', {
      userId,
      totalAttempted: refreshResults.length,
      successful: successCount,
      failed: failureCount
    });

    return refreshResults;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[refresh-expired:error]', {
      userId,
      error: errorMessage
    });

    // Capture error for monitoring
    captureApiError(
      error instanceof Error ? error : new Error(errorMessage),
      'refresh-expired-connections-failed',
      userId
    );

    throw error;
  }
}

/**
 * Get quick connection status without full health check
 * Useful for dashboard display
 */
export async function getConnectionStatus(userId: string): Promise<{
  google?: { connected: boolean; status: string; lastSync?: string; needsRefresh?: boolean };
  microsoft?: { connected: boolean; status: string; lastSync?: string; needsRefresh?: boolean };
}> {
  try {
    const connections = await getStoredConnections(userId);
    
    const google = connections.find(c => c.provider === 'google');
    const microsoft = connections.find(c => c.provider === 'microsoft');

    const result: any = {};

    if (google) {
      result.google = {
        connected: google.status === 'healthy' || google.status === 'connected',
        status: google.status,
        lastSync: google.updated_at,
        needsRefresh: google.status === 'expired'
      };
    }

    if (microsoft) {
      result.microsoft = {
        connected: microsoft.status === 'healthy' || microsoft.status === 'connected',
        status: microsoft.status,
        lastSync: microsoft.updated_at,
        needsRefresh: microsoft.status === 'expired'
      };
    }

    return result;

  } catch (error) {
    console.error('[get-connection-status:error]', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    // Return safe defaults on error
    return {
      google: { connected: false, status: 'error' },
      microsoft: { connected: false, status: 'error' }
    };
  }
}

/**
 * Schedule automatic health checks and refresh for a user
 * This would typically be called by a background job or cron
 */
export async function performAutomaticMaintenance(userId: string): Promise<{
  healthCheck: ConnectionHealthSummary;
  refreshResults: RefreshResult[];
}> {
  console.log('[automatic-maintenance:start]', { userId });

  try {
    // Perform health check
    const healthCheck = await performConnectionHealthCheck(userId);
    
    // Automatically refresh expired connections
    const refreshResults = await refreshExpiredConnections(userId);

    console.log('[automatic-maintenance:complete]', {
      userId,
      healthySummary: {
        total: healthCheck.totalConnections,
        healthy: healthCheck.healthyConnections,
        expired: healthCheck.expiredConnections,
        refreshed: refreshResults.filter(r => r.success).length
      }
    });

    return {
      healthCheck,
      refreshResults
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[automatic-maintenance:error]', {
      userId,
      error: errorMessage
    });

    // Capture error for monitoring
    captureApiError(
      error instanceof Error ? error : new Error(errorMessage),
      'automatic-maintenance-failed',
      userId
    );

    throw error;
  }
}