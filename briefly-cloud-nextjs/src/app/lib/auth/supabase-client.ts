/**
 * Supabase Client-Side Authentication Helpers
 * 
 * This module provides client-side authentication utilities
 * for browser-based Supabase Auth operations.
 */

import { createBrowserClient } from '@supabase/ssr'

/**
 * Create Supabase client for client-side operations (components, hooks)
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

/**
 * Get current user from client-side
 */
export async function getCurrentUser() {
  const supabase = createSupabaseBrowserClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error) {
    console.error('Error getting current user:', error)
    return null
  }
  
  return user
}

/**
 * Sign in with OAuth provider
 */
export async function signInWithProvider(
  provider: 'google' | 'azure',
  redirectTo?: string
) {
  const supabase = createSupabaseBrowserClient()
  
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: redirectTo || `${window.location.origin}/auth/callback`
    }
  })
  
  if (error) {
    console.error(`Error signing in with ${provider}:`, error)
    throw error
  }
}

/**
 * Sign out user
 */
export async function signOut() {
  const supabase = createSupabaseBrowserClient()
  const { error } = await supabase.auth.signOut()
  
  if (error) {
    console.error('Error signing out:', error)
    throw error
  }
}

/**
 * Get current session
 */
export async function getSession() {
  const supabase = createSupabaseBrowserClient()
  const { data: { session }, error } = await supabase.auth.getSession()
  
  if (error) {
    console.error('Error getting session:', error)
    return null
  }
  
  return session
}