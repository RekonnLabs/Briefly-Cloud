import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/app/lib/auth/supabase-auth'
import { PerformanceMonitor } from '@/app/lib/performance'
import { cacheManager } from '@/app/lib/cache'
import { withPerformanceMonitoring } from '@/app/lib/performance'

export const GET = withPerformanceMonitoring(async (req: NextRequest) => {
  const user = await getAuthenticatedUser()
  
  // Only allow authenticated users to access performance metrics
  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  // Check if user is admin (you can implement your own admin check)
  const isAdmin = user.email === process.env.ADMIN_EMAIL
  
  if (!isAdmin) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403 }
    )
  }

  const metrics = PerformanceMonitor.getMetrics()
  const cacheStats = cacheManager.getStats()

  return NextResponse.json({
    performance: {
      requests: metrics.requests,
      avgResponseTime: metrics.avgResponseTime,
      errorRate: metrics.errorRate,
      databaseQueries: metrics.databaseQueries,
      avgDatabaseQueryTime: metrics.avgDatabaseQueryTime,
      externalApiCalls: metrics.externalApiCalls,
      avgExternalApiTime: metrics.avgExternalApiTime,
    },
    cache: {
      size: cacheStats.size,
      max: cacheStats.max,
      hits: cacheStats.hits,
      misses: cacheStats.misses,
      hitRate: cacheStats.hitRate,
    },
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  })
})

export const POST = withPerformanceMonitoring(async (req: NextRequest) => {
  const user = await getAuthenticatedUser()
  
  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const isAdmin = user.email === process.env.ADMIN_EMAIL
  
  if (!isAdmin) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403 }
    )
  }

  const { action } = await req.json()

  switch (action) {
    case 'reset':
      PerformanceMonitor.reset()
      return NextResponse.json({ message: 'Performance metrics reset' })
    
    case 'clear-cache':
      cacheManager.clear()
      return NextResponse.json({ message: 'Cache cleared' })
    
    default:
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      )
  }
})
