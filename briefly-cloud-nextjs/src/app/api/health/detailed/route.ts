/**
 * Detailed Health Check API Endpoint
 * Provides comprehensive service status with correlation ID tracking and performance metrics
 */

import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/app/lib/supabase-admin"
import { ErrorHandler } from "@/app/lib/error-handler"
import { TokenStore } from "@/app/lib/oauth/token-store"
import { logger } from "@/app/lib/logger"

interface DetailedHealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  correlationId: string
  version: string
  services: {
    authentication: ServiceHealthStatus
    database: ServiceHealthStatus
    vectorStore: ServiceHealthStatus
    openai: ServiceHealthStatus
    stripe: ServiceHealthStatus
    supabase: ServiceHealthStatus
    cloudProviders: {
      google: ServiceHealthStatus
      microsoft: ServiceHealthStatus
    }
  }
  performance: {
    uptime: number
    memory: MemoryUsage
    errorMetrics: ErrorMetrics
  }
  correlationTracking: {
    enabled: boolean
    sampleCorrelationId: string
  }
}

interface ServiceHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  responseTime?: number
  error?: string
  lastChecked: string
  details?: Record<string, unknown>
}

interface MemoryUsage {
  used: number
  total: number
  percentage: number
  heapUsed: number
  heapTotal: number
}

interface ErrorMetrics {
  totalErrors: number
  errorRate: number
  lastError?: string
  errorsByCategory: Record<string, number>
  errorsByCode: Record<string, number>
}

/**
 * Generate correlation ID for health check
 */
function generateCorrelationId(): string {
  return `health_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Enhanced service check with timing and error handling
 */
async function checkService(
  name: string, 
  fn: () => Promise<any>,
  correlationId: string
): Promise<ServiceHealthStatus> {
  const startTime = Date.now()
  
  try {
    await fn()
    const responseTime = Date.now() - startTime
    
    return {
      status: responseTime > 2000 ? 'degraded' : 'healthy',
      responseTime,
      lastChecked: new Date().toISOString()
    }
  } catch (error: any) {
    const responseTime = Date.now() - startTime
    const errorMessage = error?.message || 'Unknown error'
    
    logger.warn(`Health check failed for ${name}`, {
      correlationId,
      service: name,
      error: errorMessage,
      responseTime
    })
    
    return {
      status: 'unhealthy',
      responseTime,
      error: errorMessage,
      lastChecked: new Date().toISOString()
    }
  }
}

/**
 * Check authentication system
 */
async function checkAuthentication(correlationId: string): Promise<ServiceHealthStatus> {
  return checkService('authentication', async () => {
    // Test Supabase auth service
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 })
    if (error) throw new Error(`Auth service error: ${error.message}`)
    
    // Test OAuth token storage
    const testUserId = '00000000-0000-0000-0000-000000000000'
    try {
      await TokenStore.getToken(testUserId, 'google')
    } catch (error) {
      // This is expected to fail for test user, but should not throw connection errors
      if (error instanceof Error && error.message.includes('connection')) {
        throw error
      }
    }
  }, correlationId)
}

/**
 * Check database connectivity
 */
async function checkDatabase(correlationId: string): Promise<ServiceHealthStatus> {
  return checkService('database', async () => {
    // Test basic database connectivity
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id')
      .limit(1)
    
    if (error) throw new Error(`Database error: ${error.message}`)
    
    // Test RPC functions (OAuth token storage)
    const { error: rpcError } = await supabaseAdmin.rpc('app.get_oauth_token', {
      p_user_id: '00000000-0000-0000-0000-000000000000',
      p_provider: 'google'
    })
    
    // RPC should execute without connection errors (may return no data)
    if (rpcError && rpcError.message.includes('connection')) {
      throw new Error(`RPC error: ${rpcError.message}`)
    }
  }, correlationId)
}

/**
 * Check vector store availability
 */
async function checkVectorStore(correlationId: string): Promise<ServiceHealthStatus> {
  return checkService('vectorStore', async () => {
    try {
      const { isVectorStoreAvailable } = await import("@/app/lib/vector/vector-store-factory")
      const available = await isVectorStoreAvailable()
      if (!available) throw new Error("Vector store not available")
    } catch (importError) {
      // If vector store module doesn't exist, check ChromaDB directly
      if (!process.env.CHROMA_API_KEY) {
        throw new Error("ChromaDB not configured")
      }
      
      // Test ChromaDB connection
      const response = await fetch('https://api.trychroma.com/v1/heartbeat', {
        headers: {
          'Authorization': `Bearer ${process.env.CHROMA_API_KEY}`
        },
        signal: AbortSignal.timeout(5000)
      })
      
      if (!response.ok) {
        throw new Error(`ChromaDB error: ${response.status} ${response.statusText}`)
      }
    }
  }, correlationId)
}

/**
 * Check OpenAI service
 */
async function checkOpenAI(correlationId: string): Promise<ServiceHealthStatus> {
  return checkService('openai', async () => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key not configured")
    }
    
    // Test OpenAI API with minimal request
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(5000)
    })
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`)
    }
  }, correlationId)
}

