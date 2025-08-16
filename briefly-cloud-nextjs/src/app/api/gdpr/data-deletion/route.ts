/**
 * GDPR Data Deletion API
 * 
 * Handles user data deletion requests (Right to be Forgotten - Article 17)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/app/lib/auth/supabase-auth';
import { gdprService } from '@/app/lib/gdpr-compliance';
import { createApiResponse, createErrorResponse } from '@/app/lib/api-utils';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { supabaseAdmin } from '@/app/lib/supabase'

const DeletionRequestSchema = z.object({
  deletion_type: z.enum(['account', 'data_only']).default('account'),
  reason: z.string().optional()
});

/**
 * POST /api/gdpr/data-deletion
 * Request data deletion for the authenticated user
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return createErrorResponse('Unauthorized', 401);
    }

    const body = await request.json();
    const { deletion_type, reason } = DeletionRequestSchema.parse(body);

    // Get user ID from database
    const supabase = supabaseAdmin;

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
      .from('data_deletion_requests')
      .select('*')
      .eq('user_id', userData.id)
      .eq('status', 'pending')
      .single();

    if (existingRequest) {
      return createErrorResponse('Data deletion request already pending', 409, {
        existing_request: existingRequest
      });
    }

    const deletionRequest = await gdprService.requestDataDeletion(userData.id, deletion_type, reason);
    
    return createApiResponse({
      message: 'Data deletion request submitted successfully',
      request: deletionRequest,
      warning: deletion_type === 'account' 
        ? 'This will permanently delete your account and all associated data. This action cannot be undone.'
        : 'This will delete your data but keep your account active.',
      estimated_completion: '7-30 days'
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Invalid request data', 400, {
        validation_errors: error.errors
      });
    }

    console.error('Error requesting data deletion:', error);
    return createErrorResponse('Failed to request data deletion', 500);
  }
}

/**
 * GET /api/gdpr/data-deletion
 * Get status of data deletion requests for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return createErrorResponse('Unauthorized', 401);
    }

    // Get user ID from database
    const supabase = supabaseAdmin;

    const { data: userData, error } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();

    if (error || !userData) {
      return createErrorResponse('User not found', 404);
    }

    // Get all deletion requests for this user
    const { data: requests, error: requestsError } = await supabase
      .from('data_deletion_requests')
      .select('*')
      .eq('user_id', userData.id)
      .order('requested_at', { ascending: false });

    if (requestsError) {
      throw new Error(`Failed to get deletion requests: ${requestsError.message}`);
    }

    return createApiResponse({
      requests: requests || []
    });

  } catch (error) {
    console.error('Error getting deletion requests:', error);
    return createErrorResponse('Failed to get deletion requests', 500);
  }
}