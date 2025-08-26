/**
 * Clamp the next parameter to prevent open redirects
 * Only allows internal paths starting with /
 */
export function clampNext(next?: string): string {
  try {
    if (!next) return '/briefly/app/dashboard'
    const u = new URL(next, 'http://x') // base avoids throwing
    return u.origin === 'http://x' && u.pathname.startsWith('/') 
      ? u.pathname + u.search 
      : '/briefly/app/dashboard'
  } catch {
    return '/briefly/app/dashboard'
  }
}