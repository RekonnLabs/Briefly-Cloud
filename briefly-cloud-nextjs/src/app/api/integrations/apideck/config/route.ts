import { NextResponse } from 'next/server';
import { createProtectedApiHandler, type ApiContext } from '@/app/lib/api-middleware';

const handler = async (_req: Request, ctx: ApiContext) => {
  if (!ctx.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Check Apideck configuration without exposing sensitive values
  const config = {
    enabled: process.env.APIDECK_ENABLED === 'true',
    hasApiKey: !!process.env.APIDECK_API_KEY && process.env.APIDECK_API_KEY !== 'sk_xxx',
    hasAppId: !!process.env.APIDECK_APP_ID && process.env.APIDECK_APP_ID !== 'app_xxx',
    hasAppUid: !!process.env.APIDECK_APP_UID && process.env.APIDECK_APP_UID !== 'app_uid_xxx',
    hasApiBaseUrl: !!process.env.APIDECK_API_BASE_URL,
    hasVaultBaseUrl: !!process.env.APIDECK_VAULT_BASE_URL,
    hasRedirectUrl: !!process.env.APIDECK_REDIRECT_URL,
    apiKeyFormat: process.env.APIDECK_API_KEY?.startsWith('sk_') ? 'valid' : 'invalid',
    appIdFormat: process.env.APIDECK_APP_ID?.startsWith('app_') ? 'valid' : 'invalid',
    appUidFormat: process.env.APIDECK_APP_UID?.startsWith('app_uid_') ? 'valid' : 'invalid',
    redirectUrl: process.env.APIDECK_REDIRECT_URL,
    vaultBaseUrl: process.env.APIDECK_VAULT_BASE_URL
  };

  return NextResponse.json({ config });
};

export const GET = createProtectedApiHandler(handler);