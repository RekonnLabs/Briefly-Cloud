/**
 * Supabase Client-Side Authentication
 * 
 * This module provides client-side authentication utilities for Supabase Auth.
 * Use this in client components and browser-side code.
 * 
 * @deprecated Use getSupabaseBrowserClient() from '@/app/lib/auth/supabase-browser' instead
 * This ensures a single client instance per browser tab.
 */

import { getSupabaseBrowserClient } from '@/app/lib/auth/supabase-browser'

// Create browser client for client-side operations
/**
 * @deprecated Use getSupabaseBrowserClient() from '@/app/lib/auth/supabase-browser' instead
 */
export function createSupabaseBrowserClient() {
  console.warn('createSupabaseBrowserClient is deprecated. Use getSupabaseBrowserClient() instead.')
  return getSupabaseBrowserClient()
}

// Sign in with OAuth provider
export async function signInWithProvider(
  provider: 'google' | 'azure',
  redirectTo?: string
) {
  const supabase = getSupabaseBrowserClient()
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
  const supabase = getSupabaseBrowserClient()
  return await supabase.auth.signOut()
}

// Get current session (client-side)
export async function getSession() {
  const supabase = getSupabaseBrowserClient()
  return await supabase.auth.getSession()
}

// Get current user (client-side)
export async function getUser() {
  const supabase = getSupabaseBrowserClient()
  return await supabase.auth.getUser()
}
