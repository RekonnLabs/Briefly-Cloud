/**
 * Supabase Authentication Helpers
 * 
 * This module provides server-side and client-side authentication utilities
 * for Supabase Auth implementation with enterprise security features.
 */

import { createServerClient, createBrowserClient, type CookieOptions } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/app/lib/supabase-admin'

// Subscription tier definitions
export const TIER_LIMITS = {
  free: {
    tier: 'free',
    max_files: 25,
    max_llm_calls: 100,
    max_storage_bytes: 104857600, // 100MB
    features: ['basic_chat', 'google_drive', 'gpt_3_5_turbo']
  },
  pro: {
    tier: 'pro', 
    max_files: 500,
    max_llm_calls: 400,
    max_storage_bytes: 1073741824, // 1GB
    features: ['advanced_chat', 'google_drive', 'onedrive', 'priority_support', 'gpt_4_turbo']
  },
  pro_byok: {
    tier: 'pro_byok',
    max_files: 5000, 
    max_llm_calls: 2000,
    max_storage_bytes: 10737418240, // 10GB
    features: ['byok', 'advanced_chat', 'google_drive', 'onedrive', 'priority_support', 'gpt_4_turbo']
  }
} as const

// Types for authentication
export interface AuthUser {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
  subscription_tier: 'free' | 'pro' | 'pro_byok'
  subscription_status: string
  usage_count: number
  usage_limit: number
  features_enabled: Record<string, boolean>
  permissions: Record<string, boolean>
  last_login_at: string
  created_at: string
}

export interface AuthSession {
  user: AuthUser
  access_token: string
  refresh_token: string
  expires_at: number
}

/**
 * Create Supabase client for server-side operations (API routes, middleware)
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // Handle cookie setting errors in middleware
            console.warn('Failed to set cookie:', name, error)
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
            // Handle cookie removal errors in middleware
            console.warn('Failed to remove cookie:', name, error)
          }
        },
      },
    }
  )
}

/**
 * Create Supabase client for middleware operations
 */
export function createSupabaseMiddlewareClient(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  return { supabase, response }
}

/**
 * Create Supabase client for client-side operations (React components)
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

/**
 * Get authenticated user from server-side context
 * Throws error if user is not authenticated
 */
export async function getAuthenticatedUser(): Promise<AuthUser> {
  const supabase = createSupabaseServerClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    throw new Error('Unauthorized: No valid session found')
  }

  // Get full user profile from app.users table
  const { data: userProfile, error: profileError } = await supabaseAdmin
    .from('app.users')
    .select(`
      id,
      email,
      full_name,
      avatar_url,
      subscription_tier,
      subscription_status,
      chat_messages_count,
      chat_messages_limit,
      documents_uploaded,
      documents_limit,
      api_calls_count,
      api_calls_limit,
      storage_used_bytes,
      storage_limit_bytes,
      features_enabled,
      permissions,
      last_login_at,
      created_at
    `)
    .eq('id', user.id)
    .single()

  if (profileError || !userProfile) {
    throw new Error('User profile not found')
  }

  // Update last login timestamp
  await supabaseAdmin
    .from('app.users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', user.id)

  return {
    id: userProfile.id,
    email: userProfile.email,
    full_name: userProfile.full_name,
    avatar_url: userProfile.avatar_url,
    subscription_tier: userProfile.subscription_tier,
    subscription_status: userProfile.subscription_status,
    usage_count: userProfile.chat_messages_count || 0,
    usage_limit: userProfile.chat_messages_limit || TIER_LIMITS[userProfile.subscription_tier]?.max_llm_calls || 100,
    features_enabled: userProfile.features_enabled || {},
    permissions: userProfile.permissions || {},
    last_login_at: userProfile.last_login_at,
    created_at: userProfile.created_at
  }
}

/**
 * Get user session (optional - returns null if not authenticated)
 */
export async function getUserSession(): Promise<AuthUser | null> {
  try {
    return await getAuthenticatedUser()
  } catch (error) {
    return null
  }
}

/**
 * Check if user is authenticated (boolean check)
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    await getAuthenticatedUser()
    return true
  } catch (error) {
    return false
  }
}

/**
 * Check if user is admin (RekonnLabs employee)
 */
export async function isAdmin(): Promise<boolean> {
  try {
    const user = await getAuthenticatedUser()
    return user.email.endsWith('@rekonnlabs.com')
  } catch (error) {
    return false
  }
}

