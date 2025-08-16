/**
 * Health Check Cron Job
 * 
 * Automated health monitoring that runs every 5 minutes
 * Checks system health and sends alerts if issues are detected
 */

import { NextRequest, NextResponse } from 'next/server';
import { createApiResponse, createErrorResponse } from '@/app/lib/api-utils';
import { logger } from '@/app/lib/logger';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/app/lib/supabase-admin'

interface HealthStatus {
  timestamp: string;
  overall: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    database: ServiceHealth;
    openai: ServiceHealth;
    supabase: ServiceHealth;
    chromadb?: ServiceHealth;
  };
  alerts: Alert[];
}

interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  error?: string;
}

interface Alert {
  type: 'error' | 'warning' | 'info';
  service: string;
  message: string;
  timestamp: string;
}

/**
 * POST /api/cron/health-check
 * Automated health check that runs every 5 minutes
 */
export async function POST(request: NextRequest) {
  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization');
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
    
    if (!process.env.CRON_SECRET || authHeader !== expectedAuth) {
      logger.warn('Unauthorized health check attempt', {
        ip: request.headers.get('x-forwarded-for'),
        user_agent: request.headers.get('user-agent')
      });
      return createErrorResponse('Unauthorized', 401);
    }

    logger.info('Starting automated health check');

    const healthStatus = await performHealthCheck();
    
    // Store health check results
    await storeHealthCheckResults(healthStatus);
    
    // Send alerts if necessary
    if (healthStatus.overall !== 'healthy') {
      await sendHealthAlerts(healthStatus);
    }

    logger.info('Health check completed', {
      status: healthStatus.overall,
      alerts: healthStatus.alerts.length
    });

    return createApiResponse({
      message: 'Health check completed',
      status: healthStatus.overall,
      timestamp: healthStatus.timestamp,
      alerts: healthStatus.alerts.length
    });

  } catch (error) {
    logger.error('Health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    // Send critical alert
    await sendCriticalAlert('Health check system failure', error);

    return createErrorResponse('Health check failed', 500, {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Perform comprehensive health check
 */
async function performHealthCheck(): Promise<HealthStatus> {
  const timestamp = new Date().toISOString();
  const alerts: Alert[] = [];

  // Check all services in parallel
  const [databaseHealth, openaiHealth, supabaseHealth, chromadbHealth] = await Promise.allSettled([
    checkDatabaseHealth(),
    checkOpenAIHealth(),
    checkSupabaseHealth(),
    checkChromaDBHealth()
  ]);

  const services: HealthStatus['services'] = {
    database: databaseHealth.status === 'fulfilled' ? databaseHealth.value : {
      status: 'unhealthy',
      responseTime: 0,
      error: databaseHealth.status === 'rejected' ? databaseHealth.reason?.message : 'Unknown error'
    },
    openai: openaiHealth.status === 'fulfilled' ? openaiHealth.value : {
      status: 'unhealthy',
      responseTime: 0,
      error: openaiHealth.status === 'rejected' ? openaiHealth.reason?.message : 'Unknown error'
    },
    supabase: supabaseHealth.status === 'fulfilled' ? supabaseHealth.value : {
      status: 'unhealthy',
      responseTime: 0,
      error: supabaseHealth.status === 'rejected' ? supabaseHealth.reason?.message : 'Unknown error'
    }
  };

  // Add ChromaDB if configured
  if (chromadbHealth.status === 'fulfilled' && chromadbHealth.value) {
    services.chromadb = chromadbHealth.value;
  } else if (chromadbHealth.status === 'rejected') {
    services.chromadb = {
      status: 'unhealthy',
      responseTime: 0,
      error: chromadbHealth.reason?.message || 'Unknown error'
    };
  }

  // Generate alerts based on service health
  Object.entries(services).forEach(([serviceName, health]) => {
    if (health.status === 'unhealthy') {
      alerts.push({
        type: 'error',
        service: serviceName,
        message: `${serviceName} is unhealthy: ${health.error || 'Unknown error'}`,
        timestamp
      });
    } else if (health.status === 'degraded') {
      alerts.push({
        type: 'warning',
        service: serviceName,
        message: `${serviceName} is degraded (response time: ${health.responseTime}ms)`,
        timestamp
      });
    }
  });

  // Determine overall health
  const serviceStatuses = Object.values(services).map(s => s.status);
  const hasUnhealthy = serviceStatuses.includes('unhealthy');
  const hasDegraded = serviceStatuses.includes('degraded');

  let overall: 'healthy' | 'degraded' | 'unhealthy';
  if (hasUnhealthy) {
    overall = 'unhealthy';
  } else if (hasDegraded) {
    overall = 'degraded';
  } else {
    overall = 'healthy';
  }

  return {
    timestamp,
    overall,
    services,
    alerts
  };
}

/**
 * Check database health
 */
async function checkDatabaseHealth(): Promise<ServiceHealth> {
  const startTime = Date.now();
  
  try {
    const supabase = supabaseAdmin;

    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);

    const responseTime = Date.now() - startTime;

    if (error) {
      return {
        status: 'unhealthy',
        responseTime,
        error: error.message
      };
    }

    return {
      status: responseTime > 1000 ? 'degraded' : 'healthy',
      responseTime
    };

  } catch (error) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Database connection failed'
    };
  }
}

/**
 * Check OpenAI API health
 */
async function checkOpenAIHealth(): Promise<ServiceHealth> {
  const startTime = Date.now();
  
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      return {
        status: 'unhealthy',
        responseTime,
        error: `HTTP ${response.status}: ${response.statusText}`
      };
    }

    return {
      status: responseTime > 3000 ? 'degraded' : 'healthy',
      responseTime
    };

  } catch (error) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'OpenAI API connection failed'
    };
  }
}

