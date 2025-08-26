import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export function createServerClientReadOnly() {
  const store = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // RSC: read only — never write here
        get: (name) => store.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  )
}