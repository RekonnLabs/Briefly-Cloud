/**
 * Monitoring Dashboard API
 * 
 * Provides comprehensive system metrics and monitoring data
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/app/lib/auth/supabase-auth';
import { createClient } from '@supabase/supabase-js';
import { createApiResponse, createErrorResponse } from '@/app/lib/api-utils';
import { supabaseAdmin } from '@/app/lib/supabase-admin'

interface SystemMetrics {
  overview: {
    totalUsers: number;
    activeUsers: number;
    totalDocuments: number;
    totalConversations: number;
    systemHealth: 'healthy' | 'degraded' | 'unhealthy';
  };
  performance: {
    averageResponseTime: number;
    errorRate: number;
    uptime: number;
    memoryUsage: number;
  };
  usage: {
    apiCallsToday: number;
    documentsProcessedToday: number;
    storageUsed: number;
    bandwidthUsed: number;
  };
  errors: {
    recentErrors: Array<{
      timestamp: string;
      error: string;
      endpoint: string;
      userId?: string;
    }>;
    errorsByType: Record<string, number>;
  };
  subscriptions: {
    freeUsers: number;
    proUsers: number;
    proByokUsers: number;
    monthlyRevenue: number;
  };
}

/**
 * GET /api/monitoring/dashboard
 * Get comprehensive system metrics (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    
    if (!user?.email) {
      return createErrorResponse('Unauthorized', 401);
    }

    // Check if user is admin
    const isAdmin = user.email.endsWith('@rekonnlabs.com');
    
    if (!isAdmin) {
      return createErrorResponse('Admin access required', 403);
    }

    const supabase = supabaseAdmin;

    // Get overview metrics
    const [
      { count: totalUsers },
      { count: activeUsers },
      { count: totalDocuments },
      { count: totalConversations }
    ] = await Promise.all([
      supabase.from('app.users').select('*', { count: 'exact', head: true }),
      supabase.from('app.users').select('*', { count: 'exact', head: true })
        .gte('last_login_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      supabase.from('file_metadata').select('*', { count: 'exact', head: true }),
      supabase.from('conversations').select('*', { count: 'exact', head: true })
    ]);

    // Get subscription metrics
    const { data: subscriptionData } = await supabase
      .from('app.users')
      .select('subscription_tier')
      .not('subscription_tier', 'is', null);

    const subscriptions = {
      freeUsers: subscriptionData?.filter(u => u.subscription_tier === 'free').length || 0,
      proUsers: subscriptionData?.filter(u => u.subscription_tier === 'pro').length || 0,
      proByokUsers: subscriptionData?.filter(u => u.subscription_tier === 'pro_byok').length || 0,
      monthlyRevenue: 0 // This would come from Stripe analytics
    };

    // Get recent errors (last 24 hours)
    const { data: recentErrors } = await supabase
      .from('audit_logs')
      .select('timestamp, details, resource_type, user_id')
      .eq('action', 'ERROR')
      .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('timestamp', { ascending: false })
      .limit(10);

    // Get usage metrics for today
    const today = new Date().toISOString().split('T')[0];
    const { data: usageData } = await supabase
      .from('audit_logs')
      .select('action, timestamp')
      .gte('timestamp', `${today}T00:00:00.000Z`)
      .lt('timestamp', `${today}T23:59:59.999Z`);

    const apiCallsToday = usageData?.filter(log => 
      log.action.startsWith('API_') || log.action === 'CHAT' || log.action === 'UPLOAD'
    ).length || 0;

    const documentsProcessedToday = usageData?.filter(log => 
      log.action === 'UPLOAD' || log.action === 'PROCESS'
    ).length || 0;

    // Calculate system health based on recent errors
    const errorRate = recentErrors ? recentErrors.length / Math.max(apiCallsToday, 1) : 0;
    let systemHealth: 'healthy' | 'degraded' | 'unhealthy';
    
    if (errorRate > 0.1) {
      systemHealth = 'unhealthy';
    } else if (errorRate > 0.05) {
      systemHealth = 'degraded';
    } else {
      systemHealth = 'healthy';
    }

    // Get memory usage (if available)
    const memoryUsage = process.memoryUsage ? 
      Math.round((process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100) : 0;

    const metrics: SystemMetrics = {
      overview: {
        totalUsers: totalUsers || 0,
        activeUsers: activeUsers || 0,
        totalDocuments: totalDocuments || 0,
        totalConversations: totalConversations || 0,
        systemHealth
      },
      performance: {
        averageResponseTime: 250, // This would come from actual monitoring
        errorRate: Math.round(errorRate * 100),
        uptime: process.uptime ? Math.round(process.uptime()) : 0,
        memoryUsage
      },
      usage: {
        apiCallsToday,
        documentsProcessedToday,
        storageUsed: 0, // This would come from Supabase storage metrics
        bandwidthUsed: 0 // This would come from Vercel analytics
      },
      errors: {
        recentErrors: recentErrors?.map(error => ({
          timestamp: error.timestamp,
          error: error.details?.error || 'Unknown error',
          endpoint: error.resource_type || 'unknown',
          userId: error.user_id
        })) || [],
        errorsByType: {} // This would be calculated from error logs
      },
      subscriptions
    };

    return createApiResponse(metrics);

  } catch (error) {
    console.error('Error fetching monitoring dashboard:', error);
    return createErrorResponse('Failed to fetch monitoring data', 500);
  }
}

/**
 * GET /api/monitoring/dashboard/alerts
 * Get active alerts and warnings
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    
    if (!user?.email?.endsWith('@rekonnlabs.com')) {
      return createErrorResponse('Admin access required', 403);
    }

    const supabase = supabaseAdmin;

    // Check for various alert conditions
    const alerts = [];

    // High error rate alert
    const { data: recentErrors } = await supabase
      .from('audit_logs')
      .select('timestamp')
      .eq('action', 'ERROR')
      .gte('timestamp', new Date(Date.now() - 60 * 60 * 1000).toISOString()); // Last hour

    if (recentErrors && recentErrors.length > 10) {
      alerts.push({
        type: 'error',
        severity: 'high',
        message: `High error rate detected: ${recentErrors.length} errors in the last hour`,
        timestamp: new Date().toISOString()
      });
    }

    // Storage usage alert
    const { data: storageData } = await supabase
      .from('file_metadata')
      .select('size');

    const totalStorage = storageData?.reduce((sum, file) => sum + (file.size || 0), 0) || 0;
    const storageGB = totalStorage / (1024 * 1024 * 1024);

    if (storageGB > 50) { // Alert if over 50GB
      alerts.push({
        type: 'warning',
        severity: 'medium',
        message: `High storage usage: ${storageGB.toFixed(2)}GB`,
        timestamp: new Date().toISOString()
      });
    }

    // Inactive users alert
    const { count: inactiveUsers } = await supabase
      .from('app.users')
      .select('*', { count: 'exact', head: true })
      .lt('last_login_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

    if (inactiveUsers && inactiveUsers > 100) {
      alerts.push({
        type: 'info',
        severity: 'low',
        message: `${inactiveUsers} users inactive for 90+ days`,
        timestamp: new Date().toISOString()
      });
    }

    return createApiResponse({ alerts });

  } catch (error) {
    console.error('Error fetching alerts:', error);
    return createErrorResponse('Failed to fetch alerts', 500);
  }
}