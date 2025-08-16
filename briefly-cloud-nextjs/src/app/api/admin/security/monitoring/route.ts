/**
 * Security Monitoring API Endpoints
 * Real-time security monitoring and metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/app/lib/auth/supabase-auth';
import { securityMonitor } from '@/app/lib/monitoring/security-monitor';
import { supabaseAdmin } from '@/app/lib/supabase';

// GET /api/admin/security/monitoring - Get security dashboard data
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    
    // Check if user is admin
    const { data: userData } = await supabaseAdmin
      .from('app.users')
      .select('email')
      .eq('id', user.id)
      .single();

    if (!userData?.email?.endsWith('@rekonnlabs.com')) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const timeWindow = searchParams.get('timeWindow') || '1h';
    const includeAlerts = searchParams.get('includeAlerts') !== 'false';
    const includeThreats = searchParams.get('includeThreats') !== 'false';

    // Get security dashboard data
    const dashboardData = await securityMonitor.getSecurityDashboard();

    // Get additional data based on query parameters
    let additionalData: any = {};

    if (includeAlerts) {
      const { data: alerts } = await supabaseAdmin
        .from('private.security_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      
      additionalData.recent_alerts = alerts || [];
    }

    if (includeThreats) {
      const { data: threats } = await supabaseAdmin
        .from('private.threat_intelligence')
        .select('*')
        .order('last_seen', { ascending: false })
        .limit(10);
      
      additionalData.threat_intelligence = threats || [];
    }

    // Get security events summary
    const { data: eventsSummary } = await supabaseAdmin
      .rpc('get_security_events_by_type', {
        time_window: timeWindow === '1h' ? '1 hour' : 
                    timeWindow === '24h' ? '24 hours' : 
                    timeWindow === '7d' ? '7 days' : '1 hour'
      });

    // Get security metrics summary
    const { data: metricsSummary } = await supabaseAdmin
      .rpc('get_security_metrics_summary', {
        time_window: timeWindow === '1h' ? '1 hour' : 
                    timeWindow === '24h' ? '24 hours' : 
                    timeWindow === '7d' ? '7 days' : '1 hour'
      });

    // Detect anomalies
    const { data: anomalies } = await supabaseAdmin
      .rpc('detect_security_anomalies', { threshold_multiplier: 3.0 });

    return NextResponse.json({
      dashboard: dashboardData,
      events_summary: eventsSummary || [],
      metrics_summary: metricsSummary || [],
      anomalies: anomalies || [],
      ...additionalData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Security monitoring API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch security monitoring data' },
      { status: 500 }
    );
  }
}

// POST /api/admin/security/monitoring - Log security event
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const body = await request.json();

    const {
      type,
      severity,
      source,
      metadata = {},
      user_id,
      ip_address,
      user_agent
    } = body;

    // Validate required fields
    if (!type || !severity || !source) {
      return NextResponse.json(
        { error: 'Missing required fields: type, severity, source' },
        { status: 400 }
      );
    }

    // Log security event
    await securityMonitor.logSecurityEvent({
      type,
      severity,
      source,
      user_id: user_id || user.id,
      ip_address: ip_address || request.ip,
      user_agent: user_agent || request.headers.get('user-agent'),
      metadata
    });

    return NextResponse.json({
      success: true,
      message: 'Security event logged successfully'
    });

  } catch (error) {
    console.error('Security event logging error:', error);
    return NextResponse.json(
      { error: 'Failed to log security event' },
      { status: 500 }
    );
  }
}