/**
 * Check Supabase service health
 */
async function checkSupabaseHealth(): Promise<ServiceHealth> {
  const startTime = Date.now();
  
  try {
    const supabase = supabaseAdmin;

    // Test auth service
    const { error } = await supabase.auth.getSession();
    const responseTime = Date.now() - startTime;

    if (error) {
      return {
        status: 'unhealthy',
        responseTime,
        error: error.message
      };
    }

    return {
      status: responseTime > 1000 ? 'degraded' : 'healthy',
      responseTime
    };

  } catch (error) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Supabase connection failed'
    };
  }
}

/**
 * Check ChromaDB health (if configured)
 */
async function checkChromaDBHealth(): Promise<ServiceHealth | null> {
  if (!process.env.CHROMADB_URL) {
    return null;
  }

  const startTime = Date.now();
  
  try {
    const response = await fetch(`${process.env.CHROMADB_URL}/api/v1/heartbeat`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.CHROMADB_API_KEY && {
          'Authorization': `Bearer ${process.env.CHROMADB_API_KEY}`
        })
      },
      signal: AbortSignal.timeout(10000)
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      return {
        status: 'unhealthy',
        responseTime,
        error: `HTTP ${response.status}: ${response.statusText}`
      };
    }

    return {
      status: responseTime > 3000 ? 'degraded' : 'healthy',
      responseTime
    };

  } catch (error) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'ChromaDB connection failed'
    };
  }
}

/**
 * Store health check results in database
 */
async function storeHealthCheckResults(healthStatus: HealthStatus): Promise<void> {
  try {
    const supabase = supabaseAdmin;

    await supabase
      .from('health_checks')
      .insert({
        timestamp: healthStatus.timestamp,
        overall_status: healthStatus.overall,
        services: healthStatus.services,
        alerts: healthStatus.alerts,
        created_at: new Date().toISOString()
      });

  } catch (error) {
    logger.error('Failed to store health check results', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Send health alerts via configured channels
 */
async function sendHealthAlerts(healthStatus: HealthStatus): Promise<void> {
  try {
    // In a real implementation, you would send alerts via:
    // - Email (SendGrid, AWS SES)
    // - Slack (Webhook)
    // - Discord (Webhook)
    // - PagerDuty (API)
    // - SMS (Twilio)

    logger.warn('Health alerts triggered', {
      status: healthStatus.overall,
      alerts: healthStatus.alerts
    });

    // Example: Send to webhook (replace with actual implementation)
    if (process.env.ALERT_WEBHOOK_URL) {
      await fetch(process.env.ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: `🚨 Briefly Cloud Health Alert: System is ${healthStatus.overall}`,
          attachments: [{
            color: healthStatus.overall === 'unhealthy' ? 'danger' : 'warning',
            fields: healthStatus.alerts.map(alert => ({
              title: `${alert.service} - ${alert.type}`,
              value: alert.message,
              short: false
            }))
          }]
        })
      });
    }

  } catch (error) {
    logger.error('Failed to send health alerts', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Send critical alert for system failures
 */
async function sendCriticalAlert(message: string, error: any): Promise<void> {
  try {
    logger.error('Critical system alert', {
      message,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    // Send immediate critical alert
    if (process.env.CRITICAL_ALERT_WEBHOOK_URL) {
      await fetch(process.env.CRITICAL_ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: `🚨 CRITICAL: Briefly Cloud System Failure`,
          attachments: [{
            color: 'danger',
            fields: [{
              title: 'Error',
              value: message,
              short: false
            }, {
              title: 'Details',
              value: error instanceof Error ? error.message : 'Unknown error',
              short: false
            }]
          }]
        })
      });
    }

  } catch (alertError) {
    logger.error('Failed to send critical alert', {
      originalError: error instanceof Error ? error.message : 'Unknown error',
      alertError: alertError instanceof Error ? alertError.message : 'Unknown error'
    });
  }
}

/**
 * GET /api/cron/health-check
 * Get the latest health check status
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = supabaseAdmin;

    const { data: latestCheck } = await supabase
      .from('health_checks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!latestCheck) {
      return createApiResponse({
        message: 'No health check data available',
        status: 'unknown'
      });
    }

    return createApiResponse({
      timestamp: latestCheck.timestamp,
      status: latestCheck.overall_status,
      services: latestCheck.services,
      alerts: latestCheck.alerts
    });

  } catch (error) {
    return createErrorResponse('Failed to get health check status', 500);
  }
}