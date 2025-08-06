// Utility to get API base URL depending on environment
export function getApiBaseUrl() {
  // Check for environment variable first (for build-time configuration)
  const envApiUrl = import.meta.env?.VITE_API_URL || process.env.REACT_APP_API_URL;
  if (envApiUrl) {
    return envApiUrl;
  }
  
  // Check if we're in development or production
  if (typeof window !== 'undefined') {
    // Browser environment
    const hostname = window.location.hostname;
    
    // If running on localhost/127.0.0.1, use local backend
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://127.0.0.1:3001';
    }
    
    // For production deployments, use the actual Railway URL
    return 'https://web-production-375ea.up.railway.app';
  }
  
  // Fallback for Electron or other environments
  return 'http://127.0.0.1:3001';
}

export function apiUrl(path: string) {
  const base = getApiBaseUrl();
  if (path.startsWith('/')) return base + path;
  return base + '/' + path;
}
