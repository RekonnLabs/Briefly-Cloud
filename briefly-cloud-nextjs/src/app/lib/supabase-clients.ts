/**
 * Schema-Aware Supabase Client Factory
 * 
 * This module provides schema-aware Supabase clients for the multi-tenant
 * database architecture with app, private, and public schemas.
 */

import 'server-only'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Environment validation - skip during build process
if (typeof window === 'undefined' && process.env.NODE_ENV !== 'production') {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.warn('Missing env.NEXT_PUBLIC_SUPABASE_URL - using placeholder for build')
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('Missing env.SUPABASE_SERVICE_ROLE_KEY - using placeholder for build')
  }
}

// TypeScript interfaces for schema configuration
export interface SchemaConfig {
  app: SupabaseClient<any, 'app', any>
  private: SupabaseClient<any, 'private', any>
}

/**
 * Creates schema-aware Supabase clients for multi-tenant architecture
 * @returns Object containing clients for each schema
 */
export function createSchemaAwareClients(): SchemaConfig {
  const baseConfig = {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        'X-Client-Info': 'briefly-cloud-server'
      }
    }
  }

  // Only allow placeholders during build, not runtime
  const isBuild = process.env.NEXT_PHASE === 'phase-production-build'
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  
  // Prefer SUPABASE_SERVICE_ROLE_KEY, allow SUPABASE_KEY as legacy alias
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY

  // Debug logging for Quest 0
  console.log('[SUPABASE_APP_CLIENT]', {
    vercelEnv: process.env.VERCEL_ENV,
    isBuild,
    usingServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    usingSupabaseKey: !!process.env.SUPABASE_KEY,
    serviceRoleKeyLength: process.env.SUPABASE_SERVICE_ROLE_KEY?.length,
    supabaseKeyLength: process.env.SUPABASE_KEY?.length,
  })

  // Hard fail if keys are missing at runtime (not during build)
  if (!isBuild) {
    if (!supabaseUrl) {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL in server runtime')
    }
    if (!serviceKey) {
      throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY) in server runtime')
    }
  }

  // Use placeholders only during build
  const finalUrl = supabaseUrl || 'https://placeholder.supabase.co'
  const finalKey = serviceKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTY0MDk5NTIwMCwiZXhwIjoxOTU2NTcxMjAwfQ.placeholder'

  return {
    app: createClient(
      finalUrl,
      finalKey,
      {
        ...baseConfig,
        db: { schema: 'app' }
      }
    ),
    private: createClient(
      finalUrl,
      finalKey,
      {
        ...baseConfig,
        db: { schema: 'private' }
      }
    )
  }
}

// Create schema-aware clients
const schemaClients = createSchemaAwareClients()

// Primary client for app operations (tenant-scoped data)
export const supabaseApp = schemaClients.app

// Client for private schema operations (secrets, system data)
export const supabasePrivate = schemaClients.private

// Backward compatibility - alias supabaseAdmin to supabaseApp
export const supabaseAdmin = supabaseApp

// Type exports for better TypeScript support
export type SupabaseApp = typeof supabaseApp
export type SupabasePrivate = typeof supabasePrivate
export type SupabaseAdmin = typeof supabaseAdmin