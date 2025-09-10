import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { CookieOptions } from '@supabase/ssr'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Optional, but helps if you ever canonicalize between subdomains.
const BASE_COOKIE_OPTS: Partial<CookieOptions> = {
  path: '/',
  sameSite: 'lax',
  secure: true,
  // domain: '.rekonnlabs.com', // uncomment if you ever bounce across subdomains
}

export function getSupabaseServerMutable(res: NextResponse, req?: Request) {
  return createServerClient(URL, KEY, {
    db: { schema: 'public' },
    cookies: {
      get(name) {
        // Read from request cookies if available (needed for PKCE)
        if (req) {
          const cookieHeader = req.headers.get('cookie')
          if (cookieHeader) {
            const cookies = cookieHeader
              .split(';')
              .map(s => s.trim())
              .find(s => s.startsWith(name + '='))
            return cookies?.split('=').slice(1).join('=')
          }
        }
        return undefined
      },
      set(name, value, options) {
        res.cookies.set({ name, value, ...BASE_COOKIE_OPTS, ...options })
      },
      remove(name, options) {
        res.cookies.set({ name, value: '', ...BASE_COOKIE_OPTS, ...options })
      },
    },
  })
}