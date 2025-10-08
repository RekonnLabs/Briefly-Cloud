/**
 * Apideck Unified API Client
 */

const API = process.env.APIDECK_API_BASE_URL!;
const VAULT = process.env.APIDECK_VAULT_BASE_URL!;
const APP_ID = process.env.APIDECK_APP_ID!;
const KEY = process.env.APIDECK_API_KEY!;

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
    // App ID is required in the BODY for Vault sessions
    const applicationId = process.env.APIDECK_APP_ID!;
    const res = await fetch(`${process.env.APIDECK_VAULT_BASE_URL!}/sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.APIDECK_API_KEY!}`,
        'x-apideck-app-id': applicationId,
        'x-apideck-consumer-id': consumerId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        application_id: applicationId,     // <-- this is the key bit
        unified_api: 'file-storage',
        redirect_uri: redirect
      })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Vault session failed: ${res.status} ${text}`);
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