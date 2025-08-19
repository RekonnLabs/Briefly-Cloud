/**
 * Supabase Admin Client (Server-Only)
 * 
 * This module provides server-side Supabase client with service role key
 * for administrative operations. Should only be used on the server.
 */

import 'server-only'
import { createClient } from '@supabase/supabase-js'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL')
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing env.SUPABASE_SERVICE_ROLE_KEY')
}

// Create Supabase admin client with service role key
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    db: { schema: 'app' }
  }
)

// Type helper for admin operations
export type SupabaseAdmin = typeof supabaseAdmin