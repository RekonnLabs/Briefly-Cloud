/**
 * Apideck Unified API Client
 */

const API = process.env.APIDECK_API_BASE_URL!;
const VAULT = process.env.APIDECK_VAULT_BASE_URL!;
const APP_ID = process.env.APIDECK_APP_ID!;
const KEY = process.env.APIDECK_API_KEY!;

function buildVaultSessionEndpoint(base: string): string {
  let normalized = base.trim();

  if (!normalized) {
    throw new Error('APIDECK_VAULT_BASE_URL is empty');
  }

  if (!normalized.includes('://')) {
    normalized = `https://${normalized}`;
  }

  if (/^https:\/\/vault\.apideck\.com\/?$/i.test(normalized)) {
    normalized = 'https://unify.apideck.com/vault';
  }

  // Ensure we only have a single trailing slash for concatenation
  normalized = normalized.replace(/\/+$/, '');

  if (!/\/vault($|\/)/i.test(new URL(normalized).pathname)) {
    normalized = `${normalized}/vault`;
  }

  if (!normalized.endsWith('/sessions')) {
    normalized = `${normalized}/sessions`;
  }

  return normalized;
}

type HeadersBase = Record<string,string>;

export const apideckHeaders = (consumerId: string): HeadersBase => ({
  'Authorization': `Bearer ${KEY}`,
  'x-apideck-app-id': APP_ID,
  'x-apideck-consumer-id': consumerId,
  'Content-Type': 'application/json'
});

export function isApideckEnabled() {
  return process.env.APIDECK_ENABLED === 'true';
}

export function validateApideckConfig() {
  const required = [
    'APIDECK_API_KEY',
    'APIDECK_APP_ID',
    'APIDECK_API_BASE_URL',
    'APIDECK_VAULT_BASE_URL',
    'APIDECK_REDIRECT_URL'
  ];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) throw new Error(`Missing Apideck env: ${missing.join(', ')}`);
}

export function mapServiceIdToProvider(svc: string): 'google'|'microsoft'|string {
  if (svc === 'googledrive' || svc === 'google-drive') return 'google';
  if (svc === 'onedrive') return 'microsoft';
  return svc;
}

export interface ListFilesParams { 
  folder_id?: string; 
  cursor?: string; 
  limit?: number; 
}

export const Apideck = {
  async createVaultSession(consumerId: string, redirect: string) {
    // Force rebuild - UUID validation removed, accepts base64 App ID format
    const API_KEY = process.env.APIDECK_API_KEY!;
    const APP_ID = process.env.APIDECK_APP_ID!;              // UUID from Apideck dashboard
    const VAULT_URL = process.env.APIDECK_VAULT_BASE_URL!;   // must be https://vault.apideck.com
    
    // Validate that APP_ID is a UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(APP_ID)) {
      throw new Error(`APIDECK_APP_ID must be a valid UUID, got: ${APP_ID}`);
    }
    
    // Ensure correct Vault URL
    if (!VAULT_URL.includes('vault.apideck.com')) {
      throw new Error(`APIDECK_VAULT_BASE_URL must be https://vault.apideck.com, got: ${VAULT_URL}`);
    }
    
    const res = await fetch(`${VAULT_URL}/sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'x-apideck-app-id': APP_ID,              // header must match body
        'x-apideck-consumer-id': consumerId,     // stable per Briefly user (use Supabase user.id)
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        application_id: APP_ID,                  // REQUIRED and must be a UUID
        unified_api: 'file-storage',
        redirect_uri: redirect                   // e.g. https://briefly.rekonnlabs.com/api/integrations/apideck/callback
      })
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error('[apideck:session]', { 
        status: res.status, 
        txt,
        appId: APP_ID,
        vaultUrl: VAULT_URL,
        consumerId,
        redirect
      });
      throw new Error(`Vault session failed: ${res.status} ${txt}`);
    }
    return res.json();
  },

  async listConnections(consumerId: string) {
    const res = await fetch(`${API}/unified/connections`, { headers: apideckHeaders(consumerId) });
    if (!res.ok) throw new Error(`connections failed: ${res.status} ${await res.text()}`);
    return res.json();
  },

  async listFiles(consumerId: string, connectionId: string, params?: ListFilesParams) {
    const q = new URLSearchParams();
    if (params?.folder_id) q.set('folder_id', params.folder_id);
    if (params?.cursor)   q.set('cursor', params.cursor);
    if (params?.limit)    q.set('limit', String(params.limit));
    const res = await fetch(`${API}/file-storage/files?${q.toString()}`, {
      headers: { ...apideckHeaders(consumerId), 'x-apideck-connection-id': connectionId }
    });
    if (!res.ok) throw new Error(`listFiles failed: ${res.status} ${await res.text()}`);
    return res.json();
  },

  async downloadFile(consumerId: string, connectionId: string, fileId: string, format?: string) {
    const q = new URLSearchParams();
    if (format) q.set('format', format);
    const res = await fetch(`${API}/file-storage/files/${encodeURIComponent(fileId)}/download?${q.toString()}`, {
      headers: { ...apideckHeaders(consumerId), 'x-apideck-connection-id': connectionId }
    });
    if (!res.ok) throw new Error(`download failed: ${res.status} ${await res.text()}`);
    return Buffer.from(await res.arrayBuffer());
  }
};
