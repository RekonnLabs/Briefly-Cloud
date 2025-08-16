/**
 * GDPR Consent Management API
 * 
 * Handles user consent recording and retrieval
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/app/lib/auth/supabase-auth';
import { gdprService } from '@/app/lib/gdpr-compliance';
import { createApiResponse, createErrorResponse } from '@/app/lib/api-utils';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { supabaseAdmin } from '@/app/lib/supabase'

const ConsentSchema = z.object({
  consent: z.object({
    essential: z.boolean(),
    analytics: z.boolean(),
    marketing: z.boolean(),
    functional: z.boolean()
  }),
  metadata: z.object({
    version: z.string(),
    ip_address: z.string().optional(),
    user_agent: z.string().optional()
  })
});

/**
 * GET /api/gdpr/consent
 * Get current consent status for the authenticated user
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

    const consent = await gdprService.getUserConsent(userData.id);
    
    return createApiResponse(consent);

  } catch (error) {
    console.error('Error getting consent:', error);
    return createErrorResponse('Failed to get consent status', 500);
  }
}

/**
 * POST /api/gdpr/consent
 * Record user consent preferences
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return createErrorResponse('Unauthorized', 401);
    }

    const body = await request.json();
    const { consent, metadata } = ConsentSchema.parse(body);

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

    // Record consent for each type
    const consentRecords = await Promise.all([
      gdprService.recordConsent(userData.id, 'essential', consent.essential, metadata),
      gdprService.recordConsent(userData.id, 'analytics', consent.analytics, metadata),
      gdprService.recordConsent(userData.id, 'marketing', consent.marketing, metadata),
      gdprService.recordConsent(userData.id, 'functional', consent.functional, metadata)
    ]);

    return createApiResponse({
      message: 'Consent preferences saved successfully',
      records: consentRecords
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Invalid request data', 400, {
        validation_errors: error.errors
      });
    }

    console.error('Error saving consent:', error);
    return createErrorResponse('Failed to save consent preferences', 500);
  }
}