/**
 * Sign out user (server-side)
 */
export async function signOut(): Promise<void> {
  const supabase = createSupabaseServerClient()
  await supabase.auth.signOut()
}

/**
 * Create or update user profile after OAuth sign-in
 */
export async function createOrUpdateUserProfile(
  userId: string,
  email: string,
  fullName?: string,
  avatarUrl?: string
): Promise<AuthUser> {
  // Check if user exists
  const { data: existingUser } = await supabaseAdmin
    .from('app.users')
    .select('id')
    .eq('id', userId)
    .single()

  if (!existingUser) {
    // Create new user with free tier defaults
    const newUser = {
      id: userId,
      email,
      full_name: fullName || email.split('@')[0],
      avatar_url: avatarUrl,
      subscription_tier: 'free' as const,
      subscription_status: 'active',
      chat_messages_count: 0,
      chat_messages_limit: TIER_LIMITS.free.max_llm_calls,
      documents_uploaded: 0,
      documents_limit: TIER_LIMITS.free.max_files,
      api_calls_count: 0,
      api_calls_limit: 1000,
      storage_used_bytes: 0,
      storage_limit_bytes: TIER_LIMITS.free.max_storage_bytes,
      usage_stats: {},
      preferences: {},
      features_enabled: {
        cloud_storage: true,
        ai_chat: true,
        document_upload: true
      },
      permissions: {
        can_upload: true,
        can_chat: true,
        can_export: false
      },
      usage_reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      trial_end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      last_login_at: new Date().toISOString(),
      gdpr_consent_version: '1.0',
      marketing_consent: false,
      analytics_consent: true
    }

    const { error } = await supabaseAdmin
      .from('app.users')
      .insert(newUser)

    if (error) {
      throw new Error(`Failed to create user profile: ${error.message}`)
    }

    return {
      id: userId,
      email,
      full_name: newUser.full_name,
      avatar_url: avatarUrl,
      subscription_tier: 'free',
      subscription_status: 'active',
      usage_count: 0,
      usage_limit: TIER_LIMITS.free.max_llm_calls,
      features_enabled: newUser.features_enabled,
      permissions: newUser.permissions,
      last_login_at: newUser.last_login_at,
      created_at: new Date().toISOString()
    }
  } else {
    // Update existing user's login timestamp and profile info
    const { data: updatedUser, error } = await supabaseAdmin
      .from('app.users')
      .update({
        full_name: fullName || undefined,
        avatar_url: avatarUrl || undefined,
        last_login_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select(`
        id,
        email,
        full_name,
        avatar_url,
        subscription_tier,
        subscription_status,
        chat_messages_count,
        chat_messages_limit,
        features_enabled,
        permissions,
        last_login_at,
        created_at
      `)
      .single()

    if (error || !updatedUser) {
      throw new Error(`Failed to update user profile: ${error?.message}`)
    }

    return {
      id: updatedUser.id,
      email: updatedUser.email,
      full_name: updatedUser.full_name,
      avatar_url: updatedUser.avatar_url,
      subscription_tier: updatedUser.subscription_tier,
      subscription_status: updatedUser.subscription_status,
      usage_count: updatedUser.chat_messages_count || 0,
      usage_limit: updatedUser.chat_messages_limit || TIER_LIMITS[updatedUser.subscription_tier]?.max_llm_calls || 100,
      features_enabled: updatedUser.features_enabled || {},
      permissions: updatedUser.permissions || {},
      last_login_at: updatedUser.last_login_at,
      created_at: updatedUser.created_at
    }
  }
}

/**
 * Validate and refresh user session
 */
export async function validateSession(): Promise<{ valid: boolean; user?: AuthUser }> {
  try {
    const supabase = createSupabaseServerClient()
    
    const { data: { session }, error } = await supabase.auth.getSession()
    
    if (error || !session) {
      return { valid: false }
    }

    // Check if session is expired
    if (session.expires_at && session.expires_at * 1000 < Date.now()) {
      return { valid: false }
    }

    const user = await getAuthenticatedUser()
    return { valid: true, user }
  } catch (error) {
    return { valid: false }
  }
}

/**
 * Get OAuth provider configuration for Supabase Auth
 */
export function getOAuthConfig() {
  return {
    google: {
      enabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      scopes: 'openid email profile'
    },
    microsoft: {
      enabled: !!(process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET),
      scopes: 'openid email profile'
    }
  }
}