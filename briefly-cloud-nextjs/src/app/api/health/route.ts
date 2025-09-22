/**
 * Health Check API Endpoint
 * 
 * Provides comprehensive health status for monitoring and alerting
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/app/lib/supabase-admin'

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  services: {
    database: ServiceStatus;
    openai: ServiceStatus;
    supabase: ServiceStatus;
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

interface ServiceStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  error?: string;
  lastChecked: string;
}

/**
 * Check database connectivity
 */
async function checkDatabase(): Promise<ServiceStatus> {
  const startTime = Date.now();
  
  try {
    const supabase = supabaseAdmin;

    // Simple query to test connectivity
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);

    const responseTime = Date.now() - startTime;

    if (error) {
      return {
        status: 'unhealthy',
        responseTime,
        error: error.message,
        lastChecked: new Date().toISOString()
      };
    }

    return {
      status: responseTime > 1000 ? 'degraded' : 'healthy',
      responseTime,
      lastChecked: new Date().toISOString()
    };

  } catch (error) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown database error',
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
 * Check Supabase service status
 */
async function checkSupabase(): Promise<ServiceStatus> {
  const startTime = Date.now();
  
  try {
    const supabase = supabaseAdmin;

    // Test auth service
    const { data, error } = await supabase.auth.getSession();
    const responseTime = Date.now() - startTime;

    // Note: getSession() may return null data without error for health checks
    if (error) {
      return {
        status: 'unhealthy',
        responseTime,
        error: error.message,
        lastChecked: new Date().toISOString()
      };
    }

    return {
      status: responseTime > 1000 ? 'degraded' : 'healthy',
      responseTime,
      lastChecked: new Date().toISOString()
    };

  } catch (error) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown Supabase error',
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
 * Comprehensive health check endpoint
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Run all health checks in parallel
    const [databaseStatus, openaiStatus, supabaseStatus, chromadbStatus] = await Promise.all([
      checkDatabase(),
      checkOpenAI(),
      checkSupabase(),
      checkChromaDB()
    ]);

    // Determine overall status
    const services = {
      database: databaseStatus,
      openai: openaiStatus,
      supabase: supabaseStatus,
      ...(chromadbStatus && { chromadb: chromadbStatus })
    };

    const serviceStatuses = Object.values(services).map(s => s.status);
    const hasUnhealthy = serviceStatuses.includes('unhealthy');
    const hasDegraded = serviceStatuses.includes('degraded');

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
      services,
      performance: {
        uptime: process.uptime ? Math.round(process.uptime()) : 0,
        memory: getMemoryUsage()
      }
    };

    // Return appropriate HTTP status code
    const httpStatus = overallStatus === 'healthy' ? 200 : 
                      overallStatus === 'degraded' ? 200 : 503;

    return NextResponse.json(healthCheck, { 
      status: httpStatus,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Health-Check-Duration': `${Date.now() - startTime}ms`
      }
    });

  } catch (error) {
    const errorResponse: HealthCheck = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '2.0.0',
      services: {
        database: {
          status: 'unhealthy',
          error: 'Health check failed',
          lastChecked: new Date().toISOString()
        },
        openai: {
          status: 'unhealthy',
          error: 'Health check failed',
          lastChecked: new Date().toISOString()
        },
        supabase: {
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
 * Lightweight health check for load balancers
 */
export async function HEAD(request: NextRequest) {
  try {
    // Quick database connectivity check
    const supabase = supabaseAdmin;

    const { error } = await supabase
      .from('users')
      .select('count')
      .limit(1);

    if (error) {
      return new NextResponse(null, { status: 503 });
    }

    return new NextResponse(null, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });

  } catch (error) {
    return new NextResponse(null, { status: 503 });
  }
}
