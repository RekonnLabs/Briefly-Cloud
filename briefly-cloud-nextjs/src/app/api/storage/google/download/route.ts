import { NextResponse } from 'next/server';
import { createProtectedApiHandler, type ApiContext } from '@/app/lib/api-middleware';
import { supabaseAdmin } from '@/app/lib/supabase-admin';
import { Apideck } from '@/app/lib/integrations/apideck';

const handler = async (req: Request, ctx: ApiContext) => {
  if (!ctx.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { fileId, format } = await req.json();

  const { data } = await supabaseAdmin.from('app.apideck_connections')
    .select('consumer_id, connection_id')
    .eq('user_id', ctx.user.id)
    .eq('provider', 'google')
    .maybeSingle();
  if (!data?.connection_id) return NextResponse.json({ error: 'not_connected' }, { status: 400 });

  const buf = await Apideck.downloadFile(data.consumer_id, data.connection_id, fileId, format);
  return new NextResponse(buf, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
};

export const POST = createProtectedApiHandler(handler);