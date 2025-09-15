// src/app/lib/auth/supabase-server-readonly.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export function getSupabaseServerReadOnly() {
  const cookieStore = cookies();
  
  // Debug: log all cookies to see what's available
  try {
    const allCookies = cookieStore.getAll()
    const sbCookies = allCookies.filter(c => c.name.startsWith('sb-'))
    console.log('[supabase-readonly] Cookie debug:', {
      totalCookies: allCookies.length,
      supabaseCookies: sbCookies.length,
      sbCookieNames: sbCookies.map(c => c.name),
      allCookieNames: allCookies.map(c => c.name)
    })
  } catch (e) {
    console.error('[supabase-readonly] Failed to read cookies:', e)
  }

  console.log('[supabase-readonly] Environment check:', {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'present' : 'missing',
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'present' : 'missing',
    urlPrefix: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + '...'
  })

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "public" },
      cookies: {
        // READ ONLY — RSC-safe
        get: (name: string) => {
          const value = cookieStore.get(name)?.value
          if (name.startsWith('sb-')) {
            console.log(`[supabase-readonly] Reading cookie ${name}:`, value ? 'PRESENT' : 'MISSING')
          }
          return value
        },
        set: () => { /* no-op in server components */ },
        remove: () => { /* no-op in server components */ },
      },
    }
  );
}