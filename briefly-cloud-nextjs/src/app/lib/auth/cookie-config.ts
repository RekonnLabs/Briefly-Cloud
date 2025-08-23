/**
 * Cookie Configuration for Production
 * 
 * This module provides explicit cookie configuration for production environments
 * to prevent SameSite issues with OAuth flows.
 */

// Production cookie configuration for SameSite protection
export const productionCookieConfig = {
  name: 'sb-auth',
  lifetime: 60 * 60 * 24 * 7, // 7 days
  domain: process.env.NODE_ENV === 'production' ? 'briefly-cloud.vercel.app' : undefined,
  sameSite: 'lax' as const, // Use 'lax' instead of 'none' for better compatibility
  secure: process.env.NODE_ENV === 'production',
  httpOnly: false, // Must be false for client-side access
}

// Cookie methods for explicit configuration (if needed)
export const cookieMethods = {
  getAll() {
    if (typeof document === 'undefined') return []
    return document.cookie
      .split(';')
      .map(c => c.trim())
      .filter(c => c.length > 0)
      .map(c => {
        const [name, ...rest] = c.split('=')
        return { name: name.trim(), value: rest.join('=') }
      })
  },
  setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
    if (typeof document === 'undefined') return
    cookiesToSet.forEach(({ name, value, options }) => {
      const cookieOptions = []
      if (options?.maxAge) cookieOptions.push(`Max-Age=${options.maxAge}`)
      if (options?.domain) cookieOptions.push(`Domain=${options.domain}`)
      if (options?.path) cookieOptions.push(`Path=${options.path}`)
      if (options?.sameSite) cookieOptions.push(`SameSite=${options.sameSite}`)
      if (options?.secure) cookieOptions.push('Secure')
      if (options?.httpOnly) cookieOptions.push('HttpOnly')
      
      const cookieString = `${name}=${value}${cookieOptions.length > 0 ? '; ' + cookieOptions.join('; ') : ''}`
      document.cookie = cookieString
    })
  }
}