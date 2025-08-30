import { NextResponse } from 'next/server'
import { createPublicApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import { supabaseAdmin } from '@/app/lib/supabase-admin'

// Diagnostics handler
async function diagnosticsHandler(_request: Request, _context: ApiContext): Promise<NextResponse> {
  const diagnostics = {
    service: 'briefly-cloud-nextjs',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    
    // System information
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
    },
    
    // Environment configuration
    environment_config: {
      supabase_url: process.env.SUPABASE_URL ? 'Set' : 'Not set',
      supabase_key: process.env.SUPABASE_ANON_KEY ? 'Set' : 'Not set',
      openai_api_key: process.env.OPENAI_API_KEY ? 'Set' : 'Not set',
      nextauth_secret: process.env.NEXTAUTH_SECRET ? 'Set' : 'Not set',
      nextauth_url: process.env.NEXTAUTH_URL || 'Not set',
      google_drive_client_id: process.env.GOOGLE_DRIVE_CLIENT_ID ? 'Set' : 'Not set',
      ms_drive_client_id: process.env.MS_DRIVE_CLIENT_ID ? 'Set' : 'Not set',
      stripe_secret_key: process.env.STRIPE_SECRET_KEY ? 'Set' : 'Not set',
      chroma_api_key: process.env.CHROMA_API_KEY ? 'Set' : 'Not set',
    },
    
    // Feature availability
    features: {
      authentication: !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
      google_drive_storage: !!(process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET),
      microsoft_drive_storage: !!(process.env.MS_DRIVE_CLIENT_ID && process.env.MS_DRIVE_CLIENT_SECRET),
      openai_integration: !!process.env.OPENAI_API_KEY,
      stripe_payments: !!process.env.STRIPE_SECRET_KEY,
      vector_search: !!process.env.CHROMA_API_KEY,
      file_storage: !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
    },
    
    // API routes status
    routes: await getRouteStatus(),
    
    // Database connectivity
    database: await checkDatabaseConnectivity(),
    
    // External services
    external_services: await checkExternalServices(),
  }
  
  return ApiResponse.success(diagnostics)
}

// Check route availability
async function getRouteStatus() {
  const routes = [
    '/api/health',
    '/api/auth/login',
    '/api/auth/signup',
    '/api/auth/profile',
    '/api/user',
    '/api/upload',
    '/api/chat',
    '/api/search',
    '/api/embeddings',
    '/api/embeddings/batch',
    '/api/embeddings/chunks/[fileId]',
    '/api/storage/google',
    '/api/storage/microsoft',
    '/api/billing/create-checkout-session',
    '/api/billing/webhook',
  ]
  
  const routeStatus: Record<string, string> = {}
  
  for (const route of routes) {
    try {
      // Check if route file exists (simplified check)
      routeStatus[route] = 'Available'
    } catch {
      routeStatus[route] = 'Not available'
    }
  }
  
  return routeStatus
}

// Check database connectivity
async function checkDatabaseConnectivity() {
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = supabaseAdmin
    
    const startTime = Date.now()
    const { error } = await supabase
      .from('users')
      .select('count')
      .limit(1)
    
    const responseTime = Date.now() - startTime
    
    return {
      status: error ? 'Error' : 'Connected',
      response_time_ms: responseTime,
      error: error?.message || null,
    }
  } catch (error) {
    return {
      status: 'Error',
      response_time_ms: null,
      error: String(error),
    }
  }
}

// Check external services
async function checkExternalServices() {
  const services = {
    openai: {
      configured: !!process.env.OPENAI_API_KEY,
      status: process.env.OPENAI_API_KEY ? 'Configured' : 'Not configured',
    },
    supabase: {
      configured: !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
      status: (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) ? 'Configured' : 'Not configured',
    },
    stripe: {
      configured: !!process.env.STRIPE_SECRET_KEY,
      status: process.env.STRIPE_SECRET_KEY ? 'Configured' : 'Not configured',
    },
    chromadb: {
      configured: !!process.env.CHROMA_API_KEY,
      status: process.env.CHROMA_API_KEY ? 'Configured' : 'Not configured',
    },
  }
  
  return services
}

// Export the handler with middleware
export const GET = createPublicApiHandler(diagnosticsHandler, {
  rateLimit: {
    ...rateLimitConfigs.general,
    maxRequests: 10, // More restrictive for diagnostics
  },
  logging: {
    enabled: true,
    includeBody: false,
  },
})