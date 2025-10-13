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
import { getConnectionStatus } from '@/app/lib/integrations/apideck-health-check'

async function getStorageStatusApideck(userId: string) {
  try {
    // Use the enhanced connection status check that includes health information
    const status = await getConnectionStatus(userId);
    
    return {
      google: status.google ? {
        connected: status.google.connected,
        lastSync: status.google.lastSync || null,
        status: status.google.status || 'disconnected',
        needsRefresh: status.google.needsRefresh || false
      } : { connected: false, status: 'disconnected' },
      
      microsoft: status.microsoft ? {
        connected: status.microsoft.connected,
        lastSync: status.microsoft.lastSync || null,
        status: status.microsoft.status || 'disconnected',
        needsRefresh: status.microsoft.needsRefresh || false
      } : { connected: false, status: 'disconnected' }
    };
  } catch (e) {
    console.error('[apideck:status:error]', {
      userId,
      error: e instanceof Error ? e.message : 'Unknown error',
      stack: e instanceof Error ? e.stack : undefined
    });
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
