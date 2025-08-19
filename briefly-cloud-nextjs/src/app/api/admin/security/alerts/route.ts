/**
 * Security Alerts API Endpoints
 * Manage security alerts and notifications
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/app/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/app/lib/supabase-admin';

// GET /api/admin/security/alerts - Get security alerts
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    
    // Check if user is admin
    const { data: userData } = await supabaseAdmin
      .from('users')
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
    const severity = searchParams.get('severity');
    const acknowledged = searchParams.get('acknowledged');
    const resolved = searchParams.get('resolved');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabaseAdmin
      .from('private.security_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (severity) {
      query = query.eq('severity', severity);
    }
    
    if (acknowledged !== null) {
      query = query.eq('acknowledged', acknowledged === 'true');
    }
    
    if (resolved !== null) {
      query = query.eq('resolved', resolved === 'true');
    }

    const { data: alerts, error } = await query;

    if (error) throw error;

    // Get total count for pagination
    let countQuery = supabaseAdmin
      .from('private.security_alerts')
      .select('*', { count: 'exact', head: true });

    if (severity) countQuery = countQuery.eq('severity', severity);
    if (acknowledged !== null) countQuery = countQuery.eq('acknowledged', acknowledged === 'true');
    if (resolved !== null) countQuery = countQuery.eq('resolved', resolved === 'true');

    const { count } = await countQuery;

    return NextResponse.json({
      alerts: alerts || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        has_more: (count || 0) > offset + limit
      }
    });

  } catch (error) {
    console.error('Security alerts API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch security alerts' },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/security/alerts - Update alert status
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    
    // Check if user is admin
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('email')
      .eq('id', user.id)
      .single();

    if (!userData?.email?.endsWith('@rekonnlabs.com')) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { alert_ids, action, notes } = body;

    if (!alert_ids || !Array.isArray(alert_ids) || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: alert_ids (array), action' },
        { status: 400 }
      );
    }

    let updateData: any = {};

    switch (action) {
      case 'acknowledge':
        updateData = {
          acknowledged: true,
          acknowledged_by: user.id,
          acknowledged_at: new Date().toISOString()
        };
        break;
      
      case 'resolve':
        updateData = {
          resolved: true,
          resolved_by: user.id,
          resolved_at: new Date().toISOString(),
          acknowledged: true,
          acknowledged_by: user.id,
          acknowledged_at: new Date().toISOString()
        };
        break;
      
      case 'unacknowledge':
        updateData = {
          acknowledged: false,
          acknowledged_by: null,
          acknowledged_at: null
        };
        break;
      
      case 'unresolve':
        updateData = {
          resolved: false,
          resolved_by: null,
          resolved_at: null
        };
        break;
      
      default:
        return NextResponse.json(
          { error: 'Invalid action. Must be: acknowledge, resolve, unacknowledge, unresolve' },
          { status: 400 }
        );
    }

    // Add notes to metadata if provided
    if (notes) {
      updateData.metadata = supabaseAdmin.rpc('jsonb_set', {
        target: 'metadata',
        path: '{admin_notes}',
        new_value: JSON.stringify(notes)
      });
    }

    const { data, error } = await supabaseAdmin
      .from('private.security_alerts')
      .update(updateData)
      .in('id', alert_ids)
      .select();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      updated_count: data?.length || 0,
      alerts: data
    });

  } catch (error) {
    console.error('Security alert update error:', error);
    return NextResponse.json(
      { error: 'Failed to update security alerts' },
      { status: 500 }
    );
  }
}