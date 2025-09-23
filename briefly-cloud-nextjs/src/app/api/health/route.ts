/**
 * Schema-Aware Health Check API Endpoint
 * 
 * Provides comprehensive health status for monitoring and alerting
 * with schema-specific connectivity testing for post-migration architecture
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseApp, supabasePrivate } from '@/app/lib/supabase-clients'
import { handleSchemaError, logSchemaError } from '@/app/lib/errors/schema-errors'

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  schemas: {
    app: SchemaStatus;
    private: SchemaStatus;
  };
  services: {
    openai: ServiceStatus;
    chromadb?: ServiceStatus;
  };
  performance: {
    uptime: number;
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
  };
}

interface SchemaStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  tables?: number;
  views?: number;
  error?: string;
  lastChecked: string;
}

interface ServiceStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  error?: string;
  lastChecked: string;
}

/**
 * Check app schema connectivity and table counts
 */
async function checkAppSchema(): Promise<SchemaStatus> {
  const startTime = Date.now();
  
  try {
    // Test connectivity with a simple query to app.users
    const { data, error } = await supabaseApp
      .from('users')
      .select('id')
      .limit(1);

    const responseTime = Date.now() - startTime;

    if (error) {
      const schemaError = handleSchemaError(error, {
        schema: 'app',
        operation: 'health_check_connectivity',
        table: 'users',
        correlationId: 'health-check'
      });
      logSchemaError(schemaError);
      
      return {
        status: 'unhealthy',
        responseTime,
        error: schemaError.message,
        lastChecked: new Date().toISOString()
      };
    }

    // Count tables in app schema (approximate count for performance)
    const expectedTables = 8; // users, files, document_chunks, conversations, chat_messages, usage_logs, rate_limits, user_settings

    return {
      status: responseTime > 1000 ? 'degraded' : 'healthy',
      responseTime,
      tables: expectedTables,
      lastChecked: new Date().toISOString()
    };

  } catch (error) {
    const schemaError = handleSchemaError(error, {
      schema: 'app',
      operation: 'health_check_connectivity',
      table: 'users',
      correlationId: 'health-check',
      originalError: error
    });
    logSchemaError(schemaError);
    
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      error: schemaError.message,
      lastChecked: new Date().toISOString()
    };
  }
}

/**
 * Check private schema connectivity via RPC functions
 */
async function checkPrivateSchema(): Promise<SchemaStatus> {
  const startTime = Date.now();
  
  try {
    // Test private schema access via RPC function
    const { data, error } = await supabaseApp.rpc('get_oauth_token', {
      p_user_id: '00000000-0000-0000-0000-000000000000',
      p_provider: 'google'
    });

    const responseTime = Date.now() - startTime;

    // RPC should work even if no token found (returns empty result)
    if (error && !error.message.includes('no rows')) {
      const schemaError = handleSchemaError(error, {
        schema: 'private',
        operation: 'health_check_rpc',
        correlationId: 'health-check'
      });
      logSchemaError(schemaError);
      
      return {
        status: 'unhealthy',
        responseTime,
        error: schemaError.message,
        lastChecked: new Date().toISOString()
      };
    }

    // Count tables in private schema (approximate count for performance)
    const expectedTables = 4; // oauth_tokens, audit_logs, encryption_keys, system_config

    return {
      status: responseTime > 1000 ? 'degraded' : 'healthy',
      responseTime,
      tables: expectedTables,
      lastChecked: new Date().toISOString()
    };

  } catch (error) {
    const schemaError = handleSchemaError(error, {
      schema: 'private',
      operation: 'health_check_rpc',
      correlationId: 'health-check',
      originalError: error
    });
    logSchemaError(schemaError);
    
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      error: schemaError.message,
      lastChecked: new Date().toISOString()
    };
  }
}



/**
 * Check OpenAI API connectivity
 */
async function checkOpenAI(): Promise<ServiceStatus> {
  const startTime = Date.now();
  
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      return {
        status: 'unhealthy',
        responseTime,
        error: `HTTP ${response.status}: ${response.statusText}`,
        lastChecked: new Date().toISOString()
      };
    }

    return {
      status: responseTime > 2000 ? 'degraded' : 'healthy',
      responseTime,
      lastChecked: new Date().toISOString()
    };

  } catch (error) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown OpenAI error',
      lastChecked: new Date().toISOString()
    };
  }
}



/**
 * Check ChromaDB connectivity (optional)
 */
