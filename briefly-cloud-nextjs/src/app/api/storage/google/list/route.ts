import { NextResponse } from 'next/server';
import { createProtectedApiHandler, type ApiContext } from '@/app/lib/api-middleware';
import { supabaseAdmin } from '@/app/lib/supabase-admin';
import { Apideck, isApideckEnabled } from '@/app/lib/integrations/apideck';
import { GoogleDriveProvider } from '@/app/lib/cloud-storage';

async function listGoogleFilesApideck(req: Request, ctx: ApiContext) {
  if (!ctx.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const folderId = url.searchParams.get('folderId') || undefined;
  const cursor   = url.searchParams.get('cursor') || undefined;
  const limit    = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : 100;

  const { data, error } = await supabaseAdmin.from('app.apideck_connections')
    .select('consumer_id, connection_id')
    .eq('user_id', ctx.user.id)
    .eq('provider', 'google')
    .maybeSingle();
  
  if (error) {
    console.error('[google:list:connection-lookup-error]', {
      userId: ctx.user.id,
      correlationId: ctx.correlationId,
      error: error.message,
      code: error.code,
      details: error.details
    });
    return NextResponse.json({ error: 'connection_lookup_failed' }, { status: 500 });
  }
  
  if (!data?.connection_id) {
    console.log('[google:list:not-connected]', {
      userId: ctx.user.id,
      correlationId: ctx.correlationId,
      hasData: !!data
    });
    return NextResponse.json({ error: 'not_connected' }, { status: 400 });
  }

  const resp = await Apideck.listFiles(data.consumer_id, data.connection_id, { folder_id: folderId, cursor, limit });

  const items = (resp?.data ?? []);
  const files = items.filter((i: any) => i.type !== 'folder').map((i: any) => ({
    id: i.id, name: i.name,
    size: i.size || 0,
    mimeType: i.mime_type || 'application/octet-stream',
    modifiedTime: i.updated_at,
    webViewLink: i.web_url
  }));
  const folders = items.filter((i: any) => i.type === 'folder').map((i: any) => ({
    id: i.id, name: i.name,
    mimeType: 'application/vnd.google-apps.folder',
    modifiedTime: i.updated_at,
    webViewLink: i.web_url
  }));

  return NextResponse.json({
    files, folders,
    nextPageToken: resp?.meta?.cursors?.next || null,
    hasMore: !!resp?.meta?.cursors?.next
  });
}

async function listGoogleFilesLegacy(req: Request, ctx: ApiContext) {
  const { user } = ctx;
  try {
    const { searchParams } = new URL(req.url);
    const folderId = searchParams.get('folderId') || 'root';
    const pageToken = searchParams.get('pageToken') || undefined;
    const pageSize = Math.min(1000, Math.max(1, parseInt(searchParams.get('pageSize') || '100')));

    const provider = new GoogleDriveProvider();
    const result = await provider.listFiles(user.id, folderId, pageToken, pageSize);

    return NextResponse.json({
      files: result.files,
      folders: result.folders,
      nextPageToken: result.nextPageToken,
      hasMore: result.hasMore
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('unauthorized')) {
      return NextResponse.json({ error: 'Google Drive access token is invalid or expired' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to list Google Drive files' }, { status: 500 });
  }
}

const handler = async (req: Request, ctx: ApiContext) => {
  if (!ctx.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  
  if (isApideckEnabled()) {
    return listGoogleFilesApideck(req, ctx);
  } else {
    return listGoogleFilesLegacy(req, ctx);
  }
};

export const GET = createProtectedApiHandler(handler);