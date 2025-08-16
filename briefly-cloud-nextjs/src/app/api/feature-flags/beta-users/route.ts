/**
 * Beta Users Management API
 * 
 * Endpoints for managing beta user groups
 */

import { NextRequest, NextResponse } from 'next/server';
import { featureFlagService } from '@/app/lib/feature-flags';
import { createApiResponse, createErrorResponse } from '@/app/lib/api-utils';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { supabaseAdmin } from '@/app/lib/supabase-admin'

const BetaUserSchema = z.object({
  user_id: z.string().uuid(),
  action: z.enum(['add', 'remove'])
});

const BulkBetaUserSchema = z.object({
  user_ids: z.array(z.string().uuid()),
  action: z.enum(['add', 'remove'])
});

/**
 * GET /api/feature-flags/beta-users
 * Get all beta users (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return createErrorResponse('Unauthorized', 401);
    }

    // Check if user is admin
    const isAdmin = session.user.email.endsWith('@rekonnlabs.com');

    if (!isAdmin) {
      return createErrorResponse('Admin access required', 403);
    }

    const supabase = supabaseAdmin;

    const { data: betaUsers, error } = await supabase
      .from('users')
      .select('id, email, subscription_tier, created_at')
      .eq('is_beta_user', true)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch beta users: ${error.message}`);
    }

    return createApiResponse({
      beta_users: betaUsers || [],
      total: betaUsers?.length || 0
    });

  } catch (error) {
    console.error('Error fetching beta users:', error);
    return createErrorResponse('Failed to fetch beta users', 500);
  }
}

/**
 * POST /api/feature-flags/beta-users
 * Add or remove beta users
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return createErrorResponse('Unauthorized', 401);
    }

    // Check if user is admin
    const isAdmin = session.user.email.endsWith('@rekonnlabs.com');

    if (!isAdmin) {
      return createErrorResponse('Admin access required', 403);
    }

    const body = await request.json();

    // Check if it's a bulk operation
    if (body.user_ids && Array.isArray(body.user_ids)) {
      const { user_ids, action } = BulkBetaUserSchema.parse(body);

      const results = await Promise.allSettled(
        user_ids.map(async (userId) => {
          if (action === 'add') {
            await featureFlagService.addBetaUser(userId);
          } else {
            await featureFlagService.removeBetaUser(userId);
          }
          return userId;
        })
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      return createApiResponse({
        message: `Bulk operation completed: ${successful} successful, ${failed} failed`,
        successful,
        failed,
        action
      });
    } else {
      // Single user operation
      const { user_id, action } = BetaUserSchema.parse(body);

      if (action === 'add') {
        await featureFlagService.addBetaUser(user_id);
      } else {
        await featureFlagService.removeBetaUser(user_id);
      }

      return createApiResponse({
        message: `User ${action === 'add' ? 'added to' : 'removed from'} beta group`,
        user_id,
        action
      });
    }

  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Invalid request data', 400, {
        validation_errors: error.errors
      });
    }

    console.error('Error managing beta users:', error);
    return createErrorResponse('Failed to manage beta users', 500);
  }
}