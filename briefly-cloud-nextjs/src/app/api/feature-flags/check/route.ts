/**
 * Feature Flag Check API
 * 
 * Endpoint for checking if a feature is enabled for the current user
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isFeatureEnabled, UserContext } from '@/app/lib/feature-flags';
import { createApiResponse, createErrorResponse } from '@/app/lib/api-utils';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { supabaseAdmin } from '@/app/lib/supabase'

const CheckFeatureSchema = z.object({
  feature_name: z.string().min(1)
});

/**
 * POST /api/feature-flags/check
 * Check if a feature is enabled for the current user
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return createErrorResponse('Unauthorized', 401);
    }

    const body = await request.json();
    const { feature_name } = CheckFeatureSchema.parse(body);

    // Get user context from database
    const supabase = supabaseAdmin;

    const { data: userData, error } = await supabase
      .from('users')
      .select('id, email, subscription_tier, is_beta_user, created_at')
      .eq('email', session.user.email)
      .single();

    if (error || !userData) {
      return createErrorResponse('User not found', 404);
    }

    const userContext: UserContext = {
      user_id: userData.id,
      email: userData.email,
      subscription_tier: userData.subscription_tier || 'free',
      is_beta_user: userData.is_beta_user || false,
      created_at: new Date(userData.created_at)
    };

    const result = await isFeatureEnabled(feature_name, userContext);
    
    return createApiResponse({
      feature_name,
      ...result
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Invalid request data', 400, {
        validation_errors: error.errors
      });
    }

    console.error('Error checking feature flag:', error);
    return createErrorResponse('Failed to check feature flag', 500);
  }
}

/**
 * GET /api/feature-flags/check?feature=<feature_name>
 * Alternative GET endpoint for checking features
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return createErrorResponse('Unauthorized', 401);
    }

    const { searchParams } = new URL(request.url);
    const feature_name = searchParams.get('feature');

    if (!feature_name) {
      return createErrorResponse('feature parameter is required', 400);
    }

    // Get user context from database
    const supabase = supabaseAdmin;

    const { data: userData, error } = await supabase
      .from('users')
      .select('id, email, subscription_tier, is_beta_user, created_at')
      .eq('email', session.user.email)
      .single();

    if (error || !userData) {
      return createErrorResponse('User not found', 404);
    }

    const userContext: UserContext = {
      user_id: userData.id,
      email: userData.email,
      subscription_tier: userData.subscription_tier || 'free',
      is_beta_user: userData.is_beta_user || false,
      created_at: new Date(userData.created_at)
    };

    const result = await isFeatureEnabled(feature_name, userContext);
    
    return createApiResponse({
      feature_name,
      ...result
    });

  } catch (error) {
    console.error('Error checking feature flag:', error);
    return createErrorResponse('Failed to check feature flag', 500);
  }
}