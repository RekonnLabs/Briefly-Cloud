import { NextResponse } from 'next/server'
import { createPublicApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse, createHealthCheck } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'

// Health check handler
async function healthHandler(_request: Request, _context: ApiContext): Promise<NextResponse> {
  const healthData = createHealthCheck('briefly-cloud-nextjs', '1.0.0')
  
  // Add additional health checks
  const checks = {
    database: await checkDatabase(),
    openai: await checkOpenAI(),
    supabase: await checkSupabase(),
  }
  
  const allHealthy = Object.values(checks).every(check => check.healthy)
  
  return ApiResponse.success({
    ...healthData,
    status: allHealthy ? 'healthy' : 'degraded',
    checks,
  })
}

// Database health check
async function checkDatabase(): Promise<{ healthy: boolean; message: string }> {
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    )
    
    // Simple query to test connection
    const { error } = await supabase.from('users').select('count').limit(1)
    
    return {
      healthy: !error,
      message: error ? error.message : 'Database connection successful'
    }
  } catch (error) {
    return {
      healthy: false,
      message: `Database connection failed: ${error}`
    }
  }
}

// OpenAI health check
async function checkOpenAI(): Promise<{ healthy: boolean; message: string }> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return {
        healthy: false,
        message: 'OpenAI API key not configured'
      }
    }
    
    // We don't make an actual API call to avoid costs
    // Just check if the key is present
    return {
      healthy: true,
      message: 'OpenAI API key configured'
    }
  } catch (error) {
    return {
      healthy: false,
      message: `OpenAI check failed: ${error}`
    }
  }
}

// Supabase health check
async function checkSupabase(): Promise<{ healthy: boolean; message: string }> {
  try {
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_ANON_KEY
    
    if (!supabaseUrl || !supabaseKey) {
      return {
        healthy: false,
        message: 'Supabase credentials not configured'
      }
    }
    
    return {
      healthy: true,
      message: 'Supabase credentials configured'
    }
  } catch (error) {
    return {
      healthy: false,
      message: `Supabase check failed: ${error}`
    }
  }
}

// Export the handler with middleware
export const GET = createPublicApiHandler(healthHandler, {
  rateLimit: rateLimitConfigs.general,
  logging: {
    enabled: true,
    includeBody: false,
  },
})