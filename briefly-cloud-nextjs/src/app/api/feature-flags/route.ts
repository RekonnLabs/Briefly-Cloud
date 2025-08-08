/**
 * Feature Flags API Routes
 * 
 * Provides endpoints for managing feature flags, A/B tests, and beta users
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { featureFlagService, isFeatureEnabled, UserContext } from '@/app/lib/feature-flags';
import { createApiResponse, createErrorResponse } from '@/app/lib/api-utils';
import { z } from 'zod';

// Validation schemas
const CreateFeatureFlagSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  enabled: z.boolean().default(false),
  rollout_percentage: z.number().min(0).max(100).default(0),
  user_tiers: z.array(z.enum(['free', 'pro', 'pro_byok'])).default([]),
  beta_users: z.array(z.string()).default([]),
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

const CheckFeatureSchema = z.object({
  feature_name: z.string().min(1)
});

/**
 * GET /api/feature-flags
 * Get all feature flags (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return createErrorResponse('Unauthorized', 401);
    }

    // Check if user is admin (you might want to implement proper admin role checking)
    const isAdmin = session.user.email.endsWith('@rekonnlabs.com'); // Adjust as needed
    
    if (!isAdmin) {
      return createErrorResponse('Admin access required', 403);
    }

    const flags = await featureFlagService.getAllFeatureFlags();
    
    return createApiResponse({
      flags,
      total: flags.length
    });

  } catch (error) {
    console.error('Error fetching feature flags:', error);
    return createErrorResponse('Failed to fetch feature flags', 500);
  }
}

/**
 * POST /api/feature-flags
 * Create a new feature flag (admin only)
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
    const validatedData = CreateFeatureFlagSchema.parse(body);

    const flag = await featureFlagService.createFeatureFlag(validatedData);
    
    return createApiResponse(flag, 201);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Invalid request data', 400, {
        validation_errors: error.errors
      });
    }

    console.error('Error creating feature flag:', error);
    return createErrorResponse('Failed to create feature flag', 500);
  }
}