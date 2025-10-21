/**
 * Schema-Aware Supabase Admin Client (Server-Only)
 * 
 * This module provides server-side Supabase clients with service role key
 * for administrative operations across all schemas. Should only be used on the server.
 */

import 'server-only'
import { createClient } from '@supabase/supabase-js'

// Environment validation
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL')
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing env.SUPABASE_SERVICE_ROLE_KEY')
}

const baseConfig = {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  global: {
    headers: {
      'X-Client-Info': 'briefly-cloud-admin'
    }
  }
}

/**
 * Create schema-aware admin clients with service role key
 */
export function createServerAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      ...baseConfig,
      db: { schema: 'app' }
    }
  )
}

/**
 * Create admin client for app schema operations
 */
export function createAppAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      ...baseConfig,
      db: { schema: 'app' }
    }
  )
}

/**
 * Create admin client for public schema operations
 */
export function createPublicAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      ...baseConfig,
      db: { schema: 'public' }
    }
  )
}

/**
 * Create admin client for private schema operations
 */
export function createPrivateAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      ...baseConfig,
      db: { schema: 'private' }
    }
  )
}

// Default admin client (app schema)
export const supabaseServerAdmin = createServerAdminClient()

// Schema-specific admin clients
export const supabasePublicAdmin = createPublicAdminClient()
export const supabaseAppAdmin = createAppAdminClient()
export const supabasePrivateAdmin = createPrivateAdminClient()

// Type exports
export type SupabaseServerAdmin = typeof supabaseServerAdmin
export type SupabasePublicAdmin = typeof supabasePublicAdmin
export type SupabaseAppAdmin = typeof supabaseAppAdmin
export type SupabasePrivateAdmin = typeof supabasePrivateAdmin