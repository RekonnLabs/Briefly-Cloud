import { NextResponse } from 'next/server';
import { createProtectedApiHandler, type ApiContext } from '@/app/lib/api-middleware';
import { supabaseAdmin } from '@/app/lib/supabase-admin';
import { Apideck } from '@/app/lib/integrations/apideck';

const handler = async (req: Request, ctx: ApiContext) => {
  if (!ctx.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  
  try {
    const { fileId, format } = await req.json();

    const { data, error } = await supabaseAdmin.from('apideck_connections')
      .select('consumer_id, connection_id')
      .eq('user_id', ctx.user.id)
      .eq('provider', 'google')
      .maybeSingle();
    
    if (error) {
      console.error('[google:download:connection-lookup-error]', {
        userId: ctx.user.id,
        correlationId: ctx.correlationId,
        fileId,
        error: error.message,
        code: error.code,
        details: error.details
      });
      return NextResponse.json({ error: 'connection_lookup_failed' }, { status: 500 });
    }
    
    if (!data?.connection_id) {
      console.log('[google:download:not-connected]', {
        userId: ctx.user.id,
        correlationId: ctx.correlationId,
        fileId,
        hasData: !!data
      });
      return NextResponse.json({ error: 'not_connected' }, { status: 400 });
    }

    const buf = await Apideck.downloadFile(data.consumer_id, data.connection_id, fileId, format);
    return new NextResponse(buf, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
  } catch (error) {
    console.error('[google:download:error]', {
      userId: ctx.user.id,
      correlationId: ctx.correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json({ error: 'download_failed' }, { status: 500 });
  }
};

export const POST = createProtectedApiHandler(handler);