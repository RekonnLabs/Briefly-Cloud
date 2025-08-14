/**
 * Threat Intelligence API Endpoints
 * Manage threat intelligence and IP blocking
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';

// GET /api/admin/security/threats - Get threat intelligence
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
    const threatLevel = searchParams.get('threat_level');
    const blocked = searchParams.get('blocked');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabaseAdmin
      .from('private.threat_intelligence')
      .select('*')
      .order('last_seen', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (threatLevel) {
      query = query.eq('threat_level', threatLevel);
    }
    
    if (blocked !== null) {
      query = query.eq('blocked', blocked === 'true');
    }

    const { data: threats, error } = await query;

    if (error) throw error;

    // Get total count for pagination
    let countQuery = supabaseAdmin
      .from('private.threat_intelligence')
      .select('*', { count: 'exact', head: true });

    if (threatLevel) countQuery = countQuery.eq('threat_level', threatLevel);
    if (blocked !== null) countQuery = countQuery.eq('blocked', blocked === 'true');

    const { count } = await countQuery;

    return NextResponse.json({
      threats: threats || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        has_more: (count || 0) > offset + limit
      }
    });

  } catch (error) {
    console.error('Threat intelligence API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch threat intelligence' },
      { status: 500 }
    );
  }
}

// POST /api/admin/security/threats - Add or update threat intelligence
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const {
      ip_address,
      threat_type,
      threat_level,
      description,
      blocked = false
    } = body;

    if (!ip_address || !threat_type || !threat_level) {
      return NextResponse.json(
        { error: 'Missing required fields: ip_address, threat_type, threat_level' },
        { status: 400 }
      );
    }

    // Validate threat level
    if (!['low', 'medium', 'high', 'critical'].includes(threat_level)) {
      return NextResponse.json(
        { error: 'Invalid threat_level. Must be: low, medium, high, critical' },
        { status: 400 }
      );
    }

    // Update threat intelligence using database function
    const { data, error } = await supabaseAdmin
      .rpc('update_threat_intelligence', {
        p_ip_address: ip_address,
        p_threat_type: threat_type,
        p_threat_level: threat_level,
        p_source: 'manual_admin',
        p_description: description
      });

    if (error) throw error;

    // Update blocked status if specified
    if (blocked) {
      await supabaseAdmin
        .from('private.threat_intelligence')
        .update({ blocked: true })
        .eq('id', data);
    }

    return NextResponse.json({
      success: true,
      threat_id: data,
      message: 'Threat intelligence updated successfully'
    });

  } catch (error) {
    console.error('Threat intelligence update error:', error);
    return NextResponse.json(
      { error: 'Failed to update threat intelligence' },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/security/threats - Block/unblock IPs
export async function PATCH(request: NextRequest) {
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

    const body = await request.json();
    const { threat_ids, action, reason } = body;

    if (!threat_ids || !Array.isArray(threat_ids) || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: threat_ids (array), action' },
        { status: 400 }
      );
    }

    let updateData: any = {};

    switch (action) {
      case 'block':
        updateData = { blocked: true };
        break;
      
      case 'unblock':
        updateData = { blocked: false };
        break;
      
      default:
        return NextResponse.json(
          { error: 'Invalid action. Must be: block, unblock' },
          { status: 400 }
        );
    }

    // Add reason to metadata if provided
    if (reason) {
      updateData.metadata = supabaseAdmin.rpc('jsonb_set', {
        target: 'metadata',
        path: '{admin_action}',
        new_value: JSON.stringify({
          action,
          reason,
          admin_id: user.id,
          timestamp: new Date().toISOString()
        })
      });
    }

    const { data, error } = await supabaseAdmin
      .from('private.threat_intelligence')
      .update(updateData)
      .in('id', threat_ids)
      .select();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      updated_count: data?.length || 0,
      threats: data
    });

  } catch (error) {
    console.error('Threat blocking error:', error);
    return NextResponse.json(
      { error: 'Failed to update threat blocking status' },
      { status: 500 }
    );
  }
}