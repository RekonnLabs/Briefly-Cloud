/**
 * Storage Connection Monitoring API
 * 
 * GET /api/storage/monitoring - Get comprehensive monitoring report
 */

import { createProtectedApiHandler, type ApiContext } from '@/app/lib/api-middleware';
import { ApiResponse } from '@/app/lib/api-response';
import { 
  performMonitoringCheck,
  getRecentAlerts
} from '@/app/lib/integrations/apideck-monitoring';
import { isApideckEnabled } from '@/app/lib/integrations/apideck';

/**
 * GET /api/storage/monitoring
 * Get comprehensive monitoring report including health summary, alerts, and recommendations
 */
async function getMonitoringReport(request: Request, context: ApiContext) {
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

    // Get query parameters
    const url = new URL(request.url);
    const includeHistory = url.searchParams.get('history') === 'true';
    const alertLimit = parseInt(url.searchParams.get('alertLimit') || '10');

    // Perform monitoring check
    const monitoringReport = await performMonitoringCheck(user.id);
    
    // Get recent alerts if requested
    let recentAlerts: any[] = [];
    if (includeHistory) {
      recentAlerts = await getRecentAlerts(user.id, alertLimit);
    }

    return ApiResponse.ok({
      enabled: true,
      ...monitoringReport,
      recentAlerts: includeHistory ? recentAlerts : undefined
    });

  } catch (error) {
    console.error('[storage:monitoring:error]', {
      userId: user.id,
      correlationId: context.correlationId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return ApiResponse.serverError('Failed to generate monitoring report');
  }
}

export const GET = createProtectedApiHandler(getMonitoringReport);