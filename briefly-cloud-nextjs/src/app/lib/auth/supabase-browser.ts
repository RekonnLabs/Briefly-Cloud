'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function getSupabaseBrowserClient() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            // Handle SSR case where document is not available
            if (typeof document === 'undefined') {
              return []
            }
            return document.cookie
              .split(';')
              .map(c => c.trim())
              .filter(c => c.length > 0)
              .map(c => {
                const [name, ...rest] = c.split('=')
                return { name: name.trim(), value: rest.join('=') }
              })
          },
          setAll(cookiesToSet) {
            // Handle SSR case where document is not available
            if (typeof document === 'undefined') {
              return
            }
            cookiesToSet.forEach(({ name, value, options }) => {
              const cookieOptions = []
              if (options?.maxAge) cookieOptions.push(`max-age=${options.maxAge}`)
              if (options?.sameSite) cookieOptions.push(`samesite=${options.sameSite}`)
              if (options?.secure) cookieOptions.push('secure')
              if (options?.httpOnly) cookieOptions.push('httponly')
              if (options?.path) cookieOptions.push(`path=${options.path}`)
              
              const cookieString = `${name}=${value}${cookieOptions.length > 0 ? '; ' + cookieOptions.join('; ') : ''}`
              document.cookie = cookieString
            })
          }
        },
        // IMPORTANT: unique storage key so multiple clients don't fight
        auth: {
          storageKey: 'sb-briefly-auth', // anything unique to Briefly
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        },
      }
    )
  }
  return client
}