/**
 * Check Stripe configuration
 */
async function checkStripe(correlationId: string): Promise<ServiceHealthStatus> {
  return checkService('stripe', async () => {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("Stripe secret key not configured")
    }
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      throw new Error("Stripe webhook secret not configured")
    }
    
    // Test Stripe API connection
    const response = await fetch('https://api.stripe.com/v1/account', {
      headers: {
        'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      signal: AbortSignal.timeout(5000)
    })
    
    if (!response.ok) {
      throw new Error(`Stripe API error: ${response.status} ${response.statusText}`)
    }
  }, correlationId)
}

/**
 * Check Supabase service
 */
async function checkSupabase(correlationId: string): Promise<ServiceHealthStatus> {
  return checkService('supabase', async () => {
    // Test Supabase admin connection
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 })
    if (error) throw new Error(`Supabase admin error: ${error.message}`)
    
    // Test database connection
    const { error: dbError } = await supabaseAdmin
      .from('users')
      .select('count')
      .limit(1)
    
    if (dbError) throw new Error(`Supabase DB error: ${dbError.message}`)
  }, correlationId)
}

/**
 * Check Google Drive OAuth connectivity
 */
async function checkGoogleDrive(correlationId: string): Promise<ServiceHealthStatus> {
  return checkService('googleDrive', async () => {
    if (!process.env.GOOGLE_DRIVE_CLIENT_ID || !process.env.GOOGLE_DRIVE_CLIENT_SECRET) {
      throw new Error("Google Drive OAuth not configured")
    }
    
    // Test OAuth endpoint accessibility (doesn't require auth)
    const response = await fetch('https://oauth2.googleapis.com/.well-known/openid_configuration', {
      signal: AbortSignal.timeout(5000)
    })
    
    if (!response.ok) {
      throw new Error(`Google OAuth service error: ${response.status}`)
    }
  }, correlationId)
}

/**
 * Check Microsoft OAuth connectivity
 */
async function checkMicrosoft(correlationId: string): Promise<ServiceHealthStatus> {
  return checkService('microsoft', async () => {
    if (!process.env.MS_DRIVE_CLIENT_ID || !process.env.MS_DRIVE_CLIENT_SECRET) {
      throw new Error("Microsoft OAuth not configured")
    }
    
    const tenantId = process.env.MS_DRIVE_TENANT_ID || 'common'
    
    // Test OAuth endpoint accessibility
    const response = await fetch(`https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid_configuration`, {
      signal: AbortSignal.timeout(5000)
    })
    
    if (!response.ok) {
      throw new Error(`Microsoft OAuth service error: ${response.status}`)
    }
  }, correlationId)
}

/**
 * Get enhanced memory usage information
 */
function getMemoryUsage(): MemoryUsage {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    const usage = process.memoryUsage()
    return {
      used: Math.round(usage.heapUsed / 1024 / 1024), // MB
      total: Math.round(usage.heapTotal / 1024 / 1024), // MB
      percentage: Math.round((usage.heapUsed / usage.heapTotal) * 100),
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal
    }
  }
  
  return {
    used: 0,
    total: 0,
    percentage: 0,
    heapUsed: 0,
    heapTotal: 0
  }
}

/**
 * Get error metrics from ErrorHandler
 */
function getErrorMetrics(): ErrorMetrics {
  const metrics = ErrorHandler.getErrorMetrics()
  
  return {
    totalErrors: metrics.errorCount,
    errorRate: metrics.errorRate,
    lastError: metrics.lastError?.toISOString(),
    errorsByCategory: metrics.errorsByCategory,
    errorsByCode: metrics.errorsByCode
  }
}

