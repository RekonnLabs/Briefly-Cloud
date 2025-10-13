/**
 * Storage Connection Health Check API
 * 
 * GET /api/storage/health - Perform health check on all connections
 * POST /api/storage/health/refresh - Refresh expired connections
 */

import { createProtectedApiHandler, type ApiContext } from '@/app/lib/api-middleware';
import { ApiResponse } from '@/app/lib/api-response';
import { 
  performConnectionHealthCheck, 
  refreshExpiredConnections,
  getConnectionStatus,
  type ConnectionHealthSummary,
  type RefreshResult
} from '@/app/lib/integrations/apideck-health-check';
import { isApideckEnabled } from '@/app/lib/integrations/apideck';

/**
 * GET /api/storage/health
 * Perform comprehensive health check on all user connections
 */
async function getConnectionHealth(request: Request, context: ApiContext) {
  const { user } = context;
  
  if (!user) {
    return ApiResponse.unauthorized('Authentication required');
  }
  
  try {
    if (!isApideckEnabled()) {
      return ApiResponse.ok({
        enabled: false,
        message: 'Apideck integration is not enabled'
      });
    }

    // Check if this is a quick status check or full health check
    const url = new URL(request.url);
    const quick = url.searchParams.get('quick') === 'true';

    if (quick) {
      // Return quick status without full health validation
      const status = await getConnectionStatus(user.id);
      return ApiResponse.ok({
        enabled: true,
        quick: true,
        status
      });
    }

    // Perform full health check
    const healthSummary = await performConnectionHealthCheck(user.id);
    
    return ApiResponse.ok({
      enabled: true,
      quick: false,
      health: healthSummary
    });

  } catch (error) {
    console.error('[storage:health:error]', {
      userId: user.id,
      correlationId: context.correlationId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return ApiResponse.serverError('Failed to check connection health');
  }
}

/**
 * POST /api/storage/health/refresh
 * Refresh expired connections
 */
async function refreshConnections(request: Request, context: ApiContext) {
  const { user } = context;
  
  if (!user) {
    return ApiResponse.unauthorized('Authentication required');
  }
  
  try {
    if (!isApideckEnabled()) {
      return ApiResponse.badRequest('Apideck integration is not enabled');
    }

    const body = await request.json().catch(() => ({}));
    const { connectionId, provider } = body;

    let refreshResults: RefreshResult[];

    if (connectionId && provider) {
      // Refresh specific connection
      const { refreshConnection } = await import('@/app/lib/integrations/apideck-health-check');
      const result = await refreshConnection(user.id, connectionId, provider);
      refreshResults = [result];
    } else {
      // Refresh all expired connections
      refreshResults = await refreshExpiredConnections(user.id);
    }

    const successCount = refreshResults.filter(r => r.success).length;
    const failureCount = refreshResults.filter(r => !r.success).length;

    return ApiResponse.ok({
      refreshed: refreshResults,
      summary: {
        total: refreshResults.length,
        successful: successCount,
        failed: failureCount
      }
    });

  } catch (error) {
    console.error('[storage:health:refresh:error]', {
      userId: user.id,
      correlationId: context.correlationId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return ApiResponse.serverError('Failed to refresh connections');
  }
}

export const GET = createProtectedApiHandler(getConnectionHealth);
export const POST = createProtectedApiHandler(refreshConnections);