import { NextResponse } from 'next/server';
import { Apideck, validateApideckConfig, isApideckEnabled } from '@/app/lib/integrations/apideck';
import { createProtectedApiHandler, type ApiContext } from '@/app/lib/api-middleware';

const REDIRECT = process.env.APIDECK_REDIRECT_URL!;

const handler = async (_req: Request, ctx: ApiContext) => {
  if (!isApideckEnabled()) {
    console.log('[apideck:session] Apideck is disabled');
    return NextResponse.json({ error: 'Apideck disabled' }, { status: 503 });
  }
  
  if (!ctx.user) {
    console.log('[apideck:session] No user context');
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  
  try {
    console.log('[apideck:session] Validating config for user:', ctx.user.id);
    validateApideckConfig();
    
    console.log('[apideck:session] Creating vault session with redirect:', REDIRECT);
    const session = await Apideck.createVaultSession(ctx.user.id, REDIRECT);
    
    console.log('[apideck:session] Session created successfully');
    return NextResponse.json(session);
  } catch (e) {
    console.error('[apideck:session] Error creating session:', {
      error: e instanceof Error ? e.message : 'Unknown error',
      stack: e instanceof Error ? e.stack : undefined,
      userId: ctx.user.id,
      redirect: REDIRECT,
      correlationId: ctx.correlationId
    });
    
    // Provide more specific error information
    if (e instanceof Error) {
      if (e.message.includes('Missing Apideck env')) {
        return NextResponse.json({ 
          error: 'configuration_error',
          message: 'Apideck configuration is incomplete',
          details: e.message
        }, { status: 500 });
      }
      
      if (e.message.includes('Vault session failed')) {
        return NextResponse.json({ 
          error: 'apideck_api_error',
          message: 'Failed to create Apideck session',
          details: e.message
        }, { status: 500 });
      }
    }
    
    return NextResponse.json({ 
      error: 'failed_to_create_vault_session',
      message: 'An unexpected error occurred while creating the session'
    }, { status: 500 });
  }
};

export const GET = createProtectedApiHandler(handler);