async function checkChromaDB(): Promise<ServiceStatus | undefined> {
  if (!process.env.CHROMADB_URL) {
    return undefined; // ChromaDB not configured
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
      signal: AbortSignal.timeout(5000)
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      return {
        status: 'unhealthy',
        responseTime,
        error: `HTTP ${response.status}: ${response.statusText}`,
        lastChecked: new Date().toISOString()
      };
    }

    return {
      status: responseTime > 2000 ? 'degraded' : 'healthy',
      responseTime,
      lastChecked: new Date().toISOString()
    };

  } catch (error) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown ChromaDB error',
      lastChecked: new Date().toISOString()
    };
  }
}

/**
 * Get memory usage information
 */
function getMemoryUsage() {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    const usage = process.memoryUsage();
    return {
      used: Math.round(usage.heapUsed / 1024 / 1024), // MB
      total: Math.round(usage.heapTotal / 1024 / 1024), // MB
      percentage: Math.round((usage.heapUsed / usage.heapTotal) * 100)
    };
  }
  
  return {
    used: 0,
    total: 0,
    percentage: 0
  };
}

/**
 * GET /api/health
 * Schema-aware comprehensive health check endpoint
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Run all health checks in parallel
    const [appSchemaStatus, privateSchemaStatus, openaiStatus, chromadbStatus] = await Promise.all([
      checkAppSchema(),
      checkPrivateSchema(),
      checkOpenAI(),
      checkChromaDB()
    ]);

    // Determine overall status
    const schemas = {
      app: appSchemaStatus,
      private: privateSchemaStatus
    };

    const services = {
      openai: openaiStatus,
      ...(chromadbStatus && { chromadb: chromadbStatus })
    };

    // Check all statuses (schemas + services)
    const allStatuses = [
      ...Object.values(schemas).map(s => s.status),
      ...Object.values(services).map(s => s.status)
    ];

    const hasUnhealthy = allStatuses.includes('unhealthy');
    const hasDegraded = allStatuses.includes('degraded');

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (hasUnhealthy) {
      overallStatus = 'unhealthy';
    } else if (hasDegraded) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    const healthCheck: HealthCheck = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '2.0.0',
      schemas,
      services,
      performance: {
        uptime: process.uptime ? Math.round(process.uptime()) : 0,
        memory: getMemoryUsage()
      }
    };

    // Return appropriate HTTP status code based on schema health
    const httpStatus = overallStatus === 'healthy' ? 200 : 
                      overallStatus === 'degraded' ? 200 : 503;

    return NextResponse.json(healthCheck, { 
      status: httpStatus,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Health-Check-Duration': `${Date.now() - startTime}ms`,
        'X-Schema-Status': `app:${appSchemaStatus.status},private:${privateSchemaStatus.status}`
      }
    });

  } catch (error) {
    const errorResponse: HealthCheck = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '2.0.0',
      schemas: {
        app: {
          status: 'unhealthy',
          error: 'Health check failed',
          lastChecked: new Date().toISOString()
        },
        private: {
          status: 'unhealthy',
          error: 'Health check failed',
          lastChecked: new Date().toISOString()
        }
      },
      services: {
        openai: {
          status: 'unhealthy',
          error: 'Health check failed',
          lastChecked: new Date().toISOString()
        }
      },
      performance: {
        uptime: 0,
        memory: getMemoryUsage()
      }
    };

    return NextResponse.json(errorResponse, { 
      status: 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Health-Check-Duration': `${Date.now() - startTime}ms`,
        'X-Health-Check-Error': error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}

/**
 * HEAD /api/health
 * Lightweight schema-aware health check for load balancers
 */
export async function HEAD(request: NextRequest) {
  try {
    // Quick app schema connectivity check (most critical)
    const { error } = await supabaseApp
      .from('users')
      .select('id')
      .limit(1);

    if (error) {
      const schemaError = handleSchemaError(error, {
        schema: 'app',
        operation: 'head_health_check',
        table: 'users',
        correlationId: 'head-health-check'
      });
      logSchemaError(schemaError);
      
      return new NextResponse(null, { 
        status: 503,
        headers: {
          'X-Schema-Error': 'app-schema-unavailable',
          'X-Schema-Error-Code': schemaError.code
        }
      });
    }

    return new NextResponse(null, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Schema-Status': 'app-healthy'
      }
    });

  } catch (error) {
    const schemaError = handleSchemaError(error, {
      schema: 'app',
      operation: 'head_health_check',
      table: 'users',
      correlationId: 'head-health-check',
      originalError: error
    });
    logSchemaError(schemaError);
    
    return new NextResponse(null, { 
      status: 503,
      headers: {
        'X-Schema-Error': 'connectivity-failed',
        'X-Schema-Error-Code': schemaError.code
      }
    });
  }
}
