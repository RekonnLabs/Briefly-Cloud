import { NextResponse } from 'next/server';
import { Apideck, validateApideckConfig, isApideckEnabled } from '@/app/lib/integrations/apideck';
import { createProtectedApiHandler, type ApiContext } from '@/app/lib/api-middleware';

const REDIRECT = process.env.APIDECK_REDIRECT_URL!;

const handler = async (_req: Request, ctx: ApiContext) => {
  if (!isApideckEnabled()) return NextResponse.json({ error: 'Apideck disabled' }, { status: 403 });
  if (!ctx.user)           return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    validateApideckConfig();
    const session = await Apideck.createVaultSession(ctx.user.id, REDIRECT);
    return NextResponse.json(session);
  } catch (e) {
    console.error('[apideck:session]', e);
    return NextResponse.json({ error: 'failed_to_create_vault_session' }, { status: 500 });
  }
};

export const GET = createProtectedApiHandler(handler);