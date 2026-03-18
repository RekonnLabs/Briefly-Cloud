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

export function mapServiceIdToProvider(svc: string): 'google' | 'microsoft' | 'dropbox' | 'box' | 'sharepoint' {
  // Normalize: lowercase and strip separators so google-drive, google_drive,
  // and googledrive all resolve the same way.
  const normalized = svc.toLowerCase().replace(/[-_\s]/g, '');

  if (normalized === 'googledrive')        return 'google';
  if (normalized === 'onedrive')           return 'microsoft';
  if (normalized === 'microsoftonedrive')  return 'microsoft';
  if (normalized === 'sharepoint')         return 'sharepoint';
  if (normalized === 'dropbox')            return 'dropbox';
  if (normalized === 'box')                return 'box';

  // Log unrecognized service IDs loudly so future gaps are caught immediately.
  console.error('[apideck:mapServiceId] Unrecognized service_id — cannot map to valid provider:', svc);

  // Default to google rather than passing through an invalid value that will
  // violate the CHECK constraint and fail silently.
  return 'google';
}

export interface ListFilesParams { 
  folder_id?: string; 
  cursor?: string; 
  limit?: number; 
}

export const Apideck = {
  async createVaultSession(consumerId: string, redirect: string, userEmail?: string, userName?: string) {
    // Apideck App ID is base64-like format, NOT a UUID
    const API_KEY = process.env.APIDECK_API_KEY!;
    const APP_ID = process.env.APIDECK_APP_ID!;              // App ID from Apideck dashboard (base64 format)
    const VAULT_URL = process.env.APIDECK_VAULT_BASE_URL!;   // must be https://unify.apideck.com
    
    // Validate that APP_ID is not empty and has reasonable length
    if (!APP_ID || APP_ID.length < 10) {
      throw new Error(`APIDECK_APP_ID is invalid or too short: ${APP_ID}`);
    }
    
    // Ensure correct Vault URL (should be unify.apideck.com)
    if (!VAULT_URL.includes('unify.apideck.com')) {
      throw new Error(`APIDECK_VAULT_BASE_URL must be https://unify.apideck.com, got: ${VAULT_URL}`);
    }
    
    const res = await fetch(`${VAULT_URL}/vault/sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'x-apideck-app-id': APP_ID,              // header must match body
        'x-apideck-consumer-id': consumerId,     // stable per Briefly user (use Supabase user.id)
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        consumer_metadata: {
          account_name: userName || 'Briefly User',
          user_name: userName || 'Briefly User',
          email: userEmail || 'user@briefly.com'
        },
        redirect_uri: redirect,
        settings: {
          unified_apis: ['file-storage'],
          session_length: '30m',
          hide_resource_settings: false,
          show_logs: true
        }
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
    const res = await fetch(`${API}/vault/connections`, { headers: apideckHeaders(consumerId) });
    if (!res.ok) throw new Error(`connections failed: ${res.status} ${await res.text()}`);
    return res.json();
  },

  async listFiles(consumerId: string, connectionId: string, params?: ListFilesParams) {
    const q = new URLSearchParams();
    if (params?.folder_id) q.set('filter[folder_id]', params.folder_id);
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
  },

  /**
   * Fetch metadata for a single file from Apideck.
   * Used when the list endpoint doesn't return mime_type (common for Google native files).
   * Returns the data object from the response, or null on failure.
   */
  async getFileMetadata(consumerId: string, connectionId: string, fileId: string): Promise<any | null> {
    try {
      const res = await fetch(`${API}/file-storage/files/${encodeURIComponent(fileId)}`, {
        headers: { ...apideckHeaders(consumerId), 'x-apideck-connection-id': connectionId }
      });
      if (!res.ok) {
        console.warn(`[apideck:getFileMetadata] ${res.status} for file ${fileId}`);
        return null;
      }
      const json = await res.json();
      return json?.data ?? null;
    } catch (err) {
      console.warn('[apideck:getFileMetadata] fetch error', err);
      return null;
    }
  }
};
