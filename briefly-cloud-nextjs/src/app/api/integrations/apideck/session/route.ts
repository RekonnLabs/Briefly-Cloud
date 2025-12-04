import { NextResponse } from 'next/server';
import { Apideck, validateApideckConfig, isApideckEnabled } from '@/app/lib/integrations/apideck';
import { getSupabaseServerReadOnly } from '@/app/lib/auth/supabase-server-readonly';

// Force dynamic rendering to ensure proper session handling
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // Use read-only server client that handles App Router cookie edge cases
  const supabase = await getSupabaseServerReadOnly();
  const { data: { user }, error } = await supabase.auth.getUser();

  // Enhanced logging for debugging
  console.log('[apideck:session] Session check result:', {
    hasUser: !!user,
    userId: user?.id,
    authError: error?.message,
    timestamp: new Date().toISOString()
  });

  if (error || !user) {
    console.log('[apideck:session] Authentication failed:', {
      error: error?.message,
      hasUser: !!user,
      userId: user?.id
    });
    return NextResponse.json({ 
      success: false, 
      error: 'UNAUTHORIZED',
      message: 'Authentication required for API Deck session'
    }, { status: 401 });
  }

  // Check if Apideck is enabled
  if (!isApideckEnabled()) {
    console.log('[apideck:session] Apideck is disabled');
    return NextResponse.json({ 
      success: false, 
      error: 'Apideck disabled' 
    }, { status: 503 });
  }

  try {
    // Validate required environment variables (fail fast with clear message)
    const { APIDECK_APP_ID, APIDECK_API_KEY, APIDECK_REDIRECT_URL } = process.env;
    
    console.log('[apideck:session] Environment validation:', {
      hasAppId: !!APIDECK_APP_ID,
      hasApiKey: !!APIDECK_API_KEY,
      hasRedirect: !!APIDECK_REDIRECT_URL,
      userId: user.id
    });

    if (!APIDECK_APP_ID || !APIDECK_API_KEY || !APIDECK_REDIRECT_URL) {
      console.error('[apideck:session] Missing environment variables:', {
        hasAppId: !!APIDECK_APP_ID,
        hasApiKey: !!APIDECK_API_KEY,
        hasRedirect: !!APIDECK_REDIRECT_URL
      });
      return NextResponse.json({ 
        success: false, 
        error: 'CONFIG_MISSING',
        message: 'API Deck configuration is incomplete'
      }, { status: 500 });
    }

    // Validate Apideck configuration
    validateApideckConfig();
    
    console.log('[apideck:session] Creating vault session for user:', user.id);
    
    // Create Apideck vault session with user metadata
    const session = await Apideck.createVaultSession(
      user.id, 
      process.env.APIDECK_REDIRECT_URL!,
      user.email,
      user.user_metadata?.name || user.email?.split('@')[0]
    );
    
    console.log('[apideck:session] Session created successfully:', {
      userId: user.id,
      sessionId: session?.id || 'unknown'
    });
    
    return NextResponse.json({
      success: true,
      session,
      userId: user.id
    });
    
  } catch (e) {
    console.error('[apideck:session] Error creating session:', {
      error: e instanceof Error ? e.message : 'Unknown error',
      stack: e instanceof Error ? e.stack : undefined,
      userId: user.id,
      redirect: process.env.APIDECK_REDIRECT_URL
    });
    
    // Provide more specific error information
    if (e instanceof Error) {
      if (e.message.includes('Missing Apideck env')) {
        return NextResponse.json({ 
          success: false,
          error: 'CONFIGURATION_ERROR',
          message: 'API Deck configuration is incomplete',
          details: e.message
        }, { status: 500 });
      }
      
      if (e.message.includes('Vault session failed')) {
        return NextResponse.json({ 
          success: false,
          error: 'APIDECK_API_ERROR',
          message: 'Failed to create API Deck session',
          details: e.message
        }, { status: 500 });
      }
    }
    
    return NextResponse.json({ 
      success: false,
      error: 'FAILED_TO_CREATE_SESSION',
      message: 'An unexpected error occurred while creating the session'
    }, { status: 500 });
  }
}

// Keep GET for backward compatibility, but recommend using POST
export async function GET(req: Request) {
  return POST(req);
}