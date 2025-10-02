/**
 * Storage Connection Status API
 * 
 * GET /api/storage/status - Get connection status for all providers
 * Supports both legacy OAuth tokens and Apideck connections based on feature flag
 */

import { NextRequest } from 'next/server'
import { createProtectedApiHandler, type ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-response'
import { TokenStore } from '@/app/lib/oauth/token-store'
import { isApideckEnabled } from '@/app/lib/integrations/apideck'
import { supabaseAdmin } from '@/app/lib/supabase-admin'

async function getStorageStatusApideck(userId: string) {
  try {
    const { data, error } = await supabaseAdmin
      .from('app.apideck_connections')
      .select('provider, status, updated_at')
      .eq('user_id', userId);
    if (error) throw error;

    const list = data || [];
    const google = list.find(x => x.provider === 'google');
    const microsoft = list.find(x => x.provider === 'microsoft');

    return {
      google:    { connected: google?.status === 'connected',    lastSync: google?.updated_at || null,    status: google?.status || 'disconnected' },
      microsoft: { connected: microsoft?.status === 'connected', lastSync: microsoft?.updated_at || null, status: microsoft?.status || 'disconnected' }
    };
  } catch (e) {
    console.error('[apideck:status]', e);
    return {
      google:    { connected: false, error: 'Failed to check connection' },
      microsoft: { connected: false, error: 'Failed to check connection' }
    };
  }
}

async function getStorageStatusLegacy(userId: string) {
  const [google, microsoft] = await Promise.all([
    TokenStore.getToken(userId, 'google'),
    TokenStore.getToken(userId, 'microsoft'),
  ]);

  const now = Date.now();
  const isConnected = (token: { expiresAt?: string | null } | null) => {
    if (!token) return false;
    if (!token.expiresAt) return true;

    const parsed = Date.parse(token.expiresAt);
    if (Number.isNaN(parsed)) return true;

    return parsed > now - 60_000;
  };

  return {
    google: {
      connected: isConnected(google),
      expiresAt: google?.expiresAt ?? null,
    },
    microsoft: {
      connected: isConnected(microsoft),
      expiresAt: microsoft?.expiresAt ?? null,
    },
  };
}

async function getStorageStatus(request: NextRequest, context: ApiContext) {
  const { user } = context;
  
  try {
    // Use Apideck or legacy OAuth based on feature flag
    const status = isApideckEnabled() 
      ? await getStorageStatusApideck(user.id)
      : await getStorageStatusLegacy(user.id);

    return ApiResponse.ok(status);
  } catch (error) {
    console.error('[storage:status:error]', {
      userId: user.id,
      correlationId: context.correlationId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return ApiResponse.serverError('Failed to get storage status');
  }
}

export const GET = createProtectedApiHandler(getStorageStatus)
