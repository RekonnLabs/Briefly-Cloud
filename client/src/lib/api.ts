// Utility to get API base URL depending on environment
export function getApiBaseUrl() {
  // In Electron prod, window.location.origin is file://, so always use localhost:3001
  return 'http://127.0.0.1:3001';
}

export function apiUrl(path: string) {
  const base = getApiBaseUrl();
  if (path.startsWith('/')) return base + path;
  return base + '/' + path;
}
