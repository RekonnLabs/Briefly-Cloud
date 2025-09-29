/**
 * OAuth Flow Monitoring API
 * 
 * Provides endpoints for tracking and monitoring OAuth flow separation compliance.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/app/lib/auth/supabase-server'
import { getErrorMonitoring } from '@/app/lib/error-monitoring'

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient()
    
    // Check if user is authenticated and has admin permissions
    const { data: { session }, error: authError } = await supabase.auth.getSession()
    
    if (authError || !session) {
      return NextResponse.json(
        { error: { message: 'Authentication required' } },
        { status: 401 }
      )
    }

    // Check if user is admin (you may want to implement proper role checking)
    const isAdmin = session.user.email?.endsWith('@rekonnlabs.com') || false
    
    if (!isAdmin) {
      return NextResponse.json(
        { error: { message: 'Admin access required' } },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const timeRange = searchParams.get('timeRange') || '24h'
    const includeViolations = searchParams.get('includeViolations') === 'true'

    // In a real implementation, you would query your monitoring database
    // For now, we'll return mock data that demonstrates the structure
    
    const mockData = {
      summary: {
        totalRouteUsages: 1250,
        correctUsages: 1235,
        violations: 15,
        complianceRate: 98.8,
        timeRange
      },
      flowBreakdown: {
        mainAuth: {
          total: 450,
          success: 445,
          failures: 5,
          routes: {
            '/auth/start?provider=google': { count: 280, success: 278, failures: 2 },
            '/auth/start?provider=azure': { count: 170, success: 167, failures: 3 }
          }
        },
        storageOAuth: {
          total: 800,
          success: 790,
          failures: 10,
          routes: {
            '/api/storage/google/start': { count: 500, success: 495, failures: 5 },
            '/api/storage/microsoft/start': { count: 300, success: 295, failures: 5 }
          }
        }
      },
      violations: includeViolations ? [
        {
          id: 'violation_1',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          route: '/auth/start?provider=google',
          expectedFlowType: 'main_auth',
          actualFlowType: 'storage_oauth',
          component: 'CloudStorage',
          userId: session.user.id,
          severity: 'high',
          context: {
            userAgent: 'Mozilla/5.0...',
            sessionId: 'session_123'
          }
        },
        {
          id: 'violation_2',
          timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
          route: '/api/storage/google/start',
          expectedFlowType: 'storage_oauth',
          actualFlowType: 'main_auth',
          component: 'SupabaseAuthProvider',
          userId: session.user.id,
          severity: 'medium',
          context: {
            userAgent: 'Mozilla/5.0...',
            sessionId: 'session_456'
          }
        }
      ] : [],
      trends: {
        complianceRateHistory: [
          { timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), rate: 97.5 },
          { timestamp: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(), rate: 98.2 },
          { timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(), rate: 98.8 },
          { timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), rate: 98.5 },
          { timestamp: new Date().toISOString(), rate: 98.8 }
        ]
      }
    }

    return NextResponse.json({
      success: true,
      data: mockData
    })

  } catch (error) {
    console.error('OAuth monitoring API error:', error)
    
    const monitoring = getErrorMonitoring()
    monitoring.captureError(error as Error, {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    })

    return NextResponse.json(
      { 
        error: { 
          message: 'Failed to fetch OAuth monitoring data',
          details: error instanceof Error ? error.message : 'Unknown error'
        } 
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient()
    
    // Check if user is authenticated
    const { data: { session }, error: authError } = await supabase.auth.getSession()
    
    if (authError || !session) {
      return NextResponse.json(
        { error: { message: 'Authentication required' } },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { 
      flowType, 
      provider, 
      route, 
      component, 
      success, 
      errorMessage,
      metadata 
    } = body

    // Validate required fields
    if (!flowType || !provider || !route || !component) {
      return NextResponse.json(
        { error: { message: 'Missing required fields' } },
        { status: 400 }
      )
    }

    // Validate flow type
    if (!['main_auth', 'storage_oauth'].includes(flowType)) {
      return NextResponse.json(
        { error: { message: 'Invalid flow type' } },
        { status: 400 }
      )
    }

    // In a real implementation, you would store this data in your monitoring database
    // For now, we'll just log it and return success
    
    const monitoring = getErrorMonitoring()
    monitoring.setTag('oauth_flow_type', flowType)
    monitoring.setTag('oauth_provider', provider)
    monitoring.setTag('component', component)
    monitoring.setTag('success', success?.toString() || 'unknown')
    
    monitoring.setExtra('route', route)
    monitoring.setExtra('metadata', metadata)
    
    monitoring.setUser(session.user.id)
    
    const message = success 
      ? `OAuth flow logged: ${flowType} for ${provider} via ${route}`
      : `OAuth flow failed: ${flowType} for ${provider} via ${route} - ${errorMessage}`
    
    monitoring.captureMessage(message, success ? 'info' : 'error', {
      userId: session.user.id,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    })

    return NextResponse.json({
      success: true,
      message: 'OAuth flow event logged successfully'
    })

  } catch (error) {
    console.error('OAuth monitoring POST error:', error)
    
    const monitoring = getErrorMonitoring()
    monitoring.captureError(error as Error, {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    })

    return NextResponse.json(
      { 
        error: { 
          message: 'Failed to log OAuth flow event',
          details: error instanceof Error ? error.message : 'Unknown error'
        } 
      },
      { status: 500 }
    )
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}