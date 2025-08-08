/**
 * GDPR Data Export API
 * 
 * Handles user data export requests (Right to Data Portability - Article 20)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { gdprService } from '@/app/lib/gdpr-compliance';
import { createApiResponse, createErrorResponse } from '@/app/lib/api-utils';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/gdpr/data-export
 * Request data export for the authenticated user
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return createErrorResponse('Unauthorized', 401);
    }

    // Get user ID from database
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: userData, error } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();

    if (error || !userData) {
      return createErrorResponse('User not found', 404);
    }

    // Check if there's already a pending request
    const { data: existingRequest } = await supabase
      .from('data_export_requests')
      .select('*')
      .eq('user_id', userData.id)
      .eq('status', 'pending')
      .single();

    if (existingRequest) {
      return createErrorResponse('Data export request already pending', 409, {
        existing_request: existingRequest
      });
    }

    const exportRequest = await gdprService.requestDataExport(userData.id);
    
    return createApiResponse({
      message: 'Data export request submitted successfully',
      request: exportRequest,
      estimated_completion: '24-48 hours'
    });

  } catch (error) {
    console.error('Error requesting data export:', error);
    return createErrorResponse('Failed to request data export', 500);
  }
}

/**
 * GET /api/gdpr/data-export
 * Get status of data export requests for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return createErrorResponse('Unauthorized', 401);
    }

    // Get user ID from database
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: userData, error } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();

    if (error || !userData) {
      return createErrorResponse('User not found', 404);
    }

    // Get all export requests for this user
    const { data: requests, error: requestsError } = await supabase
      .from('data_export_requests')
      .select('*')
      .eq('user_id', userData.id)
      .order('requested_at', { ascending: false });

    if (requestsError) {
      throw new Error(`Failed to get export requests: ${requestsError.message}`);
    }

    return createApiResponse({
      requests: requests || []
    });

  } catch (error) {
    console.error('Error getting export requests:', error);
    return createErrorResponse('Failed to get export requests', 500);
  }
}