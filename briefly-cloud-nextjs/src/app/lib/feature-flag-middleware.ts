/**
 * Feature Flag Middleware
 * 
 * Middleware for checking feature flags in API routes and pages
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/app/lib/auth/supabase-auth';
import { isFeatureEnabled, UserContext } from './feature-flags';
import { createClient } from '@supabase/supabase-js';

/**
 * Middleware function to check feature flags
 */
export async function withFeatureFlag(
  featureName: string,
  handler: (req: NextRequest, context?: any) => Promise<NextResponse>,
  options: {
    fallbackResponse?: NextResponse;
    requireAuth?: boolean;
  } = {}
) {
  return async (req: NextRequest, context?: any): Promise<NextResponse> => {
    try {
      // Get user session
      const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
      
      if (options.requireAuth && !token?.email) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }

      // If no user and auth not required, check feature flag without user context
      if (!token?.email) {
        // For unauthenticated users, we can only check global feature flags
        // This is a simplified check - you might want to implement IP-based or other logic
        const result = await isFeatureEnabled(featureName, {
          user_id: 'anonymous',
          email: 'anonymous@example.com',
          subscription_tier: 'free',
          is_beta_user: false,
          created_at: new Date()
        });

        if (!result.enabled) {
          return options.fallbackResponse || NextResponse.json(
            { 
              error: 'Feature not available',
              reason: result.reason 
            },
            { status: 403 }
          );
        }

        return handler(req, context);
      }

      // Get user context from database
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { data: userData, error } = await supabase
        .from('app.users')
        .select('id, email, subscription_tier, is_beta_user, created_at')
        .eq('email', token.email)
        .single();

      if (error || !userData) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        );
      }

      const userContext: UserContext = {
        user_id: userData.id,
        email: userData.email,
        subscription_tier: userData.subscription_tier || 'free',
        is_beta_user: userData.is_beta_user || false,
        created_at: new Date(userData.created_at)
      };

      // Check feature flag
      const result = await isFeatureEnabled(featureName, userContext);

      if (!result.enabled) {
        return options.fallbackResponse || NextResponse.json(
          { 
            error: 'Feature not available',
            reason: result.reason 
          },
          { status: 403 }
        );
      }

      // Add feature flag result to request headers for use in handler
      const requestHeaders = new Headers(req.headers);
      requestHeaders.set('x-feature-flag-result', JSON.stringify(result));
      
      const modifiedRequest = new NextRequest(req.url, {
        method: req.method,
        headers: requestHeaders,
        body: req.body
      });

      return handler(modifiedRequest, context);

    } catch (error) {
      console.error('Feature flag middleware error:', error);
      
      // Fail open - allow request to proceed
      return handler(req, context);
    }
  };
}

/**
 * Higher-order function for API route handlers with feature flags
 */
export function withFeatureFlagAPI(
  featureName: string,
  handler: (req: NextRequest, context?: any) => Promise<NextResponse>,
  options: {
    requireAuth?: boolean;
    fallbackMessage?: string;
  } = {}
) {
  return withFeatureFlag(
    featureName,
    handler,
    {
      requireAuth: options.requireAuth,
      fallbackResponse: NextResponse.json(
        { 
          error: 'Feature not available',
          message: options.fallbackMessage || `The ${featureName} feature is not currently available for your account.`
        },
        { status: 403 }
      )
    }
  );
}

/**
 * Utility function to get feature flag result from request headers
 */
export function getFeatureFlagResult(req: NextRequest) {
  const headerValue = req.headers.get('x-feature-flag-result');
  if (!headerValue) return null;
  
  try {
    return JSON.parse(headerValue);
  } catch {
    return null;
  }
}

/**
 * Client-side feature flag checker for pages
 */
export async function checkFeatureFlagClient(featureName: string): Promise<{
  enabled: boolean;
  variant?: string;
  config?: Record<string, any>;
  reason: string;
}> {
  try {
    const response = await fetch('/api/feature-flags/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        feature_name: featureName
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      enabled: data.enabled,
      variant: data.variant,
      config: data.config,
      reason: data.reason
    };

  } catch (error) {
    console.error('Error checking feature flag:', error);
    return {
      enabled: false,
      reason: 'Error checking feature flag'
    };
  }
}

/**
 * Batch feature flag checker for multiple features
 */
export async function checkMultipleFeatureFlags(featureNames: string[]): Promise<Record<string, {
  enabled: boolean;
  variant?: string;
  config?: Record<string, any>;
  reason: string;
}>> {
  try {
    const promises = featureNames.map(async (featureName) => {
      const result = await checkFeatureFlagClient(featureName);
      return { featureName, result };
    });

    const results = await Promise.allSettled(promises);
    const flagResults: Record<string, any> = {};

    results.forEach((result, index) => {
      const featureName = featureNames[index];
      
      if (result.status === 'fulfilled') {
        flagResults[featureName] = result.value.result;
      } else {
        flagResults[featureName] = {
          enabled: false,
          reason: 'Error checking feature flag'
        };
      }
    });

    return flagResults;

  } catch (error) {
    console.error('Error checking multiple feature flags:', error);
    
    // Return disabled state for all features
    const errorResults: Record<string, any> = {};
    featureNames.forEach(name => {
      errorResults[name] = {
        enabled: false,
        reason: 'Error checking feature flag'
      };
    });
    
    return errorResults;
  }
}