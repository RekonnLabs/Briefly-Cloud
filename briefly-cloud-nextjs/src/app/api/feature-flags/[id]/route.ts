/**
 * Individual Feature Flag Management API
 * 
 * Endpoints for updating and deleting specific feature flags
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { featureFlagService } from '@/app/lib/feature-flags';
import { createApiResponse, createErrorResponse } from '@/app/lib/api-utils';
import { z } from 'zod';

const UpdateFeatureFlagSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  enabled: z.boolean().optional(),
  rollout_percentage: z.number().min(0).max(100).optional(),
  user_tiers: z.array(z.enum(['free', 'pro', 'pro_byok'])).optional(),
  beta_users: z.array(z.string()).optional(),
  ab_test_config: z.object({
    test_name: z.string(),
    variants: z.array(z.object({
      name: z.string(),
      description: z.string(),
      config: z.record(z.any())
    })),
    traffic_split: z.record(z.number()),
    metrics: z.array(z.string()),
    start_date: z.string().datetime(),
    end_date: z.string().datetime().optional()
  }).optional()
});

/**
 * PUT /api/feature-flags/[id]
 * Update a feature flag (admin only)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const validatedData = UpdateFeatureFlagSchema.parse(body);

    const flag = await featureFlagService.updateFeatureFlag(params.id, validatedData);
    
    return createApiResponse(flag);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Invalid request data', 400, {
        validation_errors: error.errors
      });
    }

    console.error('Error updating feature flag:', error);
    return createErrorResponse('Failed to update feature flag', 500);
  }
}

/**
 * DELETE /api/feature-flags/[id]
 * Delete a feature flag (admin only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Note: You'll need to implement deleteFeatureFlag in the service
    // For now, we'll just disable it
    const flag = await featureFlagService.updateFeatureFlag(params.id, { 
      enabled: false 
    });
    
    return createApiResponse({ 
      message: 'Feature flag disabled',
      flag 
    });

  } catch (error) {
    console.error('Error deleting feature flag:', error);
    return createErrorResponse('Failed to delete feature flag', 500);
  }
}