import { NextResponse } from 'next/server';
import { createProtectedApiHandler, type ApiContext } from '@/app/lib/api-middleware';
import { Apideck, mapServiceIdToProvider, isApideckEnabled } from '@/app/lib/integrations/apideck';
import { supabaseAdmin } from '@/app/lib/supabase-admin';

const upsert = async (p: { user: string; provider: string; consumer: string; conn: string; status: string; }) => {
  const { error } = await supabaseAdmin.from('app.apideck_connections').upsert({
    user_id: p.user, provider: p.provider, consumer_id: p.consumer,
    connection_id: p.conn, status: p.status, updated_at: new Date().toISOString()
  });
  if (error) throw error;
};

const handler = async (_req: Request, ctx: ApiContext) => {
  const base = new URL('/briefly/app/dashboard?tab=storage', process.env.NEXT_PUBLIC_SITE_URL!).toString();
  
  // Enhanced logging for debugging authentication issues
  console.log('[apideck:callback] Debug info:', {
    hasUser: !!ctx.user,
    userId: ctx.user?.id,
    correlationId: ctx.correlationId,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    apideckEnabled: isApideckEnabled()
  });
  
  if (!isApideckEnabled()) {
    console.log('[apideck:callback] Apideck disabled, redirecting to dashboard');
    return NextResponse.redirect(base);
  }
  
  if (!ctx.user) {
    console.log('[apideck:callback] No user found, redirecting to signin');
    return NextResponse.redirect(new URL('/auth/signin', process.env.NEXT_PUBLIC_SITE_URL!).toString());
  }

  try {
    console.log('[apideck:callback] Fetching connections for user:', ctx.user.id);
    const json = await Apideck.listConnections(ctx.user.id) as any;
    console.log('[apideck:callback] Connections response:', { 
      dataLength: json?.data?.length || 0,
      connections: json?.data?.map((c: any) => ({ 
        service_id: c.service_id, 
        connection_id: c.connection_id, 
        status: c.status 
      })) || []
    });
    
    for (const c of (json?.data ?? [])) {
      if (!c?.connection_id || !c?.service_id) continue;
      const provider = mapServiceIdToProvider(c.service_id);
      console.log('[apideck:callback] Upserting connection:', { 
        provider, 
        connection_id: c.connection_id, 
        status: c.status 
      });
      await upsert({ user: ctx.user.id, provider, consumer: ctx.user.id, conn: c.connection_id, status: c.status ?? 'connected' });
    }
  } catch (e) {
    console.error('[apideck:callback] Error processing connections:', e);
    return NextResponse.redirect(base + '&error=callback_failed');
  }
  
  console.log('[apideck:callback] Success, redirecting to dashboard');
  return NextResponse.redirect(base + '&connected=1');
};

export const GET = createProtectedApiHandler(handler);