/**
 * GET /api/health/detailed
 * Comprehensive health check with correlation ID tracking and performance metrics
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const correlationId = generateCorrelationId()
  
  try {
    logger.info('Detailed health check started', { correlationId })
    
    // Run all health checks in parallel
    const [
      authStatus,
      databaseStatus,
      vectorStoreStatus,
      openaiStatus,
      stripeStatus,
      supabaseStatus,
      googleStatus,
      microsoftStatus
    ] = await Promise.all([
      checkAuthentication(correlationId),
      checkDatabase(correlationId),
      checkVectorStore(correlationId),
      checkOpenAI(correlationId),
      checkStripe(correlationId),
      checkSupabase(correlationId),
      checkGoogleDrive(correlationId),
      checkMicrosoft(correlationId)
    ])

    // Determine overall status
    const services = {
      authentication: authStatus,
      database: databaseStatus,
      vectorStore: vectorStoreStatus,
      openai: openaiStatus,
      stripe: stripeStatus,
      supabase: supabaseStatus,
      cloudProviders: {
        google: googleStatus,
        microsoft: microsoftStatus
      }
    }

    // Calculate overall health
    const allStatuses = [
      authStatus.status,
      databaseStatus.status,
      vectorStoreStatus.status,
      openaiStatus.status,
      stripeStatus.status,
      supabaseStatus.status,
      googleStatus.status,
      microsoftStatus.status
    ]

    const hasUnhealthy = allStatuses.includes('unhealthy')
    const hasDegraded = allStatuses.includes('degraded')

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy'
    if (hasUnhealthy) {
      overallStatus = 'unhealthy'
    } else if (hasDegraded) {
      overallStatus = 'degraded'
    } else {
      overallStatus = 'healthy'
    }

    const healthCheck: DetailedHealthCheck = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      correlationId,
      version: process.env.npm_package_version || '2.0.0',
      services,
      performance: {
        uptime: process.uptime ? Math.round(process.uptime()) : 0,
        memory: getMemoryUsage(),
        errorMetrics: getErrorMetrics()
      },
      correlationTracking: {
        enabled: true,
        sampleCorrelationId: correlationId
      }
    }

    const duration = Date.now() - startTime
    
    logger.info('Detailed health check completed', {
      correlationId,
      status: overallStatus,
      duration,
      services: Object.keys(services).length
    })

    // Return appropriate HTTP status code
    const httpStatus = overallStatus === 'healthy' ? 200 : 
                      overallStatus === 'degraded' ? 200 : 503

    return NextResponse.json(healthCheck, {
      status: httpStatus,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Correlation-ID': correlationId,
        'X-Health-Check-Duration': `${duration}ms`
      }
    })

  } catch (error) {
    const duration = Date.now() - startTime
    
    logger.error('Detailed health check failed', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration
    })

    const errorResponse: DetailedHealthCheck = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      correlationId,
      version: process.env.npm_package_version || '2.0.0',
      services: {
        authentication: {
          status: 'unhealthy',
          error: 'Health check failed',
          lastChecked: new Date().toISOString()
        },
        database: {
          status: 'unhealthy',
          error: 'Health check failed',
          lastChecked: new Date().toISOString()
        },
        vectorStore: {
          status: 'unhealthy',
          error: 'Health check failed',
          lastChecked: new Date().toISOString()
        },
        openai: {
          status: 'unhealthy',
          error: 'Health check failed',
          lastChecked: new Date().toISOString()
        },
        stripe: {
          status: 'unhealthy',
          error: 'Health check failed',
          lastChecked: new Date().toISOString()
        },
        supabase: {
          status: 'unhealthy',
          error: 'Health check failed',
          lastChecked: new Date().toISOString()
        },
        cloudProviders: {
          google: {
            status: 'unhealthy',
            error: 'Health check failed',
            lastChecked: new Date().toISOString()
          },
          microsoft: {
            status: 'unhealthy',
            error: 'Health check failed',
            lastChecked: new Date().toISOString()
          }
        }
      },
      performance: {
        uptime: 0,
        memory: getMemoryUsage(),
        errorMetrics: getErrorMetrics()
      },
      correlationTracking: {
        enabled: true,
        sampleCorrelationId: correlationId
      }
    }

    return NextResponse.json(errorResponse, {
      status: 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Correlation-ID': correlationId,
        'X-Health-Check-Duration': `${duration}ms`,
        'X-Health-Check-Error': error instanceof Error ? error.message : 'Unknown error'
      }
    })
  }
}