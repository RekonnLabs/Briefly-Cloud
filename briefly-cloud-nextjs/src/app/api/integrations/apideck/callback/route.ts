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
  if (!isApideckEnabled()) return NextResponse.redirect(base);
  if (!ctx.user)           return NextResponse.redirect(new URL('/auth/signin', process.env.NEXT_PUBLIC_SITE_URL!).toString());

  try {
    const json = await Apideck.listConnections(ctx.user.id) as any;
    for (const c of (json?.data ?? [])) {
      if (!c?.connection_id || !c?.service_id) continue;
      const provider = mapServiceIdToProvider(c.service_id);
      await upsert({ user: ctx.user.id, provider, consumer: ctx.user.id, conn: c.connection_id, status: c.status ?? 'connected' });
    }
  } catch (e) {
    console.error('[apideck:callback]', e);
    return NextResponse.redirect(base + '&error=callback_failed');
  }
  return NextResponse.redirect(base + '&connected=1');
};

export const GET = createProtectedApiHandler(handler);