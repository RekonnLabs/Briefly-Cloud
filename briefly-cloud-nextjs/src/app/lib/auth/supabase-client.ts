/**
 * Supabase Client-Side Authentication
 * 
 * This module provides client-side authentication utilities for Supabase Auth.
 * Use this in client components and browser-side code.
 * 
 * Note: For production cookie configuration with explicit SameSite settings,
 * see cookie-config.ts. The default configuration here works well for most cases
 * and avoids SSR issues during build time.
 */

import { createBrowserClient } from '@supabase/ssr'

// Create browser client for client-side operations
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { 
      db: { schema: 'app' },
      global: {
        headers: {
          'X-Client-Info': 'briefly-cloud-browser'
        }
      },
      cookies: {
        name: 'sb-auth',
        lifetime: 60 * 60 * 24 * 7,
        sameSite: 'none',
        secure: true,
        // omit domain so it binds to briefly-cloud.vercel.app
      }
    }
  )
}

// Sign in with OAuth provider
export async function signInWithProvider(
  provider: 'google' | 'azure',
  redirectTo?: string
) {
  const supabase = createSupabaseBrowserClient()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')
  
  return await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: redirectTo || `${siteUrl}/auth/callback`,
      scopes: 'openid email profile'
    }
  })
}

// Sign out
export async function signOut() {
  const supabase = createSupabaseBrowserClient()
  return await supabase.auth.signOut()
}

// Get current session (client-side)
export async function getSession() {
  const supabase = createSupabaseBrowserClient()
  return await supabase.auth.getSession()
}

// Get current user (client-side)
export async function getUser() {
  const supabase = createSupabaseBrowserClient()
  return await supabase.auth.getUser()
}