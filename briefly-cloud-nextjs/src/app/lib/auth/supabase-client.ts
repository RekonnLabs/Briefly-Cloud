/**
 * Supabase Client-Side Authentication
 * 
 * This module provides client-side authentication utilities for Supabase Auth.
 * Use this in client components and browser-side code.
 */

import { createBrowserClient } from '@supabase/ssr'

// Create browser client for client-side operations
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Sign in with OAuth provider
export async function signInWithProvider(
  provider: 'google' | 'azure',
  redirectTo?: string
) {
  const supabase = createSupabaseBrowserClient()
  
  return await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: redirectTo || `${window.location.origin}/auth/callback`,
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